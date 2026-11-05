import type { NextRequest } from "next/server";
import { updateCaseStatus } from "@/server/case-work";
import { api, json, jsonObject } from "@/server/http";
import { requireUser } from "@/server/session";

export function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    const { status } = await jsonObject(request);
    return json({ status: await updateCaseStatus(user, id, status) });
  });
}
