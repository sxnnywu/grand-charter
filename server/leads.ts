import { categories, regions } from "@/lib/intake-options";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import type { User } from "./session";

const leadColumns = `
  l.id, l.name, l.email, l.category, l.region, l.description, l.status,
  l.created_at AS "createdAt", c.id AS "caseId", f.name AS "firmName"
`;

const leadDetails = `
  SELECT ${leadColumns}
  FROM leads l LEFT JOIN firms f ON f.id = l.firm_id LEFT JOIN cases c ON c.lead_id = l.id
`;

function visibleLeads(user: User) {
  switch (user.role) {
    case "admin":
      return { clause: "TRUE", values: [] };
    case "plaintiff":
      return { clause: "l.plaintiff_id = $1", values: [user.id] };
    default:
      return { clause: "l.firm_id = $1", values: [user.firmId] };
  }
}

export async function listLeads(user: User) {
  const scope = visibleLeads(user);
  const { rows } = await db().query(
    `${leadDetails} WHERE ${scope.clause} ORDER BY l.created_at DESC, l.id DESC`,
    scope.values,
  );
  return rows;
}

export async function getLead(user: User, id: string) {
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");
  const scope = visibleLeads(user);
  const { rows } = await db().query(
    `${leadDetails} WHERE ${scope.clause} AND l.id = $${scope.values.length + 1}`,
    [...scope.values, id],
  );
  if (!rows[0]) throw new RequestError(404, "Lead not found.");
  return rows[0];
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || value.includes("\0")) {
    throw new RequestError(400, `Enter a ${label} of 1 to ${max} characters.`);
  }
  return value.trim();
}

export async function submitLead(user: User, body: Record<string, unknown>) {
  if (user.role !== "plaintiff") throw new RequestError(403, "Only plaintiffs can submit a lead.");
  const name = requiredText(body.name, "name", 120);
  const email = requiredText(body.email, "valid email address", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, "Enter a valid email address.");
  }
  const category = typeof body.category === "string" ? body.category : "";
  const region = typeof body.region === "string" ? body.region : "";
  if (!categories.includes(category) || !regions.includes(region)) {
    throw new RequestError(400, "Choose a category and region.");
  }
  const description = requiredText(body.description, "description", 5_000);

  const id = await transaction(async (client) => {
    const route = await client.query<{ firm_id: string }>(
      "SELECT firm_id FROM routing_rules WHERE category = $1 AND region = $2",
      [category, region],
    );
    const firmId = route.rows[0]?.firm_id ?? null;
    const status = firmId ? "awaiting_firm_review" : "pending_assignment";
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO leads (plaintiff_id, name, email, category, region, description, status, firm_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [user.id, name, email, category, region, description, status, firmId],
    );
    const leadId = rows[0].id;
    if (firmId) {
      await client.query(
        "INSERT INTO audit_events (lead_id, event_type, after_values) VALUES ($1, 'lead_routed', $2)",
        [leadId, { firmId, status }],
      );
    }
    return leadId;
  });
  return getLead(user, id);
}

export async function acceptLead(user: User, id: string) {
  if (!user.firmId || (user.role !== "attorney" && user.role !== "paralegal")) {
    throw new RequestError(403, "Only assigned firm staff can accept a lead.");
  }
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");

  return transaction(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      "SELECT status FROM leads WHERE id = $1 AND firm_id = $2 FOR UPDATE",
      [id, user.firmId],
    );
    if (!rows[0]) throw new RequestError(404, "Lead not found.");
    if (rows[0].status !== "awaiting_firm_review") {
      throw new RequestError(409, "This lead is no longer awaiting review.");
    }

    await client.query("UPDATE leads SET status = 'accepted' WHERE id = $1", [id]);
    const opened = await client.query<{ id: string }>(
      "INSERT INTO cases (lead_id) VALUES ($1) RETURNING id",
      [id],
    );
    const caseId = opened.rows[0].id;
    await client.query(
      `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
       VALUES ($1, 'lead_accepted', $2, $3, $4)`,
      [id, user.id, { status: rows[0].status }, { status: "accepted", caseId, caseStatus: "open" }],
    );
    return caseId;
  });
}

export async function getCase(user: User, id: string) {
  if (!isUuid(id)) throw new RequestError(404, "Case not found.");
  const scope = visibleLeads(user);
  const { rows } = await db().query(
    `SELECT c.id, c.lead_id AS "leadId", l.name, l.category, l.region, c.status,
            f.name AS "firmName", c.created_at AS "createdAt"
     FROM cases c JOIN leads l ON l.id = c.lead_id LEFT JOIN firms f ON f.id = l.firm_id
     WHERE ${scope.clause} AND c.id = $${scope.values.length + 1}`,
    [...scope.values, id],
  );
  if (!rows[0]) throw new RequestError(404, "Case not found.");
  return rows[0];
}
