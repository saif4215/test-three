import { NextResponse, type NextRequest } from "next/server";
import { getProductCardsByIds } from "@/lib/catalog/public";
import { isUuid } from "@/lib/util";

/** Public details for the products in a visitor's favourites (only published products are ever returned). */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(isUuid).slice(0, 60);
  const cards = await getProductCardsByIds(ids);
  return NextResponse.json({ items: cards }, { headers: { "Cache-Control": "no-store" } });
}
