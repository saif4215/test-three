import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cleanDbPerTest } from "./helpers";
import { isValidKey } from "../src/lib/storage";

cleanDbPerTest();

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();

describe("picture uploads", () => {
  it("stores a real picture in several sizes under keys that contain no user text", async () => {
    const { saveImage } = await import("../src/lib/media");
    const a = await saveImage(await png(1200, 800), { alt: "A sample picture", kind: "upload" });
    expect(a.width).toBeGreaterThan(0);
    expect(a.widths.length).toBeGreaterThan(1);
    for (const w of a.widths) expect(isValidKey(`${a.storage_key}/w${w}.webp`)).toBe(true);
  });

  it("accepts a small but usable picture", async () => {
    const { saveImage } = await import("../src/lib/media");
    const a = await saveImage(await png(120, 90), {});
    expect(a.widths).toEqual([120]);
  });

  it("refuses a tiny picture with a plain message (not a crash)", async () => {
    const { saveImage } = await import("../src/lib/media");
    await expect(saveImage(await png(1, 1), {})).rejects.toThrow(/too small/);
    await expect(saveImage(await png(40, 500), {})).rejects.toThrow(/too small/);
  });

  it("refuses anything that isn't a picture, whatever it is called", async () => {
    const { saveImage } = await import("../src/lib/media");
    for (const bytes of [
      Buffer.from("<html><script>alert(1)</script></html>"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from("GIF89a-not-really"),
      Buffer.from("%PDF-1.4 fake"),
    ]) {
      await expect(saveImage(bytes, {})).rejects.toThrow(/isn’t a picture/);
    }
  });

  it("refuses an empty file", async () => {
    const { saveImage } = await import("../src/lib/media");
    await expect(saveImage(Buffer.alloc(0), {})).rejects.toThrow(/empty/);
  });

  it("refuses pictures with absurd dimensions", async () => {
    const { saveImage } = await import("../src/lib/media");
    const huge = await sharp({ create: { width: 9000, height: 20, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(saveImage(huge, {})).rejects.toThrow(/too large|too small|isn’t a picture/);
  });
});
