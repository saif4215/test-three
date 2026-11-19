import "server-only";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  // Survives hot reloads in development so connections are not leaked.
  var __icsiPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__icsiPool) {
    globalThis.__icsiPool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    globalThis.__icsiPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return globalThis.__icsiPool;
}

export async function closePool() {
  if (globalThis.__icsiPool) {
    await globalThis.__icsiPool.end();
    globalThis.__icsiPool = undefined;
  }
}

export function query<R extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<R>> {
  return pool().query<R>(text, params);
}

/** Runs `fn` in a transaction. Commits if it returns, rolls back if it throws. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* the original error matters more */
    }
    throw err;
  } finally {
    client.release();
  }
}

export type Db = Pick<PoolClient, "query">;
