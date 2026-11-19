import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryBySlug } from "@/lib/catalog/public";
import { ShopView } from "@/components/shop-view";
import type { RawParams } from "@/lib/shop-query";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCategoryBySlug((await params).slug);
  return c ? { title: c.name, description: c.description || undefined, alternates: { canonical: `/category/${c.slug}` } } : {};
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  return <ShopView basePath={`/category/${category.slug}`} raw={await searchParams} category={category.slug} heading={category.name} intro={category.description || undefined} />;
}
