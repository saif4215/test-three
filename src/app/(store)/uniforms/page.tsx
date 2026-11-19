import Link from "next/link";
import type { Metadata } from "next";
import { getFeatures } from "@/lib/settings";
import { getPublishedContent } from "@/lib/content";
import { listProducts } from "@/lib/catalog/public";
import { getAsset } from "@/lib/media";
import { mediaUrl } from "@/lib/media-url";
import { renderMarkdown } from "@/lib/markdown";
import { safeUrl } from "@/lib/util";
import { getStoreSettings } from "@/lib/settings";
import { Alert, Photo, Rich } from "@/components/ui";
import { ProductGrid } from "@/components/product-card";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPublishedContent();
  return { title: c.uniforms.title || "Uniforms", alternates: { canonical: "/uniforms" } };
}

/**
 * Everything on this page is editable in the admin (Homepage & content, and the "Uniforms" category). Until something
 * is added it says so plainly: nothing about uniforms is invented here.
 */
export default async function UniformsPage() {
  const [content, features, settings, products] = await Promise.all([getPublishedContent(), getFeatures(), getStoreSettings(), listProducts({ category: "uniforms", pageSize: 24, sort: "name" })]);
  const u = content.uniforms;
  const [image, chart] = await Promise.all([getAsset(u.imageAssetId), getAsset(u.sizeChartAssetId)]);
  const official = safeUrl(settings.uniformsUrl);
  const hasInfo = !!u.intro.trim();
  return (
    <div className="container-page py-10 sm:py-14">
      <section className="grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h1 className="display text-6xl sm:text-8xl">{u.title || "Uniforms"}</h1>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/shop" className="btn-secondary">Shop all merchandise</Link>
            {official ? <a href={official} className="btn-secondary">Official uniform page</a> : null}
          </div>
        </div>
        {image ? <Photo image={{ ...image, kind: "banner" }} sizes="(min-width:1024px) 35vw, 100vw" priority className="aspect-[4/3] w-full" /> : null}
      </section>

      <div className="mt-14 space-y-14">
        <section aria-labelledby="info" className="max-w-3xl">
          <h2 id="info" className="section-title mb-3">Uniform information</h2>
          {hasInfo ? (
            <Rich html={renderMarkdown(u.intro)} />
          ) : (
            <Alert tone="info" title="Uniform details haven’t been added to this page yet">
              Please contact us for the current uniform requirements.
            </Alert>
          )}
        </section>

        {chart ? (
          <section aria-labelledby="sizes" className="max-w-3xl">
            <h2 id="sizes" className="section-title mb-3">Size chart</h2>
            <a href={mediaUrl(chart, 1600)} className="block bg-soft p-2" target="_blank" rel="noreferrer">
              <img src={mediaUrl(chart, 1200)} alt={u.sizeChartAlt || "Size chart"} width={chart.width} height={chart.height} className="h-auto w-full" />
            </a>
            <p className="mt-2 text-sm"><a className="underline underline-offset-4" href={mediaUrl(chart, 1600)} target="_blank" rel="noreferrer">Open full size</a></p>
          </section>
        ) : null}

        <section aria-labelledby="items">
          <h2 id="items" className="section-title mb-5">Uniform items</h2>
          {products.items.length > 0 ? (
            <ProductGrid products={products.items} wishlist={features.wishlist} columns={4} />
          ) : (
            <div className="rounded-2xl bg-soft px-6 py-14 text-center">
              <p className="text-lg font-medium">No uniform items are listed in the store yet.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">When products are added to the “Uniforms” category they appear here automatically.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
