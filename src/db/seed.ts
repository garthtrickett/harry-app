import "dotenv/config";
import { ROLE_PERMISSIONS } from '../lib/shared/permissions';
import { Argon2id } from 'oslo/password';
import { Effect, Cause, Exit, Data } from 'effect';
import { db, closeDb } from './client';
import type { PlatformAdminId, UserId, DeckId, ExerciseProgressId, ExerciseId } from '../types';

class SeedingError extends Data.TaggedError("SeedingError")<{
  readonly cause: unknown;
}> {}

class PasswordHashingError extends Data.TaggedError("PasswordHashingError")<{
  readonly cause: unknown;
}> {}

const PASSWORD = 'Password123!';
const SUPER_ADMIN_ID = "99999999-9999-9999-9999-999999999999" as PlatformAdminId;
const SAMPLE_LEARNER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" as UserId;
const SAMPLE_CURATOR_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22" as UserId;

export const seedDb = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo('[Seed] Commencing global fitness database seeding...');

    yield* Effect.logInfo('[Seed] Cleaning old records...');
    yield* Effect.tryPromise({
      try: () => db.deleteFrom('exercise_progress').execute(),
      catch: (cause) => new SeedingError({ cause })
    });
    yield* Effect.tryPromise({
      try: () => db.deleteFrom('exercise').execute(),
      catch: (cause) => new SeedingError({ cause })
    });
    yield* Effect.tryPromise({
      try: () => db.deleteFrom('user_preference').execute(),
      catch: (cause) => new SeedingError({ cause })
    });

    const argon2id = new Argon2id();
    const hashedPassword = yield* Effect.tryPromise({
      try: () => argon2id.hash(PASSWORD),
      catch: (cause) => new PasswordHashingError({ cause }),
    });

    yield* Effect.logInfo('[Seed] Writing Admin and User roles...');
    yield* Effect.tryPromise({
      try: () =>
        db
          .insertInto('platform_admin')
          .values({
            id: SUPER_ADMIN_ID,
            email: 'admin@calisthenicswizard.com',
            password_hash: hashedPassword,
            created_at: new Date(),
          })
          .onConflict((oc) => oc.column('email').doUpdateSet({
            password_hash: hashedPassword,
          }))
          .execute(),
      catch: (cause) => new SeedingError({ cause }),
    });

    const subscriberPerms = [...ROLE_PERMISSIONS.SUBSCRIBER];
    const curatorPerms = [...ROLE_PERMISSIONS.CURATOR];

    yield* Effect.tryPromise({
      try: () =>
        db
          .insertInto('user')
          .values([
            {
              id: SAMPLE_LEARNER_ID,
              email: 'client@site.com',
              password_hash: hashedPassword,
              permissions: subscriberPerms,
              email_verified: true,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: SAMPLE_CURATOR_ID,
              email: 'trainer@site.com',
              password_hash: hashedPassword,
              permissions: curatorPerms,
              email_verified: true,
              created_at: new Date(),
              updated_at: new Date(),
            }
          ])
          .onConflict((oc) => oc.column('email').doNothing())
          .execute(),
      catch: (cause) => new SeedingError({ cause }),
    });

    yield* Effect.logInfo('[Seed] Adding Workout Templates (Decks)...');
    const defaultDeckId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33" as DeckId;
    const upperPullDeckId = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c34" as DeckId;

    yield* Effect.tryPromise({
      try: () =>
        db
          .insertInto('deck')
          .values([
            {
              id: defaultDeckId,
              name: "Full Body Beginner",
              category: "Calisthenics",
              content: JSON.stringify({ description: "Entry-level bodyweight workout targeting push, pull, and legs." }),
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: upperPullDeckId,
              name: "Upper Body Pull",
              category: "Calisthenics",
              content: JSON.stringify({ description: "Intermediate pull focus targeting lats, upper back, and biceps." }),
              created_at: new Date(),
              updated_at: new Date(),
            }
          ])
          .onConflict((oc) => oc.column('id').doNothing())
          .execute(),
      catch: (cause) => new SeedingError({ cause }),
    });

    yield* Effect.logInfo('[Seed] Seeding default calisthenics exercises...');
    const exercises = [
      {
        id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55" as ExerciseId,
        deck_id: defaultDeckId,
        formal_name: "Push-Up",
        base_meaning: "Horizontal pushing chest/shoulders progression",
        lesson_number: 1,
        sequence_order: 1,
        difficulty_level: "Beginner"
      },
      {
        id: "00eebc99-9c0b-4ef8-bb6d-6bb9bd381a11" as ExerciseId,
        deck_id: defaultDeckId,
        formal_name: "Pull-Up",
        base_meaning: "Vertical pulling lats/back progression",
        lesson_number: 1,
        sequence_order: 2,
        difficulty_level: "Intermediate"
      },
      {
        id: "11eebc99-9c0b-4ef8-bb6d-6bb9bd381b22" as ExerciseId,
        deck_id: defaultDeckId,
        formal_name: "Dip",
        base_meaning: "Vertical pushing triceps/chest progression",
        lesson_number: 1,
        sequence_order: 3,
        difficulty_level: "Intermediate"
      },
      {
        id: "22eebc99-9c0b-4ef8-bb6d-6bb9bd381c33" as ExerciseId,
        deck_id: defaultDeckId,
        formal_name: "Pistol Squat",
        base_meaning: "Single-leg lower body squat progression",
        lesson_number: 1,
        sequence_order: 4,
        difficulty_level: "Advanced"
      }
    ];

    for (const exercise of exercises) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .insertInto('exercise')
            .values({
              ...exercise,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .onConflict((oc) => oc.column('id').doNothing())
            .execute(),
        catch: (cause) => new SeedingError({ cause }),
      });
    }

    yield* Effect.logInfo('[Seed] Writing client user preference nutrition targets...');
    yield* Effect.tryPromise({
      try: () =>
        db
          .insertInto('user_preference')
          .values({
            user_id: SAMPLE_LEARNER_ID,
            daily_review_limit: 20,
            daily_new_exercise_limit: 3,
            enforce_mastery_locks: true,
            calorie_target: 2800,
            protein_target: 165,
            water_target_ml: 3500,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .onConflict((oc) => oc.column('user_id').doNothing())
          .execute(),
      catch: (cause) => new SeedingError({ cause }),
    });

    yield* Effect.logInfo('[Seed] Adding introductory active workout reviews...');
    const activeWorkoutReviews = exercises.map((ex, index) => {
      const hexIndex = index.toString(16).padStart(4, '0');
      return {
        id: `d0eebc99-9c0b-4ef8-bb6d-6bb9bd38${hexIndex}` as ExerciseProgressId,
        user_id: SAMPLE_LEARNER_ID,
        exercise_id: ex.id,
        ease_factor: 2.5,
        repetitions: 0,
        interval_days: 0,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    for (const review of activeWorkoutReviews) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .insertInto('exercise_progress')
            .values(review)
            .onConflict((oc) => oc.column('id').doNothing())
            .execute(),
        catch: (cause) => new SeedingError({ cause }),
      });
    }

    yield* Effect.logInfo('[Seed] Seeding completed successfully.');
  });

if (import.meta.main) {
  const seedProgram = Effect.gen(function* () {
    yield* seedDb();
  });

  void Effect.runPromiseExit(seedProgram).then((exit) => {
    void closeDb().then(() => {
      if (Exit.isSuccess(exit)) {
        console.info("🌱 Database initialized with default records.");
        process.exit(0);
      } else {
        console.error('\n❌ Seeding script failed:\n');
        console.error(Cause.pretty(exit.cause));
        process.exit(1);
      }
    });
  });
}
