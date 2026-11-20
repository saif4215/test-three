import "server-only";
import { pool, type Db } from "./db";

export interface Actor {
  id: string | null;
  label: string;
}

/**
 * The activity log. Every administrative change writes one row: who, what, which record, and a small detail object.
 * Never put passwords, tokens or API keys in `detail`.
 */
export async function audit(
  actor: Actor | null,
  action: string,
  entity = "",
  entityId = "",
  detail: Record<string, unknown> = {},
  ip: string | null = null,
  db: Db = pool(),
): Promise<void> {
  try {
    await db.query("insert into audit_log (actor_id, actor_label, action, entity, entity_id, detail, ip) values ($1, $2, $3, $4, $5, $6, $7)", [
      actor?.id ?? null,
      actor?.label ?? "system",
      action,
      entity,
      entityId,
      JSON.stringify(detail),
      ip,
    ]);
  } catch (e) {
    // A failed log write must not undo (or block) the action that was just taken, but it must not be silent either.
    console.error("[audit] could not write the log entry", action, (e as Error).message);
  }
}
