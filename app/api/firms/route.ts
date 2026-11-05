import type { NextRequest } from "next/server";
import { listFirms } from "@/server/admin";
import { api, json } from "@/server/http";
import { requireUser } from "@/server/session";

export function GET(request: NextRequest) {
  return api(request, async () => json({ firms: await listFirms(await requireUser(request)) }));
}
