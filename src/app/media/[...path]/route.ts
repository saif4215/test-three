import { NextResponse, type NextRequest } from "next/server";
import { getObject, isValidKey } from "@/lib/storage";

/** Serves processed product photos. Only keys that match our own pattern are read, so no other file can be reached. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = path.join("/");
  if (!isValidKey(key)) return new NextResponse("Not found", { status: 404 });
  const obj = await getObject(key);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: { "Content-Type": obj.contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
