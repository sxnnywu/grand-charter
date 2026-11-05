import type { NextRequest } from "next/server";
import { api, json } from "@/server/http";
import { acceptLead } from "@/server/leads";
import { requireUser } from "@/server/session";

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json({ caseId: await acceptLead(user, id) });
  });
}
