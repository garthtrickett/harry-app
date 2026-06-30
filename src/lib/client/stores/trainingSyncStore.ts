import { Effect } from "effect";
import {
  exerciseProgressStore,
  exerciseCatalogStore,
  canUnlockMoreExercises,
  getDailyUnlockAllowance,
  ExerciseProgress
} from "./exerciseStore.ts";
import { activeWorkoutStore, type SessionCard } from "./activeWorkoutStore.ts";
import { clientLog } from "../clientLog.ts";

export interface ExportedWorkoutProgress {
  readonly exercise_id: string;
  readonly movement_name: string;
  readonly repetitions: number;
  readonly ease_factor: number;
}

export interface ExportPayload {
  readonly instructions: string;
  readonly queue: readonly ExportedWorkoutProgress[];
  readonly vocabulary_pool: readonly string[];
}

export const generateExportPayload = (options?: { isCram?: boolean }) => {
  const effect = Effect.gen(function* () {
    const isCram = options?.isCram ?? false;
    yield* clientLog("info", `[TrainingSync] Compiling training payload (isCram=${isCram})...`);
    
    yield* exerciseProgressStore.load();
    yield* exerciseCatalogStore.load();
    
    const localProgress = exerciseProgressStore.state.peek();
    const catalog = exerciseCatalogStore.state.peek();
    
    const now = new Date();

    const preferences = yield* Effect.promise(() => import("./userPreferencesStore.ts"));
    const dailyReviewLimit = preferences.userPreferencesStore.dailyReviewLimit.value;
    const dailyNewExerciseLimit = preferences.userPreferencesStore.dailyNewExerciseLimit.value;
    const enforceMasteryGates = preferences.userPreferencesStore.enforceMasteryGates.value;

    const eligible = !isCram && (!enforceMasteryGates || canUnlockMoreExercises(localProgress));
    let allowance = 0;
    let nextIntroductions: typeof catalog = [];
    
    if (eligible) {
      allowance = getDailyUnlockAllowance(localProgress, dailyNewExerciseLimit);
      if (allowance > 0) {
        const activeIds = new Set(localProgress.map((p: ExerciseProgress) => p.id));
        const unstudied = catalog.filter((c) => !activeIds.has(c.id));
        nextIntroductions = unstudied.slice(0, allowance);
      }
    }

    let queue: ExportedWorkoutProgress[] = [];

    if (isCram) {
      const unmasteredActive = localProgress
        .filter((p: ExerciseProgress) => p.intervalDays < 21 && !(p.repetitions >= 3 || p.intervalDays >= 7))
        .sort((a: ExerciseProgress, b: ExerciseProgress) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());

      const unmasteredSliced = unmasteredActive.slice(0, 15);

      queue = unmasteredSliced.map((p: ExerciseProgress) => {
        const match = catalog.find((c) => c.id === p.id);
        return {
          exercise_id: p.id,
          movement_name: match ? match.formal_name : "Loading...",
          repetitions: p.repetitions,
          ease_factor: p.easeFactor,
        };
      });
    } else {
      const dueReviewsTargetCount = Math.max(0, dailyReviewLimit - nextIntroductions.length);

      const activeDueProgress = localProgress
        .filter((p: ExerciseProgress) => new Date(p.nextReview).getTime() <= now.getTime())
        .sort((a: ExerciseProgress, b: ExerciseProgress) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());

      const activeDueSliced = activeDueProgress.slice(0, dueReviewsTargetCount);
      
      queue = activeDueSliced.map((p: ExerciseProgress) => {
        const match = catalog.find((c) => c.id === p.id);
        return {
          exercise_id: p.id,
          movement_name: match ? match.formal_name : "Loading...",
          repetitions: p.repetitions,
          ease_factor: p.easeFactor,
        };
      });

      if (eligible && nextIntroductions.length > 0) {
        const newProgressRecords = nextIntroductions.map((item) => ({
          id: item.id,
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: now.toISOString(),
          unlockedAt: now.toISOString(),
        }));
        
        yield* exerciseProgressStore.putAll(newProgressRecords);
        
        for (const item of nextIntroductions) {
          queue.push({
            exercise_id: item.id,
            movement_name: item.formal_name,
            repetitions: 0,
            ease_factor: 2.5,
          });
        }
      }
    }

    if (queue.length === 0 && catalog.length === 0) {
      queue.push(
        { exercise_id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55", movement_name: "Push-Up", repetitions: 0, ease_factor: 2.5 },
        { exercise_id: "00eebc99-9c0b-4ef8-bb6d-6bb9bd381a11", movement_name: "Pull-Up", repetitions: 0, ease_factor: 2.5 }
      );
    }

    const finalQueue = queue.slice(0, 15);
    const queueLength = finalQueue.length;

    const promptInstructions = isCram
      ? `Act as an expert calisthenics coach. Generate exactly ${queueLength} custom warmups.`
      : `Generate exactly ${queueLength} target exercise sets.`;

    const payload: ExportPayload = {
      instructions: promptInstructions,
      queue: finalQueue,
      vocabulary_pool: [],
    };

    const jsonString = JSON.stringify(payload, null, 2);
    
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      yield* Effect.tryPromise({
        try: () => navigator.clipboard.writeText(jsonString),
        catch: (e) => new Error(`Failed to write text to system clipboard: ${String(e)}`),
      });
    }

    return jsonString;
  });

  return effect;
};

interface ImportedCard {
  readonly exercise_id?: string;
  readonly instructions?: string;
  readonly movement_execution?: string;
  readonly audio_url?: string | null;
  readonly explanation?: string;
}

interface ImportedPayload {
  readonly cards?: readonly ImportedCard[];
}

const cleanJsonString = (raw: string): string => {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
    cleaned = cleaned.replace(/\s*```$/, "");
  }
  return cleaned.trim();
};

export const importSessionPayload = (jsonString: string) => {
  const effect = Effect.gen(function* () {
    yield* clientLog("info", "[TrainingSync] Parsing imported study session payload...");
    
    const cleanedString = cleanJsonString(jsonString);
    const parsed = yield* Effect.tryPromise({
      try: () => Promise.resolve(JSON.parse(cleanedString) as ImportedPayload),
      catch: (e) => new Error(`Invalid JSON syntax: ${String(e)}`),
    });

    const cards = parsed?.cards;
    if (!parsed || !Array.isArray(cards)) {
      return yield* Effect.fail(new Error("Invalid session payload: 'cards' array is missing or empty."));
    }

    yield* exerciseProgressStore.load();
    const localProgress = exerciseProgressStore.state.peek();
    const activeIds = new Set(localProgress.map((p: ExerciseProgress) => p.id));
    const now = new Date();

    const sessionCards: SessionCard[] = [];
    for (const card of cards as readonly ImportedCard[]) {
      if (!card.exercise_id || !card.instructions || !card.movement_execution) {
        return yield* Effect.fail(new Error("Invalid card schema."));
      }
      
      const exId = card.exercise_id;

      if (!activeIds.has(exId)) {
        const initialProgress = {
          id: exId,
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: now.toISOString(),
        };
        
        yield* exerciseProgressStore.put(initialProgress);

        const { enqueueTransaction } = yield* Effect.promise(() => import("../sync/OutboxQueue"));
        yield* enqueueTransaction("record_review", {
          exerciseId: exId,
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: initialProgress.nextReview,
        });

        activeIds.add(exId);
      }

      sessionCards.push({
        exerciseId: exId,
        instructions: card.instructions,
        movementExecution: card.movement_execution,
        audioUrl: card.audio_url || null,
        explanation: card.explanation,
      });
    }

    activeWorkoutStore.loadSession(sessionCards);
  });

  return effect;
};
