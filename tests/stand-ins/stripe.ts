import http from "node:http";
import Stripe from "stripe";

/**
 * A local stand-in for the parts of Stripe that the store uses, used ONLY by automated tests: reading the balance, creating
 * a Checkout page, a pay page, and sending signed webhooks like Stripe does. No money is involved.
 */
export interface FakeStripeSession {
  id: string;
  orderId: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
}

export type FakeStripeEvent = "checkout.session.completed" | "checkout.session.expired" | "checkout.session.async_payment_failed";

export interface FakeStripe {
  url: string;
  secretKey: string;
  webhookSecret: string;
  sessions: FakeStripeSession[];
  /** Sends a signed event for a session to the store's webhook address. Resolves with the store's HTTP status. */
  send(sessionId: string, type: FakeStripeEvent, opts?: { amount?: number; badSignature?: boolean }): Promise<number>;
  close(): Promise<void>;
}

/** `deliver` is either the store's base address (webhooks are POSTed there over HTTP) or a function that hands the signed event to code directly. */
export type Deliver = string | ((payload: string, signature: string) => Promise<number>);

export async function startFakeStripe(deliver: Deliver, port = 0, creds = { secretKey: "sk_test_stand_in", webhookSecret: "whsec_standin0123456789" }): Promise<FakeStripe> {
  const sessions: FakeStripeSession[] = [];
  let base = "";

  async function send(sessionId: string, type: FakeStripeEvent, opts: { amount?: number; badSignature?: boolean } = {}): Promise<number> {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) throw new Error(`unknown session ${sessionId}`);
    const paid = type === "checkout.session.completed";
    const payload = JSON.stringify({
      id: `evt_${Math.random().toString(36).slice(2)}`,
      object: "event",
      api_version: "2025-01-01",
      type,
      data: {
        object: {
          id: s.id,
          object: "checkout.session",
          client_reference_id: s.orderId,
          metadata: { orderId: s.orderId },
          amount_total: opts.amount ?? s.amount,
          currency: "usd",
          payment_status: paid ? "paid" : "unpaid",
          payment_intent: paid ? `pi_${s.id.slice(-8)}` : null,
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.badSignature ? "whsec_wrong" : creds.webhookSecret });
    if (typeof deliver === "function") return deliver(payload, header);
    const res = await fetch(`${deliver}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
    return res.status;
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const u = new URL(req.url ?? "/", base || "http://localhost");
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const authed = String(req.headers.authorization ?? "") === `Bearer ${creds.secretKey}`;
      if (u.pathname.startsWith("/v1/") && !authed) return json(401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });
      if (u.pathname === "/v1/balance") return json(200, { object: "balance", livemode: false, available: [], pending: [] });
      if (u.pathname === "/v1/checkout/sessions" && req.method === "POST") {
        const p = new URLSearchParams(raw);
        const id = `cs_test_${Math.random().toString(36).slice(2, 12)}`;
        const s: FakeStripeSession = {
          id,
          orderId: p.get("metadata[orderId]") ?? p.get("client_reference_id") ?? "",
          amount: Number(p.get("line_items[0][price_data][unit_amount]") ?? 0),
          successUrl: p.get("success_url") ?? "",
          cancelUrl: p.get("cancel_url") ?? "",
        };
        sessions.push(s);
        return json(200, { id, object: "checkout.session", url: `${base}/pay/${id}`, payment_status: "unpaid", amount_total: s.amount });
      }
      const pay = /^\/pay\/([^/]+)(\/complete|\/cancel)?$/.exec(u.pathname);
      if (pay) {
        const s = sessions.find((x) => x.id === pay[1]);
        if (!s) return json(404, { error: "no such session" });
        if (pay[2] === "/complete" && req.method === "POST") {
          await send(s.id, "checkout.session.completed");
          res.writeHead(303, { location: s.successUrl });
          return res.end();
        }
        if (pay[2] === "/cancel" && req.method === "POST") {
          res.writeHead(303, { location: s.cancelUrl });
          return res.end();
        }
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(
          `<!doctype html><title>Stand-in payment page</title><h1>Stand-in payment page</h1><p>Total: $${(s.amount / 100).toFixed(2)} (no real money)</p>` +
            `<form method="post" action="/pay/${s.id}/complete"><button>Pay</button></form><form method="post" action="/pay/${s.id}/cancel"><button>Cancel</button></form>`,
        );
      }
      json(404, { error: { message: "not found" } });
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url: base, ...creds, sessions, send, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
