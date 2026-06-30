import { Data, Effect } from "effect";
import type { Kysely } from "kysely";
import { db as defaultDb } from "../../db/client.ts";
import { isOnboardingStepId, type OnboardingStepId } from "../../lib/shared/onboarding.ts";
import type { ClientOnboardingId, Database, UserId } from "../../types/index.ts";
import { createNutritionSummaryPayloadFromNutritionStep } from "./nutritionSummary.ts";

export class OnboardingReviewDatabaseError extends Data.TaggedError("OnboardingReviewDatabaseError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class OnboardingReviewValidationError extends Data.TaggedError("OnboardingReviewValidationError")<{
  readonly message: string;
  readonly errors: readonly string[];
}> {}

export type RegisterOnboardingMediaInput = {
  readonly userId: UserId;
  readonly stepId: OnboardingStepId;
  readonly mediaKind: string;
  readonly storageKey: string;
  readonly publicUrl?: string | null;
  readonly originalFilename?: string | null;
  readonly mimeType: string;
  readonly sizeBytes?: number | string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const payloadToRecord = (value: unknown): Record<string, unknown> => {
  return isRecord(value) ? value : {};
};

const now = (): Date => new Date();

const loadOnboardingForUser = (userId: UserId, database: Kysely<Database>) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Loading onboarding for user ${userId}`);

    const onboarding = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding")
          .selectAll()
          .where("user_id", "=", userId)
          .executeTakeFirst(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load onboarding for user.",
          cause
        })
    });

    if (!onboarding) {
      return yield* Effect.fail(
        new OnboardingReviewValidationError({
          message: "No onboarding record exists for this user yet.",
          errors: ["onboarding not found"]
        })
      );
    }

    return onboarding;
  });

const loadNutritionStepPayload = (onboardingId: ClientOnboardingId, database: Kysely<Database>) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Loading nutrition step payload for onboarding ${onboardingId}`);

    const step = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding_step")
          .selectAll()
          .where("onboarding_id", "=", onboardingId)
          .where("step_id", "=", "nutrition_track_one_day")
          .executeTakeFirst(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load nutrition onboarding step.",
          cause
        })
    });

    if (!step || step.status !== "complete") {
      return yield* Effect.fail(
        new OnboardingReviewValidationError({
          message: "Cannot generate nutrition summary before the nutrition step is complete.",
          errors: ["nutrition step is incomplete"]
        })
      );
    }

    return payloadToRecord(step.payload);
  });

const persistNutritionSummary = (
  onboardingId: ClientOnboardingId,
  rawPayload: Record<string, unknown>,
  database: Kysely<Database>
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Persisting deterministic nutrition GPT summary for ${onboardingId}`);

    const summaryPayload = createNutritionSummaryPayloadFromNutritionStep(rawPayload);

    return yield* Effect.tryPromise({
      try: () =>
        database
          .insertInto("client_nutrition_gpt_summary")
          .values({
            onboarding_id: onboardingId,
            raw_payload: rawPayload,
            summary_payload: summaryPayload,
            provider: "local-onboarding-gpt",
            model_name: "deterministic-v1",
            client_visible: true
          })
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to persist nutrition GPT summary.",
          cause
        })
    });
  });

export const parseOnboardingReviewStepId = (value: string): OnboardingStepId | null => {
  return isOnboardingStepId(value) ? value : null;
};

export const registerOnboardingMediaMetadata = (
  input: RegisterOnboardingMediaInput,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Registering media metadata for user ${input.userId} step ${input.stepId}`);

    const onboarding = yield* loadOnboardingForUser(input.userId, database);

    if (!input.mediaKind.trim()) {
      return yield* Effect.fail(
        new OnboardingReviewValidationError({
          message: "Cannot register onboarding media without a media kind.",
          errors: ["mediaKind is required"]
        })
      );
    }

    if (!input.storageKey.trim()) {
      return yield* Effect.fail(
        new OnboardingReviewValidationError({
          message: "Cannot register onboarding media without a storage key.",
          errors: ["storageKey is required"]
        })
      );
    }

    if (!input.mimeType.trim()) {
      return yield* Effect.fail(
        new OnboardingReviewValidationError({
          message: "Cannot register onboarding media without a MIME type.",
          errors: ["mimeType is required"]
        })
      );
    }

    return yield* Effect.tryPromise({
      try: () =>
        database
          .insertInto("client_onboarding_media")
          .values({
            onboarding_id: onboarding.id,
            step_id: input.stepId,
            media_kind: input.mediaKind,
            storage_key: input.storageKey,
            public_url: input.publicUrl ?? null,
            original_filename: input.originalFilename ?? null,
            mime_type: input.mimeType,
            size_bytes: input.sizeBytes === null || input.sizeBytes === undefined ? null : String(input.sizeBytes)
          })
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to register onboarding media metadata.",
          cause
        })
    });
  });

export const generateNutritionGptSummaryForUser = (
  userId: UserId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Generating nutrition GPT summary for user ${userId}`);
    const onboarding = yield* loadOnboardingForUser(userId, database);
    const rawPayload = yield* loadNutritionStepPayload(onboarding.id, database);
    return yield* persistNutritionSummary(onboarding.id, rawPayload, database);
  });

export const listSubmittedOnboardingsForCoachReview = (
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("[OnboardingReviewService] Listing submitted onboarding records for coach review");

    return yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding")
          .selectAll()
          .where("status", "in", ["submitted", "coach_review", "complete"])
          .orderBy("submitted_at", "desc")
          .execute(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to list submitted onboarding records.",
          cause
        })
    });
  });

export const getCoachReviewOnboardingDetails = (
  onboardingId: ClientOnboardingId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Loading coach review details for onboarding ${onboardingId}`);

    const onboarding = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding")
          .selectAll()
          .where("id", "=", onboardingId)
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load onboarding for coach review.",
          cause
        })
    });

    const steps = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding_step")
          .selectAll()
          .where("onboarding_id", "=", onboardingId)
          .orderBy("created_at", "asc")
          .execute(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load onboarding steps for coach review.",
          cause
        })
    });

    const media = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding_media")
          .selectAll()
          .where("onboarding_id", "=", onboardingId)
          .orderBy("created_at", "desc")
          .execute(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load onboarding media for coach review.",
          cause
        })
    });

    const nutritionSummaries = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_nutrition_gpt_summary")
          .selectAll()
          .where("onboarding_id", "=", onboardingId)
          .orderBy("created_at", "desc")
          .execute(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to load nutrition GPT summaries for coach review.",
          cause
        })
    });

    return {
      onboarding,
      steps,
      media,
      nutritionSummaries
    };
  });

export const generateNutritionGptSummaryForOnboarding = (
  onboardingId: ClientOnboardingId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Generating nutrition GPT summary for onboarding ${onboardingId}`);
    const rawPayload = yield* loadNutritionStepPayload(onboardingId, database);
    return yield* persistNutritionSummary(onboardingId, rawPayload, database);
  });

export const markOnboardingCoachReviewStarted = (
  onboardingId: ClientOnboardingId,
  reviewerId: UserId,
  coachNotes: string,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Marking onboarding ${onboardingId} as coach_review by reviewer ${reviewerId}`);

    return yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: "coach_review",
            current_step_id: "complete",
            coach_reviewed_at: now(),
            coach_reviewer_id: reviewerId,
            coach_notes: coachNotes,
            updated_at: now()
          })
          .where("id", "=", onboardingId)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to mark onboarding as coach review.",
          cause
        })
    });
  });

export const completeOnboardingCoachReview = (
  onboardingId: ClientOnboardingId,
  reviewerId: UserId,
  coachNotes: string,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingReviewService] Completing coach review for onboarding ${onboardingId} by reviewer ${reviewerId}`);

    return yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: "complete",
            current_step_id: "complete",
            coach_reviewed_at: now(),
            coach_reviewer_id: reviewerId,
            coach_notes: coachNotes,
            updated_at: now()
          })
          .where("id", "=", onboardingId)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingReviewDatabaseError({
          message: "Failed to complete coach review.",
          cause
        })
    });
  });