import { describe, expect, it, beforeEach } from "vitest";
import {
  getCurrentOnboardingStep,
  getCurrentOnboardingStepDefinition,
  getOnboardingProgressPercentage,
  getOnboardingResumeStepId,
  onboardingState,
  parseOnboardingApiReadModel,
  resetOnboardingStateForTests
} from "./onboardingStore.ts";

describe("onboarding client store", () => {
  beforeEach(() => {
    resetOnboardingStateForTests();
  });

  it("parses a valid onboarding API read model", () => {
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
            status: "not_started",
            payload: {},
            completedAt: null
          }
        ],
        completionPercentage: 10,
        nextIncompleteStepId: "rhythm_for_success",
        derivedStatus: "part_1_in_progress"
      }
    });

    expect(parsed?.derivedStatus).toBe("part_1_in_progress");
    expect(parsed?.nextIncompleteStepId).toBe("rhythm_for_success");
    expect(parsed?.completionPercentage).toBe(10);
  });

  it("rejects malformed onboarding API read models", () => {
    expect(parseOnboardingApiReadModel(null)).toBeNull();
    expect(parseOnboardingApiReadModel({ success: true })).toBeNull();
    expect(
      parseOnboardingApiReadModel({
        success: true,
        data: {
          onboarding: { id: "1", status: "unknown", current_step_id: "welcome_video" },
          steps: [],
          completionPercentage: 0,
          nextIncompleteStepId: "welcome_video",
          derivedStatus: "unknown"
        }
      })
    ).toBeNull();
  });

  it("exposes progress, resume step, and current step helpers", () => {
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
    expect(getCurrentOnboardingStep()?.stepId).toBe("rhythm_for_success");
    expect(getCurrentOnboardingStepDefinition().title).toBe("Rhythm for Success");
  });
});