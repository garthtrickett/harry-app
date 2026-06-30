import { describe, expect, it } from "vitest";
import { createOnboardingReadModelFromRows } from "./onboarding.service.ts";
import type { ClientOnboarding, ClientOnboardingId, ClientOnboardingStep, UserId } from "../../types";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111" as UserId;
const TEST_ONBOARDING_ID = "22222222-2222-2222-2222-222222222222" as ClientOnboardingId;

const baseOnboarding = (overrides: Partial<ClientOnboarding> = {}): ClientOnboarding => ({
  id: TEST_ONBOARDING_ID,
  user_id: TEST_USER_ID,
  status: "not_started",
  current_step_id: "welcome_video",
  part_1_completed_at: null,
  part_2_completed_at: null,
  submitted_at: null,
  coach_reviewed_at: null,
  coach_reviewer_id: null,
  coach_notes: null,
  blocked_reason: null,
  created_at: new Date("2026-06-30T00:00:00.000Z"),
  updated_at: new Date("2026-06-30T00:00:00.000Z"),
  hlc: "0000000000000:0000:test",
  ...overrides
});

const stepRow = (
  stepId: string,
  payload: Record<string, unknown>,
  status = "complete"
): ClientOnboardingStep => ({
  id: `${stepId}-row-id` as ClientOnboardingStep["id"],
  onboarding_id: TEST_ONBOARDING_ID,
  step_id: stepId,
  part: "1",
  status,
  payload,
  completed_at: status === "complete" ? new Date("2026-06-30T00:05:00.000Z") : null,
  created_at: new Date("2026-06-30T00:00:00.000Z"),
  updated_at: new Date("2026-06-30T00:05:00.000Z"),
  hlc: "0000000000000:0000:test"
});

describe("onboarding service read model", () => {
  it("derives part 1 in progress when only the welcome video is complete", () => {
    const readModel = createOnboardingReadModelFromRows(baseOnboarding(), [
      stepRow("welcome_video", { confirmed: true })
    ]);

    expect(readModel.derivedStatus).toBe("part_1_in_progress");
    expect(readModel.nextIncompleteStepId).toBe("rhythm_for_success");
    expect(readModel.completionPercentage).toBe(10);
  });

  it("ignores unknown persisted step IDs when building the read model", () => {
    const readModel = createOnboardingReadModelFromRows(baseOnboarding(), [
      stepRow("unknown_future_step", { confirmed: true })
    ]);

    expect(readModel.derivedStatus).toBe("not_started");
    expect(readModel.nextIncompleteStepId).toBe("welcome_video");
    expect(readModel.completionPercentage).toBe(0);
  });

  it("preserves blocked status and stored current step for blocked onboarding", () => {
    const readModel = createOnboardingReadModelFromRows(
      baseOnboarding({ status: "blocked", current_step_id: "initial_qa" }),
      [stepRow("welcome_video", { confirmed: true })]
    );

    expect(readModel.derivedStatus).toBe("blocked");
    expect(readModel.nextIncompleteStepId).toBe("initial_qa");
  });

  it("derives submitted when all part 1 and part 2 steps are complete", () => {
    const readModel = createOnboardingReadModelFromRows(baseOnboarding({ status: "part_2_in_progress" }), [
      stepRow("welcome_video", { confirmed: true }),
      stepRow("rhythm_for_success", {
        motivation: "I want to change my life.",
        successResult: "Train consistently for 90 days.",
        consistencyBlockers: "Work gets busy.",
        weeklyTrainingRhythm: "Monday, Wednesday, Friday.",
        preferredTrainingTime: "Morning.",
        supportNeeds: "Clear plan and accountability.",
        requiredProgressPhotoCount: 3
      }),
      stepRow("initial_qa", {
        primaryGoal: "Build strength.",
        trainingExperience: "Beginner.",
        injuryHistory: "No current injuries.",
        trainingLocation: "Home.",
        biggestObstacle: "Consistency."
      }),
      stepRow("health_waiver", {
        accepted: true,
        signatureName: "Harry Example",
        waiverVersion: "2026-06-30"
      }),
      stepRow("part_1_next_steps", { confirmed: true }),
      stepRow("kit_list", {
        trainingLocation: "Home gym.",
        equipmentList: ["pull-up bar"]
      }),
      stepRow("app_walkthrough_video", { confirmed: true }),
      stepRow("initial_assessment", {
        strengthSubmitted: true,
        mobilitySubmitted: true,
        cardioSubmitted: true
      }),
      stepRow("initial_measurements", {
        unitSystem: "metric",
        bodyWeightKg: 82
      }),
      stepRow("nutrition_track_one_day", {
        nutritionDayStatus: "submitted",
        mealEntries: [{ time: "08:00", description: "Eggs and toast" }]
      })
    ]);

    expect(readModel.derivedStatus).toBe("submitted");
    expect(readModel.nextIncompleteStepId).toBe("complete");
    expect(readModel.completionPercentage).toBe(100);
  });
});