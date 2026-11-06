import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { isFirmStaff } from "./case-work";
import { transferReviewScope } from "./leads";
import { db, transaction } from "./db";
import { isUuid, RequestError } from "./http";
import { idempotent, requestHash } from "./idempotency";
import type { User } from "./session";

const maxFileSize = 10 * 1024 * 1024;
const maxRequestSize = maxFileSize + 64 * 1024;
const directory = resolve(process.cwd(), ".data", "documents");

// A null firm denotes the plaintiff. Staff must match both the current
// assignment and the sharing firm, unless the plaintiff uploaded the PDF.
const visibleLead = "(($2::uuid IS NULL AND l.plaintiff_id = $3) OR l.firm_id = $2)";
const reviewableLead = `(${visibleLead} OR ${transferReviewScope("l", "$2")})`;
const visibleDocument = "($2::uuid IS NULL OR d.sharing_firm_id IS NULL OR (l.firm_id = $2 AND d.sharing_firm_id = $2))";

function documentViewer(user: User) {
  if (user.role !== "plaintiff" && !isFirmStaff(user)) {
    throw new RequestError(403, "You do not have access to PDFs.");
  }
}

export async function listDocuments(user: User, leadId: string, before?: string) {
  documentViewer(user);
  if (!isUuid(leadId)) throw new RequestError(404, "Lead not found.");
  if (before !== undefined && !isUuid(before)) throw new RequestError(400, "Invalid page cursor.");

  const { rows } = await db().query(
    `SELECT d.id, d.file_name AS "fileName", u.name AS "uploaderName",
            d.uploader_user_id = $3 AS "uploadedByYou", f.name AS "sharingFirmName",
            d.size_bytes AS size, d.created_at AS "createdAt"
     FROM leads l
     LEFT JOIN documents d ON d.lead_id = l.id AND ${visibleDocument}
       AND ($4::uuid IS NULL OR (d.created_at, d.id) < (
         SELECT p.created_at, p.id FROM documents p
         WHERE p.id = $4 AND p.lead_id = l.id
           AND ($2::uuid IS NULL OR p.sharing_firm_id IS NULL OR (l.firm_id = $2 AND p.sharing_firm_id = $2))
       ))
     LEFT JOIN users u ON u.id = d.uploader_user_id
     LEFT JOIN firms f ON f.id = d.sharing_firm_id
     WHERE l.id = $1 AND ${reviewableLead}
     ORDER BY d.created_at DESC, d.id DESC LIMIT 26`,
    [leadId, user.firmId, user.id, before ?? null],
  );
  if (!rows.length) throw new RequestError(404, "Lead not found.");
  const documents = rows.filter((document) => document.id !== null);
  return { documents: documents.slice(0, 25), nextCursor: documents.length > 25 ? documents[24].id as string : null };
}

async function readPdfUpload(request: Request) {
  const contentType = request.headers.get("content-type");
  if (contentType?.split(";")[0].trim().toLowerCase() !== "multipart/form-data" || !request.body) {
    throw new RequestError(400, "Choose one PDF to upload.");
  }
  if (Number(request.headers.get("content-length")) > maxRequestSize) {
    throw new RequestError(413, "PDFs must be 10 MB or smaller.");
  }

  // Limit the actual bytes, including requests without Content-Length.
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestSize) {
        await reader.cancel().catch(() => {});
        throw new RequestError(413, "PDFs must be 10 MB or smaller.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  const form = await new Response(new Uint8Array(Buffer.concat(chunks, size)), {
    headers: { "Content-Type": contentType },
  }).formData().catch(() => null);
  const files = form?.getAll("file");
  const file = files?.[0];
  if (files?.length !== 1 || !(file instanceof File)) {
    throw new RequestError(400, "Choose one PDF to upload.");
  }
  if (file.size > maxFileSize) throw new RequestError(413, "PDFs must be 10 MB or smaller.");

  const name = file.name.split(/[/\\]/).at(-1)?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, "").trim() ?? "";
  const bytes = Buffer.from(await file.arrayBuffer());
  const header = bytes.subarray(0, 8).toString("latin1");
  const tail = bytes.subarray(-1024).toString("latin1");
  if (!/\.pdf$/i.test(name) || !/^%PDF-(1\.[0-7]|2\.0)$/.test(header) || !/%%EOF\s*$/.test(tail)) {
    throw new RequestError(400, "Choose a valid PDF file.");
  }

  const fileName = [...name.slice(0, -4)].slice(0, 176).join("") + ".pdf";
  return { bytes, fileName };
}

export async function uploadDocument(user: User, leadId: string, request: Request, key: string) {
  documentViewer(user);
  if (!isUuid(leadId)) throw new RequestError(404, "Lead not found.");
  const { bytes, fileName } = await readPdfUpload(request);
  const hash = requestHash({
    leadId,
    firmId: user.firmId,
    fileName,
    content: createHash("sha256").update(bytes).digest("hex"),
  });
  const storageKey = randomUUID();
  const path = resolve(directory, `${storageKey}.pdf`);
  let createdFile = false;

  try {
    return await transaction(async (client) => {
      const { rows: leads } = await client.query<{ status: string }>(
        `SELECT l.status FROM leads l WHERE l.id = $1 AND ${visibleLead} FOR UPDATE`,
        [leadId, user.firmId, user.id],
      );
      const lead = leads[0];
      if (!lead) throw new RequestError(404, "Lead not found.");
      return idempotent(client, user.id, "document.create", key, hash, async () => {
        if (lead.status === "closed") throw new RequestError(409, "This lead is closed.");
        if (user.firmId && lead.status !== "accepted") {
          throw new RequestError(409, "Accept this lead before sharing PDFs.");
        }
        if (lead.status === "accepted") {
          const { rows } = await client.query<{ status: string }>("SELECT status FROM cases WHERE lead_id = $1", [leadId]);
          if (rows[0]?.status === "closed") throw new RequestError(409, "This case is closed.");
        }

        await mkdir(directory, { recursive: true, mode: 0o700 });
        const output = await open(path, "wx", 0o600);
        createdFile = true;
        try {
          await output.writeFile(bytes);
        } finally {
          await output.close();
        }
        const { rows } = await client.query(
          `INSERT INTO documents (lead_id, uploader_user_id, sharing_firm_id, file_name, storage_key, size_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, file_name AS "fileName", size_bytes AS size, created_at AS "createdAt"`,
          [leadId, user.id, user.firmId, fileName, storageKey, bytes.byteLength],
        );
        return { ...rows[0], uploaderName: user.name };
      });
    });
  } catch (error) {
    // Preserve the file if a database disconnect makes commit success uncertain.
    if (createdFile) {
      const saved = await db().query("SELECT 1 FROM documents WHERE storage_key = $1", [storageKey]).catch(() => null);
      if (saved && saved.rowCount === 0) await unlink(path).catch(() => {});
    }
    throw error;
  }
}

export async function openDocument(user: User, id: string) {
  documentViewer(user);
  if (!isUuid(id)) throw new RequestError(404, "PDF not found.");

  return transaction(async (client) => {
    const { rows } = await client.query<{ file_name: string; storage_key: string }>(
      `SELECT d.file_name, d.storage_key
       FROM documents d JOIN leads l ON l.id = d.lead_id
       WHERE d.id = $1 AND ${reviewableLead} AND ${visibleDocument}
       FOR SHARE OF l`,
      [id, user.firmId, user.id],
    );
    const document = rows[0];
    if (!document) throw new RequestError(404, "PDF not found.");
    const bytes = await readFile(resolve(directory, `${document.storage_key}.pdf`));
    return { bytes, fileName: document.file_name };
  });
}
