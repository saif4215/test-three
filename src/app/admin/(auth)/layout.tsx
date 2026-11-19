import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const s = await getStoreSettings();
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-soft px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-7 text-center text-4xl font-extrabold tracking-[-0.045em]">{s.storeName}</p>
        <div className="card rounded-3xl p-6 shadow-[0_28px_70px_-36px_rgba(0,0,0,0.3)] sm:p-9">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">Authorised staff only. Activity is logged.</p>
      </div>
    </main>
  );
}
