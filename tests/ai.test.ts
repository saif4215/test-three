import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanDbPerTest } from "./helpers";
import { startFakeAnthropic, type FakeAnthropic } from "./stand-ins/anthropic";

cleanDbPerTest();

let a: FakeAnthropic;
beforeAll(async () => {
  a = await startFakeAnthropic();
  process.env.ANTHROPIC_BASE_URL = a.url;
  process.env.ANTHROPIC_API_KEY = a.key;
});
afterAll(async () => {
  await a.close();
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("AI writing assistant", () => {
  it("verifies with a real call, and reports a rejected key plainly", async () => {
    const { verifyAnthropic } = await import("../src/lib/ai/anthropic");
    expect((await verifyAnthropic()).ok).toBe(true);
    process.env.ANTHROPIC_API_KEY = "wrong";
    const bad = await verifyAnthropic();
    expect(bad.ok).toBe(false);
    expect(bad.detail).toMatch(/rejected the API key/);
    process.env.ANTHROPIC_API_KEY = a.key;
  });

  it("can only be switched on after verification", async () => {
    const { setFeatureFlags, FeatureError } = await import("../src/lib/settings");
    const { verifyIntegration } = await import("../src/lib/integrations");
    await expect(setFeatureFlags({ ai_assistant: true }, { id: null, label: "t" })).rejects.toBeInstanceOf(FeatureError);
    await verifyIntegration("anthropic");
    await setFeatureFlags({ ai_assistant: true }, { id: null, label: "t" });
  });

  it("sends only the typed facts, with rules that forbid inventing details", async () => {
    const { draftWithAi } = await import("../src/lib/ai/anthropic");
    a.bodies.length = 0;
    const out = await draftWithAi({ task: "product_description", tone: "friendly", notes: "Cotton tee, navy, adult sizes S to XL", storeName: "ICSI" });
    expect(out.text).toContain("[add sizes]");
    expect(a.bodies).toHaveLength(1);
    const body = a.bodies[0] as { system: string; messages: { content: string }[]; max_tokens: number };
    expect(body.system).toMatch(/ONLY the facts/);
    expect(body.system).toMatch(/Never invent prices, discounts, dates, events, policies, contact details/);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toContain("Cotton tee, navy");
    expect(body.max_tokens).toBeLessThanOrEqual(1000);
  });

  it.each([
    ["an email address", "Contact jane.doe@example.org about the shirt"],
    ["a phone number", "Call 555 123 4567 to order"],
    ["an order number", "Order ICSI-AB12-CD34 is late"],
  ])("refuses to send %s to the outside service", async (_label, notes) => {
    const { draftWithAi } = await import("../src/lib/ai/anthropic");
    a.bodies.length = 0;
    await expect(draftWithAi({ task: "announcement", tone: "simple", notes, storeName: "ICSI" })).rejects.toThrow(/remove/i);
    expect(a.bodies).toHaveLength(0);
  });

  it("validates length and shows an outside failure as a plain message", async () => {
    const { draftWithAi } = await import("../src/lib/ai/anthropic");
    await expect(draftWithAi({ task: "headline", tone: "upbeat", notes: " ", storeName: "ICSI" })).rejects.toThrow(/few facts/);
    await expect(draftWithAi({ task: "headline", tone: "upbeat", notes: "x".repeat(4001), storeName: "ICSI" })).rejects.toThrow(/too long/);
    process.env.ANTHROPIC_API_KEY = "wrong";
    await expect(draftWithAi({ task: "headline", tone: "upbeat", notes: "A new hoodie", storeName: "ICSI" })).rejects.toThrow(/rejected the API key/);
    process.env.ANTHROPIC_API_KEY = a.key;
  });
});
