import Link from "next/link";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/settings";

export default async function NotFound() {
  const name = await getStoreSettings().then((s) => s.storeName).catch(() => DEFAULT_STORE_SETTINGS.storeName);
  return (
    <>
      <header className="border-b border-line">
        <div className="container-page flex h-16 items-center">
          <Link href="/" className="text-[1.5rem] font-extrabold leading-none tracking-[-0.04em]">{name}</Link>
        </div>
      </header>
      <main id="main" className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-16 text-center">
        <p aria-hidden="true" className="display text-[9rem] text-ink/10 sm:text-[16rem]">404</p>
        <h1 className="-mt-6 text-3xl font-semibold tracking-tight sm:-mt-12 sm:text-4xl">We couldn’t find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">The link may be old, or the item may no longer be available.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/shop" className="btn-primary">Shop all</Link>
          <Link href="/" className="btn-secondary">Home</Link>
        </div>
      </main>
    </>
  );
}
