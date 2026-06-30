import { describe, expect, it } from "vitest";
import {
  canCompleteOnboardingPart1,
  canCompleteOnboardingPart2,
  canTransitionOnboardingStatus,
  createEmptyOnboardingSteps,
  deriveOnboardingStatusFromSteps,
  getNextIncompleteOnboardingStepId,
  getOnboardingCompletionPercentage,
  isOnboardingStepComplete,
  type OnboardingStepState,
  validateOnboardingStepPayload
} from "./onboarding.ts";

const completeStep = (
  stepId: OnboardingStepState["stepId"],
  payload: Record<string, unknown>
): OnboardingStepState => ({
  stepId,
  status: "complete",
  payload,
  completedAt: "2026-06-30T00:00:00.000Z"
});

const validPart1Steps = (): readonly OnboardingStepState[] => [
  completeStep("welcome_video", { confirmed: true }),
  completeStep("rhythm_for_success", {
    motivation: "I want to change my life.",
    successResult: "Train consistently for 90 days.",
    consistencyBlockers: "Work gets busy.",
    weeklyTrainingRhythm: "Monday, Wednesday, Friday.",
    preferredTrainingTime: "Morning.",
    supportNeeds: "Clear plan and accountability.",
    requiredProgressPhotoCount: 3
  }),
  completeStep("initial_qa", {
    primaryGoal: "Build strength.",
    trainingExperience: "Beginner.",
    injuryHistory: "No current injuries.",
    trainingLocation: "Home.",
    biggestObstacle: "Consistency."
  }),
  completeStep("health_waiver", {
    accepted: true,
    signatureName: "Harry Example",
    waiverVersion: "2026-06-30"
  }),
  completeStep("part_1_next_steps", { confirmed: true })
];

const validPart2Steps = (): readonly OnboardingStepState[] => [
  completeStep("kit_list", {
    trainingLocation: "Home gym.",
    equipmentList: ["pull-up bar", "resistance bands"]
  }),
  completeStep("app_walkthrough_video", { watchedPercentage: 95 }),
  completeStep("initial_assessment", {
    strengthSubmitted: true,
    mobilitySubmitted: true,
    cardioSubmitted: true
  }),
  completeStep("initial_measurements", {
    unitSystem: "metric",
    bodyWeightKg: 82
  }),
  completeStep("nutrition_track_one_day", {
    nutritionDayStatus: "submitted",
    mealEntries: [{ time: "08:00", description: "Eggs and toast" }]
  })
];

describe("onboarding domain state machine", () => {
  it("starts empty onboarding at the welcome video step", () => {
    const steps = createEmptyOnboardingSteps();

    expect(getNextIncompleteOnboardingStepId(steps)).toBe("welcome_video");
    expect(getOnboardingCompletionPercentage(steps)).toBe(0);
    expect(deriveOnboardingStatusFromSteps("not_started", steps)).toBe("not_started");
  });

  it("requires health waiver acceptance, signature name, and waiver version", () => {
    const invalid = validateOnboardingStepPayload("health_waiver", {
      accepted: false,
      signatureName: "",
      waiverVersion: ""
    });

    const valid = validateOnboardingStepPayload("health_waiver", {
      accepted: true,
      signatureName: "Harry Example",
      waiverVersion: "2026-06-30"
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("health waiver must be accepted");
    expect(valid.valid).toBe(true);
  });

  it("does not complete part 1 when the waiver step is missing", () => {
    const stepsWithoutWaiver = validPart1Steps().filter((step) => step.stepId !== "health_waiver");

    expect(canCompleteOnboardingPart1(stepsWithoutWaiver)).toBe(false);
  });

  it("completes part 1 when all foundation steps are valid", () => {
    const steps = validPart1Steps();

    expect(canCompleteOnboardingPart1(steps)).toBe(true);
    expect(deriveOnboardingStatusFromSteps("part_1_in_progress", steps)).toBe("part_1_complete");
  });

  it("allows rhythm progress photos to be uploaded or explicitly deferred", () => {
    const withPhotos = validateOnboardingStepPayload("rhythm_for_success", {
      motivation: "I want to change my life.",
      successResult: "Train consistently for 90 days.",
      consistencyBlockers: "Work gets busy.",
      weeklyTrainingRhythm: "Monday, Wednesday, Friday.",
      preferredTrainingTime: "Morning.",
      supportNeeds: "Clear plan and accountability.",
      requiredProgressPhotoCount: 3
    });

    const deferred = validateOnboardingStepPayload("rhythm_for_success", {
      motivation: "I want to change my life.",
      successResult: "Train consistently for 90 days.",
      consistencyBlockers: "Work gets busy.",
      weeklyTrainingRhythm: "Monday, Wednesday, Friday.",
      preferredTrainingTime: "Morning.",
      supportNeeds: "Clear plan and accountability.",
      progressPhotosDeferred: true
    });

    const missingPhotos = validateOnboardingStepPayload("rhythm_for_success", {
      motivation: "I want to change my life.",
      successResult: "Train consistently for 90 days.",
      consistencyBlockers: "Work gets busy.",
      weeklyTrainingRhythm: "Monday, Wednesday, Friday.",
      preferredTrainingTime: "Morning.",
      supportNeeds: "Clear plan and accountability."
    });

    expect(withPhotos.valid).toBe(true);
    expect(deferred.valid).toBe(true);
    expect(missingPhotos.valid).toBe(false);
  });

  it("requires part 2 practical data before submission", () => {
    const part1Steps = validPart1Steps();
    const incompletePart2Steps = [
      ...part1Steps,
      completeStep("kit_list", {
        trainingLocation: "Home gym.",
        equipmentList: ["pull-up bar"]
      })
    ];

    expect(canCompleteOnboardingPart2(incompletePart2Steps)).toBe(false);
    expect(deriveOnboardingStatusFromSteps("part_1_complete", incompletePart2Steps)).toBe("part_2_in_progress");
  });

  it("moves to submitted once part 1 and part 2 are complete", () => {
    const steps = [...validPart1Steps(), ...validPart2Steps()];

    expect(canCompleteOnboardingPart1(steps)).toBe(true);
    expect(canCompleteOnboardingPart2(steps)).toBe(true);
    expect(deriveOnboardingStatusFromSteps("part_2_in_progress", steps)).toBe("submitted");
  });

  it("accepts scheduled nutrition tracking as a valid part 2 completion state", () => {
    const nutrition = validateOnboardingStepPayload("nutrition_track_one_day", {
      nutritionDayStatus: "scheduled"
    });

    expect(nutrition.valid).toBe(true);
  });

  it("rejects submitted nutrition tracking without meal entries", () => {
    const nutrition = validateOnboardingStepPayload("nutrition_track_one_day", {
      nutritionDayStatus: "submitted",
      mealEntries: []
    });

    expect(nutrition.valid).toBe(false);
    expect(nutrition.errors).toContain("at least one meal entry is required when nutrition is submitted");
  });

  it("calculates completion percentage from valid completed steps only", () => {
    const steps = [
      completeStep("welcome_video", { confirmed: true }),
      completeStep("health_waiver", {
        accepted: false,
        signatureName: "",
        waiverVersion: ""
      })
    ];

    const [welcomeStep, invalidWaiverStep] = steps;

    expect(welcomeStep).toBeDefined();
    expect(invalidWaiverStep).toBeDefined();
    expect(isOnboardingStepComplete(welcomeStep)).toBe(true);
    expect(isOnboardingStepComplete(invalidWaiverStep)).toBe(false);
    expect(getOnboardingCompletionPercentage(steps)).toBe(10);
  });

  it("enforces explicit status transitions", () => {
    expect(canTransitionOnboardingStatus("not_started", "complete")).toBe(false);
    expect(canTransitionOnboardingStatus("not_started", "part_1_in_progress")).toBe(true);
    expect(canTransitionOnboardingStatus("submitted", "coach_review")).toBe(true);
    expect(canTransitionOnboardingStatus("coach_review", "complete")).toBe(true);
  });
});
