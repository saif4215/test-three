import type { Metadata } from "next";
import { getFeatures, getStoreSettings, orderingStatus } from "@/lib/settings";
import { getLivePolicySlugs, getPublishedContent } from "@/lib/content";
import { getCustomer } from "@/lib/customers";
import { renderMarkdown } from "@/lib/markdown";
import { CheckoutForm } from "@/components/checkout-form";
import { EmptyState } from "@/components/ui";
import Link from "next/link";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [settings, features, content, policies] = await Promise.all([getStoreSettings(), getFeatures(), getPublishedContent(), getLivePolicySlugs()]);
  const ordering = orderingStatus(features, settings);
  const customer = features.customer_sign_in ? await getCustomer() : null;

  if (ordering.modes.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState
          title={ordering.title ?? "Ordering isn’t open yet"}
          action={
            <Link href="/shop" className="btn-primary">
              Keep browsing
            </Link>
          }
        >
          {ordering.message ?? "Please check back soon."}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="mb-8 text-3xl font-medium tracking-tight sm:text-4xl">Checkout</h1>
      <CheckoutForm
        config={{
          modes: ordering.modes,
          closed: ordering.open ? null : { title: ordering.title ?? "Ordering is closed", message: ordering.message ?? "" },
          studentInfo: settings.studentInfo,
          fulfillment: settings.fulfillmentMethods.filter((m) => m.enabled).map((m) => ({ id: m.id, label: m.label, feeCents: m.feeCents, instructionsHtml: renderMarkdown(m.instructions) })),
          requirePhone: settings.requirePhone,
          requireTerms: settings.requireTermsAcceptance,
          policies: { terms: policies.has("terms"), returns: policies.has("returns"), privacy: policies.has("privacy") },
          instructionsHtml: renderMarkdown([settings.checkoutInstructions, content.storeInstructions].filter(Boolean).join("\n\n")),
          prefill: customer ? { name: customer.name, email: customer.email } : null,
          signInHref: features.customer_sign_in && !customer ? "/account/login?next=/checkout" : null,
        }}
      />
    </div>
  );
}
