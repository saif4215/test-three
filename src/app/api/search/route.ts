import { NextResponse, type NextRequest } from "next/server";
import { listProducts } from "@/lib/catalog/public";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/** Instant search suggestions for the header. Public data only (published products). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ items: [] });
  const rl = await rateLimit(`search:${await clientIp()}`, 120, 60);
  if (!rl.ok) return NextResponse.json({ items: [] }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const { items } = await listProducts({ q, pageSize: 6, sort: "featured" });
  return NextResponse.json(
    { items: items.map((p) => ({ slug: p.slug, name: p.name, category: p.category_name, priceCents: p.effective_price_cents, image: p.image ? { storage_key: p.image.storage_key, widths: p.image.widths, alt: p.image.alt } : null })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
