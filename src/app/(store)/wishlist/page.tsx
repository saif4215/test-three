import type { Metadata } from "next";
import { getFeatures } from "@/lib/settings";
import { WishlistView } from "@/components/wishlist-view";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Favourites", robots: { index: false } };

export default async function WishlistPage() {
  const features = await getFeatures();
  return (
    <div className="container-page py-8 sm:py-12">
      <PageHeading title="Favourites">Products you’ve saved. They stay in this browser.</PageHeading>
      {features.wishlist ? <WishlistView /> : <p className="text-muted">Favourites aren’t available right now.</p>}
    </div>
  );
}
