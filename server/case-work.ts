import type { PoolClient } from "pg";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import type { User } from "./session";

type CaseStatus = "open" | "in_progress" | "closed";

export function isFirmStaff(user: User): user is User & { firmId: string } {
  return (user.role === "attorney" || user.role === "paralegal") && user.firmId !== null;
}

function caseWriter(user: User, caseId: string) {
  if (!isFirmStaff(user)) throw new RequestError(403, "Only assigned firm staff can make this change.");
  if (!isUuid(caseId)) throw new RequestError(404, "Case not found.");
  return user.firmId;
}

async function lockAssignedCase(client: PoolClient, caseId: string, firmId: string) {
  const lead = await client.query<{ id: string }>(
    `SELECT l.id FROM cases c JOIN leads l ON l.id = c.lead_id
     WHERE c.id = $1 AND l.firm_id = $2 FOR UPDATE OF l`,
    [caseId, firmId],
  );
  if (!lead.rows[0]) throw new RequestError(404, "Case not found.");

  // Read case status after taking the lead lock, including any change we waited for.
  const record = await client.query<{ status: CaseStatus }>("SELECT status FROM cases WHERE id = $1", [caseId]);
  return { leadId: lead.rows[0].id, status: record.rows[0].status };
}

export async function updateCaseStatus(user: User, caseId: string, status: unknown) {
  const firmId = caseWriter(user, caseId);
  if (status !== "open" && status !== "in_progress" && status !== "closed") {
    throw new RequestError(400, "Choose a valid case status.");
  }

  return transaction(async (client) => {
    const current = await lockAssignedCase(client, caseId, firmId);
    const nextStatus = current.status === "open" ? "in_progress" : current.status === "in_progress" ? "closed" : null;
    if (status !== nextStatus) throw new RequestError(409, "That status change is unavailable.");

    await client.query("UPDATE cases SET status = $2 WHERE id = $1", [caseId, status]);
    await client.query(
      `INSERT INTO audit_events (lead_id, event_type, actor_user_id, before_values, after_values)
       VALUES ($1, 'case_status_changed', $2, $3, $4)`,
      [current.leadId, user.id, { caseId, caseStatus: current.status }, { caseId, caseStatus: status }],
    );
    return status;
  });
}

export async function listCaseNotes(user: User, caseId: string) {
  const isAdmin = user.role === "admin";
  if (!isAdmin && !isFirmStaff(user)) throw new RequestError(403, "This view is for firm staff and admins.");
  if (!isUuid(caseId)) throw new RequestError(404, "Case not found.");

  const { rows } = await db().query(
    `SELECT n.id, n.body, u.name AS "authorName", f.name AS "firmName", n.created_at AS "createdAt"
     FROM cases c
     JOIN leads l ON l.id = c.lead_id
     LEFT JOIN firm_notes n ON n.case_id = c.id AND ($2 OR n.firm_id = $3)
     LEFT JOIN users u ON u.id = n.author_user_id
     LEFT JOIN firms f ON f.id = n.firm_id
     WHERE c.id = $1 AND ($2 OR l.firm_id = $3)
     ORDER BY n.created_at DESC, n.id DESC`,
    [caseId, isAdmin, user.firmId],
  );
  if (!rows.length) throw new RequestError(404, "Case not found.");
  return rows.filter((note) => note.id !== null);
}

export async function addCaseNote(user: User, caseId: string, body: unknown) {
  const firmId = caseWriter(user, caseId);
  const text = typeof body === "string" ? body.trim() : "";
  if (!text || text.length > 2_000 || text.includes("\0")) {
    throw new RequestError(400, "Enter a note of up to 2,000 characters.");
  }

  return transaction(async (client) => {
    const current = await lockAssignedCase(client, caseId, firmId);
    if (current.status === "closed") throw new RequestError(409, "This case is closed.");

    const { rows } = await client.query(
      `INSERT INTO firm_notes (case_id, author_user_id, firm_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, body, created_at AS "createdAt"`,
      [caseId, user.id, firmId, text],
    );
    return { ...rows[0], authorName: user.name, firmName: user.firmName };
  });
}
