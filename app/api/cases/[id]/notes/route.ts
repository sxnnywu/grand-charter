import type { NextRequest } from "next/server";
import { addCaseNote, listCaseNotes } from "@/server/case-work";
import { api, json, jsonObject } from "@/server/http";
import { requireUser } from "@/server/session";
import { idempotencyKey } from "@/server/idempotency";

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json(await listCaseNotes(user, id, request.nextUrl.searchParams.get("before") ?? undefined));
  });
}

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    const { body } = await jsonObject(request);
    return json({ note: await addCaseNote(user, id, body, idempotencyKey(request)) }, 201);
  });
}
