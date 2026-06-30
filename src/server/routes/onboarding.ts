import { Elysia, t } from "elysia";
import { Effect } from "effect";
import { InvalidCredentialsError } from "../../features/auth/Errors.ts";
import {
  acceptHealthWaiver,
  completeOnboardingStep,
  getOrCreateOnboarding,
  OnboardingDatabaseError,
  OnboardingValidationError,
  saveOnboardingStepDraft,
  submitOnboardingPart1,
  submitOnboardingPart2
} from "../../features/onboarding/onboarding.service.ts";
import { validateToken } from "../../lib/server/JwtService.ts";
import { isOnboardingStepId, type OnboardingStepId } from "../../lib/shared/onboarding.ts";
import type { UserId } from "../../types/index.ts";
import { effectPlugin } from "../middleware/effect-plugin.ts";

export type OnboardingRouteErrorBody = {
  readonly error: string;
  readonly message?: string;
  readonly errors?: readonly string[];
};

export type OnboardingRouteErrorResult = {
  readonly status: number;
  readonly body: OnboardingRouteErrorBody;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getErrorTag = (error: unknown): string | null => {
  if (!isRecord(error)) return null;
  const tag = error._tag;
  return typeof tag === "string" ? tag : null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
};

export const getBearerTokenFromAuthorizationHeader = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token || token === "null" || token === "undefined") return null;

  return token;
};

const getBearerTokenFromRequest = (request: Request): string | null => {
  return getBearerTokenFromAuthorizationHeader(request.headers.get("authorization"));
};

const authenticateOnboardingRequest = (request: Request) =>
  Effect.gen(function* () {
    const token = getBearerTokenFromRequest(request);

    if (!token) {
      yield* Effect.logError("[OnboardingRoutes] Missing or invalid Bearer token.");
      return yield* Effect.fail(new InvalidCredentialsError());
    }

    const user = yield* validateToken(token);
    yield* Effect.logInfo(`[OnboardingRoutes] Authenticated onboarding request for user ${user.email}`);

    return {
      ...user,
      id: user.id as UserId
    };
  });

export const parseOnboardingRouteStepId = (stepId: string): OnboardingStepId | null => {
  return isOnboardingStepId(stepId) ? stepId : null;
};

export const parseOnboardingRoutePayload = (body: unknown): Record<string, unknown> | null => {
  if (!isRecord(body)) return null;
  const payload = body.payload;
  return isRecord(payload) ? payload : null;
};

const getValidatedStepId = (stepId: string) =>
  Effect.gen(function* () {
    const parsedStepId = parseOnboardingRouteStepId(stepId);

    if (!parsedStepId) {
      yield* Effect.logError(`[OnboardingRoutes] Invalid onboarding step ID: ${stepId}`);
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Invalid onboarding step ID.",
          errors: ["stepId is invalid"]
        })
      );
    }

    return parsedStepId;
  });

const getValidatedPayload = (body: unknown) =>
  Effect.gen(function* () {
    const payload = parseOnboardingRoutePayload(body);

    if (!payload) {
      yield* Effect.logError("[OnboardingRoutes] Invalid onboarding payload body.");
      return yield* Effect.fail(
        new OnboardingValidationError({
          message: "Invalid onboarding payload body.",
          errors: ["payload must be an object"]
        })
      );
    }

    return payload;
  });

export const mapOnboardingRouteError = (error: unknown): OnboardingRouteErrorResult => {
  const tag = getErrorTag(error);

  if (error instanceof InvalidCredentialsError || tag === "Unauthorized" || tag === "Forbidden") {
    return {
      status: 401,
      body: { error: "Unauthorized" }
    };
  }

  if (error instanceof OnboardingValidationError) {
    return {
      status: 400,
      body: {
        error: "Onboarding validation failed",
        message: error.message,
        errors: error.errors
      }
    };
  }

  if (error instanceof OnboardingDatabaseError) {
    return {
      status: 500,
      body: {
        error: "Onboarding database error",
        message: error.message
      }
    };
  }

  if (tag === "BadRequest") {
    return {
      status: 400,
      body: {
        error: "Bad request",
        message: getErrorMessage(error)
      }
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal Server Error",
      message: getErrorMessage(error)
    }
  };
};

const runOnboardingRouteEffect = async <A>(
  effect: Effect.Effect<A, unknown, never>,
  set: { status?: number | string },
  runEffect: <B, E>(effect: Effect.Effect<B, E, unknown>) => Promise<B>
): Promise<A | OnboardingRouteErrorBody> => {
  const result = await runEffect(Effect.either(effect));

  if (result._tag === "Right") {
    return result.right;
  }

  const mappedError = mapOnboardingRouteError(result.left);
  set.status = mappedError.status;

  await runEffect(
    Effect.logError(
      `[OnboardingRoutes] Request failed with status ${mappedError.status}: ${mappedError.body.error}`
    )
  );

  return mappedError.body;
};

export const onboardingRoutes = new Elysia({ prefix: "/api/onboarding" })
  .use(effectPlugin)
  .get("/me", async ({ request, set, runEffect }) => {
    const onboardingEffect = Effect.gen(function* () {
      yield* Effect.logInfo("[OnboardingRoutes] GET /api/onboarding/me");
      const user = yield* authenticateOnboardingRequest(request);
      const onboarding = yield* getOrCreateOnboarding(user.id);
      return { success: true, data: onboarding };
    });

    return runOnboardingRouteEffect(onboardingEffect, set, runEffect);
  })
  .post(
    "/steps/:stepId/draft",
    async ({ body, params, request, set, runEffect }) => {
      const draftEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingRoutes] POST draft for step ${params.stepId}`);
        const user = yield* authenticateOnboardingRequest(request);
        const stepId = yield* getValidatedStepId(params.stepId);
        const payload = yield* getValidatedPayload(body);
        const onboarding = yield* saveOnboardingStepDraft({ userId: user.id, stepId, payload });
        return { success: true, data: onboarding };
      });

      return runOnboardingRouteEffect(draftEffect, set, runEffect);
    },
    {
      params: t.Object({
        stepId: t.String()
      }),
      body: t.Object({
        payload: t.Any()
      })
    }
  )
  .post(
    "/steps/:stepId/complete",
    async ({ body, params, request, set, runEffect }) => {
      const completeEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingRoutes] POST complete for step ${params.stepId}`);
        const user = yield* authenticateOnboardingRequest(request);
        const stepId = yield* getValidatedStepId(params.stepId);
        const payload = yield* getValidatedPayload(body);
        const onboarding = yield* completeOnboardingStep({ userId: user.id, stepId, payload });
        return { success: true, data: onboarding };
      });

      return runOnboardingRouteEffect(completeEffect, set, runEffect);
    },
    {
      params: t.Object({
        stepId: t.String()
      }),
      body: t.Object({
        payload: t.Any()
      })
    }
  )
  .post(
    "/waiver/accept",
    async ({ body, request, set, runEffect }) => {
      const waiverEffect = Effect.gen(function* () {
        yield* Effect.logInfo("[OnboardingRoutes] POST health waiver accept");
        const user = yield* authenticateOnboardingRequest(request);
        const forwardedFor = request.headers.get("x-forwarded-for");
        const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;

        const onboarding = yield* acceptHealthWaiver({
          userId: user.id,
          signatureName: body.signatureName,
          waiverVersion: body.waiverVersion,
          ipAddress,
          deviceMetadata: isRecord(body.deviceMetadata) ? body.deviceMetadata : null
        });

        return { success: true, data: onboarding };
      });

      return runOnboardingRouteEffect(waiverEffect, set, runEffect);
    },
    {
      body: t.Object({
        signatureName: t.String({ minLength: 1 }),
        waiverVersion: t.String({ minLength: 1 }),
        deviceMetadata: t.Optional(t.Any())
      })
    }
  )
  .post("/submit-part-1", async ({ request, set, runEffect }) => {
    const submitPart1Effect = Effect.gen(function* () {
      yield* Effect.logInfo("[OnboardingRoutes] POST submit Part 1");
      const user = yield* authenticateOnboardingRequest(request);
      const onboarding = yield* submitOnboardingPart1(user.id);
      return { success: true, data: onboarding };
    });

    return runOnboardingRouteEffect(submitPart1Effect, set, runEffect);
  })
  .post("/submit-part-2", async ({ request, set, runEffect }) => {
    const submitPart2Effect = Effect.gen(function* () {
      yield* Effect.logInfo("[OnboardingRoutes] POST submit Part 2");
      const user = yield* authenticateOnboardingRequest(request);
      const onboarding = yield* submitOnboardingPart2(user.id);
      return { success: true, data: onboarding };
    });

    return runOnboardingRouteEffect(submitPart2Effect, set, runEffect);
  });