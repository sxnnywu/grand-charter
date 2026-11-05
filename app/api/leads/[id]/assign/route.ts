import type { NextRequest } from "next/server";
import { assignLead } from "@/server/admin";
import { api, json, jsonObject } from "@/server/http";
import { requireUser } from "@/server/session";

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    const { firmId } = await jsonObject(request);
    return json({ lead: await assignLead(user, id, firmId) });
  });
}
