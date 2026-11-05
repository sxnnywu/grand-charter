import { Pool } from "pg";

const globalDb = globalThis as typeof globalThis & { grandCharterPool?: Pool };

export function db() {
  if (!globalDb.grandCharterPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is missing");
    globalDb.grandCharterPool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  }
  return globalDb.grandCharterPool;
}

export async function transaction<T>(run: (client: import("pg").PoolClient) => Promise<T>) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
