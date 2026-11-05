import type { NextRequest } from "next/server";
import { leadHistory } from "@/server/admin";
import { api, json } from "@/server/http";
import { requireUser } from "@/server/session";

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    return json({ events: await leadHistory(user, id) });
  });
}
