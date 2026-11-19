import "server-only";
import Stripe from "stripe";
import { env } from "../env";
import { query } from "../db";
import { UserError } from "../errors";
import { markOrderPaid, changeOrderStatus } from "../orders/manage";
import { trackingUrl } from "../orders/tracking-code";

/**
 * Card payments through Stripe Checkout. Card numbers never touch this server: the customer pays on Stripe's page.
 * Nothing here runs unless STRIPE_* keys are set AND "Verify" succeeded in Admin > Settings.
 */
function client(): Stripe {
  const opts: ConstructorParameters<typeof Stripe>[1] = { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "icsi-store" } };
  if (env.stripe.apiBase) {
    const u = new URL(env.stripe.apiBase); // a local stand-in used only by automated tests
    Object.assign(opts, { host: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), protocol: u.protocol.replace(":", "") });
  }
  return new Stripe(env.stripe.secretKey, opts);
}

/** A real, harmless call to Stripe (reads the account balance) to prove the secret key works. */
export async function verifyStripe(): Promise<{ ok: boolean; detail: string }> {
  try {
    const bal = await client().balance.retrieve();
    if (!env.stripe.webhookSecret.startsWith("whsec_")) return { ok: false, detail: "Stripe accepted the secret key, but STRIPE_WEBHOOK_SECRET should start with “whsec_”. Copy it from the webhook endpoint in Stripe." };
    return { ok: true, detail: `Connected to Stripe in ${bal.livemode ? "LIVE" : "test"} mode. Make sure the webhook endpoint ${env.appUrl}/api/webhooks/stripe is set up in Stripe.` };
  } catch (e) {
    const err = e as Stripe.errors.StripeError;
    return { ok: false, detail: `Stripe rejected the request: ${err.message ?? "unknown error"}` };
  }
}

export interface CheckoutOrder {
  id: string;
  orderNumber: string;
  email: string;
  totalCents: number;
  itemCount: number;
}

/** Creates the Stripe page the customer pays on and returns its address. The amount is the server-computed order total. */
export async function createCheckoutSession(order: CheckoutOrder): Promise<string> {
  try {
    const session = await client().checkout.sessions.create({
      mode: "payment",
      customer_email: order.email,
      client_reference_id: order.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.orderNumber }, description: `Order ${order.orderNumber}` },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "usd", unit_amount: order.totalCents, product_data: { name: `Order ${order.orderNumber}`, description: `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}` } },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${trackingUrl(order.orderNumber, order.id)}&paid=1`,
      cancel_url: `${env.appUrl}/cart`,
    });
    if (!session.url) throw new Error("Stripe returned no payment page");
    await query("update orders set stripe_session_id = $2 where id = $1", [order.id, session.id]);
    return session.url;
  } catch (e) {
    console.error("[stripe] could not create a payment page:", (e as Error).message);
    throw new UserError("We couldn’t start the card payment. Nothing was charged. Please try again, or choose “order request” if it’s offered.");
  }
}

/** Verifies the signature on a webhook call and applies it. Returns an HTTP status to answer with. */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ status: number; message: string }> {
  if (!signature) return { status: 400, message: "Missing signature" };
  let event: Stripe.Event;
  try {
    event = client().webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
  } catch {
    return { status: 400, message: "Invalid signature" };
  }
  const obj = event.data.object as Stripe.Checkout.Session;
  const orderId = obj.metadata?.orderId ?? obj.client_reference_id ?? null;
  if (!orderId) return { status: 200, message: "ignored: no order" };
  const known = await query<{ total_cents: number; status: string }>("select total_cents, status from orders where id = $1 and stripe_session_id = $2", [orderId, obj.id]);
  if (!known.rowCount) return { status: 200, message: "ignored: unknown session" };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (obj.payment_status === "paid") {
        // The amount Stripe collected must be exactly what we asked for. If not, don't confirm: leave a note for staff to look at.
        if (typeof obj.amount_total === "number" && obj.amount_total !== known.rows[0].total_cents) {
          const note = `Stripe reported a payment of ${(obj.amount_total / 100).toFixed(2)} dollars but this order is ${(known.rows[0].total_cents / 100).toFixed(2)} dollars. It was NOT marked paid. Check the payment in Stripe.`;
          await query("insert into order_events (order_id, from_status, to_status, note, actor_label) values ($1, $2, $2, $3, 'stripe')", [orderId, known.rows[0].status, note]);
          return { status: 200, message: "ignored: amount mismatch" };
        }
        await markOrderPaid(orderId, typeof obj.payment_intent === "string" ? obj.payment_intent : null);
      }
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      try {
        await query("update orders set payment_status = 'failed' where id = $1 and payment_status = 'pending'", [orderId]);
        await changeOrderStatus(orderId, "cancelled", { id: null, label: "stripe" }, "The card payment wasn’t completed.");
      } catch {
        /* already moved on */
      }
      break;
    default:
      break;
  }
  return { status: 200, message: "ok" };
}
