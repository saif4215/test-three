import { NextResponse, type NextRequest } from "next/server";
import { missingConfig } from "@/lib/integrations";
import { handleStripeWebhook } from "@/lib/payments/stripe";

/** Stripe calls this when a payment succeeds or a payment page expires. The signature is checked before anything is read. */
export async function POST(req: NextRequest) {
  if (missingConfig("stripe").length) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  const raw = await req.text();
  const res = await handleStripeWebhook(raw, req.headers.get("stripe-signature"));
  // Even if the feature was switched off meanwhile, a payment that already happened is still recorded.
  return NextResponse.json({ message: res.message }, { status: res.status });
}
