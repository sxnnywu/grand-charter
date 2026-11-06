import { NextResponse, type NextRequest } from "next/server";

export class RequestError extends Error {
  constructor(public readonly status: number, message: string, public readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function api(request: NextRequest, run: () => Promise<NextResponse>) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && origin !== `${request.nextUrl.protocol}//${host}`) {
        throw new RequestError(403, "This action must come from Brief.");
      }
    }
    return await run();
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message, ...(error.fieldErrors && { fieldErrors: error.fieldErrors }) }, error.status);
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

export async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new RequestError(415, "Send a JSON request.");
  }
  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError(400, "Send a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}
