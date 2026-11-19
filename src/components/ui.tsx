import Link from "next/link";
import { formatMoney } from "@/lib/util";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";

type Tone = "neutral" | "ok" | "warn" | "danger" | "brand" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-soft text-ink",
  ok: "bg-green-100 text-green-900",
  warn: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-900",
  brand: "bg-brand text-brand-ink",
  accent: "bg-accent-soft text-accent-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "ok" | "warn" | "danger"; title?: string; children?: React.ReactNode }) {
  const styles = {
    info: "border-line bg-soft text-ink",
    ok: "border-green-300 bg-green-50 text-green-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    danger: "border-red-300 bg-red-50 text-red-900",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-6 py-16 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-md text-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** A price. When there is a sale, the sale price is green and the regular price is struck through (with a spoken label). */
export function Price({ cents, originalCents, className = "" }: { cents: number; originalCents?: number | null; className?: string }) {
  const sale = originalCents != null && originalCents > cents;
  return (
    <span className={className}>
      <span className={sale ? "font-medium text-ok" : "font-medium"}>{formatMoney(cents)}</span>
      {sale ? (
        <>
          {" "}
          <s className="text-muted">
            <span className="sr-only">Regular price </span>
            {formatMoney(originalCents)}
          </s>
        </>
      ) : null}
    </span>
  );
}

export interface ImageLike {
  storage_key: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  kind?: string;
}

export function Photo({
  image,
  sizes,
  priority = false,
  className = "",
  fallbackLabel = "Photo coming soon",
}: {
  image: ImageLike | null;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallbackLabel?: string;
}) {
  if (!image) {
    return (
      <div className={`flex items-center justify-center bg-soft p-4 text-center text-sm text-muted ${className}`} role="img" aria-label={fallbackLabel}>
        {fallbackLabel}
      </div>
    );
  }
  return (
    <img
      src={mediaUrl(image, 800)}
      srcSet={mediaSrcSet(image)}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={`object-cover ${className}`}
    />
  );
}

export function buildQuery(base: Record<string, string | undefined>, overrides: Record<string, string | undefined> = {}): string {
  const merged = { ...base, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function Pagination({ page, pageCount, basePath, query }: { page: number; pageCount: number; basePath: string; query: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `${basePath}${buildQuery(query, { page: p === 1 ? undefined : String(p) })}`;
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary btn-sm" rel="prev">
          Previous
        </Link>
      ) : null}
      {list.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - list[i - 1] > 1 ? <span aria-hidden="true">…</span> : null}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={p === page ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            <span className="sr-only">Page </span>
            {p}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} className="btn-secondary btn-sm" rel="next">
          Next
        </Link>
      ) : null}
    </nav>
  );
}

export function PageHeading({ title, children, count }: { title: string; children?: React.ReactNode; count?: number }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-medium tracking-tight sm:text-[2.5rem] sm:leading-tight">
        {title}
        {count !== undefined ? <span className="ml-2 text-muted">({count})</span> : null}
      </h1>
      {children ? <div className="mt-2 max-w-2xl text-muted">{children}</div> : null}
    </header>
  );
}

export function Rich({ html, className = "" }: { html: string; className?: string }) {
  // `html` is ALWAYS produced by renderMarkdown(), which sanitises with an allow-list.
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
