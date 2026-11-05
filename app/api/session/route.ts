import type { NextRequest } from "next/server";
import { api, json, jsonObject } from "@/server/http";
import { currentUser, demoAccounts, setSessionCookie, signIn, signOut } from "@/server/session";

export function GET(request: NextRequest) {
  return api(request, async () => {
    const [user, accounts] = await Promise.all([currentUser(request), demoAccounts()]);
    return json({ user, accounts });
  });
}

export function POST(request: NextRequest) {
  return api(request, async () => {
    const { user, id } = await signIn(request, await jsonObject(request));
    const response = json({ user });
    setSessionCookie(request, response, id);
    return response;
  });
}

export function DELETE(request: NextRequest) {
  return api(request, async () => {
    await signOut(request);
    const response = json({ user: null });
    setSessionCookie(request, response, null);
    return response;
  });
}
