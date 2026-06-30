import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeDeltaPull } from "./DeltaPullEngine";
import { Effect } from "effect";
import { deckStore } from "../stores/deckStore";
import { exerciseProgressStore, exerciseCatalogStore, ExerciseProgress } from "../stores/exerciseStore.ts";
import { userPreferencesStore } from "../stores/userPreferencesStore";
import { hlcStore, hlcSignal } from "../stores/hlcStore";
import { createStore, get, clear } from "idb-keyval";

const syncMetadataStore = createStore("bedrock-lang-sync-v1", "metadata");

describe("DeltaPullEngine - Client Causal Merging", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.setItem("jwt", "mock-session-token");
    await clear(syncMetadataStore);
    await Effect.runPromise(deckStore.clear());
    await Effect.runPromise(exerciseProgressStore.clear());
    await Effect.runPromise(exerciseCatalogStore.clear());
    await Effect.runPromise(userPreferencesStore.clear());
    await Effect.runPromise(hlcStore.clear());
    await Effect.runPromise(hlcStore.load());
  });

  it("should safely integrate incoming server HLC timestamps and update the local clock", async () => {
    const serverFutureTime = Date.now() + 300000;
    const serverHlc = `${serverFutureTime}:0002:server`;

    const mockPayload = {
      serverTimestamp: serverFutureTime,
      serverHlc: serverHlc,
      decks: [],
      srsUpdates: [],
      exercises: []
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockPayload)
    });
    global.fetch = fetchMock as any;

    await Effect.runPromise(executeDeltaPull() as any);

    const currentHlc = hlcSignal.value;
    expect(currentHlc.physical).toBe(serverFutureTime);
    expect(currentHlc.counter).toBe(3);

    const savedHlc = await get<string>("last_pull_hlc", syncMetadataStore);
    expect(savedHlc).toBe(serverHlc);
  });

  it("should discard older out-of-order changes from the server that are clobbered by newer local records", async () => {
    const localNewerHlc = `${Date.now()}:0005:client`;
    await Effect.runPromise(
      exerciseProgressStore.put({
        id: "gp-causal-test",
        easeFactor: 3.1,
        repetitions: 3,
        intervalDays: 14,
        nextReview: new Date().toISOString(),
        hlc: localNewerHlc
      })
    );

    const serverOlderHlc = `${Date.now() - 60000}:0001:server`;
    const mockPayload = {
      serverTimestamp: Date.now(),
      serverHlc: `${Date.now()}:0001:server`,
      decks: [],
      srsUpdates: [
        {
          id: "srs-causal-test",
          exerciseId: "gp-causal-test",
          easeFactor: 1.5,
          repetitions: 1,
          intervalDays: 1,
          nextReview: new Date().toISOString(),
          hlc: serverOlderHlc
        }
      ],
      exercises: []
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockPayload)
    });
    global.fetch = fetchMock as any;

    await Effect.runPromise(executeDeltaPull() as any);

    const progress = (exerciseProgressStore.state.peek() as ExerciseProgress[]).find(p => p.id === "gp-causal-test");
    expect(progress).toBeDefined();
    expect(progress!.easeFactor).toBe(3.1);
    expect(progress!.hlc).toBe(localNewerHlc);
  });
});
