import type { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { isUuid, RequestError } from "./http";

export type User = {
  id: string;
  name: string;
  role: "plaintiff" | "attorney" | "paralegal" | "admin";
  firmId: string | null;
  firmName: string | null;
};

const cookieName = "grand_charter_session";
const sessionHours = 8;
const demoPassword = "grand-charter-demo";
const userColumns = 'u.id, u.name, u.role, u.firm_id AS "firmId", f.name AS "firmName"';

function sessionId(request: NextRequest) {
  const id = request.cookies.get(cookieName)?.value;
  return isUuid(id) ? id : null;
}

export async function currentUser(request: NextRequest): Promise<User | null> {
  const id = sessionId(request);
  if (!id) return null;
  const { rows } = await db().query<User>(
    `SELECT ${userColumns}
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN firms f ON f.id = u.firm_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  return rows[0] ?? null;
}

export async function requireUser(request: NextRequest): Promise<User> {
  const user = await currentUser(request);
  if (!user) throw new RequestError(401, "Sign in to continue.");
  return user;
}

export async function demoAccounts() {
  const { rows } = await db().query(
    `SELECT u.id, u.name, u.email, u.role, f.name AS "firmName"
     FROM users u LEFT JOIN firms f ON f.id = u.firm_id
     WHERE u.is_demo ORDER BY u.role, u.name`,
  );
  return rows;
}

export async function signIn(request: NextRequest, body: Record<string, unknown>) {
  if (typeof body.email !== "string" || body.password !== demoPassword) {
    throw new RequestError(401, "That email or password is incorrect.");
  }
  const { rows } = await db().query<User>(
    `SELECT ${userColumns}
     FROM users u LEFT JOIN firms f ON f.id = u.firm_id
     WHERE lower(u.email) = $1 AND u.is_demo`,
    [body.email.trim().toLowerCase()],
  );
  const user = rows[0];
  if (!user) throw new RequestError(401, "That email or password is incorrect.");

  const session = await db().query<{ id: string }>(
    `WITH previous_session AS (DELETE FROM sessions WHERE id = $1)
     INSERT INTO sessions (user_id, expires_at)
     VALUES ($2, now() + $3 * interval '1 hour')
     RETURNING id`,
    [sessionId(request), user.id, sessionHours],
  );
  return { user, id: session.rows[0].id };
}

export async function signOut(request: NextRequest) {
  const id = sessionId(request);
  if (id) await db().query("DELETE FROM sessions WHERE id = $1", [id]);
}

export function setSessionCookie(request: NextRequest, response: NextResponse, id: string | null) {
  response.cookies.set(cookieName, id ?? "", {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: id ? sessionHours * 60 * 60 : 0,
  });
}
