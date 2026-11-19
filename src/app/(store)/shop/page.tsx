import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import type { RawParams } from "@/lib/shop-query";

export const metadata: Metadata = { title: "Shop all", alternates: { canonical: "/shop" } };

export default async function ShopPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <ShopView basePath="/shop" raw={await searchParams} heading="Shop all" />;
}
