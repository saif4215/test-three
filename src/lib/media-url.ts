/** Builds image URLs. Safe for the browser: it only formats strings. */
export interface MediaLike {
  storage_key: string;
  widths: number[];
  width: number;
  height: number;
  alt?: string;
}

/** The smallest stored width that is at least `w` (or the largest there is). */
export function pickWidth(widths: number[], w: number): number {
  const sorted = [...widths].sort((a, b) => a - b);
  return sorted.find((x) => x >= w) ?? sorted[sorted.length - 1] ?? w;
}

export const mediaUrl = (m: Pick<MediaLike, "storage_key" | "widths">, w = 800): string => `/media/${m.storage_key}/w${pickWidth(m.widths, w)}.webp`;

export const mediaSrcSet = (m: Pick<MediaLike, "storage_key" | "widths">): string =>
  [...m.widths]
    .sort((a, b) => a - b)
    .map((w) => `/media/${m.storage_key}/w${w}.webp ${w}w`)
    .join(", ");
