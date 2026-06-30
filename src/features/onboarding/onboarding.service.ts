import { Data, Effect } from "effect";
import { sql, type Kysely } from "kysely";
import { db as defaultDb } from "../../db/client";
import {
  canCompleteOnboardingPart1,
  canCompleteOnboardingPart2,
  createEmptyOnboardingSteps,
  deriveOnboardingStatusFromSteps,
  getNextIncompleteOnboardingStepId,
  getOnboardingCompletionPercentage,
  getOnboardingStepDefinition,
  isOnboardingStepId,
  ONBOARDING_STATUSES,
  ONBOARDING_STEP_STATUSES,
  type OnboardingStatus,
  type OnboardingStepId,
  type OnboardingStepState,
  type OnboardingStepStatus,
  validateOnboardingStepPayload
} from "../../lib/shared/onboarding.ts";
import type {
  ClientOnboarding,
  ClientOnboardingId,
  ClientOnboardingStep,
  Database,
  UserId
} from "../../types";

export class OnboardingDatabaseError extends Data.TaggedError("OnboardingDatabaseError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class OnboardingValidationError extends Data.TaggedError("OnboardingValidationError")<{
  readonly message: string;
  readonly errors: readonly string[];
}> {}

export type OnboardingReadModel = {
  readonly onboarding: ClientOnboarding;
  readonly steps: readonly OnboardingStepState[];
  readonly completionPercentage: number;
  readonly nextIncompleteStepId: OnboardingStepId;
  readonly derivedStatus: OnboardingStatus;
};

export type SaveOnboardingStepDraftInput = {
  readonly userId: UserId;
  readonly stepId: OnboardingStepId;
  readonly payload: Record<string, unknown>;
};

export type CompleteOnboardingStepInput = SaveOnboardingStepDraftInput;

export type AcceptHealthWaiverInput = {
  readonly userId: UserId;
  readonly signatureName: string;
  readonly waiverVersion: string;
  readonly ipAddress?: string | null;
  readonly deviceMetadata?: Record<string, unknown> | null;
};

const now = (): Date => new Date();

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const payloadToRecord = (value: unknown): Record<string, unknown> => {
  return isRecord(value) ? value : {};
};

const toIsoStringOrNull = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const toOnboardingStatus = (value: string): OnboardingStatus => {
  return ONBOARDING_STATUSES.includes(value as OnboardingStatus)
    ? (value as OnboardingStatus)
    : "not_started";
};

const toOnboardingStepStatus = (value: string): OnboardingStepStatus => {
  return ONBOARDING_STEP_STATUSES.includes(value as OnboardingStepStatus)
    ? (value as OnboardingStepStatus)
    : "not_started";
};

const rowToStepState = (row: ClientOnboardingStep): OnboardingStepState | null => {
  if (!isOnboardingStepId(row.step_id)) {
    return null;
  }

  return {
    stepId: row.step_id,
    status: toOnboardingStepStatus(row.status),
    payload: payloadToRecord(row.payload),
    completedAt: toIsoStringOrNull(row.completed_at)
  };
};

const mergeStepRowsIntoState = (
  stepRows: readonly ClientOnboardingStep[]
): readonly OnboardingStepState[] => {
  const persistedSteps = new Map<OnboardingStepId, OnboardingStepState>();

  for (const row of stepRows) {
    const step = rowToStepState(row);
    if (step) {
      persistedSteps.set(step.stepId, step);
    }
  }

  return createEmptyOnboardingSteps().map((emptyStep) => {
    return persistedSteps.get(emptyStep.stepId) ?? emptyStep;
  });
};

const resolveCurrentStepId = (
  derivedStatus: OnboardingStatus,
  nextIncompleteStepId: OnboardingStepId,
  storedCurrentStepId: string
): OnboardingStepId => {
  if (derivedStatus === "submitted" || derivedStatus === "coach_review" || derivedStatus === "complete") {
    return "complete";
  }

  if (derivedStatus === "blocked" && isOnboardingStepId(storedCurrentStepId)) {
    return storedCurrentStepId;
  }

  return nextIncompleteStepId;
};

export const createOnboardingReadModelFromRows = (
  onboarding: ClientOnboarding,
  stepRows: readonly ClientOnboardingStep[]
): OnboardingReadModel => {
  const steps = mergeStepRowsIntoState(stepRows);
  const storedStatus = toOnboardingStatus(onboarding.status);
  const nextIncompleteStepId = getNextIncompleteOnboardingStepId(steps);
  const derivedStatus = deriveOnboardingStatusFromSteps(storedStatus, steps);

  return {
    onboarding,
    steps,
    completionPercentage: getOnboardingCompletionPercentage(steps),
    nextIncompleteStepId: resolveCurrentStepId(derivedStatus, nextIncompleteStepId, onboarding.current_step_id),
    derivedStatus
  };
};

const loadStepRows = (
  database: Kysely<Database>,
  onboardingId: ClientOnboardingId
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Loading step rows for onboarding ${onboardingId}`);

    return yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding_step")
          .selectAll()
          .where("onboarding_id", "=", onboardingId)
          .execute(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to load onboarding steps.",
          cause
        })
    });
  });

const loadReadModel = (
  database: Kysely<Database>,
  onboarding: ClientOnboarding
) =>
  Effect.gen(function* () {
    const stepRows = yield* loadStepRows(database, onboarding.id);
    const readModel = createOnboardingReadModelFromRows(onboarding, stepRows);

    yield* Effect.logInfo(
      `[OnboardingService] Loaded onboarding read model for user ${onboarding.user_id} with status ${readModel.derivedStatus}`
    );

    return readModel;
  });

const updateOnboardingProgressFromSteps = (
  database: Kysely<Database>,
  onboarding: ClientOnboarding,
  steps: readonly OnboardingStepState[]
) =>
  Effect.gen(function* () {
    const storedStatus = toOnboardingStatus(onboarding.status);
    const derivedStatus = deriveOnboardingStatusFromSteps(storedStatus, steps);
    const nextIncompleteStepId = getNextIncompleteOnboardingStepId(steps);
    const currentStepId = resolveCurrentStepId(derivedStatus, nextIncompleteStepId, onboarding.current_step_id);

    yield* Effect.logInfo(
      `[OnboardingService] Updating onboarding ${onboarding.id} progress to status ${derivedStatus} and current step ${currentStepId}`
    );

    const updated = yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: derivedStatus,
            current_step_id: currentStepId,
            updated_at: now()
          })
          .where("id", "=", onboarding.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to update onboarding progress.",
          cause
        })
    });

    return createOnboardingReadModelFromRows(updated, []);
  });

export const getOrCreateOnboarding = (
  userId: UserId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Loading onboarding for user ${userId}`);

    const existing = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding")
          .selectAll()
          .where("user_id", "=", userId)
          .executeTakeFirst(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to load onboarding record.",
          cause
        })
    });

    if (existing) {
      yield* Effect.logInfo(`[OnboardingService] Found existing onboarding ${existing.id} for user ${userId}`);
      return yield* loadReadModel(database, existing);
    }

    yield* Effect.logInfo(`[OnboardingService] Creating onboarding for user ${userId}`);

    const created = yield* Effect.tryPromise({
      try: () =>
        database
          .insertInto("client_onboarding")
          .values({
            user_id: userId,
            status: "not_started",
            current_step_id: "welcome_video"
          })
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to create onboarding record.",
          cause
        })
    });

    return yield* loadReadModel(database, created);
  });

const upsertOnboardingStep = (
  database: Kysely<Database>,
  onboardingId: ClientOnboardingId,
  stepId: OnboardingStepId,
  status: OnboardingStepStatus,
  payload: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const stepDefinition = getOnboardingStepDefinition(stepId);
    const completedAt = status === "complete" ? now() : null;

    yield* Effect.logInfo(
      `[OnboardingService] Upserting onboarding step ${stepId} for onboarding ${onboardingId} as ${status}`
    );

    return yield* Effect.tryPromise({
      try: () =>
        database
          .insertInto("client_onboarding_step")
          .values({
            onboarding_id: onboardingId,
            step_id: stepId,
            part: String(stepDefinition.part),
            status,
            payload,
            completed_at: completedAt,
            updated_at: now()
          })
          .onConflict((oc) =>
            oc.columns(["onboarding_id", "step_id"]).doUpdateSet({
              part: String(stepDefinition.part),
              status,
              payload,
              completed_at: completedAt,
              updated_at: now()
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: `Failed to upsert onboarding step ${stepId}.`,
          cause
        })
    });
  });

const refreshOnboardingAfterStepMutation = (
  database: Kysely<Database>,
  onboarding: ClientOnboarding
) =>
  Effect.gen(function* () {
    const stepRows = yield* loadStepRows(database, onboarding.id);
    const steps = mergeStepRowsIntoState(stepRows);
    yield* updateOnboardingProgressFromSteps(database, onboarding, steps);

    const refreshed = yield* Effect.tryPromise({
      try: () =>
        database
          .selectFrom("client_onboarding")
          .selectAll()
          .where("id", "=", onboarding.id)
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to reload onboarding after step mutation.",
          cause
        })
    });

    return yield* loadReadModel(database, refreshed);
  });

export const saveOnboardingStepDraft = (
  input: SaveOnboardingStepDraftInput,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `[OnboardingService] Saving draft for user ${input.userId} step ${input.stepId}`
    );

    const readModel = yield* getOrCreateOnboarding(input.userId, database);

    if (readModel.derivedStatus === "blocked") {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot save onboarding draft while onboarding is blocked.",
          errors: ["onboarding is blocked"]
        })
      );
    }

    yield* upsertOnboardingStep(
      database,
      readModel.onboarding.id,
      input.stepId,
      "in_progress",
      input.payload
    );

    return yield* refreshOnboardingAfterStepMutation(database, readModel.onboarding);
  });

export const completeOnboardingStep = (
  input: CompleteOnboardingStepInput,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `[OnboardingService] Completing step ${input.stepId} for user ${input.userId}`
    );

    const validation = validateOnboardingStepPayload(input.stepId, input.payload);
    if (!validation.valid) {
      yield* Effect.logInfo(
        `[OnboardingService] Step ${input.stepId} failed validation with ${validation.errors.length} errors`
      );

      return yield* Effect.fail(
        new OnboardingValidationError({
          message: `Cannot complete onboarding step ${input.stepId}.`,
          errors: validation.errors
        })
      );
    }

    const readModel = yield* getOrCreateOnboarding(input.userId, database);

    if (readModel.derivedStatus === "blocked") {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot complete onboarding step while onboarding is blocked.",
          errors: ["onboarding is blocked"]
        })
      );
    }

    yield* upsertOnboardingStep(
      database,
      readModel.onboarding.id,
      input.stepId,
      "complete",
      input.payload
    );

    return yield* refreshOnboardingAfterStepMutation(database, readModel.onboarding);
  });

export const acceptHealthWaiver = (
  input: AcceptHealthWaiverInput,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Accepting health waiver for user ${input.userId}`);

    const payload = {
      accepted: true,
      signatureName: input.signatureName,
      waiverVersion: input.waiverVersion
    };
    const validation = validateOnboardingStepPayload("health_waiver", payload);

    if (!validation.valid) {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot accept invalid health waiver.",
          errors: validation.errors
        })
      );
    }

    const readModel = yield* getOrCreateOnboarding(input.userId, database);

    yield* Effect.tryPromise({
      try: () =>
        database
          .insertInto("client_health_waiver_acceptance")
          .values({
            onboarding_id: readModel.onboarding.id,
            user_id: input.userId,
            waiver_version: input.waiverVersion,
            signature_name: input.signatureName,
            ip_address: input.ipAddress ?? null,
            device_metadata: input.deviceMetadata ?? null
          })
          .onConflict((oc) =>
            oc.columns(["onboarding_id", "waiver_version"]).doNothing()
          )
          .execute(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to persist health waiver acceptance.",
          cause
        })
    });

    yield* Effect.logInfo(`[OnboardingService] Health waiver persisted for onboarding ${readModel.onboarding.id}`);

    yield* upsertOnboardingStep(
      database,
      readModel.onboarding.id,
      "health_waiver",
      "complete",
      payload
    );

    return yield* refreshOnboardingAfterStepMutation(database, readModel.onboarding);
  });

export const submitOnboardingPart1 = (
  userId: UserId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Submitting onboarding part 1 for user ${userId}`);

    const readModel = yield* getOrCreateOnboarding(userId, database);

    if (!canCompleteOnboardingPart1(readModel.steps)) {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot submit Part 1 until all fundamental onboarding steps are complete.",
          errors: ["part 1 is incomplete"]
        })
      );
    }

    const updated = yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: "part_1_complete",
            current_step_id: "kit_list",
            part_1_completed_at: now(),
            updated_at: now()
          })
          .where("id", "=", readModel.onboarding.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to submit onboarding Part 1.",
          cause
        })
    });

    return yield* loadReadModel(database, updated);
  });

export const submitOnboardingPart2 = (
  userId: UserId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Submitting onboarding part 2 for user ${userId}`);

    const readModel = yield* getOrCreateOnboarding(userId, database);

    if (!canCompleteOnboardingPart1(readModel.steps)) {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot submit Part 2 before Part 1 is complete.",
          errors: ["part 1 is incomplete"]
        })
      );
    }

    if (!canCompleteOnboardingPart2(readModel.steps)) {
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Cannot submit Part 2 until all data onboarding steps are complete.",
          errors: ["part 2 is incomplete"]
        })
      );
    }

    const updated = yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: "submitted",
            current_step_id: "complete",
            part_2_completed_at: now(),
            submitted_at: now(),
            updated_at: now()
          })
          .where("id", "=", readModel.onboarding.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to submit onboarding Part 2.",
          cause
        })
    });

    return yield* loadReadModel(database, updated);
  });

export const derivePersistedOnboardingStatus = (
  userId: UserId,
  database: Kysely<Database> = defaultDb
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[OnboardingService] Deriving persisted onboarding status for user ${userId}`);

    const readModel = yield* getOrCreateOnboarding(userId, database);

    const updated = yield* Effect.tryPromise({
      try: () =>
        database
          .updateTable("client_onboarding")
          .set({
            status: readModel.derivedStatus,
            current_step_id: readModel.nextIncompleteStepId,
            updated_at: now()
          })
          .where("id", "=", readModel.onboarding.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      catch: (cause) =>
        new OnboardingDatabaseError({
          message: "Failed to persist derived onboarding status.",
          cause
        })
    });

    return yield* loadReadModel(database, updated);
  });