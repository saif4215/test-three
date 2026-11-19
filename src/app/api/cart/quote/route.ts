import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cartItemsSchema, quoteCart } from "@/lib/orders/quote";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ items: cartItemsSchema, promoCode: z.string().max(60).nullable().optional(), fulfillmentId: z.string().max(40).nullable().optional() });

/** Real prices and availability for what is in a visitor's bag. Read-only; it never changes anything. */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`quote:${await clientIp()}`, 240, 60);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const quote = await quoteCart(parsed.data.items, { promoCode: parsed.data.promoCode, fulfillmentId: parsed.data.fulfillmentId });
  return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
}
