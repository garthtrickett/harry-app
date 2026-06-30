// This file bridges Kanel-generated types to the rest of the application.
// The database is the single source of truth; run "bun run db:generate" to regenerate these.
import type Database from "./generated/Database";
import type UserTable from "./generated/public/User";
import type { User, NewUser, UserUpdate, UserId } from "./generated/public/User";
import type PlatformAdminTable from "./generated/public/PlatformAdmin";
import type { PlatformAdmin, NewPlatformAdmin, PlatformAdminUpdate, PlatformAdminId } from "./generated/public/PlatformAdmin";
import type DeckTable from "./generated/public/Deck";
import type { Deck, NewDeck, DeckUpdate, DeckId } from "./generated/public/Deck";
import type ExerciseProgressTable from "./generated/public/ExerciseProgress";
import type { ExerciseProgress, NewExerciseProgress, ExerciseProgressUpdate, ExerciseProgressId } from "./generated/public/ExerciseProgress";
import type ExerciseTable from "./generated/public/Exercise";
import type { Exercise, NewExercise, ExerciseUpdate, ExerciseId } from "./generated/public/Exercise";
import type UserPreferenceTable from "./generated/public/UserPreference";
import type { UserPreference, NewUserPreference, UserPreferenceUpdate } from "./generated/public/UserPreference";

export type {
  Database,
  UserTable, User, NewUser, UserUpdate, UserId,
  PlatformAdminTable, PlatformAdmin, NewPlatformAdmin, PlatformAdminUpdate, PlatformAdminId,
  DeckTable, Deck, NewDeck, DeckUpdate, DeckId,
  ExerciseProgressTable, ExerciseProgress, NewExerciseProgress, ExerciseProgressUpdate, ExerciseProgressId,
  ExerciseTable, Exercise, NewExercise, ExerciseUpdate, ExerciseId,
  UserPreferenceTable, UserPreference, NewUserPreference, UserPreferenceUpdate
};
