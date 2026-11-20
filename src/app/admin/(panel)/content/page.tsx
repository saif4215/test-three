import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadDraftContent } from "@/lib/content";
import { listAdminProducts } from "@/lib/catalog/admin";
import { getAssets } from "@/lib/media";
import { mediaUrl } from "@/lib/media-url";
import { AdminHeading, Section } from "@/components/admin-ui";
import { ActionButton, ActionForm, ImagePicker, SubmitButton, Toggle } from "@/components/admin-forms";
import { ProductPicker } from "@/components/product-picker";
import { Alert } from "@/components/ui";
import { discardDraftAction, saveContentAction } from "./actions";

export const metadata = { title: "Homepage & content" };

export default async function ContentPage() {
  await requireAdmin("content.manage");
  const [{ draft: c, hasUnpublished }, products] = await Promise.all([loadDraftContent(), listAdminProducts({ status: "published", pageSize: 100 })]);
  const ids = [c.hero.bannerAssetId, c.uniforms.imageAssetId, c.uniforms.sizeChartAssetId, ...c.promoBanners.map((b) => b.assetId)].filter((x): x is string => !!x);
  const assets = await getAssets(ids);
  const url = (id: string | null) => (id && assets.get(id) ? mediaUrl(assets.get(id)!, 400) : null);
  const banners = [0, 1, 2, 3].map((i) => c.promoBanners[i] ?? { id: `b${i + 1}`, enabled: true, title: "", text: "", href: "", assetId: null });
  const links = [0, 1, 2, 3, 4, 5].map((i) => c.footerLinks[i] ?? { label: "", href: "" });
  return (
    <>
      <AdminHeading title="Homepage & content" actions={<Link href="/?preview=1" target="_blank" className="btn-secondary btn-sm">Preview draft ↗</Link>}>
        Your changes are saved as a draft first. Visitors see the published version until you press “Save &amp; publish”.
      </AdminHeading>
      {hasUnpublished ? <div className="mb-6"><Alert tone="warn" title="You have unpublished changes">Press “Save &amp; publish” below to put them on the live site, or discard them.</Alert></div> : null}
      <ActionForm action={saveContentAction} className="space-y-0">
        <Section title="Top of the homepage" id="hero">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="hh" className="label">Big headline</label><input id="hh" name="hero.headline" defaultValue={c.hero.headline} maxLength={60} className="field" /><p className="hint">Shown in large letters. Short works best.</p></div>
            <div><label htmlFor="hs" className="label">Line under it (optional)</label><input id="hs" name="hero.subheading" defaultValue={c.hero.subheading} maxLength={200} className="field" /></div>
            <div><label htmlFor="hl" className="label">Button text</label><input id="hl" name="hero.ctaLabel" defaultValue={c.hero.ctaLabel} maxLength={30} className="field" /></div>
            <div><label htmlFor="hr" className="label">Button goes to</label><input id="hr" name="hero.ctaHref" defaultValue={c.hero.ctaHref} maxLength={300} className="field" /><p className="hint">A page such as /shop, or a full https:// address.</p></div>
          </div>
          <div className="mt-4"><ImagePicker name="hero.bannerAssetId" initialAssetId={c.hero.bannerAssetId} initialUrl={url(c.hero.bannerAssetId)} label="Banner photo (optional)" hint="A wide photo. If empty, your products are shown instead." kind="banner" /></div>
        </Section>

        <Section title="Which sections to show" id="sections">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle name="sections.showFeatured" label="Featured row" defaultChecked={c.sections.showFeatured} />
            <Toggle name="sections.showNewArrivals" label="New arrivals row" defaultChecked={c.sections.showNewArrivals} />
            <Toggle name="sections.showCategories" label="Shop by category" defaultChecked={c.sections.showCategories} />
            <Toggle name="sections.showCollections" label="Collections" defaultChecked={c.sections.showCollections} />
            <Toggle name="sections.showAnnouncements" label="Announcements" defaultChecked={c.sections.showAnnouncements} />
          </div>
          <div className="mt-6 border-t border-line pt-5"><p className="label">Choose the “Featured” products by hand (optional)</p><ProductPicker name="featuredIds" products={products.items.map((p) => ({ id: p.id, name: p.name }))} initial={c.sections.featuredProductIds} /></div>
        </Section>

        <Section title="Promotional banners" id="banners">
          <p className="mb-4 text-sm text-muted">Up to four. Leave the title blank to skip one. Only describe promotions that have been approved.</p>
          <div className="space-y-6">
            {banners.map((b, i) => (
              <fieldset key={i} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-semibold">Banner {i + 1}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor={`bt${i}`} className="label">Title</label><input id={`bt${i}`} name={`b${i}.title`} defaultValue={b.title} maxLength={80} className="field" /></div>
                  <div><label htmlFor={`bh${i}`} className="label">Link</label><input id={`bh${i}`} name={`b${i}.href`} defaultValue={b.href} maxLength={300} className="field" /></div>
                  <div className="sm:col-span-2"><label htmlFor={`bx${i}`} className="label">Text</label><input id={`bx${i}`} name={`b${i}.text`} defaultValue={b.text} maxLength={200} className="field" /></div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-center"><ImagePicker name={`b${i}.assetId`} initialAssetId={b.assetId} initialUrl={url(b.assetId)} label="Picture (optional)" kind="banner" /><Toggle name={`b${i}.enabled`} label="Show this banner" defaultChecked={b.enabled} /></div>
              </fieldset>
            ))}
          </div>
        </Section>

        <Section title="Contact details" id="contact">
          <p className="mb-4 text-sm text-muted">Only enter details that have been approved. Blank fields are not shown.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="ce" className="label">Email</label><input id="ce" name="contact.email" defaultValue={c.contact.email} maxLength={254} className="field" /></div>
            <div><label htmlFor="cp" className="label">Phone</label><input id="cp" name="contact.phone" defaultValue={c.contact.phone} maxLength={60} className="field" /></div>
            <div><label htmlFor="ca" className="label">Address</label><textarea id="ca" name="contact.address" defaultValue={c.contact.address} maxLength={400} className="field !min-h-24" /></div>
            <div><label htmlFor="ch" className="label">Hours</label><textarea id="ch" name="contact.hours" defaultValue={c.contact.hours} maxLength={400} className="field !min-h-24" /></div>
          </div>
        </Section>

        <Section title="Uniforms" id="uniform">
          <p className="mb-4 text-sm text-muted">Shown on the Uniforms page and as a band on the homepage. Paste only wording that has been approved. To list actual uniform items, create a category called “Uniforms” and add products to it. The Uniforms menu item appears once there is something to show.</p>
          <div className="space-y-4">
            <Toggle name="uniforms.showOnHome" label="Show a Uniforms band on the homepage" defaultChecked={c.uniforms.showOnHome} />
            <div><label htmlFor="ut" className="label">Page title</label><input id="ut" name="uniforms.title" defaultValue={c.uniforms.title} maxLength={60} className="field" /></div>
            <div><label htmlFor="ui" className="label">Uniform information</label><textarea id="ui" name="uniforms.intro" defaultValue={c.uniforms.intro} maxLength={5000} className="field !min-h-40" /></div>
            <ImagePicker name="uniforms.imageAssetId" initialAssetId={c.uniforms.imageAssetId} initialUrl={url(c.uniforms.imageAssetId)} label="Photo (optional)" hint="A real photo of the uniform, supplied by you." kind="banner" />
            <ImagePicker name="uniforms.sizeChartAssetId" initialAssetId={c.uniforms.sizeChartAssetId} initialUrl={url(c.uniforms.sizeChartAssetId)} label="Size chart image (optional)" hint="Your own sizing chart. Add a text description below for screen readers." />
            <div><label htmlFor="ua" className="label">Size chart description (for screen readers)</label><input id="ua" name="uniforms.sizeChartAlt" defaultValue={c.uniforms.sizeChartAlt} maxLength={300} className="field" /></div>
          </div>
        </Section>

        <Section title="Ordering information and footer" id="more">
          <div className="space-y-4">
            <div><label htmlFor="si" className="label">How ordering works (shown on the homepage, contact page and checkout)</label><textarea id="si" name="storeInstructions" defaultValue={c.storeInstructions} maxLength={5000} className="field !min-h-32" /></div>
            <div><label htmlFor="fn" className="label">Footer line (replaces “© year name”)</label><input id="fn" name="footerNote" defaultValue={c.footerNote} maxLength={300} className="field" /></div>
            <fieldset><legend className="label">Extra footer links (optional)</legend>
              <div className="space-y-3">{links.map((l, i) => <div key={i} className="grid gap-3 sm:grid-cols-2"><div><label className="sr-only" htmlFor={`fl${i}l`}>Footer link {i + 1} name</label><input id={`fl${i}l`} name={`fl${i}.label`} defaultValue={l.label} placeholder="Name" maxLength={60} className="field" /></div><div><label className="sr-only" htmlFor={`fl${i}h`}>Footer link {i + 1} address</label><input id={`fl${i}h`} name={`fl${i}.href`} defaultValue={l.href} placeholder="/page or https://…" maxLength={300} className="field" /></div></div>)}</div>
            </fieldset>
          </div>
        </Section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <SubmitButton name="intent" value="draft" className="btn-secondary" pendingLabel="Saving…">Save draft</SubmitButton>
          <SubmitButton name="intent" value="publish" pendingLabel="Publishing…">Save &amp; publish</SubmitButton>
        </div>
      </ActionForm>
      {hasUnpublished ? <div className="mt-4"><ActionButton action={discardDraftAction} fields={{}} label="Discard unpublished changes" confirm="Discard every unpublished change and go back to what is live?" /></div> : null}
    </>
  );
}
