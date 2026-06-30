import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "./WorkoutSession";
import { WorkoutSession, calculateSrsUpdate } from "./WorkoutSession";

describe("WorkoutSession SRS calculations", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should calculate correct updates on correct reviews", () => {
    const initial = { easeFactor: 2.5, repetitions: 0, intervalDays: 0 };
    const firstCorrect = calculateSrsUpdate(initial, true);
    expect(firstCorrect.repetitions).toBe(1);
    expect(firstCorrect.intervalDays).toBe(1);
    expect(firstCorrect.easeFactor).toBeGreaterThan(2.5);
  });
});
