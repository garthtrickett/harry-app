import { describe, expect, it } from "vitest";
import { InvalidCredentialsError } from "../../features/auth/Errors.ts";
import { OnboardingDatabaseError, OnboardingValidationError } from "../../features/onboarding/onboarding.service.ts";
import {
  getBearerTokenFromAuthorizationHeader,
  mapOnboardingRouteError,
  parseOnboardingRoutePayload,
  parseOnboardingRouteStepId
} from "./onboarding.ts";

describe("onboarding route helpers", () => {
  it("extracts a valid Bearer token from an Authorization header", () => {
    expect(getBearerTokenFromAuthorizationHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(getBearerTokenFromAuthorizationHeader("Bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
  });

  it("rejects missing, malformed, null, and undefined Bearer tokens", () => {
    expect(getBearerTokenFromAuthorizationHeader(null)).toBeNull();
    expect(getBearerTokenFromAuthorizationHeader("Basic abc.def.ghi")).toBeNull();
    expect(getBearerTokenFromAuthorizationHeader("Bearer ")).toBeNull();
    expect(getBearerTokenFromAuthorizationHeader("Bearer null")).toBeNull();
    expect(getBearerTokenFromAuthorizationHeader("Bearer undefined")).toBeNull();
  });

  it("parses valid onboarding step IDs only", () => {
    expect(parseOnboardingRouteStepId("welcome_video")).toBe("welcome_video");
    expect(parseOnboardingRouteStepId("nutrition_track_one_day")).toBe("nutrition_track_one_day");
    expect(parseOnboardingRouteStepId("made_up_step")).toBeNull();
  });

  it("parses object payload bodies only", () => {
    expect(parseOnboardingRoutePayload({ payload: { confirmed: true } })).toEqual({ confirmed: true });
    expect(parseOnboardingRoutePayload({ payload: null })).toBeNull();
    expect(parseOnboardingRoutePayload({ payload: [] })).toBeNull();
    expect(parseOnboardingRoutePayload(null)).toBeNull();
  });

  it("maps unauthorized errors to 401", () => {
    const result = mapOnboardingRouteError(new InvalidCredentialsError());

    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Unauthorized");
  });

  it("maps onboarding validation errors to 400 with details", () => {
    const result = mapOnboardingRouteError(
      new OnboardingValidationError({
        message: "Invalid onboarding payload body.",
        errors: ["payload must be an object"]
      })
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Onboarding validation failed");
    expect(result.body.errors).toEqual(["payload must be an object"]);
  });

  it("maps onboarding database errors to 500 without leaking the raw cause", () => {
    const result = mapOnboardingRouteError(
      new OnboardingDatabaseError({
        message: "Failed to load onboarding record.",
        cause: new Error("connection details should stay server-side")
      })
    );

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Onboarding database error");
    expect(result.body.message).toBe("Failed to load onboarding record.");
  });
});