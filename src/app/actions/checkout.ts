"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import { isExpected } from "@/lib/actions";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { placeOrder } from "@/lib/orders/create";
import { notifyOrderPlaced } from "@/lib/orders/notify";
import { changeOrderStatus } from "@/lib/orders/manage";
import { getFeatures } from "@/lib/settings";
import { getCustomer } from "@/lib/customers";

export interface CheckoutState {
  error?: string;
}

const payloadSchema = z.object({ email: z.string().max(254).optional() }).passthrough();

/**
 * Receives the checkout form. The browser sends WHICH options and HOW MANY plus the person's details; the server
 * recomputes every price and places the order in one transaction.
 */
export async function submitOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  try {
    if (String(form.get("website") ?? "").trim()) return { error: "We couldn’t place your order. Please try again." }; // honeypot
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      throw new UserError("We couldn’t read your order. Please reload the page and try again.");
    }
    const meta = payloadSchema.parse(raw);
    const ip = await clientIp();
    const [a, b] = await Promise.all([rateLimit(`order:ip:${ip}`, 15, 3600), rateLimit(`order:email:${(meta.email ?? "").toLowerCase()}`, 8, 3600)]);
    if (!a.ok || !b.ok) throw new UserError("You’ve placed several orders in a short time. Please wait a little before trying again.");

    const features = await getFeatures();
    const customer = features.customer_sign_in ? await getCustomer() : null;
    const placed = await placeOrder(raw, { customerId: customer?.id ?? null });
    await notifyOrderPlaced(placed.orderId);

    if (placed.mode === "online") {
      const { createCheckoutSession } = await import("@/lib/payments/stripe");
      try {
        const { getOrder } = await import("@/lib/orders/queries");
        const found = await getOrder(placed.orderId);
        const url = await createCheckoutSession({
          id: placed.orderId,
          orderNumber: placed.orderNumber,
          email: placed.customerEmail,
          totalCents: placed.totalCents,
          itemCount: found?.items.reduce((n, i) => n + i.quantity, 0) ?? 1,
        });
        redirect(url);
      } catch (e) {
        unstable_rethrow(e);
        // No payment page means nothing can be paid: give the items back and say so.
        await changeOrderStatus(placed.orderId, "cancelled", { id: null, label: "system" }, "The payment page could not be created.").catch(() => {});
        throw e;
      }
    }
    redirect(`${placed.trackPath}&placed=1`);
  } catch (e) {
    unstable_rethrow(e);
    if (isExpected(e) || e instanceof UserError) return { error: (e as Error).message };
    console.error("[checkout] unexpected error", e);
    return { error: "Something went wrong and your order was not placed. Please try again." };
  }
}
