import { NextResponse, type NextRequest } from "next/server";
import { adminFor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sameOrigin } from "@/lib/request";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { saveImage } from "@/lib/media";
import { mediaUrl } from "@/lib/media-url";
import { audit } from "@/lib/audit";
import { isExpected } from "@/lib/actions";

/** Receives one picture from the admin forms. Checked: same site, signed in, allowed to edit products or content, size-limited, really an image. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const a = await adminFor("products.manage");
  const b = "error" in a ? await adminFor("content.manage") : a;
  if ("error" in b) return NextResponse.json({ error: b.error === 401 ? "Please sign in again." : "You don’t have permission to upload images." }, { status: b.error });
  const admin = b.admin;
  if (!can(admin.role, "products.manage") && !can(admin.role, "content.manage")) return NextResponse.json({ error: "You don’t have permission to upload images." }, { status: 403 });
  const rl = await rateLimit(`upload:${admin.id}`, 60, 600);
  if (!rl.ok) return NextResponse.json({ error: "Too many uploads. Please wait a moment." }, { status: 429 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
    const kindRaw = String(form.get("kind") ?? "upload");
    const kind = kindRaw === "banner" || kindRaw === "logo" ? kindRaw : "upload";
    const asset = await saveImage(Buffer.from(await file.arrayBuffer()), { alt: "", kind });
    await audit({ id: admin.id, label: admin.email }, "media.upload", "media", asset.id, { kind }, await clientIp());
    return NextResponse.json({ id: asset.id, url: mediaUrl(asset, 400), width: asset.width, height: asset.height });
  } catch (e) {
    if (isExpected(e)) return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 });
  }
}
