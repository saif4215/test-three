import Link from "next/link";
import { getFeatures, getStoreSettings, orderingStatus } from "@/lib/settings";
import { getActiveAnnouncements, getLivePolicySlugs, getPublishedContent } from "@/lib/content";
import { hasSaleProducts, hasUniformProducts, listPublicCategories, listPublicCollections } from "@/lib/catalog/public";
import { getAsset } from "@/lib/media";
import { getAdmin } from "@/lib/auth";
import { getCustomer } from "@/lib/customers";
import { mediaUrl } from "@/lib/media-url";
import { safeUrl } from "@/lib/util";
import { AdminBar } from "@/components/admin-bar";
import { Providers } from "@/components/providers";
import { BagLink, FavLink, MobileNav, SearchBox, type NavLink } from "@/components/header-widgets";

const tone = (t: string) => (t === "important" ? "bg-danger text-white" : t === "promo" ? "bg-accent-strong text-white" : "bg-ink text-white");

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, features, content, announcements, categories, policies] = await Promise.all([
    getStoreSettings(),
    getFeatures(),
    getPublishedContent(),
    getActiveAnnouncements(),
    listPublicCategories(),
    getLivePolicySlugs(),
  ]);
  const [logo, admin, customer, uniformProducts, sale, collections] = await Promise.all([
    getAsset(settings.logoAssetId),
    getAdmin(),
    features.customer_sign_in ? getCustomer() : Promise.resolve(null),
    hasUniformProducts(),
    hasSaleProducts(),
    features.collections ? listPublicCollections() : Promise.resolve([]),
  ]);
  const uniformsAvailable = !!content.uniforms.intro.trim() || !!content.uniforms.sizeChartAssetId || !!safeUrl(settings.uniformsUrl) || uniformProducts;
  const live = categories.filter((c) => c.product_count > 0);
  const links: NavLink[] = [
    { href: "/shop", label: "Shop all" },
    { href: "/shop?sort=newest", label: "New" },
    ...live.slice(0, 3).map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
    ...(collections.length ? [{ href: "/collections", label: "Collections" }] : []),
    ...(uniformsAvailable ? [{ href: "/uniforms", label: content.uniforms.title || "Uniforms" }] : []),
    ...(sale ? [{ href: "/shop?sale=1", label: "Sale", tone: "sale" as const }] : []),
  ];
  const account = features.customer_sign_in ? (customer ? { href: "/account", label: "Account" } : { href: "/account/login", label: "Sign in" }) : null;
  const secondary: NavLink[] = [
    ...(features.order_tracking ? [{ href: "/track", label: "Track order" }] : []),
    { href: "/contact", label: "Contact" },
    ...(account ? [account] : []),
  ];
  const ordering = orderingStatus(features, settings);
  const top = announcements[0];
  const topLink = top?.link_url ? safeUrl(top.link_url) : null;
  const year = new Date().getFullYear();
  const org = settings.orgName.trim().toLowerCase() === settings.storeName.trim().toLowerCase() ? null : settings.orgName;
  const hasContact = content.contact.email || content.contact.phone || content.contact.address || content.contact.hours;

  return (
    <Providers>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {admin ? <AdminBar admin={admin} /> : null}
      {top ? (
        <div className={tone(top.tone)}>
          <p className="container-page py-2.5 text-center text-sm font-medium">
            {top.title}
            {topLink ? (
              <>
                {" "}
                <Link href={topLink} className="underline underline-offset-4">
                  {top.link_label || "Learn more"}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      <div className="hidden bg-soft md:block">
        <div className="container-page flex h-9 items-center justify-end gap-5 text-xs font-medium">
          {secondary.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-muted">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-4 lg:gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label={`${settings.storeName}: home`}>
            {logo ? <img src={mediaUrl(logo, 200)} alt="" width={logo.width} height={logo.height} className="h-9 w-auto max-w-36 object-contain" /> : null}
            <span className="whitespace-nowrap text-[1.6rem] font-extrabold leading-none tracking-[-0.045em]">{settings.storeName}</span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-1 whitespace-nowrap xl:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={`rounded-full px-3 py-2 text-base font-medium transition hover:bg-soft lg:px-4 ${l.tone === "sale" ? "text-danger" : ""}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SearchBox id="search-header" className="hidden w-48 md:block xl:w-56" />
            {features.wishlist ? <FavLink /> : null}
            {features.cart ? <BagLink /> : null}
            <MobileNav links={links} secondary={secondary} />
          </div>
        </div>
      </header>
      {ordering.banner ? (
        <div role="status" className="border-b border-line bg-soft">
          <p className="container-page flex items-center justify-center gap-2.5 py-2.5 text-center text-sm font-medium">
            <span aria-hidden="true" className="animate-pulse-dot inline-block size-2 shrink-0 rounded-full bg-ink" />
            <span>{ordering.banner}</span>
          </p>
        </div>
      ) : null}

      <main id="main" tabIndex={-1}>
        {children}
      </main>

      <footer className="on-dark mt-24 bg-ink text-white">
        <div className="container-page grid gap-12 py-14 md:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
          <div>
            <p className="text-3xl font-extrabold tracking-[-0.045em]">{settings.storeName}</p>
            {org ? <p className="mt-2 max-w-xs text-sm text-white/65">Merchandise from {org}.</p> : null}
            {safeUrl(settings.websiteUrl) || safeUrl(settings.uniformsUrl) ? (
              <ul className="mt-5 space-y-2 text-sm">
                {safeUrl(settings.websiteUrl) ? (
                  <li>
                    <a className="text-white/85 underline underline-offset-4 hover:text-white" href={safeUrl(settings.websiteUrl)!}>
                      Main website
                    </a>
                  </li>
                ) : null}
                {safeUrl(settings.uniformsUrl) ? (
                  <li>
                    <a className="text-white/85 underline underline-offset-4 hover:text-white" href={safeUrl(settings.uniformsUrl)!}>
                      Uniform information
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white">Shop</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              <li><Link href="/shop" className="hover:text-white">Shop all</Link></li>
              {live.slice(0, 6).map((c) => (
                <li key={c.id}><Link href={`/category/${c.slug}`} className="hover:text-white">{c.name}</Link></li>
              ))}
              {uniformsAvailable ? <li><Link href="/uniforms" className="hover:text-white">{content.uniforms.title || "Uniforms"}</Link></li> : null}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white">Help</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              {features.order_tracking ? <li><Link href="/track" className="hover:text-white">Track an order</Link></li> : null}
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              {policies.has("returns") ? <li><Link href="/policies/returns" className="hover:text-white">Returns</Link></li> : null}
              {policies.has("terms") ? <li><Link href="/policies/terms" className="hover:text-white">Terms of sale</Link></li> : null}
              {policies.has("privacy") ? <li><Link href="/policies/privacy" className="hover:text-white">Privacy</Link></li> : null}
              {content.footerLinks.map((l) =>
                safeUrl(l.href) ? (
                  <li key={l.label + l.href}>
                    <Link href={safeUrl(l.href)!} className="hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white">Contact</h2>
            {hasContact ? (
              <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                {content.contact.email ? (
                  <li>
                    <a className="underline underline-offset-4 hover:text-white" href={`mailto:${content.contact.email}`}>
                      {content.contact.email}
                    </a>
                  </li>
                ) : null}
                {content.contact.phone ? <li>{content.contact.phone}</li> : null}
                {content.contact.address ? <li className="whitespace-pre-line">{content.contact.address}</li> : null}
                {content.contact.hours ? <li className="whitespace-pre-line text-white/55">{content.contact.hours}</li> : null}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-white/65">
                Contact details will appear here once they have been added. See the{" "}
                <Link className="underline underline-offset-4 hover:text-white" href="/contact">
                  contact page
                </Link>
                .
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-white/15">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-white/60">
            <p>{content.footerNote || `© ${year} ${settings.orgName}`}</p>
          </div>
        </div>
      </footer>
    </Providers>
  );
}
