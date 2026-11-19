"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAction, fd, fdBool, UserError, type ActionState } from "@/lib/actions";
import { discardDraftContent, DEFAULT_CONTENT, POLICY_SLUGS, publishContent, saveDraftContent, savePolicyPage, siteContentSchema, type PolicySlug } from "@/lib/content";
import { loadStoreSettings } from "@/lib/settings";
import { fromLocalInput } from "@/lib/format";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isUuid, safeUrl } from "@/lib/util";

const id = (v: string) => (isUuid(v) ? v : null);

export async function saveContentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("content.manage", async (admin, ip) => {
    const g = (k: string) => fd(form, k);
    const banners = [0, 1, 2, 3].map((i) => ({ id: `b${i + 1}`, enabled: fdBool(form, `b${i}.enabled`), title: g(`b${i}.title`), text: g(`b${i}.text`), href: g(`b${i}.href`), assetId: id(g(`b${i}.assetId`)) })).filter((b) => b.title || b.text || b.href || b.assetId);
    const content = siteContentSchema.parse({
      hero: { headline: g("hero.headline") || DEFAULT_CONTENT.hero.headline, subheading: g("hero.subheading"), ctaLabel: g("hero.ctaLabel") || DEFAULT_CONTENT.hero.ctaLabel, ctaHref: g("hero.ctaHref") || "/shop", bannerAssetId: id(g("hero.bannerAssetId")) },
      sections: {
        showFeatured: fdBool(form, "sections.showFeatured"),
        showNewArrivals: fdBool(form, "sections.showNewArrivals"),
        showCategories: fdBool(form, "sections.showCategories"),
        showCollections: fdBool(form, "sections.showCollections"),
        showAnnouncements: fdBool(form, "sections.showAnnouncements"),
        featuredProductIds: form.getAll("featuredIds").map(String).filter(isUuid).slice(0, 12),
      },
      promoBanners: banners,
      contact: { email: g("contact.email"), phone: g("contact.phone"), address: String(form.get("contact.address") ?? "").trim(), hours: String(form.get("contact.hours") ?? "").trim() },
      uniforms: { showOnHome: fdBool(form, "uniforms.showOnHome"), title: g("uniforms.title") || "Uniforms", intro: String(form.get("uniforms.intro") ?? "").trim(), imageAssetId: id(g("uniforms.imageAssetId")), sizeChartAssetId: id(g("uniforms.sizeChartAssetId")), sizeChartAlt: g("uniforms.sizeChartAlt") },
      storeInstructions: String(form.get("storeInstructions") ?? "").trim(),
      footerLinks: [0, 1, 2, 3, 4, 5].map((i) => ({ label: g(`fl${i}.label`), href: g(`fl${i}.href`) })).filter((l) => l.label || l.href).map((l) => {
        if (!l.label || !l.href) throw new UserError("Each footer link needs both a name and an address.");
        if (!safeUrl(l.href)) throw new UserError(`Footer link “${l.label}” isn’t a valid address.`);
        return l;
      }),
      footerNote: g("footerNote"),
    });
    await saveDraftContent(content, { id: admin.id, label: admin.email }, ip);
    if (fd(form, "intent") === "publish") {
      await publishContent({ id: admin.id, label: admin.email }, ip);
      return "Published. The live website is updated.";
    }
    return "Draft saved. Visitors don’t see it until you publish.";
  });
  if (res.ok) revalidatePath("/admin/content");
  return res;
}

export async function discardDraftAction(): Promise<ActionState> {
  const res = await adminAction("content.manage", async (admin, ip) => {
    await discardDraftContent({ id: admin.id, label: admin.email }, ip);
    return "Draft changes discarded.";
  });
  if (res.ok) revalidatePath("/admin/content");
  return res;
}

export async function savePolicyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("content.manage", async (admin, ip) => {
    const slug = fd(form, "slug");
    if (!(POLICY_SLUGS as readonly string[]).includes(slug)) throw new UserError("Unknown page.");
    const approved = fdBool(form, "approved");
    await savePolicyPage(slug as PolicySlug, String(form.get("body") ?? ""), approved, { id: admin.id, label: admin.email }, ip);
    return approved ? "Saved and published." : "Saved. It stays hidden from customers until you tick “ICSI-approved”.";
  });
  if (res.ok) revalidatePath("/admin/content/pages");
  return res;
}

export async function saveAnnouncementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let savedId = "";
  const res = await adminAction("content.manage", async (admin, ip) => {
    const tz = (await loadStoreSettings()).timezone;
    const title = fd(form, "title");
    if (!title) throw new UserError("Give the announcement a title.");
    const link = fd(form, "linkUrl");
    if (link && !safeUrl(link)) throw new UserError("The link isn’t valid. Use a full address starting with https:// or a path such as /shop.");
    const tone = ["info", "promo", "important"].includes(fd(form, "tone")) ? fd(form, "tone") : "info";
    const starts = fromLocalInput(fd(form, "startsAt"), tz);
    const ends = fromLocalInput(fd(form, "endsAt"), tz);
    if (starts && ends && ends <= starts) throw new UserError("“Ends” must be after “Starts”.");
    const existing = id(fd(form, "id"));
    if (existing) {
      const r = await query("update announcements set title = $2, body_md = $3, tone = $4, link_url = $5, link_label = $6, starts_at = $7, ends_at = $8, active = $9 where id = $1", [existing, title, String(form.get("body") ?? "").slice(0, 2000), tone, link || null, fd(form, "linkLabel") || null, starts, ends, fdBool(form, "active")]);
      if (!r.rowCount) throw new UserError("That announcement no longer exists.");
      savedId = existing;
    } else {
      savedId = (await query<{ id: string }>("insert into announcements (title, body_md, tone, link_url, link_label, starts_at, ends_at, active) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id", [title, String(form.get("body") ?? "").slice(0, 2000), tone, link || null, fd(form, "linkLabel") || null, starts, ends, fdBool(form, "active")])).rows[0].id;
    }
    await audit({ id: admin.id, label: admin.email }, "announcement.save", "announcement", savedId, { name: title }, ip);
  });
  if (!res.ok) return res;
  revalidatePath("/admin/content/announcements");
  redirect(`/admin/content/announcements/${savedId}?saved=1`);
}

export async function deleteAnnouncementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("content.manage", async (admin, ip) => {
    const aid = id(fd(form, "id"));
    if (!aid) throw new UserError("That announcement wasn’t found.");
    const r = await query<{ title: string }>("delete from announcements where id = $1 returning title", [aid]);
    if (!r.rowCount) throw new UserError("That announcement no longer exists.");
    await audit({ id: admin.id, label: admin.email }, "announcement.delete", "announcement", aid, { name: r.rows[0].title }, ip);
    return "Deleted.";
  });
  if (res.ok) revalidatePath("/admin/content/announcements");
  return res;
}
