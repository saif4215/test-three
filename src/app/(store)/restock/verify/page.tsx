import type { Metadata } from "next";
import Link from "next/link";
import { verifyRestock } from "@/lib/restock";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Back-in-stock alert", robots: { index: false } };

export default async function VerifyRestockPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const ok = token.length >= 16 && (await verifyRestock(token));
  return (
    <div className="container-page max-w-2xl py-14">
      <PageHeading title={ok ? "You’re all set" : "That link didn’t work"}>
        {ok ? "We’ll email you once when this item is back in stock." : "The link may be old or incomplete. Try asking for the alert again from the product page."}
      </PageHeading>
      <Link href="/shop" className="btn-primary">Keep shopping</Link>
    </div>
  );
}
