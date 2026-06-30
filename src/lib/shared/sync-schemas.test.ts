import { describe, it, expect } from "vitest";
import { Schema, Either } from "effect";
import { OutboxTransactionSchema, RecordReviewPayloadSchema, UpdatePreferencesPayloadSchema } from "./sync-schemas";

describe("Sync schemas verification", () => {
  it("should successfully decode camelCase record_review payload", () => {
    const raw = {
      exerciseId: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55",
      easeFactor: 2.7,
      repetitions: 2,
      intervalDays: 6,
      nextReview: "2026-05-31T04:32:00.000Z",
    };

    const result = Schema.decodeUnknownEither(RecordReviewPayloadSchema)(raw);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.exerciseId).toBe(raw.exerciseId);
      expect(result.right.easeFactor).toBe(2.7);
      expect(result.right.repetitions).toBe(2);
      expect(result.right.intervalDays).toBe(6);
    }
  });

  it("should successfully decode snake_case record_review payload", () => {
    const raw = {
      exercise_id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55",
      ease_factor: 2.7,
      repetitions: 2,
      interval_days: 6,
      next_review: "2026-05-31T04:32:00.000Z",
    };

    const result = Schema.decodeUnknownEither(RecordReviewPayloadSchema)(raw);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.exerciseId).toBe(raw.exercise_id);
      expect(result.right.easeFactor).toBe(2.7);
      expect(result.right.repetitions).toBe(2);
      expect(result.right.intervalDays).toBe(6);
    }
  });

  it("should apply default values on omitted optional record_review fields", () => {
    const raw = {
      exerciseId: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55",
      repetitions: 0,
      nextReview: "2026-05-31T04:32:00.000Z",
    };

    const result = Schema.decodeUnknownEither(RecordReviewPayloadSchema)(raw);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.easeFactor).toBe(2.5);
      expect(result.right.intervalDays).toBe(0);
    }
  });

  it("should fail to decode record_review with invalid UUID", () => {
    const raw = {
      exerciseId: "invalid-uuid-string",
      repetitions: 0,
      nextReview: "2026-05-31T04:32:00.000Z",
    };

    const result = Schema.decodeUnknownEither(RecordReviewPayloadSchema)(raw);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("should successfully decode update_preferences payload with default enforceMasteryLocks fallback", () => {
    const raw = {
      dailyReviewLimit: 30,
      dailyNewExerciseLimit: 5,
    };

    const result = Schema.decodeUnknownEither(UpdatePreferencesPayloadSchema)(raw);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.enforceMasteryLocks).toBe(true);
    }
  });

  it("should successfully decode update_preferences payload with custom enforceMasteryLocks value", () => {
    const raw = {
      dailyReviewLimit: 30,
      dailyNewExerciseLimit: 5,
      enforceMasteryLocks: false,
    };

    const result = Schema.decodeUnknownEither(UpdatePreferencesPayloadSchema)(raw);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.enforceMasteryLocks).toBe(false);
    }
  });

  it("should fail to decode update_preferences with negative values", () => {
    const raw = {
      dailyReviewLimit: -10,
      dailyNewExerciseLimit: 3,
    };

    const result = Schema.decodeUnknownEither(UpdatePreferencesPayloadSchema)(raw);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("should fail to decode update_preferences with floating point values", () => {
    const raw = {
      dailyReviewLimit: 20.5,
      dailyNewExerciseLimit: 3,
    };

    const result = Schema.decodeUnknownEither(UpdatePreferencesPayloadSchema)(raw);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("should decode full discriminated union transaction envelope", () => {
    const rawTransaction = {
      id: "tx-777",
      type: "update_preferences",
      payload: {
        dailyReviewLimit: 50,
        dailyNewExerciseLimit: 5,
      },
      hlc: "1600000000000:0000:nodeId",
    };

    const result = Schema.decodeUnknownEither(OutboxTransactionSchema)(rawTransaction);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.type).toBe("update_preferences");
      expect(result.right.payload).toEqual({
        dailyReviewLimit: 50,
        dailyNewExerciseLimit: 5,
        enforceMasteryLocks: true,
      });
    }
  });
});
