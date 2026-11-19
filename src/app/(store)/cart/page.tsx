import type { Metadata } from "next";
import { getFeatures } from "@/lib/settings";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = { title: "Bag", robots: { index: false } };

export default async function CartPage() {
  const features = await getFeatures();
  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="mb-8 text-3xl font-medium tracking-tight sm:text-4xl">Bag</h1>
      <CartView cartEnabled={features.cart} />
    </div>
  );
}
