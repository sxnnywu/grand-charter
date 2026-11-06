import type { PoolClient } from "pg";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import { leadDetails } from "./leads";
import type { User } from "./session";

type Firm = { id: string; name: string };
type LeadState = "pending_assignment" | "awaiting_firm_review" | "accepted" | "declined" | "closed";
type LockedLead = {
  id: string;
  status: LeadState;
  firmId: string | null;
};

function assertAdmin(user: User) {
  if (user.role !== "admin") throw new RequestError(403, "Only admins can do this.");
}

function requestedFirm(value: unknown) {
  if (typeof value !== "string" || !isUuid(value)) {
    throw new RequestError(400, "Select an existing firm.");
  }
  return value;
}

async function lockLead(client: PoolClient, id: string) {
  const { rows: [lead] } = await client.query<LockedLead>(
    `SELECT id, status, firm_id AS "firmId"
     FROM leads WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!lead) throw new RequestError(404, "Lead not found.");
  return lead;
}

async function findFirm(client: PoolClient, id: string) {
  const { rows: [firm] } = await client.query<Firm>("SELECT id, name FROM firms WHERE id = $1", [id]);
  if (!firm) throw new RequestError(400, "Select an existing firm.");
  return firm;
}

async function updateAssignment(
  client: PoolClient,
  lead: LockedLead,
  actorId: string,
  change: {
    status: LeadState;
    firm: Firm | null;
    eventType: "lead_assigned" | "lead_reassigned" | "lead_closed" | "case_reassigned";
    message?: string;
    caseId?: string;
  },
) {
  const firmId = change.firm?.id ?? null;
  const priorFirm = lead.firmId ? await findFirm(client, lead.firmId) : null;
  const beforeValues = { status: lead.status, firmId: lead.firmId, firmName: priorFirm?.name ?? null };
  const afterValues = { status: change.status, firmId, firmName: change.firm?.name ?? null, caseId: change.caseId };

  await client.query("UPDATE leads SET status = $2, firm_id = $3 WHERE id = $1", [lead.id, change.status, firmId]);
  await client.query(
    `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
     VALUES ($1, $2, $3, $4, $5)`,
    [lead.id, change.eventType, actorId, beforeValues, afterValues],
  );
  if (change.message) {
    await client.query("INSERT INTO plaintiff_notices (lead_id, message) VALUES ($1, $2)", [lead.id, change.message]);
  }

  const { rows: [updated] } = await client.query(`${leadDetails} WHERE l.id = $1`, [lead.id]);
  return updated;
}

export async function listFirms(user: User) {
  assertAdmin(user);
  const { rows } = await db().query<Firm>("SELECT id, name FROM firms ORDER BY name, id");
  return rows;
}

export function assignLead(user: User, id: string, selectedFirmId: unknown) {
  assertAdmin(user);
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");
  const firmId = requestedFirm(selectedFirmId);

  return transaction(async (client) => {
    const lead = await lockLead(client, id);
    if (lead.status === "accepted") throw new RequestError(409, "Reassign this lead from its case.");
    if (lead.status === "closed") throw new RequestError(409, "This lead is closed.");

    const firm = await findFirm(client, firmId);
    const sameFirm = lead.firmId === firm.id;
    if (lead.status === "awaiting_firm_review" && sameFirm) {
      throw new RequestError(409, "This lead is already assigned to that firm.");
    }
    const eventType = lead.firmId && !sameFirm ? "lead_reassigned" : "lead_assigned";
    const action = sameFirm ? "returned" : eventType === "lead_reassigned" ? "reassigned" : "assigned";
    return updateAssignment(client, lead, user.id, {
      status: "awaiting_firm_review",
      firm,
      eventType,
      message: lead.firmId ? `Your request was ${action} to ${firm.name} for review.` : undefined,
    });
  });
}

export function closeLead(user: User, id: string) {
  assertAdmin(user);
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");

  return transaction(async (client) => {
    const lead = await lockLead(client, id);
    if (lead.status !== "declined") throw new RequestError(409, "Only declined leads can be closed.");

    return updateAssignment(client, lead, user.id, {
      status: "closed",
      firm: null,
      eventType: "lead_closed",
      message: "Your request was closed without placement at a firm.",
    });
  });
}

export function reassignCase(user: User, id: string, selectedFirmId: unknown) {
  assertAdmin(user);
  if (!isUuid(id)) throw new RequestError(404, "Case not found.");
  const firmId = requestedFirm(selectedFirmId);

  return transaction(async (client) => {
    const { rows: [record] } = await client.query<{ lead_id: string }>("SELECT lead_id FROM cases WHERE id = $1", [id]);
    if (!record) throw new RequestError(404, "Case not found.");
    const lead = await lockLead(client, record.lead_id);
    if (lead.status !== "accepted") throw new RequestError(409, "This case is no longer linked to an accepted lead.");

    const firm = await findFirm(client, firmId);
    if (lead.firmId === firm.id) throw new RequestError(409, "This case is already assigned to that firm.");

    return updateAssignment(client, lead, user.id, {
      status: lead.status,
      firm,
      eventType: "case_reassigned",
      message: `Your case was reassigned to ${firm.name}.`,
      caseId: id,
    });
  });
}

export async function leadHistory(user: User, id: string) {
  assertAdmin(user);
  if (!isUuid(id)) throw new RequestError(404, "Lead not found.");

  const { rows: [record] } = await db().query<{ events: unknown[] }>(
    `SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id', e.id,
              'eventType', e.event_type,
              'actorName', COALESCE(u.name, 'System'),
              'beforeValues', e.before_values,
              'afterValues', CASE WHEN routed.name IS NOT NULL
                THEN jsonb_build_object('firmName', routed.name) || e.after_values
                ELSE e.after_values END,
              'createdAt', e.created_at
            ) ORDER BY e.created_at DESC, e.id DESC) FILTER (WHERE e.id IS NOT NULL), '[]') AS events
     FROM leads l LEFT JOIN audit_events e ON e.lead_id = l.id
     LEFT JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN firms routed ON e.event_type = 'lead_routed' AND routed.id = (e.after_values ->> 'firmId')::uuid
     WHERE l.id = $1 GROUP BY l.id`,
    [id],
  );
  if (!record) throw new RequestError(404, "Lead not found.");
  return record.events;
}
