import { Elysia, t } from "elysia";
import { Effect } from "effect";
import { InvalidCredentialsError } from "../../features/auth/Errors.ts";
import {
  completeOnboardingCoachReview,
  generateNutritionGptSummaryForOnboarding,
  generateNutritionGptSummaryForUser,
  getCoachReviewOnboardingDetails,
  listSubmittedOnboardingsForCoachReview,
  markOnboardingCoachReviewStarted,
  OnboardingReviewDatabaseError,
  OnboardingReviewValidationError,
  parseOnboardingReviewStepId,
  registerOnboardingMediaMetadata
} from "../../features/onboarding/onboardingReview.service.ts";
import { validateToken } from "../../lib/server/JwtService.ts";
import type { ClientOnboardingId, UserId } from "../../types/index.ts";
import { effectPlugin } from "../middleware/effect-plugin.ts";

const getBearerTokenFromAuthorizationHeader = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token || token === "null" || token === "undefined") return null;

  return token;
};

const authenticateOnboardingReviewRequest = (request: Request) =>
  Effect.gen(function* () {
    const token = getBearerTokenFromAuthorizationHeader(request.headers.get("authorization"));

    if (!token) {
      yield* Effect.logError("[OnboardingReviewRoutes] Missing or invalid Bearer token.");
      return yield* Effect.fail(new InvalidCredentialsError());
    }

    const user = yield* validateToken(token);
    yield* Effect.logInfo(`[OnboardingReviewRoutes] Authenticated request for user ${user.email}`);

    return {
      ...user,
      id: user.id as UserId
    };
  });

export const canReviewOnboarding = (permissions: readonly string[]): boolean => {
  return (
    permissions.includes("platform:manage") ||
    permissions.includes("deck:manage") ||
    permissions.includes("workout_template:manage") ||
    permissions.includes("exercise:curate")
  );
};

const requireOnboardingReviewer = (user: { readonly id: UserId; readonly email: string; readonly permissions: readonly string[] }) =>
  Effect.gen(function* () {
    if (!canReviewOnboarding(user.permissions)) {
      yield* Effect.logError(`[OnboardingReviewRoutes] User ${user.email} is not allowed to review onboarding submissions.`);
      return yield* Effect.fail(new InvalidCredentialsError());
    }

    yield* Effect.logInfo(`[OnboardingReviewRoutes] User ${user.email} authorised for onboarding review.`);
    return user;
  });

const mapOnboardingReviewRouteError = (error: unknown): { readonly status: number; readonly body: Record<string, unknown> } => {
  if (error instanceof InvalidCredentialsError) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (error instanceof OnboardingReviewValidationError) {
    return {
      status: 400,
      body: {
        error: "Onboarding review validation failed",
        message: error.message,
        errors: error.errors
      }
    };
  }

  if (error instanceof OnboardingReviewDatabaseError) {
    return {
      status: 500,
      body: {
        error: "Onboarding review database error",
        message: error.message
      }
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error"
    }
  };
};

const runOnboardingReviewRouteEffect = async <A>(
  effect: Effect.Effect<A, unknown, never>,
  set: { status?: number | string },
  runEffect: <B, E>(effect: Effect.Effect<B, E, unknown>) => Promise<B>
): Promise<A | Record<string, unknown>> => {
  const result = await runEffect(Effect.either(effect));

  if (result._tag === "Right") {
    return result.right;
  }

  const mappedError = mapOnboardingReviewRouteError(result.left);
  set.status = mappedError.status;

  await runEffect(
    Effect.logError(
      `[OnboardingReviewRoutes] Request failed with status ${mappedError.status}: ${String(mappedError.body.error)}`
    )
  );

  return mappedError.body;
};

export const onboardingReviewRoutes = new Elysia({ prefix: "/api/onboarding" })
  .use(effectPlugin)
  .post(
    "/media",
    async ({ body, request, set, runEffect }) => {
      const mediaEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingReviewRoutes] POST media metadata for step ${body.stepId}`);
        const user = yield* authenticateOnboardingReviewRequest(request);
        const stepId = parseOnboardingReviewStepId(body.stepId);

        if (!stepId) {
          return yield* Effect.fail(
            new OnboardingReviewValidationError({
              message: "Invalid onboarding step ID.",
              errors: ["stepId is invalid"]
            })
          );
        }

        const media = yield* registerOnboardingMediaMetadata({
          userId: user.id,
          stepId,
          mediaKind: body.mediaKind,
          storageKey: body.storageKey,
          publicUrl: body.publicUrl ?? null,
          originalFilename: body.originalFilename ?? null,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes ?? null
        });

        return { success: true, data: media };
      });

      return runOnboardingReviewRouteEffect(mediaEffect, set, runEffect);
    },
    {
      body: t.Object({
        stepId: t.String(),
        mediaKind: t.String({ minLength: 1 }),
        storageKey: t.String({ minLength: 1 }),
        publicUrl: t.Optional(t.Nullable(t.String())),
        originalFilename: t.Optional(t.Nullable(t.String())),
        mimeType: t.String({ minLength: 1 }),
        sizeBytes: t.Optional(t.Union([t.String(), t.Number(), t.Null()]))
      })
    }
  )
  .post("/nutrition-summary", async ({ request, set, runEffect }) => {
    const nutritionSummaryEffect = Effect.gen(function* () {
      yield* Effect.logInfo("[OnboardingReviewRoutes] POST nutrition GPT summary generation for current user");
      const user = yield* authenticateOnboardingReviewRequest(request);
      const summary = yield* generateNutritionGptSummaryForUser(user.id);
      return { success: true, data: summary };
    });

    return runOnboardingReviewRouteEffect(nutritionSummaryEffect, set, runEffect);
  })
  .get("/admin/submitted", async ({ request, set, runEffect }) => {
    const submittedEffect = Effect.gen(function* () {
      yield* Effect.logInfo("[OnboardingReviewRoutes] GET submitted onboarding records for admin review");
      const user = yield* authenticateOnboardingReviewRequest(request);
      yield* requireOnboardingReviewer(user);
      const submitted = yield* listSubmittedOnboardingsForCoachReview();
      return { success: true, data: submitted };
    });

    return runOnboardingReviewRouteEffect(submittedEffect, set, runEffect);
  })
  .get(
    "/admin/:onboardingId",
    async ({ params, request, set, runEffect }) => {
      const detailEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingReviewRoutes] GET coach review detail for onboarding ${params.onboardingId}`);
        const user = yield* authenticateOnboardingReviewRequest(request);
        yield* requireOnboardingReviewer(user);
        const detail = yield* getCoachReviewOnboardingDetails(params.onboardingId as ClientOnboardingId);
        return { success: true, data: detail };
      });

      return runOnboardingReviewRouteEffect(detailEffect, set, runEffect);
    },
    {
      params: t.Object({ onboardingId: t.String({ minLength: 1 }) })
    }
  )
  .post(
    "/admin/:onboardingId/nutrition-summary",
    async ({ params, request, set, runEffect }) => {
      const nutritionSummaryEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingReviewRoutes] POST admin nutrition GPT summary for onboarding ${params.onboardingId}`);
        const user = yield* authenticateOnboardingReviewRequest(request);
        yield* requireOnboardingReviewer(user);
        const summary = yield* generateNutritionGptSummaryForOnboarding(params.onboardingId as ClientOnboardingId);
        return { success: true, data: summary };
      });

      return runOnboardingReviewRouteEffect(nutritionSummaryEffect, set, runEffect);
    },
    {
      params: t.Object({ onboardingId: t.String({ minLength: 1 }) })
    }
  )
  .post(
    "/admin/:onboardingId/review",
    async ({ body, params, request, set, runEffect }) => {
      const reviewEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingReviewRoutes] POST mark coach review started for onboarding ${params.onboardingId}`);
        const user = yield* authenticateOnboardingReviewRequest(request);
        yield* requireOnboardingReviewer(user);
        const readModel = yield* markOnboardingCoachReviewStarted(
          params.onboardingId as ClientOnboardingId,
          user.id,
          body.coachNotes
        );
        return { success: true, data: readModel };
      });

      return runOnboardingReviewRouteEffect(reviewEffect, set, runEffect);
    },
    {
      params: t.Object({ onboardingId: t.String({ minLength: 1 }) }),
      body: t.Object({ coachNotes: t.String() })
    }
  )
  .post(
    "/admin/:onboardingId/complete",
    async ({ body, params, request, set, runEffect }) => {
      const completeReviewEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[OnboardingReviewRoutes] POST complete coach review for onboarding ${params.onboardingId}`);
        const user = yield* authenticateOnboardingReviewRequest(request);
        yield* requireOnboardingReviewer(user);
        const readModel = yield* completeOnboardingCoachReview(
          params.onboardingId as ClientOnboardingId,
          user.id,
          body.coachNotes
        );
        return { success: true, data: readModel };
      });

      return runOnboardingReviewRouteEffect(completeReviewEffect, set, runEffect);
    },
    {
      params: t.Object({ onboardingId: t.String({ minLength: 1 }) }),
      body: t.Object({ coachNotes: t.String() })
    }
  );