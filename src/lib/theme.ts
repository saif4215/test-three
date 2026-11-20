/** Picks black or white text for a background colour so buttons and banners always stay readable. Pure; browser-safe. */
export function readableInk(hex: string): "#ffffff" | "#111111" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white vs against near-black: use whichever is higher.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0056 ? "#ffffff" : "#111111";
}
