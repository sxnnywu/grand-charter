import { categories, regions } from "@/lib/intake-options";
import type { PoolClient, QueryResultRow } from "pg";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import { idempotent, requestHash } from "./idempotency";
import type { User } from "./session";

const leadColumns = `
  l.id, l.name, l.email, l.title, l.category, l.region, l.description, l.status,
  l.created_at AS "createdAt", c.id AS "caseId", c.status AS "caseStatus",
  l.firm_id AS "firmId", f.name AS "firmName",
  (SELECT json_build_object('id', t.id, 'caseId', t.case_id, 'status', t.status,
      'fromFirmId', t.from_firm_id, 'fromFirmName', old_firm.name,
      'toFirmId', t.to_firm_id, 'toFirmName', new_firm.name, 'createdAt', t.created_at)
   FROM case_transfers t JOIN firms old_firm ON old_firm.id = t.from_firm_id
   JOIN firms new_firm ON new_firm.id = t.to_firm_id
   WHERE t.case_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS transfer
`;

const leadRelations = `
  FROM leads l LEFT JOIN firms f ON f.id = l.firm_id LEFT JOIN cases c ON c.lead_id = l.id
`;
export const leadDetails = `SELECT ${leadColumns} ${leadRelations}`;

export function transferReviewScope(alias: string, firmParameter: string) {
  return `${alias}.id IN (SELECT tc.lead_id FROM case_transfers t JOIN cases tc ON tc.id = t.case_id
    WHERE t.to_firm_id = ${firmParameter}
      AND t.status IN ('pending', 'declined') AND t.id = (
        SELECT recent.id FROM case_transfers recent WHERE recent.case_id = t.case_id
        ORDER BY recent.created_at DESC, recent.id DESC LIMIT 1))`;
}
const declinedTransfer = `c.id IN (SELECT t.case_id FROM case_transfers t WHERE t.status = 'declined'
  AND t.id = (SELECT recent.id FROM case_transfers recent WHERE recent.case_id = t.case_id
    ORDER BY recent.created_at DESC, recent.id DESC LIMIT 1))`;

function presentLead(user: User, row: QueryResultRow) {
  if (user.role !== "admin" && user.role !== "plaintiff" && row.firmId !== user.firmId
    && row.transfer?.toFirmId === user.firmId && ["pending", "declined"].includes(row.transfer.status)) {
    return { ...row, reviewTransfer: true, status: row.transfer.status === "pending" ? "awaiting_firm_review" : "declined", caseId: null, caseStatus: null };
  }
  return row;
}

function visibleLeads(user: User, alias: "l" | "p" = "l", includeOffers = true) {
  switch (user.role) {
    case "admin":
      return { clause: "TRUE", values: [] };
    case "plaintiff":
      return { clause: `${alias}.plaintiff_id = $1`, values: [user.id] };
    default:
      return { clause: includeOffers ? `(${alias}.firm_id = $1 OR ${transferReviewScope(alias, "$1")})` : `${alias}.firm_id = $1`, values: [user.firmId] };
  }
}

const pageSize = 50;

async function listRecords(user: User, params: URLSearchParams, casesOnly: boolean) {
  const scope = visibleLeads(user, "l", !casesOnly);
  const clauses = [scope.clause];
  const values: (string | null)[] = [...scope.values];
  const parameter = (value: string) => `$${values.push(value)}`;
  const oldest = params.get("sort") === "oldest";
  const direction = oldest ? "ASC" : "DESC";

  if (casesOnly) clauses.push("c.id IS NOT NULL");
  if (params.get("attention") === "true") {
    if (user.role !== "admin") throw new RequestError(403, "Only admins can open the attention queue.");
    if (casesOnly) throw new RequestError(400, "The attention filter is only available for leads.");
    clauses.push(`(l.status IN ('pending_assignment', 'declined') OR ${declinedTransfer})`);
  }
  const status = params.get("status");
  const region = params.get("region");
  const category = params.get("category");
  const before = params.get("before") ?? undefined;
  if (status) {
    const value = parameter(status);
    if (user.role === "admin" && params.get("attention") === "true" && status === "declined") clauses.push(`(l.status = ${value} OR ${declinedTransfer})`);
    else if (!casesOnly && user.firmId) clauses.push(`(CASE WHEN l.firm_id = $1 THEN l.status
      WHEN EXISTS (SELECT 1 FROM case_transfers t JOIN cases tc ON tc.id = t.case_id
        WHERE tc.lead_id = l.id AND t.to_firm_id = $1 AND t.status = 'pending') THEN 'awaiting_firm_review' ELSE 'declined' END) = ${value}`);
    else clauses.push(`${casesOnly ? "c" : "l"}.status = ${value}`);
  }
  if (region) clauses.push(`l.region = ${parameter(region)}`);
  if (category) clauses.push(`l.category = ${parameter(category)}`);
  if (user.role === "plaintiff") {
    const kind = params.get("requestKind");
    if (kind && !["all", "requests", "cases"].includes(kind)) {
      throw new RequestError(400, "Choose all matters, requests, or cases.");
    }
    if (kind === "requests") clauses.push("c.id IS NULL");
    if (kind === "cases") clauses.push("c.id IS NOT NULL");
    const requestState = params.get("requestState");
    if (requestState && requestState !== "all" && requestState !== "active" && requestState !== "closed") {
      throw new RequestError(400, "Choose all, active, or closed requests.");
    }
    if (requestState === "active") clauses.push("l.status <> 'closed' AND (c.id IS NULL OR c.status <> 'closed')");
    if (requestState === "closed") clauses.push("(l.status = 'closed' OR c.status = 'closed')");
  }
  if (before && !isUuid(before)) throw new RequestError(400, "Invalid page cursor.");

  if (user.role === "admin") {
    const firm = params.get("firmId") ?? undefined;
    if (firm) {
      if (!isUuid(firm)) throw new RequestError(400, "Invalid firm.");
      clauses.push(`l.firm_id = ${parameter(firm)}`);
    }
  }

  if (user.role !== "plaintiff") {
    const query = params.get("q")?.trim().slice(0, 120);
    if (query) {
      const namePattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      if (isUuid(query)) {
        const id = parameter(query);
        clauses.push(casesOnly && user.role === "admin" ? `c.id = ${id}` : `(l.id = ${id} OR c.id = ${id})`);
      } else {
        clauses.push(`l.name ILIKE ${parameter(namePattern)}`);
      }
    }
  }

  const matchingWhere = clauses.join(" AND ");
  if (before) clauses.push(`(l.created_at, l.id) ${oldest ? ">" : "<"} (
    SELECT p.created_at, p.id FROM leads p WHERE ${visibleLeads(user, "p", !casesOnly).clause} AND p.id = ${parameter(before)}
  )`);

  const details = user.role === "plaintiff" ? `
    SELECT ${leadColumns}, (
      SELECT json_build_object('id', n.id, 'message', n.message, 'createdAt', n.created_at)
      FROM plaintiff_notices n WHERE n.lead_id = l.id
      ORDER BY n.created_at DESC, n.id DESC LIMIT 1
    ) AS "latestNotice" ${leadRelations}` : leadDetails;
  const pageQuery = `${details} WHERE ${clauses.join(" AND ")}
    ORDER BY l.created_at ${direction}, l.id ${direction} LIMIT ${pageSize + 1}`;
  let rows: QueryResultRow[];
  let totalCount: number | undefined;
  if (params.get("count") === "true") {
    // Aggregating the page preserves the full count even when the cursor returns no rows.
    const { rows: [counted] } = await db().query(
      `SELECT (
         SELECT COUNT(*) FROM leads l ${casesOnly ? "JOIN" : "LEFT JOIN"} cases c ON c.lead_id = l.id WHERE ${matchingWhere}
       ) AS "totalCount",
       COALESCE(json_agg(page ORDER BY page."createdAt" ${direction}, page.id ${direction}), '[]'::json) AS records
       FROM (${pageQuery}) page`,
      values,
    );
    rows = counted.records;
    totalCount = Number(counted.totalCount);
  } else {
    ({ rows } = await db().query(pageQuery, values));
  }
  const leads = rows.slice(0, pageSize).map(row => presentLead(user, row));
  return {
    leads,
    nextCursor: rows.length > pageSize ? leads.at(-1)!.id as string : null,
    ...(totalCount === undefined ? {} : { totalCount }),
  };
}

export function listLeads(user: User, params: URLSearchParams) {
  return listRecords(user, params, false);
}

export async function listCases(user: User, params: URLSearchParams) {
  const { leads, nextCursor, totalCount } = await listRecords(user, params, true);
  const cases = leads.map((lead) => ({
    id: lead.caseId,
    leadId: lead.id,
    status: lead.caseStatus,
    lead,
  }));
  return { cases, nextCursor, ...(totalCount === undefined ? {} : { totalCount }) };
}

export async function getLead(user: User, id: string) {
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");
  const scope = visibleLeads(user);
  const { rows } = await db().query(
    `${leadDetails} WHERE ${scope.clause} AND l.id = $${scope.values.length + 1}`,
    [...scope.values, id],
  );
  if (!rows[0]) throw new RequestError(404, "Lead not found.");
  if (user.role !== "plaintiff") return presentLead(user, rows[0]);
  const notices = await db().query(
    `SELECT id, message, created_at AS "createdAt" FROM plaintiff_notices
     WHERE lead_id = $1 ORDER BY created_at DESC, id DESC`,
    [id],
  );
  return { ...rows[0], notices: notices.rows };
}

function requiredText(value: unknown, label: string, max: number, field: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || value.includes("\0")) {
    const message = `Enter a ${label} of 1 to ${max} characters.`;
    throw new RequestError(400, message, { [field]: message });
  }
  return value.trim();
}

export async function submitLead(user: User, body: Record<string, unknown>, key: string) {
  if (user.role !== "plaintiff") throw new RequestError(403, "Only plaintiffs can submit a lead.");
  const name = requiredText(body.name, "name", 120, "name");
  const email = requiredText(body.email, "valid email address", 254, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, "Enter a valid email address.", { email: "Enter a valid email address." });
  }
  const category = typeof body.category === "string" ? body.category : "";
  const region = typeof body.region === "string" ? body.region : "";
  if (!categories.includes(category) || !regions.includes(region)) {
    throw new RequestError(400, "Choose a category and province.", {
      ...(!categories.includes(category) && { category: "Choose the type of help you need." }),
      ...(!regions.includes(region) && { region: "Choose the province where your situation took place." }),
    });
  }
  const description = requiredText(body.description, "description", 2_500, "description");
  const title = body.title === undefined || body.title === null || body.title === "" ? null
    : typeof body.title === "string" && !body.title.trim() ? null : requiredText(body.title, "request name", 80, "title");

  const hash = requestHash({ name, email, category, region, description, ...(title ? { title } : {}) });
  return transaction((client) => idempotent(client, user.id, "lead.create", key, hash, async () => {
    const route = await client.query<{ firm_id: string }>(
      "SELECT firm_id FROM routing_rules WHERE category = $1 AND region = $2",
      [category, region],
    );
    const firmId = route.rows[0]?.firm_id ?? null;
    const status = firmId ? "awaiting_firm_review" : "pending_assignment";
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO leads (plaintiff_id, name, email, category, region, description, status, firm_id, title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [user.id, name, email, category, region, description, status, firmId, title],
    );
    const leadId = rows[0].id;
    if (firmId) {
      await client.query(
        "INSERT INTO audit_events (lead_id, event_type, after_values) VALUES ($1, 'lead_routed', $2)",
        [leadId, { firmId, status }],
      );
    }
    const { rows: [lead] } = await client.query(`${leadDetails} WHERE l.id = $1`, [leadId]);
    return { ...lead, notices: [] };
  }));
}

function reviewLead<T>(
  user: User,
  id: string,
  decision: "accept" | "decline",
  apply: (client: PoolClient) => Promise<T>,
  transferred: (client: PoolClient, caseId: string) => Promise<T>,
  expectedTransfer?: string,
) {
  if (!user.firmId || (user.role !== "attorney" && user.role !== "paralegal")) {
    throw new RequestError(403, `Only assigned firm staff can ${decision} a lead.`);
  }
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");

  return transaction(async (client) => {
    const { rows } = await client.query<{ status: string; firm_id: string }>(
      `SELECT l.status, l.firm_id FROM leads l WHERE l.id = $1 AND (l.firm_id = $2 OR ${transferReviewScope("l", "$2")}) FOR UPDATE`,
      [id, user.firmId],
    );
    if (!rows[0]) throw new RequestError(404, "Lead not found.");
    if (rows[0].firm_id !== user.firmId) {
      const { rows: [offer] } = await client.query(`SELECT t.*, f.name AS "fromName", target.name AS "toName"
        FROM case_transfers t JOIN cases c ON c.id = t.case_id
        JOIN firms f ON f.id = t.from_firm_id JOIN firms target ON target.id = t.to_firm_id
        WHERE c.lead_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 1 FOR UPDATE OF t`, [id]);
      if (!offer || offer.id !== expectedTransfer || offer.to_firm_id !== user.firmId || offer.status !== "pending") throw new RequestError(409, "This transfer offer is no longer awaiting your firm’s review.");
      if (rows[0].firm_id !== offer.from_firm_id) throw new RequestError(409, "The current assignment has changed. Ask an admin to review the transfer.");
      const status = decision === "accept" ? "accepted" : "declined";
      await client.query("UPDATE case_transfers SET status = $2, decided_by = $3, decided_at = clock_timestamp() WHERE id = $1", [offer.id, status, user.id]);
      if (decision === "accept") await client.query("UPDATE leads SET firm_id = $2 WHERE id = $1", [id, user.firmId]);
      await client.query(`INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values) VALUES ($1, $2, $3, $4, $5)`,
        [id, `case_transfer_${status}`, user.id, { firmName: offer.fromName, transferStatus: "pending" },
          { firmName: decision === "accept" ? offer.toName : offer.fromName, proposedFirmName: offer.toName, transferStatus: status }]);
      await client.query("INSERT INTO plaintiff_notices (lead_id, message) VALUES ($1, $2)", [id, decision === "accept"
        ? `${offer.toName} accepted the transfer and is now handling your case. Its progress is unchanged.`
        : `${offer.toName} declined the transfer. ${offer.fromName} continues handling your case while an administrator reviews the next step.`]);
      return transferred(client, offer.case_id);
    }
    if (expectedTransfer) throw new RequestError(409, "This transfer has already been decided.");
    if (rows[0].status !== "awaiting_firm_review") {
      throw new RequestError(409, "This lead is no longer awaiting review.");
    }
    return apply(client);
  });
}

export function acceptLead(user: User, id: string, expectedTransfer?: string) {
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
  }, async (_client, caseId) => caseId, expectedTransfer);
}

export function declineLead(user: User, id: string, expectedTransfer?: string) {
  return reviewLead(user, id, "decline", async (client) => {
    await client.query("UPDATE leads SET status = 'declined' WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
       VALUES ($1, 'lead_declined', $2, $3, $4)`,
      [id, user.id, { status: "awaiting_firm_review" }, { status: "declined" }],
    );
    const { rows } = await client.query(`${leadDetails} WHERE l.id = $1`, [id]);
    return rows[0];
  }, async (client) => {
    const { rows: [lead] } = await client.query(`${leadDetails} WHERE l.id = $1`, [id]);
    return presentLead(user, lead);
  }, expectedTransfer);
}

export async function decideCaseTransfer(user: User, id: string, decision: "accept" | "decline") {
  if (!isUuid(id)) throw new RequestError(404, "Transfer offer not found.");
  const { rows: [offer] } = await db().query(`SELECT c.lead_id FROM case_transfers t JOIN cases c ON c.id = t.case_id WHERE t.id = $1 AND t.to_firm_id = $2`, [id, user.firmId]);
  if (!offer) throw new RequestError(404, "Transfer offer not found.");
  if (decision === "decline") return { lead: await declineLead(user, offer.lead_id, id) };
  const caseId = await acceptLead(user, offer.lead_id, id);
  return { caseId, lead: await getLead(user, offer.lead_id) };
}

export async function getCase(user: User, id: string) {
  if (!isUuid(id)) throw new RequestError(404, "Case not found.");
  const scope = visibleLeads(user, "l", false);
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
