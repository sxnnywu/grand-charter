import type { NextRequest } from "next/server";
import { listDocuments, uploadDocument } from "@/server/documents";
import { api, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { idempotencyKey } from "@/server/idempotency";

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json({ documents: await listDocuments(user, id) });
  });
}

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json({ document: await uploadDocument(user, id, request, idempotencyKey(request)) }, 201);
  });
}
