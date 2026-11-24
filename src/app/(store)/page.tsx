import Link from "next/link";
import type { Metadata } from "next";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { getActiveAnnouncements, getPublishedContent, loadDraftContent, type SiteContent } from "@/lib/content";
import { collectionProducts, featuredProducts, getProductCardsByIds, hasUniformProducts, listPublicCategories, listPublicCollections, newArrivals } from "@/lib/catalog/public";
import { getAsset } from "@/lib/media";
import { getAdmin } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { safeUrl } from "@/lib/util";
import { Alert, Photo, Rich } from "@/components/ui";
import { Carousel } from "@/components/carousel";
import { ProductCard } from "@/components/product-card";

export async function generateMetadata(): Promise<Metadata> {
  const [s, c] = await Promise.all([getStoreSettings(), getPublishedContent()]);
  const same = s.orgName.trim().toLowerCase() === s.storeName.trim().toLowerCase();
  return { title: { absolute: same ? s.storeName : `${s.storeName} | ${s.orgName}` }, description: c.hero.subheading || undefined, alternates: { canonical: "/" } };
}

/** The width of one product in a sideways-scrolling row (wider when there are only a few, so the row never looks empty). */
const itemClass = (n: number) =>
  n <= 3 ? "w-[64%] shrink-0 snap-start sm:w-[46%] md:w-[32%] lg:w-[32.2%]" : "w-[64%] shrink-0 snap-start sm:w-[42%] md:w-[31%] lg:w-[23.6%]";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  const [settings, features, publishedContent, announcements, categories] = await Promise.all([
    getStoreSettings(),
    getFeatures(),
    getPublishedContent(),
    getActiveAnnouncements(),
    listPublicCategories(),
  ]);
  const collections = features.collections ? await listPublicCollections({ featuredOnly: true }) : [];

  // Staff can look at unpublished homepage edits with ?preview=1.
  let content: SiteContent = publishedContent;
  let previewing = false;
  if (sp.preview === "1") {
    const admin = await getAdmin();
    if (admin) {
      content = (await loadDraftContent()).draft;
      previewing = true;
    }
  }

  const manualIds = content.sections.featuredProductIds;
  const [featuredRaw, arrivals, banner, uniformImage, uniformProducts] = await Promise.all([
    content.sections.showFeatured ? (manualIds.length ? getProductCardsByIds(manualIds) : featuredProducts(10)) : Promise.resolve([]),
    newArrivals(10),
    getAsset(content.hero.bannerAssetId),
    getAsset(content.uniforms.imageAssetId),
    hasUniformProducts(),
  ]);
  const featuredIds = new Set(featuredRaw.map((p) => p.id));
  const fresh = content.sections.showNewArrivals ? arrivals.filter((p) => !featuredIds.has(p.id)) : [];
  const liveCollections = content.sections.showCollections && features.collections ? collections.slice(0, 2) : [];
  const collectionRows = await Promise.all(liveCollections.map(async (c) => ({ c, products: (await collectionProducts(c.id)).slice(0, 10) })));
  const homeCategories = categories.filter((c) => c.show_on_home && c.product_count > 0);
  const banners = content.promoBanners.filter((b) => b.enabled && b.title);
  const bannerAssets = await Promise.all(banners.map((b) => getAsset(b.assetId)));

  const seen = new Set<string>();
  const picks = [...featuredRaw, ...arrivals].filter((p) => (p.image && !seen.has(p.id) ? (seen.add(p.id), true) : false)).slice(0, 3);
  const hasProducts = featuredRaw.length + arrivals.length > 0;
  // On an empty store, a signed-in team member is shown what to do next (shoppers just see "coming soon").
  const emptyStoreAdmin = hasProducts ? null : await getAdmin();
  const ctaHref = safeUrl(content.hero.ctaHref) ?? "/shop";
  const uniformsUrl = safeUrl(settings.uniformsUrl);
  const uniformsReady = !!content.uniforms.intro.trim() || !!content.uniforms.sizeChartAssetId || !!uniformsUrl || uniformProducts;
  const showUniformBand = content.uniforms.showOnHome && uniformsReady;
  const wish = features.wishlist;

  // Left, centre and right photos of the hero: the strongest product goes in the middle.
  const order = picks.length === 3 ? [picks[1], picks[0], picks[2]] : picks.length === 2 ? [picks[0], picks[1]] : picks;

  return (
    <>
      {previewing ? (
        <div className="container-page pt-4">
          <Alert tone="warn" title="Draft preview">
            This is how your unpublished homepage edits look. Visitors still see the published version.{" "}
            <Link className="underline" href="/admin/content">
              Back to the editor
            </Link>
          </Alert>
        </div>
      ) : null}

      {banner ? (
        <section aria-label="Welcome" className="relative isolate overflow-hidden bg-ink text-white">
          <Photo image={{ ...banner, kind: "banner" }} sizes="100vw" priority className="absolute inset-0 -z-10 size-full opacity-80" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="container-page flex min-h-[28rem] flex-col justify-end pb-10 pt-24 sm:min-h-[38rem] sm:pb-14">
            <h1 className="display animate-rise max-w-5xl text-[22vw] sm:text-[12rem] lg:text-[15rem]">{content.hero.headline}</h1>
            {content.hero.subheading ? <p className="mt-4 max-w-xl text-lg text-white/90">{content.hero.subheading}</p> : null}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={ctaHref} className="inline-flex min-h-12 items-center rounded-full bg-white px-8 text-base font-medium text-ink transition hover:opacity-80">
                {content.hero.ctaLabel}
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section aria-label="Welcome" className="overflow-hidden bg-soft">
          <div className="container-page pb-10 pt-8 sm:pb-14 sm:pt-10">
            <h1 className="display animate-rise select-none text-center text-[min(32vw,20rem)] leading-[0.9] text-ink">{content.hero.headline}</h1>
            {order.length > 0 ? (
              <div className="animate-rise relative z-0 mx-auto -mt-[min(5vw,3.5rem)] flex w-full max-w-4xl items-end justify-center gap-2 [animation-delay:150ms] sm:gap-5">
                {order.map((p, i) => {
                  const centre = order.length === 3 ? i === 1 : order.length === 1 || i === 0;
                  return (
                    <Link
                      key={p.id}
                      href={`/products/${p.slug}`}
                      tabIndex={-1}
                      aria-hidden="true"
                      className={`block overflow-hidden bg-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.45)] transition duration-500 hover:-translate-y-1.5 ${centre ? "w-[46%] sm:w-[40%]" : "w-[27%] sm:w-[28%]"}`}
                    >
                      <Photo image={p.image} sizes="(min-width:1024px) 30vw, 46vw" priority className="aspect-[4/5] w-full" />
                    </Link>
                  );
                })}
              </div>
            ) : null}
            <div className="relative z-10 mt-8 flex flex-col items-center text-center">
              {content.hero.subheading ? <p className="mb-4 max-w-md text-lg text-muted">{content.hero.subheading}</p> : null}
              <div className="flex flex-wrap justify-center gap-3">
                <Link href={ctaHref} className="btn-primary !min-h-14 !px-10 text-base">
                  {content.hero.ctaLabel}
                </Link>
                {features.order_tracking ? (
                  <Link href="/track" className="btn-secondary !min-h-14 !px-10 text-base">
                    Track an order
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="container-page space-y-20 pt-16 sm:space-y-24 sm:pt-20">
        {content.sections.showAnnouncements && announcements.length > 0 ? (
          <section aria-label="Announcements" className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className={`rounded-2xl border px-6 py-5 ${a.tone === "important" ? "border-red-300 bg-red-50" : a.tone === "promo" ? "border-accent/40 bg-accent-soft" : "border-line bg-soft"}`}>
                <p className="text-lg font-medium">{a.title}</p>
                {a.body_md ? <Rich html={renderMarkdown(a.body_md)} className="!text-sm" /> : null}
                {a.link_url && safeUrl(a.link_url) ? (
                  <Link href={safeUrl(a.link_url)!} className="mt-1 inline-block text-sm font-medium underline underline-offset-4">
                    {a.link_label || "Learn more"}
                  </Link>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {!hasProducts ? (
          <section className="rounded-2xl bg-soft px-6 py-20 text-center">
            <h2 className="display text-5xl sm:text-7xl">Coming soon</h2>
            <p className="mx-auto mt-4 max-w-md text-muted">The store is getting ready. Please check back shortly.</p>
            {emptyStoreAdmin ? (
              <div className="mx-auto mt-8 max-w-md border-t border-line pt-6">
                <p className="text-sm text-muted">Only you and your team see this part. Shoppers see “Coming soon” until there are products.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Link href="/admin/products/new" className="btn-primary">Add your first product</Link>
                  <Link href="/admin" className="btn-secondary">Or try sample products</Link>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {featuredRaw.length > 0 ? (
          <Carousel title="Featured" href="/shop?sort=featured">
            {featuredRaw.map((p, i) => (
              <ProductCard key={p.id} product={p} wishlist={wish} priority={i < 3} className={itemClass(featuredRaw.length)} />
            ))}
          </Carousel>
        ) : null}

        {content.sections.showCategories && homeCategories.length > 0 ? (
          <section aria-labelledby="cats">
            <h2 id="cats" className="section-title mb-5">
              Shop by category
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
              {homeCategories.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-soft">
                    {c.image ? <Photo image={c.image} sizes="(min-width:1024px) 24vw, (min-width:768px) 32vw, 48vw" className="size-full transition duration-700 group-hover:scale-[1.04]" /> : null}
                    <span className="absolute bottom-3 left-3 rounded-full bg-white px-5 py-2.5 text-base font-medium shadow-sm transition group-hover:bg-ink group-hover:text-white sm:bottom-5 sm:left-5">
                      {c.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {banners.length > 0 ? (
          <section aria-label="Promotions" className="grid gap-2 sm:gap-3 md:grid-cols-2">
            {banners.map((b, i) => {
              const href = safeUrl(b.href);
              const asset = bannerAssets[i];
              const inner = (
                <div className="relative isolate flex min-h-72 flex-col justify-end overflow-hidden bg-soft p-6 sm:min-h-96 sm:p-8">
                  {asset ? <Photo image={{ ...asset, kind: "banner" }} sizes="(min-width:768px) 50vw, 100vw" className="absolute inset-0 -z-10 size-full" /> : null}
                  {asset ? <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 to-transparent" /> : null}
                  <p className={`display text-4xl sm:text-6xl ${asset ? "text-white" : ""}`}>{b.title}</p>
                  {b.text ? <p className={`mt-2 max-w-md ${asset ? "text-white/90" : "text-muted"}`}>{b.text}</p> : null}
                  {href ? <span className={`mt-5 inline-flex min-h-11 w-fit items-center rounded-full px-6 text-base font-medium ${asset ? "bg-white text-ink" : "bg-ink text-white"}`}>Shop</span> : null}
                </div>
              );
              return href ? (
                <Link key={b.id} href={href} className="block transition hover:opacity-90">
                  {inner}
                </Link>
              ) : (
                <div key={b.id}>{inner}</div>
              );
            })}
          </section>
        ) : null}

        {fresh.length > 0 ? (
          <Carousel title="New arrivals" href="/shop?sort=newest">
            {fresh.map((p) => (
              <ProductCard key={p.id} product={p} wishlist={wish} className={itemClass(fresh.length)} />
            ))}
          </Carousel>
        ) : null}

        {collectionRows.map(({ c, products }) =>
          products.length ? (
            <div key={c.id}>
              <Carousel title={c.title} href={`/collections/${c.slug}`} linkLabel="View collection">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} wishlist={wish} className={itemClass(products.length)} />
                ))}
              </Carousel>
              {c.description ? <p className="mt-3 max-w-2xl text-muted">{c.description}</p> : null}
            </div>
          ) : null,
        )}

        {showUniformBand ? (
          <section aria-labelledby="uniform-band" className="grid items-center gap-8 bg-soft p-8 sm:p-12 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 id="uniform-band" className="display text-5xl sm:text-7xl">
                {content.uniforms.title}
              </h2>
              {content.uniforms.intro ? <p className="mt-4 line-clamp-3 max-w-2xl text-muted">{content.uniforms.intro.replace(/[#*_>`-]/g, "").trim()}</p> : null}
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/uniforms" className="btn-primary">
                  Uniform details
                </Link>
                {uniformsUrl ? (
                  <a href={uniformsUrl} className="btn-secondary">
                    Official uniform page
                  </a>
                ) : null}
              </div>
            </div>
            {uniformImage ? <Photo image={{ ...uniformImage, kind: "banner" }} sizes="(min-width:1024px) 30vw, 100vw" className="aspect-[4/3] w-full" /> : null}
          </section>
        ) : null}

        {content.storeInstructions ? (
          <section aria-labelledby="how" className="border-t border-line pt-12">
            <h2 id="how" className="section-title">
              More about ordering
            </h2>
            <Rich html={renderMarkdown(content.storeInstructions)} className="mt-3 max-w-3xl" />
          </section>
        ) : null}
      </div>
    </>
  );
}
