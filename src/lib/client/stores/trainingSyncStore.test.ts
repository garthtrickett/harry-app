import { describe, it, expect, beforeEach } from "vitest";
import { runClientPromise } from "../runtime.ts";
import { exerciseProgressStore, exerciseCatalogStore } from "./exerciseStore.ts";
import { generateExportPayload } from "./trainingSyncStore.ts";

describe("sessionSyncStore export payload gating integration tests", () => {
  beforeEach(async () => {
    await runClientPromise(exerciseProgressStore.clear());
    await runClientPromise(exerciseCatalogStore.clear());
  });

  it("should cap massive backlogs of due exercises to a maximum of 15 items in the exported queue", async () => {
    const catalogItems = Array.from({ length: 50 }, (_, i) => ({
      id: `gp-${i}`,
      formal_name: `exercise-${i}`,
      base_meaning: `meaning-${i}`,
      difficulty_level: "Beginner",
      hlc: "0000000000000:0000:initial"
    }));
    await runClientPromise(exerciseCatalogStore.putAll(catalogItems));

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const progressItems = Array.from({ length: 50 }, (_, i) => ({
      id: `gp-${i}`,
      easeFactor: 2.5,
      repetitions: 1,
      intervalDays: 1,
      nextReview: twoHoursAgo,
      hlc: "0000000000000:0000:initial"
    }));
    await runClientPromise(exerciseProgressStore.putAll(progressItems));

    const jsonString = await runClientPromise(generateExportPayload());
    const payload = JSON.parse(jsonString as string);

    expect(payload.queue).toHaveLength(15);
    expect(payload.queue[0]?.exercise_id).toBe("gp-0");
  });

  it("should unlock and append up to 3 new exercises for eligible users if enforceMasteryGates is toggled off", async () => {
    const catalogItems = Array.from({ length: 5 }, (_, i) => ({
      id: `gp-${i}`,
      formal_name: `exercise-${i}`,
      base_meaning: `meaning-${i}`,
      difficulty_level: "Beginner",
      hlc: "0000000000000:0000:initial"
    }));
    await runClientPromise(exerciseCatalogStore.putAll(catalogItems));

    const past = new Date(Date.now() - 100000).toISOString();
    await runClientPromise(
      exerciseProgressStore.putAll([
        { id: "gp-0", easeFactor: 2.5, repetitions: 0, intervalDays: 0, nextReview: past, hlc: "0000000000000:0000:initial" },
        { id: "gp-1", easeFactor: 2.5, repetitions: 0, intervalDays: 0, nextReview: past, hlc: "0000000000000:0000:initial" },
      ])
    );

    const preferences = await import("./userPreferencesStore.ts");
    await runClientPromise(preferences.userPreferencesStore.updateLimits(20, 3, false));

    const jsonString = await runClientPromise(generateExportPayload());
    const payload = JSON.parse(jsonString as string);

    expect(payload.queue).toHaveLength(5);
  });
});
