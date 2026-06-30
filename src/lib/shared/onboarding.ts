export const ONBOARDING_STATUSES = [
  "not_started",
  "part_1_in_progress",
  "part_1_complete",
  "part_2_in_progress",
  "submitted",
  "coach_review",
  "complete",
  "blocked"
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STEP_STATUSES = [
  "not_started",
  "in_progress",
  "complete"
] as const;

export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export const ONBOARDING_STEP_IDS = [
  "welcome_video",
  "rhythm_for_success",
  "initial_qa",
  "health_waiver",
  "part_1_next_steps",
  "kit_list",
  "app_walkthrough_video",
  "initial_assessment",
  "initial_measurements",
  "nutrition_track_one_day",
  "complete"
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingPart = 1 | 2 | "complete";

export type OnboardingStepDefinition = {
  readonly id: OnboardingStepId;
  readonly title: string;
  readonly part: OnboardingPart;
  readonly requiredFields: readonly string[];
};

export type OnboardingStepState = {
  readonly stepId: OnboardingStepId;
  readonly status: OnboardingStepStatus;
  readonly payload: Record<string, unknown>;
  readonly completedAt: string | null;
};

export type OnboardingState = {
  readonly status: OnboardingStatus;
  readonly currentStepId: OnboardingStepId;
  readonly steps: readonly OnboardingStepState[];
};

export type OnboardingValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly string[];
};

export const ONBOARDING_STEPS = [
  {
    id: "welcome_video",
    title: "Welcome Video",
    part: 1,
    requiredFields: []
  },
  {
    id: "rhythm_for_success",
    title: "Rhythm for Success",
    part: 1,
    requiredFields: [
      "motivation",
      "successResult",
      "consistencyBlockers",
      "weeklyTrainingRhythm",
      "preferredTrainingTime",
      "supportNeeds"
    ]
  },
  {
    id: "initial_qa",
    title: "Initial Q&A",
    part: 1,
    requiredFields: [
      "primaryGoal",
      "trainingExperience",
      "injuryHistory",
      "trainingLocation",
      "biggestObstacle"
    ]
  },
  {
    id: "health_waiver",
    title: "Health Waiver",
    part: 1,
    requiredFields: ["accepted", "signatureName", "waiverVersion"]
  },
  {
    id: "part_1_next_steps",
    title: "Next Steps",
    part: 1,
    requiredFields: ["confirmed"]
  },
  {
    id: "kit_list",
    title: "Kit List",
    part: 2,
    requiredFields: ["trainingLocation"]
  },
  {
    id: "app_walkthrough_video",
    title: "App Walkthrough Video",
    part: 2,
    requiredFields: []
  },
  {
    id: "initial_assessment",
    title: "Initial Assessment",
    part: 2,
    requiredFields: ["strengthSubmitted", "mobilitySubmitted", "cardioSubmitted"]
  },
  {
    id: "initial_measurements",
    title: "Initial Measurements",
    part: 2,
    requiredFields: ["unitSystem"]
  },
  {
    id: "nutrition_track_one_day",
    title: "Custom Nutrition GPT: Track 1 Day",
    part: 2,
    requiredFields: ["nutritionDayStatus"]
  },
  {
    id: "complete",
    title: "Onboarding Complete",
    part: "complete",
    requiredFields: []
  }
] as const satisfies readonly OnboardingStepDefinition[];

const PART_1_STEP_IDS = ONBOARDING_STEPS
  .filter((step) => step.part === 1)
  .map((step) => step.id);

const PART_2_STEP_IDS = ONBOARDING_STEPS
  .filter((step) => step.part === 2)
  .map((step) => step.id);

const ALLOWED_STATUS_TRANSITIONS: Record<OnboardingStatus, readonly OnboardingStatus[]> = {
  not_started: ["part_1_in_progress", "blocked"],
  part_1_in_progress: ["part_1_complete", "blocked"],
  part_1_complete: ["part_2_in_progress", "blocked"],
  part_2_in_progress: ["submitted", "blocked"],
  submitted: ["coach_review", "blocked"],
  coach_review: ["complete", "blocked"],
  complete: ["blocked"],
  blocked: [
    "not_started",
    "part_1_in_progress",
    "part_1_complete",
    "part_2_in_progress",
    "submitted",
    "coach_review",
    "complete"
  ]
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isPositiveNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
};

const isStringArrayWithItems = (value: unknown): value is readonly string[] => {
  return Array.isArray(value) && value.some(isNonEmptyString);
};

const hasWatchedOrConfirmedVideo = (payload: Record<string, unknown>): boolean => {
  if (payload.confirmed === true) return true;
  const watchedPercentage = payload.watchedPercentage;
  return typeof watchedPercentage === "number" && watchedPercentage >= 80;
};

const hasRequiredTextFields = (
  step: OnboardingStepDefinition,
  payload: Record<string, unknown>
): readonly string[] => {
  return step.requiredFields.filter((field) => !isNonEmptyString(payload[field]));
};

const makeValidationResult = (errors: readonly string[]): OnboardingValidationResult => ({
  valid: errors.length === 0,
  errors
});

export const getOnboardingStepDefinition = (
  stepId: OnboardingStepId
): OnboardingStepDefinition => {
  return ONBOARDING_STEPS.find((step) => step.id === stepId) ?? ONBOARDING_STEPS[0];
};

export const isOnboardingStepId = (value: string): value is OnboardingStepId => {
  return ONBOARDING_STEP_IDS.includes(value as OnboardingStepId);
};

export const validateOnboardingStepPayload = (
  stepId: OnboardingStepId,
  payloadInput: unknown
): OnboardingValidationResult => {
  if (!isRecord(payloadInput)) {
    return makeValidationResult(["payload must be an object"]);
  }

  const payload = payloadInput;
  const step = getOnboardingStepDefinition(stepId);

  if (stepId === "welcome_video" || stepId === "app_walkthrough_video") {
    if (!hasWatchedOrConfirmedVideo(payload)) {
      return makeValidationResult(["video must be confirmed or watched to at least 80 percent"]);
    }
    return makeValidationResult([]);
  }

  if (stepId === "rhythm_for_success") {
    const missingFields = hasRequiredTextFields(step, payload);
    const photoCount = payload.requiredProgressPhotoCount;
    const hasRequiredPhotos = typeof photoCount === "number" && photoCount >= 3;
    const hasDeferredPhotos = payload.progressPhotosDeferred === true;

    if (!hasRequiredPhotos && !hasDeferredPhotos) {
      return makeValidationResult([
        ...missingFields,
        "required progress photos must be uploaded or explicitly deferred"
      ]);
    }

    return makeValidationResult(missingFields);
  }

  if (stepId === "health_waiver") {
    const errors = [
      payload.accepted === true ? "" : "health waiver must be accepted",
      isNonEmptyString(payload.signatureName) ? "" : "signatureName is required",
      isNonEmptyString(payload.waiverVersion) ? "" : "waiverVersion is required"
    ].filter(isNonEmptyString);

    return makeValidationResult(errors);
  }

  if (stepId === "part_1_next_steps") {
    return makeValidationResult(payload.confirmed === true ? [] : ["next steps must be confirmed"]);
  }

  if (stepId === "kit_list") {
    const errors = hasRequiredTextFields(step, payload);
    const hasEquipment = isStringArrayWithItems(payload.equipmentList);
    const hasNoEquipment = payload.noEquipment === true;

    if (!hasEquipment && !hasNoEquipment) {
      return makeValidationResult([
        ...errors,
        "equipmentList must contain equipment or noEquipment must be true"
      ]);
    }

    return makeValidationResult(errors);
  }

  if (stepId === "initial_assessment") {
    const errors = [
      payload.strengthSubmitted === true ? "" : "strength assessment is required",
      payload.mobilitySubmitted === true ? "" : "mobility assessment is required",
      payload.cardioSubmitted === true ? "" : "cardio assessment is required"
    ].filter(isNonEmptyString);

    return makeValidationResult(errors);
  }

  if (stepId === "initial_measurements") {
    const unitSystem = payload.unitSystem;
    const hasValidUnitSystem = unitSystem === "metric" || unitSystem === "imperial";
    const hasMetricWeight = unitSystem === "metric" && isPositiveNumber(payload.bodyWeightKg);
    const hasImperialWeight = unitSystem === "imperial" && isPositiveNumber(payload.bodyWeightLb);
    const errors = [
      hasValidUnitSystem ? "" : "unitSystem must be metric or imperial",
      hasMetricWeight || hasImperialWeight ? "" : "body weight is required"
    ].filter(isNonEmptyString);

    return makeValidationResult(errors);
  }

  if (stepId === "nutrition_track_one_day") {
    if (payload.nutritionDayStatus === "scheduled") {
      return makeValidationResult([]);
    }

    if (payload.nutritionDayStatus !== "submitted") {
      return makeValidationResult(["nutritionDayStatus must be submitted or scheduled"]);
    }

    if (!Array.isArray(payload.mealEntries) || payload.mealEntries.length === 0) {
      return makeValidationResult(["at least one meal entry is required when nutrition is submitted"]);
    }

    return makeValidationResult([]);
  }

  if (stepId === "complete") {
    return makeValidationResult([]);
  }

  return makeValidationResult(hasRequiredTextFields(step, payload));
};

export const isOnboardingStepComplete = (step: OnboardingStepState): boolean => {
  if (step.status !== "complete") return false;
  return validateOnboardingStepPayload(step.stepId, step.payload).valid;
};

export const getCompletedOnboardingStepIds = (
  steps: readonly OnboardingStepState[]
): readonly OnboardingStepId[] => {
  return steps.filter(isOnboardingStepComplete).map((step) => step.stepId);
};

export const getNextIncompleteOnboardingStepId = (
  steps: readonly OnboardingStepState[]
): OnboardingStepId => {
  const completedStepIds = new Set(getCompletedOnboardingStepIds(steps));
  return ONBOARDING_STEP_IDS.find((stepId) => !completedStepIds.has(stepId)) ?? "complete";
};

export const getOnboardingCompletionPercentage = (
  steps: readonly OnboardingStepState[]
): number => {
  const completionSteps = ONBOARDING_STEP_IDS.filter((stepId) => stepId !== "complete");
  const completedStepIds = new Set(getCompletedOnboardingStepIds(steps));
  const completedCount = completionSteps.filter((stepId) => completedStepIds.has(stepId)).length;
  return Math.round((completedCount / completionSteps.length) * 100);
};

export const canCompleteOnboardingPart1 = (
  steps: readonly OnboardingStepState[]
): boolean => {
  const completedStepIds = new Set(getCompletedOnboardingStepIds(steps));
  return PART_1_STEP_IDS.every((stepId) => completedStepIds.has(stepId));
};

export const canCompleteOnboardingPart2 = (
  steps: readonly OnboardingStepState[]
): boolean => {
  const completedStepIds = new Set(getCompletedOnboardingStepIds(steps));
  return PART_2_STEP_IDS.every((stepId) => completedStepIds.has(stepId));
};

export const canTransitionOnboardingStatus = (
  from: OnboardingStatus,
  to: OnboardingStatus
): boolean => {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
};

export const deriveOnboardingStatusFromSteps = (
  currentStatus: OnboardingStatus,
  steps: readonly OnboardingStepState[]
): OnboardingStatus => {
  if (currentStatus === "blocked" || currentStatus === "complete" || currentStatus === "coach_review") {
    return currentStatus;
  }

  const completedStepIds = new Set(getCompletedOnboardingStepIds(steps));
  const hasAnyCompletedStep = completedStepIds.size > 0;
  const hasAnyPart2StepComplete = PART_2_STEP_IDS.some((stepId) => completedStepIds.has(stepId));

  if (canCompleteOnboardingPart1(steps) && canCompleteOnboardingPart2(steps)) {
    return "submitted";
  }

  if (hasAnyPart2StepComplete) {
    return "part_2_in_progress";
  }

  if (canCompleteOnboardingPart1(steps)) {
    return "part_1_complete";
  }

  if (hasAnyCompletedStep) {
    return "part_1_in_progress";
  }

  return "not_started";
};

export const createEmptyOnboardingSteps = (): readonly OnboardingStepState[] => {
  return ONBOARDING_STEP_IDS.map((stepId) => ({
    stepId,
    status: "not_started",
    payload: {},
    completedAt: null
  }));
};