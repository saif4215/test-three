import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/lib/env";

describe("the site's public address", () => {
  const keep = { app: process.env.APP_URL, render: process.env.RENDER_EXTERNAL_URL };
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
  });
  afterEach(() => {
    if (keep.app === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = keep.app;
    if (keep.render === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = keep.render;
  });

  it("uses APP_URL when it is set", () => {
    process.env.APP_URL = "https://store.example.org/";
    process.env.RENDER_EXTERNAL_URL = "https://icsi-store.onrender.com";
    expect(env.appUrl).toBe("https://store.example.org");
    expect(env.secureCookies).toBe(true);
  });

  it("falls back to the address Render provides, so a Render deploy needs no address typed in", () => {
    process.env.RENDER_EXTERNAL_URL = "https://icsi-store.onrender.com";
    expect(env.appUrl).toBe("https://icsi-store.onrender.com");
    expect(env.secureCookies).toBe(true);
  });

  it("treats a blank APP_URL as not set", () => {
    process.env.APP_URL = "   ";
    process.env.RENDER_EXTERNAL_URL = "https://icsi-store.onrender.com";
    expect(env.appUrl).toBe("https://icsi-store.onrender.com");
  });

  it("uses the local address when neither is set", () => {
    expect(env.appUrl).toBe("http://localhost:3000");
    expect(env.secureCookies).toBe(false);
  });
});
