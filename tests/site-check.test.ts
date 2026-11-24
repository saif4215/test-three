import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanDbPerTest } from "./helpers";
import { query } from "../src/lib/db";

cleanDbPerTest();

describe("site check: the address", () => {
  it("is fine when the visitor's address matches the configured one", async () => {
    const { checkAddress } = await import("../src/lib/site-check");
    const r = checkAddress("https://store.example.org", { host: "store.example.org", proto: "https" }, true);
    expect(r.level).toBe("ok");
  });

  it("says plainly what is wrong, and the address to use, when they differ", async () => {
    const { checkAddress } = await import("../src/lib/site-check");
    const r = checkAddress("https://icsi-store.onrender.com", { host: "icsi-store-x1y2.onrender.com", proto: "https" }, true);
    expect(r.level).toBe("problem");
    expect(r.detail).toContain("icsi-store.onrender.com");
    expect(r.detail).toContain("icsi-store-x1y2.onrender.com");
    expect(r.fix).toContain("https://icsi-store-x1y2.onrender.com");
  });

  it("catches an address still pointing at this computer on a real site", async () => {
    const { checkAddress } = await import("../src/lib/site-check");
    const r = checkAddress("http://localhost:3000", { host: "store.example.org", proto: "https" }, true);
    expect(r.level).toBe("problem");
    expect(r.fix).toContain("https://store.example.org");
  });

  it("does not complain when both ends are local (testing on one computer)", async () => {
    const { checkAddress } = await import("../src/lib/site-check");
    expect(checkAddress("http://127.0.0.1:3100", { host: "localhost:3100", proto: "http" }, true).level).toBe("ok");
    expect(checkAddress("http://localhost:3000", null, false).level).toBe("ok");
  });

  it("warns when a secure site has an http:// address configured, and rejects nonsense", async () => {
    const { checkAddress } = await import("../src/lib/site-check");
    expect(checkAddress("http://store.example.org", { host: "store.example.org", proto: "https" }, true).level).toBe("warn");
    expect(checkAddress("not a web address", null, true).level).toBe("problem");
  });

  it("reads the visitor's address from the forwarded headers first", async () => {
    const { seenFromHeaders } = await import("../src/lib/site-check");
    const h: Record<string, string> = { host: "10.0.0.5:10000", "x-forwarded-host": "store.example.org, proxy.internal", "x-forwarded-proto": "https, http" };
    expect(seenFromHeaders((n) => h[n] ?? null)).toEqual({ host: "store.example.org", proto: "https" });
    expect(seenFromHeaders((n) => ({ host: "localhost:3000" } as Record<string, string>)[n] ?? null)).toEqual({ host: "localhost:3000", proto: "" });
  });
});

describe("site check: the whole report", () => {
  const keep = { dir: process.env.UPLOAD_DIR, driver: process.env.STORAGE_DRIVER };
  afterEach(() => {
    if (keep.dir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = keep.dir;
    if (keep.driver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = keep.driver;
  });
  const item = (r: { items: { id: string }[] }, id: string) => r.items.find((i) => i.id === id)! as import("../src/lib/site-check").CheckItem;

  it("passes the database and storage checks on a healthy setup", async () => {
    const { runSiteCheck } = await import("../src/lib/site-check");
    const r = await runSiteCheck({ host: "localhost:3000", proto: "http" });
    expect(item(r, "database").level).toBe("ok");
    expect(item(r, "storage").level).toBe("ok");
    expect(item(r, "address").level).toBe("ok");
    expect(r.services.map((s) => s.key).sort()).toEqual(["anthropic", "email", "google", "stripe"]);
  });

  it("reports housekeeping as not yet run, then as running, then as stalled", async () => {
    const { runSiteCheck } = await import("../src/lib/site-check");
    const { runMaintenanceIfDue } = await import("../src/lib/maintenance");
    expect(item(await runSiteCheck(null), "housekeeping").level).toBe("warn");
    await runMaintenanceIfDue();
    expect(item(await runSiteCheck(null), "housekeeping").level).toBe("ok");
    await query("update rate_limits set window_start = now() - interval '45 minutes' where key = 'maintenance'");
    const stalled = item(await runSiteCheck(null), "housekeeping");
    expect(stalled.level).toBe("warn");
    expect(stalled.detail).toMatch(/4\d minutes ago/);
    expect(stalled.fix).toContain("/api/health");
  });

  it("finds a picture folder the server cannot write to and says what to do", async () => {
    const { runSiteCheck } = await import("../src/lib/site-check");
    const file = path.join(os.tmpdir(), `site-check-${process.pid}-${Date.now()}`);
    fs.writeFileSync(file, "a file, not a folder");
    process.env.UPLOAD_DIR = path.join(file, "pictures"); // a folder cannot be created inside a file
    try {
      const r = await runSiteCheck(null);
      const storage = item(r, "storage");
      expect(storage.level).toBe("problem");
      expect(storage.detail).toContain("can’t be saved");
      expect(storage.fix).toContain("Disks");
      expect(r.worst).toBe("problem");
      expect(r.items[0].level).toBe("problem"); // problems are listed first
      expect(r.needAttention).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("names the missing settings when picture storage is set to S3 but not configured", async () => {
    const { runSiteCheck } = await import("../src/lib/site-check");
    process.env.STORAGE_DRIVER = "s3";
    const storage = item(await runSiteCheck(null), "storage");
    expect(storage.level).toBe("problem");
    expect(storage.detail).toMatch(/S3_BUCKET/);
  });
});
