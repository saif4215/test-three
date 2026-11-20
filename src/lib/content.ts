import "server-only";
import { cache } from "react";
import { z } from "zod";
import { query } from "./db";
import { audit, type Actor } from "./audit";
import { safeUrl } from "./util";
import { UserError } from "./errors";

/**
 * Everything an owner can edit on the public site without touching code. Edits are saved as a DRAFT first; visitors
 * only see the PUBLISHED copy until someone presses Publish. Nothing here is pre-filled with invented facts: contact
 * details, policies and uniform information stay empty (and hidden) until the owner supplies them.
 */
const linkField = z.string().trim().max(300).default("");

export const siteContentSchema = z.object({
  hero: z
    .object({
      headline: z.string().trim().max(60).default("ICSI"),
      subheading: z.string().trim().max(200).default(""),
      ctaLabel: z.string().trim().max(30).default("Shop all"),
      ctaHref: linkField.default("/shop"),
      bannerAssetId: z.string().uuid().nullable().default(null),
    })
    .default({ headline: "ICSI", subheading: "", ctaLabel: "Shop all", ctaHref: "/shop", bannerAssetId: null }),
  sections: z
    .object({
      showFeatured: z.boolean().default(true),
      showNewArrivals: z.boolean().default(true),
      showCategories: z.boolean().default(true),
      showCollections: z.boolean().default(true),
      showAnnouncements: z.boolean().default(true),
      featuredProductIds: z.array(z.string().uuid()).max(12).default([]),
    })
    .default({ showFeatured: true, showNewArrivals: true, showCategories: true, showCollections: true, showAnnouncements: true, featuredProductIds: [] }),
  promoBanners: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        enabled: z.boolean().default(true),
        title: z.string().trim().max(80).default(""),
        text: z.string().trim().max(200).default(""),
        href: linkField,
        assetId: z.string().uuid().nullable().default(null),
      }),
    )
    .max(4)
    .default([]),
  contact: z
    .object({
      email: z.string().trim().max(254).default(""),
      phone: z.string().trim().max(60).default(""),
      address: z.string().trim().max(400).default(""),
      hours: z.string().trim().max(400).default(""),
    })
    .default({ email: "", phone: "", address: "", hours: "" }),
  uniforms: z
    .object({
      showOnHome: z.boolean().default(true),
      title: z.string().trim().max(60).default("Uniforms"),
      /** Only approved wording belongs here. Empty means the page says so plainly; nothing is invented. */
      intro: z.string().trim().max(5000).default(""),
      imageAssetId: z.string().uuid().nullable().default(null),
      sizeChartAssetId: z.string().uuid().nullable().default(null),
      sizeChartAlt: z.string().trim().max(300).default(""),
    })
    .default({ showOnHome: true, title: "Uniforms", intro: "", imageAssetId: null, sizeChartAssetId: null, sizeChartAlt: "" }),
  storeInstructions: z.string().trim().max(5000).default(""),
  footerLinks: z.array(z.object({ label: z.string().trim().min(1).max(60), href: z.string().trim().max(300) })).max(6).default([]),
  footerNote: z.string().trim().max(300).default(""),
});
export type SiteContent = z.infer<typeof siteContentSchema>;
export const DEFAULT_CONTENT: SiteContent = siteContentSchema.parse({});

function parseContent(raw: unknown): SiteContent {
  const r = siteContentSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  const stored = (raw ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const [k, schema] of Object.entries(siteContentSchema.shape)) {
    const one = (schema as z.ZodTypeAny).safeParse(stored[k]);
    if (one.success) merged[k] = one.data;
  }
  return siteContentSchema.parse(merged);
}

export async function loadPublishedContent(): Promise<SiteContent> {
  const r = await query<{ published: unknown }>("select published from site_content where id = 'main'");
  return parseContent(r.rows[0]?.published);
}
export const getPublishedContent = cache(loadPublishedContent);

export async function loadDraftContent(): Promise<{ draft: SiteContent; published: SiteContent; publishedAt: Date | null; hasUnpublished: boolean }> {
  const r = await query<{ draft: unknown; published: unknown; published_at: Date | null }>("select draft, published, published_at from site_content where id = 'main'");
  const row = r.rows[0];
  const published = parseContent(row?.published);
  // A brand-new site has no draft yet: start from what is live.
  const draft = row && Object.keys((row.draft ?? {}) as object).length ? parseContent(row.draft) : published;
  return { draft, published, publishedAt: row?.published_at ?? null, hasUnpublished: JSON.stringify(draft) !== JSON.stringify(published) };
}

/** Every link an owner types is checked: only http(s) addresses and paths on this site are allowed. */
export function validateContentLinks(c: SiteContent): void {
  const bad = (label: string, href: string) => {
    if (href && !safeUrl(href)) throw new UserError(`${label}: “${href}” isn’t a valid link. Use a full address starting with https:// or a path such as /shop.`);
  };
  bad("Hero button link", c.hero.ctaHref);
  c.promoBanners.forEach((b, i) => bad(`Banner ${i + 1} link`, b.href));
  c.footerLinks.forEach((l, i) => bad(`Footer link ${i + 1}`, l.href));
  if (c.contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.contact.email)) throw new UserError("The contact email address doesn’t look right.");
}

export async function saveDraftContent(content: SiteContent, actor: Actor, ip: string | null = null): Promise<void> {
  const value = siteContentSchema.parse(content);
  validateContentLinks(value);
  await query(
    `insert into site_content (id, draft, updated_at) values ('main', $1, now())
     on conflict (id) do update set draft = excluded.draft, updated_at = now()`,
    [JSON.stringify(value)],
  );
  await audit(actor, "content.draft", "site_content", "main", {}, ip);
}

export async function publishContent(actor: Actor, ip: string | null = null): Promise<void> {
  const { draft } = await loadDraftContent();
  validateContentLinks(draft);
  await query(
    `insert into site_content (id, draft, published, published_at, updated_at) values ('main', $1, $1, now(), now())
     on conflict (id) do update set published = excluded.published, draft = excluded.draft, published_at = now(), updated_at = now()`,
    [JSON.stringify(draft)],
  );
  await audit(actor, "content.publish", "site_content", "main", {}, ip);
}

export async function discardDraftContent(actor: Actor, ip: string | null = null): Promise<void> {
  await query("update site_content set draft = published, updated_at = now() where id = 'main'");
  await audit(actor, "content.discard", "site_content", "main", {}, ip);
}

/* ------------------------------------------------------------------ announcements */

export interface Announcement {
  id: string;
  title: string;
  body_md: string;
  tone: "info" | "promo" | "important";
  link_url: string | null;
  link_label: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  active: boolean;
}

export async function listActiveAnnouncements(): Promise<Announcement[]> {
  return (
    await query<Announcement>(
      `select id, title, body_md, tone, link_url, link_label, starts_at, ends_at, active from announcements
        where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        order by case tone when 'important' then 0 when 'promo' then 1 else 2 end, created_at desc limit 5`,
    )
  ).rows;
}
export const getActiveAnnouncements = cache(listActiveAnnouncements);

/* ------------------------------------------------------------------ policy pages (terms, privacy, returns) */

export const POLICY_SLUGS = ["returns", "terms", "privacy"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];
export const POLICY_TITLES: Record<PolicySlug, string> = { returns: "Returns", terms: "Terms of sale", privacy: "Privacy" };

export interface PolicyPage {
  slug: string;
  title: string;
  body_md: string;
  approved: boolean;
  updated_at: Date;
}

/** A policy is only public once it has text AND someone ticked "approved". We never invent policy wording. */
export async function getPublicPolicy(slug: string): Promise<PolicyPage | null> {
  const r = await query<PolicyPage>("select slug, title, body_md, approved, updated_at from pages where slug = $1 and approved and btrim(body_md) <> ''", [slug]);
  return r.rows[0] ?? null;
}

export async function listPolicyPages(): Promise<PolicyPage[]> {
  const rows = (await query<PolicyPage>("select slug, title, body_md, approved, updated_at from pages")).rows;
  const by = new Map(rows.map((r) => [r.slug, r]));
  return POLICY_SLUGS.map((slug) => by.get(slug) ?? { slug, title: POLICY_TITLES[slug], body_md: "", approved: false, updated_at: new Date(0) });
}

export async function savePolicyPage(slug: PolicySlug, body: string, approved: boolean, actor: Actor, ip: string | null = null): Promise<void> {
  if (approved && !body.trim()) throw new UserError("Write the text before approving it.");
  await query(
    `insert into pages (slug, title, body_md, approved, updated_at) values ($1, $2, $3, $4, now())
     on conflict (slug) do update set body_md = excluded.body_md, approved = excluded.approved, updated_at = now()`,
    [slug, POLICY_TITLES[slug], body.slice(0, 50_000), approved],
  );
  await audit(actor, "policy.save", "page", slug, { approved }, ip);
}

/** Which policy pages are live (used to decide which footer links and checkout links to show). */
export async function livePolicySlugs(): Promise<Set<string>> {
  const r = await query<{ slug: string }>("select slug from pages where approved and btrim(body_md) <> ''");
  return new Set(r.rows.map((x) => x.slug));
}
export const getLivePolicySlugs = cache(livePolicySlugs);
