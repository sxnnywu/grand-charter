import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { isUuid, RequestError } from "./http";

export function idempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key") ?? undefined;
  if (!isUuid(key)) throw new RequestError(400, "Include a valid Idempotency-Key header.");
  return key;
}

export function requestHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function idempotent<T>(
  client: PoolClient,
  userId: string,
  operation: string,
  key: string,
  hash: string,
  create: () => Promise<T>,
): Promise<T> {
  // The unique claim, business change and stored response share one transaction.
  // A concurrent retry waits for the first transaction to commit or roll back.
  const claim = await client.query(
    `INSERT INTO idempotency_requests (user_id, operation, key, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, operation, key) DO NOTHING
     RETURNING key`,
    [userId, operation, key, hash],
  );

  if (!claim.rowCount) {
    const { rows: [previous] } = await client.query<{ request_hash: string; response: T | null }>(
      `SELECT request_hash, response FROM idempotency_requests
       WHERE user_id = $1 AND operation = $2 AND key = $3`,
      [userId, operation, key],
    );
    if (previous.request_hash !== hash) {
      throw new RequestError(409, "This request key was already used with different input.");
    }
    if (previous.response === null) throw new Error("An idempotency response was not saved.");
    return previous.response;
  }

  const result = await create();
  await client.query(
    `UPDATE idempotency_requests SET response = $4
     WHERE user_id = $1 AND operation = $2 AND key = $3`,
    [userId, operation, key, JSON.stringify(result)],
  );
  return result;
}
