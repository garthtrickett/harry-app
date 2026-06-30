import { createLocalStore } from "../storage/LocalStoreFactory.ts";
import { Effect } from "effect";
import { computed } from "@preact/signals-core";
import { enqueueTransaction } from "../sync/OutboxQueue.ts";

export interface UserPreferences {
  readonly id: "settings";
  readonly dailyReviewLimit: number;
  readonly dailyNewExerciseLimit: number;
  readonly enforceMasteryLocks: boolean;
  readonly hlc?: string;
}

const basePreferencesStore = createLocalStore<UserPreferences>("user_preferences");

export const userPreferencesStore = {
  ...basePreferencesStore,

  load: () => {
    const effect = Effect.gen(function* () {
      yield* basePreferencesStore.load();
      const current = basePreferencesStore.state.peek();
      if (current.length === 0) {
        yield* basePreferencesStore.put({
          id: "settings",
          dailyReviewLimit: 20,
          dailyNewExerciseLimit: 3,
          enforceMasteryLocks: true,
        });
      } else {
        const settings = current.find((p) => p.id === "settings");
        if (settings && settings.enforceMasteryLocks === undefined) {
          yield* basePreferencesStore.put({
            ...settings,
            enforceMasteryLocks: true,
          });
        }
      }
    });
    return effect;
  },

  updateLimits: (dailyReviewLimit: number, dailyNewExerciseLimit: number, enforceMasteryLocks: boolean = true) => {
    const effect = Effect.gen(function* () {
      const { hlcStore } = yield* Effect.promise(() => import("./hlcStore.ts"));
      const currentHlc = yield* hlcStore.tick();

      const updated: UserPreferences = {
        id: "settings",
        dailyReviewLimit,
        dailyNewExerciseLimit,
        enforceMasteryLocks,
        hlc: currentHlc,
      };
      yield* basePreferencesStore.put(updated);
      yield* enqueueTransaction("update_preferences", {
        dailyReviewLimit,
        dailyNewExerciseLimit,
        enforceMasteryLocks,
      });
    });
    return effect;
  },

  dailyReviewLimit: computed(() => {
    const record = basePreferencesStore.state.value.find((p) => p.id === "settings");
    return record ? record.dailyReviewLimit : 20;
  }),

  dailyNewExerciseLimit: computed(() => {
    const record = basePreferencesStore.state.value.find((p) => p.id === "settings");
    return record ? record.dailyNewExerciseLimit : 3;
  }),

  enforceMasteryGates: computed(() => {
    const record = basePreferencesStore.state.value.find((p) => p.id === "settings");
    return record && record.enforceMasteryLocks !== undefined ? record.enforceMasteryLocks : true;
  }),
};
