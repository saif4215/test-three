import Link from "next/link";

/** Layout pieces shared by every admin page. Server-safe (no hooks); interactive forms live in admin-forms.tsx. */
export function AdminHeading({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
        {children ? <div className="mt-1.5 max-w-2xl text-base text-muted">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, children, actions, id, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; id?: string; className?: string }) {
  return (
    <section className={`card mb-6 min-w-0 p-6 ${className}`} aria-labelledby={id && title ? id : undefined}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id={id} className="scroll-mt-24 text-lg font-semibold">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function DataTable({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="card relative overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <th scope="col" className={`border-b border-line bg-soft px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted first:rounded-tl-2xl last:rounded-tr-2xl ${className}`}>
    {children}
  </th>
);
export const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => <td className={`border-b border-line px-4 py-3 align-middle last:border-r-0 ${className}`}>{children}</td>;

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {it.href ? (
              <Link href={it.href} className="hover:text-ink hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A tiny horizontal bar chart (no chart library): each row is a label, a bar sized to the largest value, and the number. */
export function BarList({ rows, format }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="font-medium tabular-nums">{format ? format(r.value) : r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-soft" aria-hidden="true">
            <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A link that downloads a file (a CSV). It is a plain anchor on purpose: the address is a file, not a page of the app. */
export function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} download className="btn-secondary btn-sm">
      {children}
    </a>
  );
}
