import { describe, expect, it } from "vitest";
import { z } from "zod";
import { issueMessage } from "../src/lib/zod-message";

describe("validation messages", () => {
  it("keeps the messages we wrote ourselves", () => {
    const r = z.object({ name: z.string().min(1, "Enter a name.") }).safeParse({ name: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(issueMessage(r.error.issues[0])).toBe("Enter a name.");
  });

  it("replaces the library's own wording with a plain sentence naming the field", () => {
    const r = z.object({ orderWindow: z.object({ closesAt: z.string().min(5) }) }).safeParse({ orderWindow: { closesAt: "x" } });
    expect(r.success).toBe(false);
    if (!r.success) {
      const m = issueMessage(r.error.issues[0]);
      expect(m).toBe("Please check the “order window › closes at” field.");
      expect(m).not.toMatch(/expected|Too small|received/i);
    }
  });

  it("handles a missing value and an unknown field without leaking jargon", () => {
    const missing = z.object({ email: z.string() }).safeParse({});
    if (!missing.success) expect(issueMessage(missing.error.issues[0], "setting")).toBe("Please check the “email” setting.");
    expect(issueMessage({ message: "Invalid input", path: [] })).toMatch(/isn’t valid/);
  });
});
