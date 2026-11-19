import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeRestock } from "@/lib/restock";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const ok = token.length >= 16 && (await unsubscribeRestock(token));
  return (
    <div className="container-page max-w-2xl py-14">
      <PageHeading title={ok ? "You’re unsubscribed" : "Nothing to unsubscribe"}>
        {ok ? "We won’t email you about this item again." : "That link was already used or isn’t valid."}
      </PageHeading>
      <Link href="/shop" className="btn-primary">Back to the shop</Link>
    </div>
  );
}
