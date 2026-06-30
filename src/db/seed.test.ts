import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { seedDb } from "./seed";
import { db } from "./client";

describe("Database Seeder", () => {
  it("should seed all core movements into the catalog and active progress logs", async () => {
    await Effect.runPromise(seedDb());

    const gpCountResult = await db
      .selectFrom("exercise")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const srsCountResult = await db
      .selectFrom("exercise_progress")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    // Verify calisthenics exercises catalog size
    expect(Number(gpCountResult.count)).toBeGreaterThanOrEqual(4);

    // Verify active progress cards count matching exercises
    expect(Number(srsCountResult.count)).toBe(4);

    const sampleGp = await db.selectFrom("exercise").select("hlc").limit(1).executeTakeFirstOrThrow();
    expect(sampleGp.hlc).toBe("0000000000000:0000:initial");

    const sampleSrs = await db.selectFrom("exercise_progress").select("hlc").limit(1).executeTakeFirstOrThrow();
    expect(sampleSrs.hlc).toBe("0000000000000:0000:initial");
  });
});
