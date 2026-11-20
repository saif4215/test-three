import { requireAdmin } from "@/lib/auth";
import { listAdminCategories } from "@/lib/catalog/admin";
import { getAssets } from "@/lib/media";
import { mediaUrl } from "@/lib/media-url";
import { AdminHeading, Section } from "@/components/admin-ui";
import { ActionButton, ActionForm, ImagePicker, SubmitButton, Toggle } from "@/components/admin-forms";
import { deleteCategoryAction, saveCategoryAction } from "./actions";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireAdmin("products.manage");
  const cats = await listAdminCategories();
  const assets = await getAssets(cats.map((c) => c.image_asset_id).filter((x): x is string => !!x));
  return (
    <>
      <AdminHeading title="Categories">Group products so shoppers can browse. A category named “Uniforms” fills the Uniforms page automatically.</AdminHeading>
      <Section title="Add a category" id="add">
        <ActionForm action={saveCategoryAction} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label htmlFor="new-name" className="label">Name</label><input id="new-name" name="name" required maxLength={80} className="field" /></div>
          <div><label htmlFor="new-desc" className="label">Description (optional)</label><input id="new-desc" name="description" maxLength={500} className="field" /></div>
          <SubmitButton pendingLabel="Adding…">Add category</SubmitButton>
        </ActionForm>
      </Section>
      <Section title="Your categories">
        {cats.length === 0 ? <p className="text-muted">No categories yet.</p> : (
          <ul className="divide-y divide-line">
            {cats.map((c) => {
              const a = c.image_asset_id ? assets.get(c.image_asset_id) : null;
              return (
                <li key={c.id} className="py-4">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                      <span><span className="font-medium">{c.name}</span> <span className="text-sm text-muted">· {c.product_count} product{c.product_count === 1 ? "" : "s"} · /category/{c.slug}</span></span>
                      <span className="btn-secondary btn-sm">Edit</span>
                    </summary>
                    <div className="mt-4 space-y-4">
                      <ActionForm action={saveCategoryAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div><label htmlFor={`n-${c.id}`} className="label">Name</label><input id={`n-${c.id}`} name="name" defaultValue={c.name} required maxLength={80} className="field" /></div>
                          <div><label htmlFor={`s-${c.id}`} className="label">Order (lower comes first)</label><input id={`s-${c.id}`} name="sort" defaultValue={c.sort} inputMode="numeric" className="field" /></div>
                          <div className="sm:col-span-2"><label htmlFor={`d-${c.id}`} className="label">Description</label><textarea id={`d-${c.id}`} name="description" defaultValue={c.description} maxLength={500} className="field !min-h-20" /></div>
                        </div>
                        <Toggle name="showOnHome" label="Show on the homepage" defaultChecked={c.show_on_home} />
                        <ImagePicker name="imageAssetId" initialAssetId={c.image_asset_id} initialUrl={a ? mediaUrl(a, 200) : null} label="Category picture (optional)" hint="If empty, a picture of one of its products is used." />
                        <SubmitButton>Save category</SubmitButton>
                      </ActionForm>
                      <ActionButton action={deleteCategoryAction} fields={{ id: c.id }} label="Delete category" confirm={`Delete “${c.name}”? Its products stay, but lose this category.`} className="btn-danger btn-sm" />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
