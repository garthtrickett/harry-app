import { describe, expect, it } from "vitest";
import {
  buildHealthWaiverPayload,
  buildInitialQaPayload,
  buildNextStepsPayload,
  buildRhythmForSuccessPayload,
  buildWelcomeVideoPayload,
  draftBoolean,
  draftString
} from "./onboardingPart1Payloads.ts";

describe("onboarding Part 1 payload builders", () => {
  it("builds the welcome video completion payload", () => {
    expect(buildWelcomeVideoPayload()).toEqual({
      confirmed: true,
      watchedPercentage: 100
    });
  });

  it("builds rhythm payloads with explicit progress photo deferral", () => {
    const payload = buildRhythmForSuccessPayload({
      motivation: "I want to become consistent.",
      successResult: "Train for 90 days.",
      consistencyBlockers: "Work gets busy.",
      weeklyTrainingRhythm: "Mon/Wed/Fri.",
      preferredTrainingTime: "Morning.",
      supportNeeds: "Accountability.",
      progressPhotosDeferred: true
    });

    expect(payload).toMatchObject({
      motivation: "I want to become consistent.",
      progressPhotosDeferred: true,
      requiredProgressPhotoCount: 0
    });
  });

  it("builds initial Q&A payloads with required and optional fields", () => {
    const payload = buildInitialQaPayload({
      primaryGoal: "Build strength.",
      trainingExperience: "Beginner.",
      injuryHistory: "No current injuries.",
      trainingLocation: "Home.",
      biggestObstacle: "Consistency.",
      coachNotes: "Needs short sessions."
    });

    expect(payload).toMatchObject({
      primaryGoal: "Build strength.",
      trainingExperience: "Beginner.",
      injuryHistory: "No current injuries.",
      trainingLocation: "Home.",
      biggestObstacle: "Consistency.",
      coachNotes: "Needs short sessions."
    });
  });

  it("builds waiver and next-step payloads", () => {
    expect(
      buildHealthWaiverPayload({ accepted: true, signatureName: "Harry Example" }, "v-test")
    ).toEqual({
      accepted: true,
      signatureName: "Harry Example",
      waiverVersion: "v-test"
    });

    expect(buildNextStepsPayload()).toEqual({ confirmed: true });
  });

  it("normalises draft field reads", () => {
    expect(draftString({ value: "yes" }, "value")).toBe("yes");
    expect(draftString({ value: false }, "value", "fallback")).toBe("fallback");
    expect(draftBoolean({ value: true }, "value")).toBe(true);
    expect(draftBoolean({ value: "true" }, "value")).toBe(false);
  });
});