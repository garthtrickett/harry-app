import { createStore, get, set } from "idb-keyval";
import { Effect, Schedule } from "effect";
import { isOnlineState } from "../stores/syncStore";
import { clientLog } from "../clientLog";
import { runClientUnscoped } from "../runtime";

const DB_NAME = "bedrock-lang-sync-v1";
const STORE_NAME = "metadata";
const syncMetadataStore = createStore(DB_NAME, STORE_NAME);
const LAST_PULL_KEY = "last_pull_hlc";

interface DeltaResponse {
  readonly serverTimestamp: number;
  readonly serverHlc: string;
  readonly decks: Array<{
    readonly id: string;
    readonly name: string;
    readonly category: string;
    readonly content: unknown;
    readonly hlc: string;
  }>;
  readonly srsUpdates: Array<{
    readonly id: string;
    readonly exerciseId: string;
    readonly easeFactor: number;
    readonly repetitions: number;
    readonly intervalDays: number;
    readonly nextReview: string;
    readonly hlc: string;
  }>;
  readonly exercises: Array<{
    readonly id: string;
    readonly formal_name: string;
    readonly base_meaning: string;
    readonly difficulty_level: string;
    readonly hlc: string;
  }>;
  readonly userPreference?: {
    readonly dailyReviewLimit: number;
    readonly dailyNewExerciseLimit: number;
    readonly enforceMasteryLocks: boolean;
    readonly hlc: string;
  };
}

const getStoredPullHlc = (): Promise<string> => {
  return get<string>(LAST_PULL_KEY, syncMetadataStore).then((hlc) => hlc || "0000000000000:0000:initial");
};

const savePullHlc = (hlc: string): Promise<void> => {
  return set(LAST_PULL_KEY, hlc, syncMetadataStore);
};

const filterCausal = <T extends { id: string; hlc?: string }>(
  incoming: T[],
  existingList: readonly { id: string; hlc?: string }[]
): T[] => {
  return incoming.filter((inc) => {
    const ext = existingList.find((e) => e.id === inc.id);
    if (!ext || !ext.hlc || !inc.hlc) return true;
    return inc.hlc > ext.hlc;
  });
};

export const executeDeltaPull = () =>
  Effect.gen(function* () {
    yield* clientLog("debug", "[DeltaPull] executeDeltaPull loop checkpoint triggered.");

    if (!isOnlineState.value) {
      yield* clientLog("debug", "[DeltaPull] Device offline. Skipping pull cycle.");
      return;
    }

    const token = localStorage.getItem("jwt");
    yield* clientLog("debug", `[DeltaPull] Retrieved token from localStorage: "${token}"`);

    if (!token || token === "null" || token === "undefined" || token.trim() === "") {
      yield* clientLog("debug", "[DeltaPull] No valid active session found. Skipping pull cycle.");
      return;
    }

    let lastPull = yield* Effect.tryPromise({
      try: () => getStoredPullHlc(),
      catch: (e) => e,
    });

    const { deckStore } = yield* Effect.promise(() => import("../stores/deckStore"));
    const { exerciseProgressStore, exerciseCatalogStore } = yield* Effect.promise(() => import("../stores/exerciseStore.ts"));
    const { userPreferencesStore } = yield* Effect.promise(() => import("../stores/userPreferencesStore"));

    const deckCount = deckStore?.state?.peek()?.length ?? 0;
    const exerciseProgressCount = exerciseProgressStore?.state?.peek()?.length ?? 0;
    const catalogCount = exerciseCatalogStore?.state?.peek()?.length ?? 0;
    
    yield* clientLog("info", `[DeltaPull] Local state inspection - deckCount: ${deckCount}, exerciseProgressCount: ${exerciseProgressCount}, catalogCount: ${catalogCount}, lastPull: ${lastPull}`);
    
    if (lastPull !== "0000000000000:0000:initial" && (deckCount === 0 || catalogCount === 0)) {
      yield* clientLog("warn", "[DeltaPull] Local catalog or decks are empty but lastPull is non-initial. Forcing full sync (since=initial) to heal local state.");
      lastPull = "0000000000000:0000:initial";
    }

    yield* clientLog("info", `[DeltaPull] Executing pull request (Since: ${lastPull})...`);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`/api/sync/pull?since=${lastPull}`, {
          method: "GET",
          headers,
        }),
      catch: (e) => new Error(`Network failure during pull request: ${String(e)}`),
    });

    yield* clientLog("debug", `[DeltaPull] Pull request response status: ${response.status}`);

    if (!response.ok) {
      return yield* Effect.fail(new Error(`Server returned HTTP ${response.status}`));
    }

    const delta = (yield* Effect.tryPromise({
      try: () => response.json() as Promise<DeltaResponse>,
      catch: (e) => new Error(`Invalid JSON received from pull: ${String(e)}`),
    }));

    const decksLen = delta?.decks?.length ?? 0;
    const srsUpdatesLen = delta?.srsUpdates?.length ?? 0;
    const exercisesLen = delta?.exercises?.length ?? 0;

    yield* clientLog(
      "info",
      `[DeltaPull] Received pull payload - Decks: ${decksLen}, SRS updates: ${srsUpdatesLen}, Exercises: ${exercisesLen}, serverHlc: ${delta?.serverHlc}`
    );

    if (decksLen > 0 || srsUpdatesLen > 0 || exercisesLen > 0 || delta.userPreference) {
      yield* clientLog("info", `[DeltaPull] Applying updates: ${decksLen} decks, ${srsUpdatesLen} SRS metrics, ${exercisesLen} catalog items.`);
      
      if (decksLen > 0 && deckStore) {
        const existingDecks = deckStore.state.peek();
        const filteredDecks = filterCausal(delta.decks, existingDecks);
        if (filteredDecks.length > 0) {
          yield* deckStore.putAll(filteredDecks);
        }
      }
      
      if (exercisesLen > 0 && exerciseCatalogStore && delta.exercises) {
        const existingCatalog = exerciseCatalogStore.state.peek();
        const mappedExercises = delta.exercises.map(ex => ({
          id: ex.id,
          formal_name: ex.formal_name,
          base_meaning: ex.base_meaning,
          difficulty_level: ex.difficulty_level,
          hlc: ex.hlc
        }));
        const filteredExercises = filterCausal(mappedExercises, existingCatalog);
        if (filteredExercises.length > 0) {
          yield* exerciseCatalogStore.putAll(filteredExercises);
        }
      }

      if (srsUpdatesLen > 0 && exerciseProgressStore) {
        const existingProgress = exerciseProgressStore.state.peek();
        const mappedProgress = delta.srsUpdates.map(u => ({
          id: u.exerciseId,
          easeFactor: u.easeFactor,
          repetitions: u.repetitions,
          intervalDays: u.intervalDays,
          nextReview: u.nextReview,
          hlc: u.hlc
        }));
        const filteredProgress = filterCausal(mappedProgress, existingProgress);
        if (filteredProgress.length > 0) {
          yield* exerciseProgressStore.putAll(filteredProgress);
        }
      }

      if (delta.userPreference && userPreferencesStore) {
        const existingPref = userPreferencesStore.state.peek().find(p => p.id === "settings");
        if (!existingPref || !existingPref.hlc || !delta.userPreference.hlc || delta.userPreference.hlc > existingPref.hlc) {
          yield* userPreferencesStore.put({
            id: "settings",
            dailyReviewLimit: delta.userPreference.dailyReviewLimit,
            dailyNewExerciseLimit: delta.userPreference.dailyNewExerciseLimit,
            enforceMasteryLocks: delta.userPreference.enforceMasteryLocks,
            hlc: delta.userPreference.hlc
          });
        }
      }
    }

    if (delta.serverHlc) {
      const { hlcStore } = yield* Effect.promise(() => import("../stores/hlcStore"));
      yield* hlcStore.updateWithRemote(delta.serverHlc);
    }

    yield* Effect.tryPromise({
      try: () => savePullHlc(delta?.serverHlc ?? lastPull),
      catch: (e) => e,
    });

    yield* clientLog("debug", `[DeltaPull] Pull cycle complete. Next checkpoint HLC: ${delta?.serverHlc ?? lastPull}`);
  });

export const startDeltaPullEngine = () => {
  const pullSchedule = Schedule.spaced("10 minutes");
  const pullLoop = Effect.gen(function* () {
    yield* executeDeltaPull();
  }).pipe(
    Effect.catchAll((err) =>
      clientLog("error", "[DeltaPull] Execution loop failed", err)
    ),
    Effect.repeat(pullSchedule)
  );

  runClientUnscoped(pullLoop);
};
