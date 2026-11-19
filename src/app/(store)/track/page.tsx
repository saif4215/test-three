import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFeatures } from "@/lib/settings";
import { trackOrder } from "@/lib/orders/tracking";
import { trackingPath } from "@/lib/orders/tracking-code";
import { clientIp } from "@/lib/rate-limit";
import { getOrderByNumber } from "@/lib/orders/queries";
import { Alert, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ orderNumber?: string; code?: string }> }) {
  const features = await getFeatures();
  if (!features.order_tracking) {
    return (
      <div className="container-page max-w-2xl py-12">
        <PageHeading title="Track your order">Order tracking isn’t available right now.</PageHeading>
      </div>
    );
  }
  const sp = await searchParams;
  const orderNumber = (sp.orderNumber ?? "").trim().toUpperCase().slice(0, 30);
  const code = (sp.code ?? "").trim().slice(0, 64);
  let problem: string | null = null;
  if (orderNumber || code) {
    const res = await trackOrder(orderNumber, code, await clientIp());
    if (res.ok) {
      const found = await getOrderByNumber(orderNumber);
      if (found) redirect(trackingPath(found.order.order_number, found.order.id));
    }
    problem = !res.ok && res.reason === "limited" ? "Too many attempts. Please wait a few minutes and try again." : "We couldn’t find an order with that number and code. Check them and try again.";
  }
  return (
    <div className="container-page max-w-2xl py-10 sm:py-14">
      <PageHeading title="Track your order">Use the private link from your confirmation email, or enter your order number and tracking code.</PageHeading>
      {problem ? (
        <div className="mb-6">
          <Alert tone="danger">{problem}</Alert>
        </div>
      ) : null}
      <form method="get" action="/track" className="space-y-5 rounded-2xl border border-line p-6 sm:p-8">
        <div>
          <label htmlFor="orderNumber" className="label">
            Order number
          </label>
          <input id="orderNumber" name="orderNumber" required placeholder="ICSI-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" className="field uppercase" maxLength={30} defaultValue={orderNumber} />
        </div>
        <div>
          <label htmlFor="code" className="label">
            Tracking code
          </label>
          <input id="code" name="code" required autoComplete="off" className="field" maxLength={64} />
          <p className="hint">Find this in the private link on your confirmation page or email.</p>
        </div>
        <button type="submit" className="btn-primary">
          View order
        </button>
      </form>
    </div>
  );
}
