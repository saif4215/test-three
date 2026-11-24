import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The container starts as root only to make a mounted pictures disk writable, then drops to the app's own user.
 * This needs to be root and to have setpriv (as in the Docker image), so it is skipped on a normal laptop or CI user.
 */
const script = path.resolve("scripts/docker-entrypoint.sh");
const canRun = typeof process.getuid === "function" && process.getuid() === 0 && spawnSync("sh", ["-c", "command -v setpriv && id nobody"]).status === 0;

describe.skipIf(!canRun)("container start-up script", () => {
  const run = (uploadDir: string, command: string) =>
    spawnSync("sh", [script, "sh", "-c", command], { env: { ...process.env, APP_USER: "nobody", UPLOAD_DIR: uploadDir }, encoding: "utf8" });

  it("makes a root-owned pictures folder writable and runs the app as the unprivileged user", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "entry-"));
    fs.chmodSync(base, 0o755);
    const dir = path.join(base, "pictures");
    fs.mkdirSync(dir);
    try {
      expect(fs.statSync(dir).uid).toBe(0);
      const r = run(dir, 'id -un; touch "$UPLOAD_DIR/probe" && echo wrote');
      expect(r.stdout.trim().split("\n")).toEqual(["nobody", "wrote"]);
      expect(fs.statSync(dir).uid).not.toBe(0);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("creates a missing pictures folder", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "entry-"));
    fs.chmodSync(base, 0o755);
    try {
      const r = run(path.join(base, "new"), 'touch "$UPLOAD_DIR/probe" && echo wrote');
      expect(r.stdout.trim()).toBe("wrote");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("never runs the app as root", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "entry-"));
    fs.chmodSync(base, 0o755);
    try {
      expect(run(base, "id -u").stdout.trim()).not.toBe("0");
      expect(execFileSync("id", ["-u", "nobody"], { encoding: "utf8" }).trim()).not.toBe("0");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
