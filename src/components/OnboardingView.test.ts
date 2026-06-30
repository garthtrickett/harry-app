import { describe, expect, it } from "vitest";
import { stepStatusLabel } from "./OnboardingView.ts";
import {
  getCurrentOnboardingStepDefinition,
  getOnboardingProgressPercentage,
  getOnboardingResumeStepId,
  onboardingState,
  parseOnboardingApiReadModel,
  resetOnboardingStateForTests
} from "../lib/client/stores/onboardingStore.ts";

describe("OnboardingView shell helpers", () => {
  it("maps onboarding step statuses to client-facing labels", () => {
    expect(stepStatusLabel("complete")).toBe("Complete");
    expect(stepStatusLabel("in_progress")).toBe("In progress");
    expect(stepStatusLabel("not_started")).toBe("Not started");
  });

  it("exposes the placeholder shell state needed by the view without requiring a DOM test runner", () => {
    resetOnboardingStateForTests();

    const parsed = parseOnboardingApiReadModel({
      success: true,
      data: {
        onboarding: {
          id: "onboarding-1",
          status: "part_1_in_progress",
          current_step_id: "rhythm_for_success"
        },
        steps: [
          {
            stepId: "welcome_video",
            status: "complete",
            payload: { confirmed: true },
            completedAt: "2026-06-30T00:00:00.000Z"
          },
          {
            stepId: "rhythm_for_success",
            status: "in_progress",
            payload: { motivation: "I want to change." },
            completedAt: null
          }
        ],
        completionPercentage: 10,
        nextIncompleteStepId: "rhythm_for_success",
        derivedStatus: "part_1_in_progress"
      }
    });

    expect(parsed).not.toBeNull();
    if (!parsed) return;

    onboardingState.value = {
      status: "ready",
      readModel: parsed,
      errorMessage: null,
      lastLoadedAt: "2026-06-30T00:00:00.000Z"
    };

    expect(getOnboardingProgressPercentage()).toBe(10);
    expect(getOnboardingResumeStepId()).toBe("rhythm_for_success");
    expect(getCurrentOnboardingStepDefinition().title).toBe("Rhythm for Success");

    resetOnboardingStateForTests();
  });
});
