import type { NextRequest } from "next/server";
import { api, json } from "@/server/http";
import { listCases } from "@/server/leads";
import { requireUser } from "@/server/session";

export function GET(request: NextRequest) {
  return api(request, async () => json(await listCases(await requireUser(request), request.nextUrl.searchParams)));
}
