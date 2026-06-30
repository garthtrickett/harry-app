import { signal } from "@preact/signals-core";
import { Effect } from "effect";
import {
  getNextIncompleteOnboardingStepId,
  getOnboardingStepDefinition,
  isOnboardingStepId,
  ONBOARDING_STATUSES,
  ONBOARDING_STEP_STATUSES,
  type OnboardingStatus,
  type OnboardingStepId,
  type OnboardingStepState,
  type OnboardingStepStatus
} from "../../shared/onboarding.ts";
import { clientLog } from "../clientLog.ts";

type ClientOnboardingSummary = {
  readonly id: string;
  readonly status: string;
  readonly currentStepId: string;
};

export type ClientOnboardingReadModel = {
  readonly onboarding: ClientOnboardingSummary;
  readonly steps: readonly OnboardingStepState[];
  readonly completionPercentage: number;
  readonly nextIncompleteStepId: OnboardingStepId;
  readonly derivedStatus: OnboardingStatus;
};

export type OnboardingClientLoadStatus = "idle" | "loading" | "ready" | "error";

export type OnboardingClientState = {
  readonly status: OnboardingClientLoadStatus;
  readonly readModel: ClientOnboardingReadModel | null;
  readonly errorMessage: string | null;
  readonly lastLoadedAt: string | null;
};

export const initialOnboardingClientState: OnboardingClientState = {
  status: "idle",
  readModel: null,
  errorMessage: null,
  lastLoadedAt: null
};

export const onboardingState = signal<OnboardingClientState>(initialOnboardingClientState);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

const isValidOnboardingStatus = (value: unknown): value is OnboardingStatus => {
  return isString(value) && ONBOARDING_STATUSES.includes(value as OnboardingStatus);
};

const isValidOnboardingStepStatus = (value: unknown): value is OnboardingStepStatus => {
  return isString(value) && ONBOARDING_STEP_STATUSES.includes(value as OnboardingStepStatus);
};

const normalisePercentage = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const getAuthToken = (): string | null => {
  const token = localStorage.getItem("jwt");
  if (!token || token === "null" || token === "undefined" || token.trim() === "") {
    return null;
  }

  return token;
};

const parseStepState = (value: unknown): OnboardingStepState | null => {
  if (!isRecord(value)) return null;

  const stepId = value.stepId;
  const status = value.status;
  const payload = value.payload;
  const completedAt = value.completedAt;

  if (!isString(stepId) || !isOnboardingStepId(stepId)) return null;
  if (!isValidOnboardingStepStatus(status)) return null;

  return {
    stepId,
    status,
    payload: isRecord(payload) ? payload : {},
    completedAt: completedAt === null || isString(completedAt) ? completedAt : null
  };
};

const parseSteps = (value: unknown): readonly OnboardingStepState[] | null => {
  if (!Array.isArray(value)) return null;

  const parsedSteps = value
    .map(parseStepState)
    .filter((step): step is OnboardingStepState => step !== null);

  if (parsedSteps.length === 0 && value.length > 0) return null;

  return parsedSteps;
};

const parseOnboardingSummary = (value: unknown): ClientOnboardingSummary | null => {
  if (!isRecord(value)) return null;

  const id = value.id;
  const status = value.status;
  const currentStepId = value.current_step_id;

  if (!isString(id) || !isString(status) || !isString(currentStepId)) return null;

  return {
    id,
    status,
    currentStepId
  };
};

export const parseOnboardingApiReadModel = (value: unknown): ClientOnboardingReadModel | null => {
  if (!isRecord(value)) return null;

  const rawData = value.data;
  if (!isRecord(rawData)) return null;

  const onboarding = parseOnboardingSummary(rawData.onboarding);
  const steps = parseSteps(rawData.steps);
  const derivedStatus = rawData.derivedStatus;
  const nextIncompleteStepId = rawData.nextIncompleteStepId;

  if (!onboarding || !steps || !isValidOnboardingStatus(derivedStatus)) return null;

  const fallbackStepId = getNextIncompleteOnboardingStepId(steps);

  return {
    onboarding,
    steps,
    completionPercentage: normalisePercentage(rawData.completionPercentage),
    nextIncompleteStepId:
      isString(nextIncompleteStepId) && isOnboardingStepId(nextIncompleteStepId)
        ? nextIncompleteStepId
        : fallbackStepId,
    derivedStatus
  };
};

const readErrorMessage = (response: Response) =>
  Effect.gen(function* () {
    const jsonResult = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new Error(`Failed to parse onboarding error response: ${String(cause)}`)
    }).pipe(Effect.either);

    if (jsonResult._tag === "Left") {
      return `Onboarding request failed with HTTP ${response.status}.`;
    }

    const body = jsonResult.right;
    if (isRecord(body) && isString(body.message)) return body.message;
    if (isRecord(body) && isString(body.error)) return body.error;

    return `Onboarding request failed with HTTP ${response.status}.`;
  });

const setOnboardingLoading = () => {
  onboardingState.value = {
    ...onboardingState.value,
    status: "loading",
    errorMessage: null
  };
};

const setOnboardingError = (message: string) => {
  onboardingState.value = {
    ...onboardingState.value,
    status: "error",
    errorMessage: message
  };
};

const setOnboardingReady = (readModel: ClientOnboardingReadModel) => {
  onboardingState.value = {
    status: "ready",
    readModel,
    errorMessage: null,
    lastLoadedAt: new Date().toISOString()
  };
};

export const getOnboardingProgressPercentage = (state: OnboardingClientState = onboardingState.value): number => {
  return state.readModel?.completionPercentage ?? 0;
};

export const getOnboardingResumeStepId = (state: OnboardingClientState = onboardingState.value): OnboardingStepId => {
  return state.readModel?.nextIncompleteStepId ?? "welcome_video";
};

export const getCurrentOnboardingStep = (state: OnboardingClientState = onboardingState.value): OnboardingStepState | null => {
  const readModel = state.readModel;
  if (!readModel) return null;

  return readModel.steps.find((step) => step.stepId === readModel.nextIncompleteStepId) ?? null;
};

export const getCurrentOnboardingStepDefinition = (state: OnboardingClientState = onboardingState.value) => {
  return getOnboardingStepDefinition(getOnboardingResumeStepId(state));
};

export const resetOnboardingStateForTests = () => {
  onboardingState.value = initialOnboardingClientState;
};

export const loadOnboarding = () =>
  Effect.gen(function* () {
    yield* clientLog("info", "[OnboardingStore] Loading onboarding state.");
    setOnboardingLoading();

    const token = getAuthToken();
    if (!token) {
      yield* clientLog("warn", "[OnboardingStore] Cannot load onboarding without an active JWT.");
      setOnboardingError("You need to log in before onboarding can load.");
      return;
    }

    const responseResult = yield* Effect.tryPromise({
      try: () =>
        fetch("/api/onboarding/me", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
      catch: (cause) => new Error(`Onboarding request connection failed: ${String(cause)}`)
    }).pipe(Effect.either);

    if (responseResult._tag === "Left") {
      yield* clientLog("error", `[OnboardingStore] Network failure: ${responseResult.left.message}`);
      setOnboardingError(responseResult.left.message);
      return;
    }

    const response = responseResult.right;
    yield* clientLog("debug", `[OnboardingStore] GET /api/onboarding/me returned HTTP ${response.status}`);

    if (!response.ok) {
      const message = yield* readErrorMessage(response);
      yield* clientLog("warn", `[OnboardingStore] Server rejected onboarding load: ${message}`);
      setOnboardingError(message);
      return;
    }

    const jsonResult = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new Error(`Failed to parse onboarding response: ${String(cause)}`)
    }).pipe(Effect.either);

    if (jsonResult._tag === "Left") {
      yield* clientLog("error", `[OnboardingStore] ${jsonResult.left.message}`);
      setOnboardingError(jsonResult.left.message);
      return;
    }

    const readModel = parseOnboardingApiReadModel(jsonResult.right);
    if (!readModel) {
      yield* clientLog("error", "[OnboardingStore] Onboarding response shape was invalid.");
      setOnboardingError("The onboarding response was not in the expected format.");
      return;
    }

    yield* clientLog(
      "info",
      `[OnboardingStore] Loaded onboarding status ${readModel.derivedStatus} at step ${readModel.nextIncompleteStepId}.`
    );
    setOnboardingReady(readModel);
  });

const postOnboardingReadModel = (
  path: string,
  body?: Record<string, unknown>
) =>
  Effect.gen(function* () {
    yield* clientLog("info", `[OnboardingStore] Posting onboarding mutation to ${path}.`);

    const token = getAuthToken();
    if (!token) {
      yield* clientLog("warn", `[OnboardingStore] Cannot post ${path} without an active JWT.`);
      setOnboardingError("You need to log in before onboarding can be updated.");
      return null;
    }

    const responseResult = yield* Effect.tryPromise({
      try: () =>
        fetch(path, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: body ? JSON.stringify(body) : undefined
        }),
      catch: (cause) => new Error(`Onboarding mutation connection failed: ${String(cause)}`)
    }).pipe(Effect.either);

    if (responseResult._tag === "Left") {
      yield* clientLog("error", `[OnboardingStore] Mutation network failure: ${responseResult.left.message}`);
      setOnboardingError(responseResult.left.message);
      return null;
    }

    const response = responseResult.right;
    yield* clientLog("debug", `[OnboardingStore] ${path} returned HTTP ${response.status}`);

    if (!response.ok) {
      const message = yield* readErrorMessage(response);
      yield* clientLog("warn", `[OnboardingStore] Server rejected onboarding mutation: ${message}`);
      setOnboardingError(message);
      return null;
    }

    const jsonResult = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new Error(`Failed to parse onboarding mutation response: ${String(cause)}`)
    }).pipe(Effect.either);

    if (jsonResult._tag === "Left") {
      yield* clientLog("error", `[OnboardingStore] ${jsonResult.left.message}`);
      setOnboardingError(jsonResult.left.message);
      return null;
    }

    const readModel = parseOnboardingApiReadModel(jsonResult.right);
    if (!readModel) {
      yield* clientLog("error", "[OnboardingStore] Mutation response shape was invalid.");
      setOnboardingError("The onboarding response was not in the expected format.");
      return null;
    }

    yield* clientLog(
      "info",
      `[OnboardingStore] Mutation updated onboarding to status ${readModel.derivedStatus} at step ${readModel.nextIncompleteStepId}.`
    );
    setOnboardingReady(readModel);
    return readModel;
  });

export const saveOnboardingStepDraft = (
  stepId: OnboardingStepId,
  payload: Record<string, unknown>
) =>
  Effect.gen(function* () {
    yield* clientLog("info", `[OnboardingStore] Saving onboarding draft for ${stepId}.`);
    return yield* postOnboardingReadModel(`/api/onboarding/steps/${stepId}/draft`, { payload });
  });

export const completeOnboardingStep = (
  stepId: OnboardingStepId,
  payload: Record<string, unknown>
) =>
  Effect.gen(function* () {
    yield* clientLog("info", `[OnboardingStore] Completing onboarding step ${stepId}.`);
    return yield* postOnboardingReadModel(`/api/onboarding/steps/${stepId}/complete`, { payload });
  });

export const acceptOnboardingHealthWaiver = (
  signatureName: string,
  waiverVersion: string,
  deviceMetadata?: Record<string, unknown>
) =>
  Effect.gen(function* () {
    yield* clientLog("info", "[OnboardingStore] Accepting onboarding health waiver.");
    return yield* postOnboardingReadModel("/api/onboarding/waiver/accept", {
      signatureName,
      waiverVersion,
      deviceMetadata: deviceMetadata ?? null
    });
  });

export const submitOnboardingPart1 = () =>
  Effect.gen(function* () {
    yield* clientLog("info", "[OnboardingStore] Submitting onboarding Part 1.");
    return yield* postOnboardingReadModel("/api/onboarding/submit-part-1");
  });
