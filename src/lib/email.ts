import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";
import { query } from "./db";
import { isFeatureOn } from "./settings";

function transporter() {
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/** A real connection and sign-in to the mail server (nothing is sent). */
export async function verifySmtp(): Promise<{ ok: boolean; detail: string }> {
  try {
    await transporter().verify();
    return { ok: true, detail: `Connected to ${env.smtp.host}:${env.smtp.port}${env.smtp.user ? " and signed in" : " (no login required)"}.` };
  } catch (e) {
    return { ok: false, detail: `Could not connect to the mail server: ${(e as Error).message}` };
  }
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  template?: string;
  orderId?: string | null;
}

/**
 * Sends one email if email is switched on AND verified. Every attempt is recorded in the outbox so a failure is visible
 * to the owner. It never throws: a mail problem must not make an order fail.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!(await isFeatureOn("email_notifications"))) return { sent: false, skipped: true };
  const row = await query<{ id: string }>(
    "insert into email_outbox (to_email, subject, text_body, html_body, template, related_order_id) values ($1, $2, $3, $4, $5, $6) returning id",
    [msg.to, msg.subject, msg.text, msg.html, msg.template ?? "", msg.orderId ?? null],
  );
  const id = row.rows[0].id;
  try {
    await transporter().sendMail({ from: env.smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    await query("update email_outbox set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null where id = $1", [id]);
    return { sent: true };
  } catch (e) {
    const error = (e as Error).message.slice(0, 300);
    await query("update email_outbox set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1", [id, error]);
    console.error("[email] send failed:", error);
    return { sent: false, error };
  }
}

/** Tries again for messages that failed (called from the admin "Email log"). Returns how many were delivered. */
export async function retryFailedEmails(limit = 20): Promise<number> {
  if (!(await isFeatureOn("email_notifications"))) return 0;
  const rows = (
    await query<{ id: string; to_email: string; subject: string; text_body: string; html_body: string }>(
      "select id, to_email, subject, text_body, html_body from email_outbox where status = 'failed' and attempts < 5 order by created_at limit $1",
      [limit],
    )
  ).rows;
  let ok = 0;
  for (const m of rows) {
    try {
      await transporter().sendMail({ from: env.smtp.from, to: m.to_email, subject: m.subject, text: m.text_body, html: m.html_body });
      await query("update email_outbox set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null where id = $1", [m.id]);
      ok++;
    } catch (e) {
      await query("update email_outbox set attempts = attempts + 1, last_error = $2 where id = $1", [m.id, (e as Error).message.slice(0, 300)]);
    }
  }
  return ok;
}
