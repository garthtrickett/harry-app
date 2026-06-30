import { describe, it, expect, beforeEach } from "vitest";
import { runClientPromise } from "../runtime.ts";
import {
  exerciseProgressStore,
  exerciseCatalogStore,
  exerciseProgressStoreWithHelpers,
  canUnlockMoreExercises,
  getDailyUnlockAllowance,
  ExerciseProgress
} from "./exerciseStore.ts";

describe("exerciseStore state management and pacing helpers", () => {
  beforeEach(async () => {
    await runClientPromise(exerciseProgressStore.clear());
    await runClientPromise(exerciseCatalogStore.clear());
  });

  it("should partition catalog items and progress into locked, active, and graduated collections", async () => {
    await runClientPromise(
      exerciseCatalogStore.putAll([
        { id: "gp-1", formal_name: "Push-Up", base_meaning: "Push-Up", difficulty_level: "Beginner" },
        { id: "gp-2", formal_name: "Pull-Up", base_meaning: "Pull-Up", difficulty_level: "Intermediate" },
        { id: "gp-3", formal_name: "Dip", base_meaning: "Dip", difficulty_level: "Intermediate" },
      ])
    );

    expect(exerciseProgressStoreWithHelpers.activeLearningExercises.value).toHaveLength(0);
    expect(exerciseProgressStoreWithHelpers.graduatedExercises.value).toHaveLength(0);
    expect(exerciseProgressStoreWithHelpers.lockedCatalogItems.value).toHaveLength(3);
    expect(exerciseProgressStoreWithHelpers.lockedCatalogItems.value[0]?.id).toBe("gp-1");

    await runClientPromise(
      exerciseProgressStore.put({
        id: "gp-1",
        easeFactor: 2.5,
        repetitions: 1,
        intervalDays: 3,
        nextReview: new Date().toISOString(),
        unlockedAt: new Date().toISOString(),
      })
    );

    expect(exerciseProgressStoreWithHelpers.activeLearningExercises.value).toHaveLength(1);
    expect(exerciseProgressStoreWithHelpers.activeLearningExercises.value[0]?.id).toBe("gp-1");
    expect(exerciseProgressStoreWithHelpers.graduatedExercises.value).toHaveLength(0);
    expect(exerciseProgressStoreWithHelpers.lockedCatalogItems.value).toHaveLength(2);

    await runClientPromise(
      exerciseProgressStore.put({
        id: "gp-2",
        easeFactor: 2.5,
        repetitions: 4,
        intervalDays: 24,
        nextReview: new Date().toISOString(),
        unlockedAt: new Date().toISOString(),
      })
    );

    expect(exerciseProgressStoreWithHelpers.activeLearningExercises.value).toHaveLength(1);
    expect(exerciseProgressStoreWithHelpers.graduatedExercises.value).toHaveLength(1);
    expect(exerciseProgressStoreWithHelpers.graduatedExercises.value[0]?.id).toBe("gp-2");
    expect(exerciseProgressStoreWithHelpers.lockedCatalogItems.value).toHaveLength(1);
    expect(exerciseProgressStoreWithHelpers.lockedCatalogItems.value[0]?.id).toBe("gp-3");
  });

  it("should calculate unlockedLast24HoursCount correctly", async () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const twentyThreeHoursAgo = new Date(now - 23 * 60 * 60 * 1000).toISOString();
    const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();

    await runClientPromise(
      exerciseProgressStore.putAll([
        {
          id: "gp-1",
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString(),
          unlockedAt: twoHoursAgo,
        },
        {
          id: "gp-2",
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString(),
          unlockedAt: twentyThreeHoursAgo,
        },
        {
          id: "gp-3",
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString(),
          unlockedAt: twentyFiveHoursAgo,
        },
        {
          id: "gp-4",
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString(),
        },
      ])
    );

    expect(exerciseProgressStoreWithHelpers.unlockedLast24HoursCount.value).toBe(1);
  });

  describe("canUnlockMoreExercises gating logic", () => {
    it("should return true for empty active learning queues to allow initial seeding", () => {
      const emptyProgress: ExerciseProgress[] = [];
      expect(canUnlockMoreExercises(emptyProgress)).toBe(true);
    });

    it("should return true if exactly 80% of active learning exercises are mastered", () => {
      const progress: ExerciseProgress[] = [
        { id: "1", easeFactor: 2.5, repetitions: 3, intervalDays: 1, nextReview: "" },
        { id: "2", easeFactor: 2.5, repetitions: 0, intervalDays: 8, nextReview: "" },
        { id: "3", easeFactor: 2.5, repetitions: 3, intervalDays: 7, nextReview: "" },
        { id: "4", easeFactor: 2.5, repetitions: 4, intervalDays: 12, nextReview: "" },
        { id: "5", easeFactor: 2.5, repetitions: 1, intervalDays: 2, nextReview: "" },
      ];

      expect(canUnlockMoreExercises(progress)).toBe(true);
    });

    it("should return false if less than 80% of active learning exercises are mastered", () => {
      const progress: ExerciseProgress[] = [
        { id: "1", easeFactor: 2.5, repetitions: 3, intervalDays: 1, nextReview: "" },
        { id: "2", easeFactor: 2.5, repetitions: 0, intervalDays: 8, nextReview: "" },
        { id: "3", easeFactor: 2.5, repetitions: 1, intervalDays: 2, nextReview: "" },
        { id: "4", easeFactor: 2.5, repetitions: 0, intervalDays: 0, nextReview: "" },
        { id: "5", easeFactor: 2.5, repetitions: 2, intervalDays: 3, nextReview: "" },
      ];

      expect(canUnlockMoreExercises(progress)).toBe(false);
    });
  });
});

describe("exerciseStore computed mastery rate metrics", () => {
  beforeEach(async () => {
    await runClientPromise(exerciseProgressStore.clear());
  });

  it("should return 100% mastery rate when active learning queue is empty", () => {
    expect(exerciseProgressStoreWithHelpers.activeMasteryRate.value).toBe(100);
    expect(exerciseProgressStoreWithHelpers.unmasteredActiveExercises.value).toHaveLength(0);
  });

  it("should calculate correct mastery rate and list unmastered active exercises, ignoring graduated exercises", async () => {
    await runClientPromise(
      exerciseProgressStore.putAll([
        { id: "gp-1", easeFactor: 2.5, repetitions: 3, intervalDays: 1, nextReview: "" },
        { id: "gp-2", easeFactor: 2.5, repetitions: 1, intervalDays: 7, nextReview: "" },
        { id: "gp-3", easeFactor: 2.5, repetitions: 1, intervalDays: 2, nextReview: "" },
        { id: "gp-4", easeFactor: 2.5, repetitions: 0, intervalDays: 0, nextReview: "" },
        { id: "gp-5", easeFactor: 2.5, repetitions: 1, intervalDays: 30, nextReview: "" },
      ])
    );

    expect(exerciseProgressStoreWithHelpers.activeMasteryRate.value).toBe(50);

    const unmastered = exerciseProgressStoreWithHelpers.unmasteredActiveExercises.value;
    expect(unmastered).toHaveLength(2);
    expect(unmastered.map((u: ExerciseProgress) => u.id).sort()).toEqual(["gp-3", "gp-4"].sort());
  });
});
