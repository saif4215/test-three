"use client";

import { addSampleProductsAction, removeSampleProductsAction } from "@/app/admin/(panel)/products/actions";
import { ActionForm, SubmitButton } from "./admin-forms";

/** The dashboard card for trying the store with sample products (and getting rid of them again). */
export function SampleProducts({ hasSamples }: { hasSamples: boolean }) {
  if (hasSamples) {
    return (
      <ActionForm action={removeSampleProductsAction} className="space-y-3">
        <p className="text-muted">Sample products are in your store. They are labelled “Sample” and are not real merchandise. Remove them before you open the store to the public.</p>
        <SubmitButton className="btn-secondary" pendingLabel="Removing…">Remove all sample products</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={addSampleProductsAction} className="space-y-3">
      <p className="text-muted">Your store has no products yet, so shoppers see an empty shelf. Add a few clearly labelled samples to see how it looks, then remove them in one click when your real products are ready.</p>
      <SubmitButton pendingLabel="Adding…">Add sample products</SubmitButton>
    </ActionForm>
  );
}
