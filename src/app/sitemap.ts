import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { listPublicCategories, publishedSlugs } from "@/lib/catalog/public";
import { getLivePolicySlugs } from "@/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = env.appUrl;
  const [products, categories, policies] = await Promise.all([publishedSlugs(), listPublicCategories(), getLivePolicySlugs()]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: "monthly" },
    ...categories.filter((c) => c.product_count > 0).map((c) => ({ url: `${base}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...[...policies].map((slug) => ({ url: `${base}/policies/${slug}`, changeFrequency: "yearly" as const })),
  ];
}
