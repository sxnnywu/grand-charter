import type { NextRequest } from "next/server";
import { api, json, jsonObject } from "@/server/http";
import { listLeads, submitLead } from "@/server/leads";
import { requireUser } from "@/server/session";
import { idempotencyKey } from "@/server/idempotency";

export function GET(request: NextRequest) {
  return api(request, async () => json(await listLeads(await requireUser(request), request.nextUrl.searchParams)));
}

export function POST(request: NextRequest) {
  return api(request, async () => {
    const user = await requireUser(request);
    const lead = await submitLead(user, await jsonObject(request), idempotencyKey(request));
    return json({ lead }, 201);
  });
}
