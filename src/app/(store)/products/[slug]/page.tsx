import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeatures, getStoreSettings, orderingStatus } from "@/lib/settings";
import { getProductBySlug, relatedProducts } from "@/lib/catalog/public";
import { getAdmin } from "@/lib/auth";
import { renderMarkdown, markdownToText } from "@/lib/markdown";
import { mediaUrl } from "@/lib/media-url";
import { env } from "@/lib/env";
import { Alert, Rich } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Carousel } from "@/components/carousel";
import { ProductCard } from "@/components/product-card";
import { ProductExperience } from "@/components/product-experience";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return {};
  const description = p.short_description || markdownToText(p.description_md, 160) || undefined;
  const image = p.images[0] ? `${env.appUrl}${mediaUrl(p.images[0], 1200)}` : undefined;
  return { title: p.name, description, alternates: { canonical: `/products/${p.slug}` }, openGraph: { title: p.name, description, images: image ? [image] : undefined } };
}

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-line py-5 last:border-b">
      <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-medium">
        {title}
        <Icon name="chevron-down" size={22} className="transition group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // Drafts and archived products can only be previewed by signed-in staff.
  const preview = sp.preview === "1" && !!(await getAdmin());
  const [settings, features] = await Promise.all([getStoreSettings(), getFeatures()]);
  const product = await getProductBySlug(slug, { allowUnpublished: preview, lowStockDefault: settings.lowStockDefault });
  if (!product) notFound();

  const related = product.status === "published" ? await relatedProducts(product.id, 8) : [];
  const ordering = orderingStatus(features, settings);
  const published = product.status === "published";
  const canOrder = features.cart && ordering.open && published;
  const orderingNote = !published ? "Preview only: this product can’t be ordered until it is published." : !features.cart ? "This item is available to view only right now." : (ordering.message ?? "Ordering isn’t open yet. Please check back soon.");
  const lowest = product.variants.length ? Math.min(...product.variants.map((v) => v.unit_price_cents)) : 0;
  const inStock = product.variants.some((v) => v.available);

  const infoLines: string[] = [];
  if (features.cart && ordering.modes.length > 0 && published) {
    infoLines.push(ordering.modes.includes("online") && ordering.modes.includes("request") ? "Pay online or send an order request" : ordering.modes.includes("online") ? "Secure card payment" : "Order request: we confirm it, and you aren’t charged online");
    for (const m of settings.fulfillmentMethods.filter((x) => x.enabled)) infoLines.push(`${m.label}${m.feeCents > 0 ? ` (${(m.feeCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })})` : ""}`);
    if (features.order_tracking) infoLines.push("Private link to track your order");
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.short_description || markdownToText(product.description_md, 300) || undefined,
    sku: product.sku || undefined,
    image: product.images.map((i) => `${env.appUrl}${mediaUrl(i, 1200)}`),
    offers: { "@type": "Offer", priceCurrency: "USD", price: (lowest / 100).toFixed(2), availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${env.appUrl}/products/${product.slug}` },
  };

  return (
    <div className="container-page py-8 sm:py-10">
      {preview && !published ? (
        <div className="mb-6">
          <Alert tone="warn" title={`Preview: this product is ${product.status === "draft" ? "a draft" : "archived"}`}>
            Only signed-in staff can see this page. Customers cannot.{" "}
            <Link href="/admin/products" className="underline">
              Back to products
            </Link>
          </Alert>
        </div>
      ) : null}
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/shop" className="hover:text-ink hover:underline">
              Shop
            </Link>
          </li>
          {product.categories[0] ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`/category/${product.categories[0].slug}`} className="hover:text-ink hover:underline">
                  {product.categories[0].name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-ink">
            {product.name}
          </li>
        </ol>
      </nav>

      <ProductExperience
        product={product}
        categoryName={product.categories[0]?.name ?? null}
        isNew={product.is_new}
        maxQuantity={settings.maxQuantityPerLine}
        canOrder={canOrder}
        orderingNote={orderingNote}
        wishlist={features.wishlist && published}
        restock={features.restock_alerts && published}
        sizeGuideHtml={renderMarkdown(product.size_chart_md)}
        infoLines={infoLines}
      >
        <div>
          {product.description_md ? (
            <Accordion title="Description" open>
              <Rich html={renderMarkdown(product.description_md)} />
            </Accordion>
          ) : null}
          {product.instructions_md ? (
            <Accordion title="Good to know">
              <Rich html={renderMarkdown(product.instructions_md)} />
            </Accordion>
          ) : null}
          {product.tags.length ? (
            <p className="border-t border-line pt-5 text-sm text-muted">
              Tags:{" "}
              {product.tags.map((t, i) => (
                <span key={t}>
                  {i > 0 ? ", " : ""}
                  <Link className="underline underline-offset-2 hover:text-ink" href={`/shop?q=${encodeURIComponent(t)}`}>
                    {t}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </ProductExperience>

      {related.length > 0 ? (
        <div className="mt-20">
          <Carousel title="You Might Also Like">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} wishlist={features.wishlist} className="w-[64%] shrink-0 snap-start sm:w-[42%] md:w-[31%] lg:w-[23.6%]" />
            ))}
          </Carousel>
        </div>
      ) : null}

      {published ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
    </div>
  );
}
