import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import "./globals.css";
import { DEFAULT_STORE_SETTINGS, getStoreSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { readableInk } from "@/lib/theme";

async function safeSettings() {
  try {
    return await getStoreSettings();
  } catch {
    // The database being unreachable must not take the error page down with it.
    return DEFAULT_STORE_SETTINGS;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await safeSettings();
  const description = `${s.storeName} merchandise.`;
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: s.storeName, template: `%s | ${s.storeName}` },
    description,
    openGraph: { type: "website", siteName: s.storeName, title: s.storeName, description },
    twitter: { card: "summary_large_image", title: s.storeName, description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // always render per request (live database content, per-request CSP nonce)
  const s = await safeSettings();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Colours come from validated settings (#rrggbb only), so this style tag cannot carry anything else.
  const css = `:root{--brand:${s.brandPrimary};--brand-ink:${readableInk(s.brandPrimary)};--accent:${s.brandAccent};}`;
  return (
    <html lang="en">
      <head>
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
