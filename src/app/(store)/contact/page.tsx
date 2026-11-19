import Link from "next/link";
import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/settings";
import { getPublishedContent } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { safeUrl } from "@/lib/util";
import { Alert, PageHeading, Rich } from "@/components/ui";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const [settings, content] = await Promise.all([getStoreSettings(), getPublishedContent()]);
  const c = content.contact;
  const any = c.email || c.phone || c.address || c.hours;
  const methods = settings.fulfillmentMethods.filter((m) => m.enabled);
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <PageHeading title="Contact & store information" />
      <section aria-labelledby="contact-h" className="rounded-2xl border border-line p-6 sm:p-8">
        <h2 id="contact-h" className="text-xl font-medium">
          Contact
        </h2>
        {any ? (
          <dl className="mt-4 grid gap-3 text-base sm:grid-cols-[8rem_1fr]">
            {c.email ? (<><dt className="text-muted">Email</dt><dd><a className="underline underline-offset-2" href={`mailto:${c.email}`}>{c.email}</a></dd></>) : null}
            {c.phone ? (<><dt className="text-muted">Phone</dt><dd>{c.phone}</dd></>) : null}
            {c.address ? (<><dt className="text-muted">Address</dt><dd className="whitespace-pre-line">{c.address}</dd></>) : null}
            {c.hours ? (<><dt className="text-muted">Hours</dt><dd className="whitespace-pre-line">{c.hours}</dd></>) : null}
          </dl>
        ) : (
          <div className="mt-4">
            <Alert tone="info" title="Contact details haven’t been added yet">
              Contact information will be published here as soon as it has been added.
            </Alert>
          </div>
        )}
      </section>

      {methods.length > 0 ? (
        <section aria-labelledby="pickup-h" className="mt-6 rounded-2xl border border-line p-6 sm:p-8">
          <h2 id="pickup-h" className="text-xl font-medium">
            Pickup & delivery
          </h2>
          <ul className="mt-4 space-y-5">
            {methods.map((m) => (
              <li key={m.id}>
                <p className="font-medium">
                  {m.label}
                  {m.feeCents > 0 ? <span className="font-normal text-muted"> · ${(m.feeCents / 100).toFixed(2)}</span> : null}
                </p>
                {m.instructions ? <Rich html={renderMarkdown(m.instructions)} className="!text-base" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.storeInstructions ? (
        <section aria-labelledby="how-h" className="mt-6 rounded-2xl border border-line p-6 sm:p-8">
          <h2 id="how-h" className="text-xl font-medium">
            How ordering works
          </h2>
          <Rich html={renderMarkdown(content.storeInstructions)} />
        </section>
      ) : null}

      {safeUrl(settings.websiteUrl) || safeUrl(settings.uniformsUrl) ? (
        <p className="mt-6 flex flex-wrap gap-5 text-base">
          {safeUrl(settings.websiteUrl) ? <a className="font-medium underline underline-offset-4" href={safeUrl(settings.websiteUrl)!}>Main website</a> : null}
          {safeUrl(settings.uniformsUrl) ? <a className="font-medium underline underline-offset-4" href={safeUrl(settings.uniformsUrl)!}>Uniform information</a> : null}
        </p>
      ) : null}
      <p className="mt-8 text-sm text-muted">
        <Link href="/shop" className="underline underline-offset-4">Back to the shop</Link>
      </p>
    </div>
  );
}
