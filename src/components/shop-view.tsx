import Link from "next/link";
import { getFeatures } from "@/lib/settings";
import { getFacets, listProducts, listPublicCategories } from "@/lib/catalog/public";
import { SORT_LABELS, type SortKey } from "@/lib/catalog/types";
import { parseShopParams, type RawParams } from "@/lib/shop-query";
import { formatMoney } from "@/lib/util";
import { buildQuery, EmptyState, Pagination } from "./ui";
import { ProductGrid } from "./product-card";
import { ShopFilters } from "./shop-filters";
import { Icon } from "./icons";

const round5 = (cents: number) => Math.round(cents / 500) * 500;

/** One filter choice is a link: choosing it adds it to the address, choosing it again removes it. */
function Choice({ href, active, children, kind = "text" }: { href: string; active: boolean; children: React.ReactNode; kind?: "text" | "box" | "chip" }) {
  if (kind === "box")
    return (
      <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className={`grid min-h-11 place-items-center rounded-md border px-2 text-base transition ${active ? "border-ink ring-1 ring-ink" : "border-line-strong hover:border-ink"}`}>
        {children}
      </Link>
    );
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className={`flex items-center justify-between gap-2 py-1.5 text-base hover:underline ${active ? "font-semibold" : "text-ink/85"}`}>
      <span>{children}</span>
      {active ? <Icon name="check" size={18} /> : null}
    </Link>
  );
}

function Group({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium">
        {title}
        <Icon name="chevron-down" size={20} className="transition group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export async function ShopView({
  basePath,
  raw,
  category,
  heading,
  intro,
}: {
  basePath: string;
  raw: RawParams;
  /** Set on a category page: the category is fixed by the address, not a choice. */
  category?: string;
  heading: string;
  intro?: React.ReactNode;
}) {
  const { filters, query, sort } = parseShopParams(raw, { category });
  const [features, list, facets, categories] = await Promise.all([getFeatures(), listProducts({ ...filters, pageSize: 24 }), getFacets(), listPublicCategories()]);
  const href = (over: Record<string, string | undefined>) => `${basePath}${buildQuery(query, { page: undefined, ...over })}`;
  const toggle = (key: string, value: string) => href({ [key]: query[key] === value ? undefined : value });

  // Price steps from what the store actually sells.
  const spread = facets.maxCents - facets.minCents;
  const t1 = round5(facets.minCents + spread / 3);
  const t2 = round5(facets.minCents + (spread * 2) / 3);
  const ranges =
    spread >= 500 && t1 < t2
      ? [
          { label: `Under ${formatMoney(t1)}`, min: undefined, max: String(t1 / 100) },
          { label: `${formatMoney(t1)} – ${formatMoney(t2)}`, min: String(t1 / 100), max: String(t2 / 100) },
          { label: `Over ${formatMoney(t2)}`, min: String(t2 / 100), max: undefined },
        ]
      : [];

  const live = categories.filter((c) => c.product_count > 0);
  const active: { label: string; href: string }[] = [];
  if (query.size) active.push({ label: `Size ${query.size}`, href: href({ size: undefined }) });
  if (query.color) active.push({ label: query.color, href: href({ color: undefined }) });
  if (query.min || query.max) active.push({ label: ranges.find((r) => r.min === query.min && r.max === query.max)?.label ?? `${query.min ? `$${query.min}` : "Up"} – ${query.max ? `$${query.max}` : "any"}`, href: href({ min: undefined, max: undefined }) });
  if (query.instock) active.push({ label: "In stock", href: href({ instock: undefined }) });
  if (query.sale) active.push({ label: "On sale", href: href({ sale: undefined }) });
  if (!category && query.category) active.push({ label: live.find((c) => c.slug === query.category)?.name ?? query.category, href: href({ category: undefined }) });

  const panel = (
    <div>
      {!category ? (
        <nav aria-label="Categories" className="pb-4">
          <ul className="space-y-0.5">
            <li>
              <Choice href={href({ category: undefined })} active={!query.category}>
                All
              </Choice>
            </li>
            {live.map((c) => (
              <li key={c.id}>
                <Choice href={href({ category: query.category === c.slug ? undefined : c.slug })} active={query.category === c.slug}>
                  {c.name}
                </Choice>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <nav aria-label="Categories" className="pb-4">
          <ul className="space-y-0.5">
            <li>
              <Link href="/shop" className="flex py-1.5 text-base text-ink/85 hover:underline">
                All merchandise
              </Link>
            </li>
            {live.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} aria-current={c.slug === category ? "page" : undefined} className={`flex items-center justify-between py-1.5 text-base hover:underline ${c.slug === category ? "font-semibold" : "text-ink/85"}`}>
                  {c.name}
                  {c.slug === category ? <Icon name="check" size={18} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Group title="Quick filters">
        <ul className="space-y-0.5">
          <li>
            <Choice href={toggle("instock", "1")} active={!!query.instock}>
              In stock only
            </Choice>
          </li>
          <li>
            <Choice href={toggle("sale", "1")} active={!!query.sale}>
              On sale
            </Choice>
          </li>
        </ul>
      </Group>
      {facets.sizes.length > 0 ? (
        <Group title="Size">
          <div className="grid grid-cols-3 gap-2">
            {facets.sizes.map((s) => (
              <Choice key={s} kind="box" href={toggle("size", s)} active={query.size?.toLowerCase() === s.toLowerCase()}>
                {s}
              </Choice>
            ))}
          </div>
        </Group>
      ) : null}
      {facets.colors.length > 0 ? (
        <Group title="Colour">
          <ul className="space-y-0.5">
            {facets.colors.map((c) => (
              <li key={c}>
                <Choice href={toggle("color", c)} active={query.color?.toLowerCase() === c.toLowerCase()}>
                  {c}
                </Choice>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
      {ranges.length > 0 ? (
        <Group title="Price">
          <ul className="space-y-0.5">
            {ranges.map((r) => (
              <li key={r.label}>
                <Choice href={href({ min: query.min === r.min && query.max === r.max ? undefined : r.min, max: query.min === r.min && query.max === r.max ? undefined : r.max })} active={query.min === r.min && query.max === r.max}>
                  {r.label}
                </Choice>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
    </div>
  );

  const sortMenu = (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full px-4 py-2 text-base font-medium hover:bg-soft">
        <span>
          Sort By<span className="sr-only">: {SORT_LABELS[sort]}</span>
        </span>
        <Icon name="chevron-down" size={20} className="transition group-open:rotate-180" />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-60 rounded-2xl border border-line bg-white p-2 shadow-xl">
        {(Object.keys(SORT_LABELS) as SortKey[])
          .filter((k) => (query.q ? true : k !== "featured" || true))
          .map((k) => (
            <li key={k}>
              <Link href={href({ sort: k })} aria-current={k === sort ? "true" : undefined} className={`block rounded-lg px-3 py-2 text-base hover:bg-soft ${k === sort ? "font-semibold" : ""}`}>
                {SORT_LABELS[k]}
              </Link>
            </li>
          ))}
      </ul>
    </details>
  );

  const chips =
    active.length > 0 ? (
      <ul className="mt-5 flex flex-wrap items-center gap-2" aria-label="Active filters">
        {active.map((a) => (
          <li key={a.label}>
            <Link href={a.href} className="inline-flex items-center gap-2 rounded-full bg-soft px-4 py-1.5 text-sm font-medium hover:bg-line">
              {a.label}
              <Icon name="close" size={14} />
              <span className="sr-only"> (remove filter)</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href={`${basePath}${buildQuery({ q: query.q, category: category ? undefined : undefined })}`} className="px-2 text-sm font-medium underline underline-offset-4">
            Clear all
          </Link>
        </li>
      </ul>
    ) : null;

  const title = query.q ? `Results for “${query.q}”` : heading;
  const paginationQuery = { ...query, page: undefined };

  return (
    <ShopFilters
      activeCount={active.length}
      heading={
        <>
          <h1 className="text-2xl font-medium tracking-tight sm:text-[1.75rem]">
            {title} <span className="text-muted">({list.total})</span>
          </h1>
          {intro ? <div className="mt-1 max-w-xl text-muted">{intro}</div> : null}
        </>
      }
      sort={sortMenu}
      chips={chips}
      panel={panel}
    >
      {list.items.length === 0 ? (
        <EmptyState
          title={active.length || query.q ? "No products match" : "Nothing here yet"}
          action={
            active.length || query.q ? (
              <Link href={basePath} className="btn-primary">
                Clear filters
              </Link>
            ) : (
              <Link href="/" className="btn-primary">
                Back to home
              </Link>
            )
          }
        >
          {active.length || query.q ? "Try removing a filter or searching for something else." : "Merchandise will appear here as soon as it has been added."}
        </EmptyState>
      ) : (
        <>
          <ProductGrid products={list.items} wishlist={features.wishlist} />
          <Pagination page={list.page} pageCount={list.pageCount} basePath={basePath} query={paginationQuery} />
        </>
      )}
    </ShopFilters>
  );
}
