import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./OnboardingView.ts";
import { resetOnboardingStateForTests } from "../lib/client/stores/onboardingStore.ts";

const waitForEffects = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const onboardingResponse = {
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
};

describe("OnboardingView shell", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = "";
    resetOnboardingStateForTests();
    localStorage.setItem("jwt", "test-token");
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(onboardingResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.removeItem("jwt");
    resetOnboardingStateForTests();
  });

  it("loads and renders the onboarding shell placeholder", async () => {
    const element = document.createElement("onboarding-view") as HTMLElement & {
      updateComplete: Promise<boolean>;
    };

    document.body.appendChild(element);
    await waitForEffects();
    await waitForEffects();
    await element.updateComplete;

    expect(element.querySelector('[data-testid="onboarding-shell"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="onboarding-placeholder-step"]')).not.toBeNull();
    expect(element.textContent).toContain("Rhythm for Success");
    expect(element.textContent).toContain("10% complete");
  });
});