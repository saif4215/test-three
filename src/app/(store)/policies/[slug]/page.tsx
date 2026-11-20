import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPolicy } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { getStoreSettings } from "@/lib/settings";
import { PageHeading, Rich } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublicPolicy((await params).slug);
  return p ? { title: p.title, alternates: { canonical: `/policies/${p.slug}` } } : {};
}

/** Policy pages exist only when someone wrote the text AND approved it. We never invent policy wording. */
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, settings] = await Promise.all([params, getStoreSettings()]);
  const page = await getPublicPolicy(slug);
  if (!page) notFound();
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <PageHeading title={page.title}>Last updated {formatDate(page.updated_at, settings.timezone)}</PageHeading>
      <Rich html={renderMarkdown(page.body_md)} />
    </div>
  );
}
