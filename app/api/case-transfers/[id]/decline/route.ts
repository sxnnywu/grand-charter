import type { NextRequest } from "next/server";
import { decideCaseTransfer } from "@/server/leads";
import { api, json } from "@/server/http";
import { requireUser } from "@/server/session";

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json(await decideCaseTransfer(user, id, "decline"));
  });
}
