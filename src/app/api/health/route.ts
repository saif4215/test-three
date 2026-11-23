import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runMaintenanceIfDue } from "@/lib/maintenance";

/**
 * For hosting health checks: answers 200 only when the database is reachable. Reveals nothing else.
 * It also nudges the housekeeping job (at most once every five minutes); that runs after the answer is sent.
 */
export async function GET() {
  try {
    await query("select 1");
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  void runMaintenanceIfDue();
  return NextResponse.json({ ok: true });
}
