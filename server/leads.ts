import { categories, regions } from "@/lib/intake-options";
import type { PoolClient } from "pg";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import type { User } from "./session";

const leadColumns = `
  l.id, l.name, l.email, l.category, l.region, l.description, l.status,
  l.created_at AS "createdAt", c.id AS "caseId", c.status AS "caseStatus",
  l.firm_id AS "firmId", f.name AS "firmName"
`;

const leadRelations = `
  FROM leads l LEFT JOIN firms f ON f.id = l.firm_id LEFT JOIN cases c ON c.lead_id = l.id
`;
export const leadDetails = `SELECT ${leadColumns} ${leadRelations}`;

function visibleLeads(user: User, alias: "l" | "p" = "l") {
  switch (user.role) {
    case "admin":
      return { clause: "TRUE", values: [] };
    case "plaintiff":
      return { clause: `${alias}.plaintiff_id = $1`, values: [user.id] };
    default:
      return { clause: `${alias}.firm_id = $1`, values: [user.firmId] };
  }
}

const pageSize = 50;

async function listRecords(user: User, params: URLSearchParams, casesOnly: boolean) {
  const scope = visibleLeads(user);
  const clauses = [scope.clause];
  const values: (string | null)[] = [...scope.values];
  const parameter = (value: string) => `$${values.push(value)}`;

  if (casesOnly) clauses.push("c.id IS NOT NULL");
  const status = params.get("status");
  const region = params.get("region");
  const category = params.get("category");
  const before = params.get("before") ?? undefined;
  if (status) clauses.push(`${casesOnly ? "c" : "l"}.status = ${parameter(status)}`);
  if (region) clauses.push(`l.region = ${parameter(region)}`);
  if (category) clauses.push(`l.category = ${parameter(category)}`);
  if (before) {
    if (!isUuid(before)) throw new RequestError(400, "Invalid page cursor.");
    clauses.push(`(l.created_at, l.id) < (
      SELECT p.created_at, p.id FROM leads p WHERE ${visibleLeads(user, "p").clause} AND p.id = ${parameter(before)}
    )`);
  }

  if (user.role === "admin") {
    const firm = params.get("firmId") ?? undefined;
    if (firm) {
      if (!isUuid(firm)) throw new RequestError(400, "Invalid firm.");
      clauses.push(`l.firm_id = ${parameter(firm)}`);
    }
    const query = params.get("q")?.trim().slice(0, 120);
    if (query) {
      const namePattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      if (isUuid(query)) {
        const id = parameter(query);
        clauses.push(casesOnly ? `c.id = ${id}` : `(l.id = ${id} OR c.id = ${id})`);
      } else {
        clauses.push(`l.name ILIKE ${parameter(namePattern)}`);
      }
    }
  }

  const details = user.role === "plaintiff" ? `
    SELECT ${leadColumns}, (
      SELECT json_build_object('id', n.id, 'message', n.message, 'createdAt', n.created_at)
      FROM plaintiff_notices n WHERE n.lead_id = l.id
      ORDER BY n.created_at DESC, n.id DESC LIMIT 1
    ) AS "latestNotice" ${leadRelations}` : leadDetails;
  const { rows } = await db().query(
    `${details} WHERE ${clauses.join(" AND ")}
     ORDER BY l.created_at DESC, l.id DESC LIMIT ${pageSize + 1}`,
    values,
  );
  const leads = rows.slice(0, pageSize);
  return { leads, nextCursor: rows.length > pageSize ? leads.at(-1).id as string : null };
}

export function listLeads(user: User, params: URLSearchParams) {
  return listRecords(user, params, false);
}

export async function listCases(user: User, params: URLSearchParams) {
  const { leads, nextCursor } = await listRecords(user, params, true);
  const cases = leads.map((lead) => ({
    id: lead.caseId,
    leadId: lead.id,
    status: lead.caseStatus,
    lead,
  }));
  return { cases, nextCursor };
}

export async function getLead(user: User, id: string) {
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");
  const scope = visibleLeads(user);
  const { rows } = await db().query(
    `${leadDetails} WHERE ${scope.clause} AND l.id = $${scope.values.length + 1}`,
    [...scope.values, id],
  );
  if (!rows[0]) throw new RequestError(404, "Lead not found.");
  if (user.role !== "plaintiff") return rows[0];
  const notices = await db().query(
    `SELECT id, message, created_at AS "createdAt" FROM plaintiff_notices
     WHERE lead_id = $1 ORDER BY created_at DESC, id DESC`,
    [id],
  );
  return { ...rows[0], notices: notices.rows };
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

function reviewLead<T>(
  user: User,
  id: string,
  decision: "accept" | "decline",
  apply: (client: PoolClient) => Promise<T>,
) {
  if (!user.firmId || (user.role !== "attorney" && user.role !== "paralegal")) {
    throw new RequestError(403, `Only assigned firm staff can ${decision} a lead.`);
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
    return apply(client);
  });
}

export function acceptLead(user: User, id: string) {
  return reviewLead(user, id, "accept", async (client) => {
    await client.query("UPDATE leads SET status = 'accepted' WHERE id = $1", [id]);
    const opened = await client.query<{ id: string }>(
      "INSERT INTO cases (lead_id) VALUES ($1) RETURNING id",
      [id],
    );
    const caseId = opened.rows[0].id;
    await client.query(
      `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
       VALUES ($1, 'lead_accepted', $2, $3, $4)`,
      [id, user.id, { status: "awaiting_firm_review" }, { status: "accepted", caseId, caseStatus: "open" }],
    );
    return caseId;
  });
}

export function declineLead(user: User, id: string) {
  return reviewLead(user, id, "decline", async (client) => {
    await client.query("UPDATE leads SET status = 'declined' WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
       VALUES ($1, 'lead_declined', $2, $3, $4)`,
      [id, user.id, { status: "awaiting_firm_review" }, { status: "declined" }],
    );
    const { rows } = await client.query(`${leadDetails} WHERE l.id = $1`, [id]);
    return rows[0];
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
