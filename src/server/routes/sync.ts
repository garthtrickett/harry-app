import { Elysia, t } from "elysia";
import { Effect } from "effect";
import { effectPlugin } from "../middleware/effect-plugin.ts";
import { db } from "../../db/client.ts";
import { validateToken } from "../../lib/server/JwtService.ts";
import { InvalidCredentialsError, AuthDatabaseError } from "../../features/auth/Errors.ts";
import { initHlc, receiveHlc, packHlc } from "../../lib/shared/hlc.ts";
import type { UserId, ExerciseProgressId, ExerciseId } from "../../types/index.ts";
import { OutboxTransactionSchema } from "../../lib/shared/sync-schemas.ts";
import { Schema } from "effect";
import { TreeFormatter } from "effect/ParseResult";
import { AuthError } from "../../lib/shared/auth.ts";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(effectPlugin)
  .get(
    "/pull",
    async ({ query, headers, set, runEffect }) => {
      const pullEffect = Effect.gen(function* () {
        const since = query.since || "0000000000000:0000:initial";
        yield* Effect.logInfo(`[Sync:Pull] Executing pull requests. sinceHlc=${since}`);

        const authHeader = headers["authorization"];
        yield* Effect.logInfo(`[Sync:Pull] Received Authorization header: "${authHeader}"`);

        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        yield* Effect.logInfo(`[Sync:Pull] Parsed token value: "${token}"`);

        if (!token || token === "null" || token === "undefined" || token.trim() === "") {
          yield* Effect.logError(`[Sync:Pull] Unauthorized access: Missing, null, or empty authorization token "${token}"`);
          return yield* Effect.fail(new InvalidCredentialsError());
        }

        const user = yield* validateToken(token);
        yield* Effect.logInfo(`[Sync:Pull] Authorized session for subscriber: ${user.email} (ID: ${user.id})`);

        const op = since === "0000000000000:0000:initial" ? ">=" : ">";

        // Retrieve decks updated lexicographically after the client's since HLC
        yield* Effect.logInfo(`[Sync:Pull] Fetching decks updated after HLC: ${since}`);
        const decks = yield* Effect.tryPromise({
          try: () => db.selectFrom("deck")
            .selectAll()
            .where("hlc", op, since)
            .execute(),
          catch: (cause) => new AuthDatabaseError({ cause })
        });
        yield* Effect.logInfo(`[Sync:Pull] Retrieved ${decks.length} matching decks from database`);

        // Retrieve exercise progress updated lexicographically after client since HLC
        yield* Effect.logInfo(`[Sync:Pull] Fetching user exercise progress updated after HLC: ${since}`);
        const progressCards = yield* Effect.tryPromise({
          try: () => db.selectFrom("exercise_progress")
            .selectAll()
            .where("user_id", "=", user.id as UserId)
            .where("hlc", op, since)
            .execute(),
          catch: (cause) => new AuthDatabaseError({ cause })
        });
        yield* Effect.logInfo(`[Sync:Pull] Retrieved ${progressCards.length} matching progress cards from database`);

        // Retrieve global exercises catalog updated lexicographically after client since HLC
        yield* Effect.logInfo(`[Sync:Pull] Fetching global exercises updated after HLC: ${since}`);
        const exercises = yield* Effect.tryPromise({
          try: () => db.selectFrom("exercise")
            .selectAll()
            .where("hlc", op, since)
            .execute(),
          catch: (cause) => new AuthDatabaseError({ cause })
        });
        yield* Effect.logInfo(`[Sync:Pull] Retrieved ${exercises.length} matching exercises from database`);

        const decksResult = decks.map(d => ({
          id: d.id,
          name: d.name,
          category: d.category,
          content: d.content,
          hlc: d.hlc
        }));

        const srsUpdatesResult = progressCards.map(c => ({
          id: c.id,
          exerciseId: c.exercise_id,
          easeFactor: c.ease_factor,
          repetitions: c.repetitions,
          intervalDays: c.interval_days,
          nextReview: c.next_review.toISOString(),
          hlc: c.hlc
        }));

        const exercisesResult = exercises.map(ex => ({
          id: ex.id,
          formal_name: ex.formal_name,
          base_meaning: ex.base_meaning,
          difficulty_level: ex.difficulty_level,
          hlc: ex.hlc
        }));

        // Retrieve user preferences (or initialize defaults on-the-fly)
        yield* Effect.logInfo(`[Sync:Pull] Fetching user preferences for user_id=${user.id}`);
        let userPreference = yield* Effect.tryPromise({
          try: () => db.selectFrom("user_preference")
            .selectAll()
            .where("user_id", "=", user.id as UserId)
            .executeTakeFirst(),
          catch: (cause) => new AuthDatabaseError({ cause })
        });

        if (!userPreference) {
          yield* Effect.logInfo(`[Sync:Pull] Seed default preferences for user_id=${user.id}`);
          userPreference = yield* Effect.tryPromise({
            try: () => db.insertInto("user_preference")
              .values({
                user_id: user.id as UserId,
                daily_review_limit: 20,
                daily_new_exercise_limit: 3,
                enforce_mastery_locks: true,
                created_at: new Date(),
                updated_at: new Date(),
                hlc: "0000000000000:0000:initial"
              })
              .returningAll()
              .executeTakeFirstOrThrow(),
            catch: (cause) => new AuthDatabaseError({ cause })
          });
        }

        const showPreference = userPreference && (op === ">=" ? userPreference.hlc >= since : userPreference.hlc > since);
        const serverTimestamp = Date.now();
        yield* Effect.logInfo(`[Sync:Pull] Complete. generatedServerTimestamp=${serverTimestamp}`);

        return {
          serverTimestamp,
          serverHlc: packHlc(initHlc("server", serverTimestamp)),
          decks: decksResult,
          srsUpdates: srsUpdatesResult,
          exercises: exercisesResult,
          userPreference: showPreference ? {
            dailyReviewLimit: userPreference.daily_review_limit,
            dailyNewExerciseLimit: userPreference.daily_new_exercise_limit,
            enforceMasteryLocks: userPreference.enforce_mastery_locks,
            hlc: userPreference.hlc
          } : undefined
        };
      });

      const result = await runEffect(Effect.either(pullEffect));
      if (result._tag === "Left") {
        const error = result.left;
        const errorMessage = error instanceof Error ? error.message : (typeof error === "string" ? error : (JSON.stringify(error) ?? "Unknown error"));
        await runEffect(
          Effect.logError(
            `[Sync:Pull] Pull request failed: ${errorMessage}`
          )
        );
        if (error instanceof InvalidCredentialsError || (error && typeof error === "object" && "_tag" in error && (error._tag === "Unauthorized" || error._tag === "Forbidden" || (error as { _tag?: string })._tag === "AuthError"))) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        set.status = 500;
        return { error: "Internal Server Error", message: errorMessage };
      }
      return result.right;
    },
    {
      query: t.Object({
        since: t.Optional(t.String())
      })
    }
  )
  .post(
    "/push",
    async ({ body, headers, set, runEffect }) => {
      const pushEffect = Effect.gen(function* () {
        yield* Effect.logInfo(`[Sync:Push] Processing transaction. txId=${body.id}, type=${body.type}`);

        const decodedTx = yield* Schema.decodeUnknown(OutboxTransactionSchema)(body).pipe(
          Effect.mapError(
            (parseError) =>
              new AuthError({
                _tag: "BadRequest",
                message: `Invalid outbox transaction payload: ${TreeFormatter.formatErrorSync(parseError)}`,
              })
          )
        );

        const authHeader = headers["authorization"];
        yield* Effect.logInfo(`[Sync:Push] Received Authorization header: "${authHeader}"`);

        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        yield* Effect.logInfo(`[Sync:Push] Parsed token value: "${token}"`);

        if (!token || token === "null" || token === "undefined" || token.trim() === "") {
          yield* Effect.logError(`[Sync:Push] Unauthorized access: Missing, null, or empty authorization token "${token}"`);
          return yield* Effect.fail(new InvalidCredentialsError());
        }

        const user = yield* validateToken(token);
        yield* Effect.logInfo(`[Sync:Push] Authorized session for subscriber: ${user.email} (ID: ${user.id})`);

        // Clock Convergence: Merge server wall clock with client's incoming HLC
        const clientHlc = decodedTx.hlc;
        const serverBase = initHlc("server", Date.now());
        const converged = receiveHlc(serverBase, clientHlc, Date.now());
        const convergedPacked = packHlc(converged);

        yield* Effect.logInfo(`[Sync:Push] HLC converged: client=${clientHlc} -> converged=${convergedPacked}`);

        if (decodedTx.type === "record_review") {
          const payload = decodedTx.payload;
          const exerciseId = payload.exerciseId;
          const easeFactor = payload.easeFactor;
          const repetitions = payload.repetitions;
          const intervalDays = payload.intervalDays;
          const nextReview = payload.nextReview;

          yield* Effect.logInfo(`[Sync:Push] Recording review exerciseId=${exerciseId}. easeFactor=${easeFactor}, reps=${repetitions}, nextReview=${nextReview}`);

          // Verify exercise exists first to prevent foreign key violations
          const exExists = yield* Effect.tryPromise({ 
            try: () => db.selectFrom("exercise")
              .select("id")
              .where("id", "=", exerciseId as ExerciseId)
              .executeTakeFirst(),
            catch: (cause) => new AuthDatabaseError({ cause })
          });

          if (!exExists) {
            yield* Effect.logWarning(`[Sync:Push] exerciseId=${exerciseId} not found in database. Discarding review to clear outbox queue.`);
            return { success: true };
          }

          yield* Effect.tryPromise({ 
            try: () => db.insertInto("exercise_progress")
              .values({
                id: crypto.randomUUID() as ExerciseProgressId,
                user_id: user.id as UserId,
                exercise_id: exerciseId as ExerciseId,
                ease_factor: easeFactor,
                repetitions: repetitions,
                interval_days: intervalDays,
                next_review: new Date(nextReview),
                created_at: new Date(),
                updated_at: new Date(),
                hlc: convergedPacked
              })
              .onConflict((oc) => oc
                .columns(["user_id", "exercise_id"])
                .doUpdateSet({
                  ease_factor: easeFactor,
                  repetitions: repetitions,
                  interval_days: intervalDays,
                  next_review: new Date(nextReview),
                  updated_at: new Date(),
                  hlc: convergedPacked
                })
              )
              .execute(),
            catch: (cause) => new AuthDatabaseError({ cause })
          });
          yield* Effect.logInfo(`[Sync:Push] Progress recorded for exerciseId=${exerciseId}`);
        } else if (decodedTx.type === "update_preferences") {
          const payload = decodedTx.payload;
          const dailyReviewLimit = payload.dailyReviewLimit;
          const dailyNewExerciseLimit = payload.dailyNewExerciseLimit;
          const enforceMasteryLocks = payload.enforceMasteryLocks !== undefined ? payload.enforceMasteryLocks : true;

          yield* Effect.logInfo(`[Sync:Push] Updating preferences for user_id=${user.id}. dailyReviewLimit=${dailyReviewLimit}, dailyNewExerciseLimit=${dailyNewExerciseLimit}, enforceMasteryLocks=${enforceMasteryLocks}`);

          yield* Effect.tryPromise({ 
            try: () => db.insertInto("user_preference")
              .values({
                user_id: user.id as UserId,
                daily_review_limit: dailyReviewLimit,
                daily_new_exercise_limit: dailyNewExerciseLimit,
                enforce_mastery_locks: enforceMasteryLocks,
                created_at: new Date(),
                updated_at: new Date(),
                hlc: convergedPacked
              })
              .onConflict((oc) => oc
                .column("user_id")
                .doUpdateSet({
                  daily_review_limit: dailyReviewLimit,
                  daily_new_exercise_limit: dailyNewExerciseLimit,
                  enforce_mastery_locks: enforceMasteryLocks,
                  updated_at: new Date(),
                  hlc: convergedPacked
                })
              )
              .execute(),
            catch: (cause) => new AuthDatabaseError({ cause })
          });
          yield* Effect.logInfo(`[Sync:Push] Preferences updated successfully for user_id=${user.id}`);
        } else if (decodedTx.type === "toggle_skin") {
          yield* Effect.logInfo(`[Sync:Push] Processing skin toggle. payload=${JSON.stringify(decodedTx.payload)}`);
        } else if (decodedTx.type === "unlock_deck") {
          yield* Effect.logInfo(`[Sync:Push] Processing deck unlock. payload=${JSON.stringify(decodedTx.payload)}`);
        } else {
          yield* Effect.logWarning(`[Sync:Push] Unrecognized transaction type: ${(decodedTx as { readonly type: string }).type}`);
        }

        return { success: true };
      });

      const result = await runEffect(Effect.either(pushEffect));
      if (result._tag === "Left") {
        const error = result.left;
        const errorMessage = error instanceof Error ? error.message : (typeof error === "string" ? error : (JSON.stringify(error) ?? "Unknown error"));
        await runEffect(
          Effect.logError(
            `[Sync:Push] Push request failed: ${errorMessage}`
          )
        );
        if (error && typeof error === "object" && "_tag" in error && error._tag === "BadRequest") {
          set.status = 400;
          return { error: "Bad Request", message: (error as { readonly message: string }).message };
        }
        if (error instanceof InvalidCredentialsError || (error && typeof error === "object" && "_tag" in error && (error._tag === "Unauthorized" || error._tag === "Forbidden" || (error as { _tag?: string })._tag === "AuthError"))) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        set.status = 500;
        return { error: "Internal Server Error", message: errorMessage };
      }
      return result.right;
    },
    {
      body: t.Object({
        id: t.String(),
        type: t.String(),
        payload: t.Any(),
        hlc: t.String()
      })
    }
  );
