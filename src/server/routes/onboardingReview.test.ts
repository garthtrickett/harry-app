import { describe, expect, it } from "vitest";
import { parseOnboardingReviewStepId } from "../../features/onboarding/onboardingReview.service.ts";
import { canReviewOnboarding } from "./onboardingReview.ts";

describe("onboarding review route helpers", () => {
  it("allows platform and coach-like permissions to review onboarding", () => {
    expect(canReviewOnboarding(["platform:manage"])).toBe(true);
    expect(canReviewOnboarding(["deck:manage"])).toBe(true);
    expect(canReviewOnboarding(["exercise:curate"])).toBe(true);
  });

  it("rejects normal subscriber permissions for coach review", () => {
    expect(canReviewOnboarding(["exercise:read"])).toBe(false);
    expect(canReviewOnboarding([])).toBe(false);
  });

  it("parses valid onboarding step IDs for media registration", () => {
    expect(parseOnboardingReviewStepId("rhythm_for_success")).toBe("rhythm_for_success");
    expect(parseOnboardingReviewStepId("nutrition_track_one_day")).toBe("nutrition_track_one_day");
    expect(parseOnboardingReviewStepId("unknown_step")).toBeNull();
  });
});