import { describe, expect, it } from "vitest";
import { cleanDbPerTest } from "./helpers";
import { query } from "../src/lib/db";

cleanDbPerTest();

describe("the baseline seed (runs on every start in the Docker image)", () => {
  it("adds the suggested categories and empty policy pages, never products", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    await seedBaseline();
    expect((await query("select 1 from categories")).rowCount).toBe(5);
    expect((await query<{ slug: string; body_md: string; approved: boolean }>("select slug, body_md, approved from pages order by slug")).rows).toEqual([
      { slug: "privacy", body_md: "", approved: false },
      { slug: "returns", body_md: "", approved: false },
      { slug: "terms", body_md: "", approved: false },
    ]);
    expect((await query("select 1 from products")).rowCount).toBe(0);
  });

  it("is safe to repeat: no duplicates, and it never touches what the team changed", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    await seedBaseline();
    await query("update pages set body_md = 'Approved wording', approved = true where slug = 'terms'");
    await query("update categories set name = 'Team Wear' where slug = 'shirts-and-polos'");
    await seedBaseline();
    await seedBaseline();
    expect((await query("select 1 from categories")).rowCount).toBe(5);
    expect((await query<{ name: string }>("select name from categories where slug = 'shirts-and-polos'")).rows[0].name).toBe("Team Wear");
    expect((await query<{ body_md: string; approved: boolean }>("select body_md, approved from pages where slug = 'terms'")).rows[0]).toEqual({ body_md: "Approved wording", approved: true });
  });

  it("does not bring categories back after the team deleted them", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    await seedBaseline();
    await query("delete from categories");
    await seedBaseline(); // e.g. the server restarted
    expect((await query("select 1 from categories")).rowCount).toBe(0);
  });
});
