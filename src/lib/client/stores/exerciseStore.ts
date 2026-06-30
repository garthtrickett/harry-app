import { createLocalStore } from "../storage/LocalStoreFactory.ts";
import { computed } from "@preact/signals-core";
import { userPreferencesStore } from "./userPreferencesStore.ts";

export interface ExerciseProgress {
  readonly id: string; // Represents exercise_id (UUID)
  readonly easeFactor: number;
  readonly repetitions: number;
  readonly intervalDays: number;
  readonly nextReview: string;
  readonly unlockedAt?: string; // ISO string representing when the exercise was unlocked
  readonly hlc?: string;
}

export interface ExerciseCatalogItem {
  readonly id: string;
  readonly formal_name: string;
  readonly base_meaning: string;
  readonly difficulty_level: string;
  readonly hlc?: string;
}

export const exerciseCatalogStore = createLocalStore<ExerciseCatalogItem>(
  "movements_catalog"
);

export const exerciseProgressStore = createLocalStore<ExerciseProgress>(
  "exercise_progress",
  (a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime()
);

export const canUnlockMoreExercises = (progressList: ExerciseProgress[]): boolean => {
  const activeLearning = progressList.filter(p => p.intervalDays < 21);
  if (activeLearning.length === 0) {
    return true;
  }

  const masteredCount = activeLearning.filter(
    p => p.repetitions >= 3 || p.intervalDays >= 7
  ).length;

  return (masteredCount / activeLearning.length) >= 0.8;
};

export const getDailyUnlockAllowance = (
  progressList: ExerciseProgress[],
  dailyCap: number = 3
): number => {
  const now = Date.now();
  const limit = now - 24 * 60 * 60 * 1000;

  const unlockedCount = progressList.filter(p => {
    if (!p.unlockedAt) return false;
    const time = new Date(p.unlockedAt).getTime();
    return time >= limit && time <= now;
  }).length;

  return Math.max(0, dailyCap - unlockedCount);
};

export const exerciseProgressStoreWithHelpers = {
  ...exerciseProgressStore,

  activeLearningExercises: computed<ExerciseProgress[]>(() => {
    const progress = exerciseProgressStore.state.value;
    return progress.filter((p: ExerciseProgress) => p.intervalDays < 21);
  }),

  graduatedExercises: computed<ExerciseProgress[]>(() => {
    const progress = exerciseProgressStore.state.value;
    return progress.filter((p: ExerciseProgress) => p.intervalDays >= 21);
  }),

  lockedCatalogItems: computed<ExerciseCatalogItem[]>(() => {
    const catalog = exerciseCatalogStore.state.value;
    const progress = exerciseProgressStore.state.value;
    const progressIds = new Set(progress.map((p: ExerciseProgress) => p.id));
    return catalog.filter((c: ExerciseCatalogItem) => !progressIds.has(c.id));
  }),

  unlockedLast24HoursCount: computed<number>(() => {
    const progress = exerciseProgressStore.state.value;
    const limit = userPreferencesStore.dailyNewExerciseLimit.value;
    return getDailyUnlockAllowance(progress, limit);
  }),

  activeMasteryRate: computed<number>(() => {
    const progress = exerciseProgressStore.state.value;
    const activeLearning = progress.filter((p: ExerciseProgress) => p.intervalDays < 21);
    if (activeLearning.length === 0) {
      return 100;
    }
    const masteredCount = activeLearning.filter(
      (p: ExerciseProgress) => p.repetitions >= 3 || p.intervalDays >= 7
    ).length;
    return Math.round((masteredCount / activeLearning.length) * 100);
  }),

  unmasteredActiveExercises: computed<ExerciseProgress[]>(() => {
    const progress = exerciseProgressStore.state.value;
    const activeLearning = progress.filter((p: ExerciseProgress) => p.intervalDays < 21);
    return activeLearning.filter(
      (p: ExerciseProgress) => !(p.repetitions >= 3 || p.intervalDays >= 7)
    );
  }),
};
