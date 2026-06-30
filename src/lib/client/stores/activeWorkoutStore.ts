import { signal, computed } from "@preact/signals-core";
import { clientLog } from "../clientLog.ts";
import { runClientUnscoped } from "../runtime.ts";
import { userPreferencesStore } from "./userPreferencesStore.ts";

export interface SessionCard {
  readonly exerciseId: string;
  readonly instructions: string;
  readonly movementExecution: string;
  readonly audioUrl?: string | null;
  readonly explanation?: string;
}

const BATCH_SIZE = 15;

const masterList = signal<readonly SessionCard[]>([]);
const state = signal<readonly SessionCard[]>([]);
const currentIndex = signal<number>(0);
const batchIndex = signal<number>(0);

export const weaveSessionCards = (cards: readonly SessionCard[]): readonly SessionCard[] => {
  runClientUnscoped(clientLog("info", `[activeWorkoutStore] Weaving ${cards.length} workout elements...`));
  
  if (cards.length === 0) {
    runClientUnscoped(clientLog("debug", "[activeWorkoutStore] Empty active workout list provided."));
    return [];
  }

  const bins: Record<string, SessionCard[]> = {};
  for (const card of cards) {
    if (!bins[card.exerciseId]) {
      bins[card.exerciseId] = [];
    }
    bins[card.exerciseId]!.push(card);
  }

  for (const exId of Object.keys(bins)) {
    bins[exId] = bins[exId]!.sort(() => Math.random() - 0.5);
  }

  interface Bin {
    exId: string;
    cards: SessionCard[];
  }

  const activeBins: Bin[] = Object.entries(bins).map(([exId, binCards]) => ({
    exId,
    cards: binCards,
  }));

  const result: SessionCard[] = [];
  let lastExId: string | null = null;

  while (true) {
    const binsWithCards = activeBins.filter(b => b.cards.length > 0);
    if (binsWithCards.length === 0) {
      break;
    }

    const allowedBins = binsWithCards.filter(b => b.exId !== lastExId);
    let chosenBin: Bin | undefined;

    if (allowedBins.length > 0) {
      const maxCount = Math.max(...allowedBins.map(b => b.cards.length));
      const candidates = allowedBins.filter(b => b.cards.length === maxCount);
      chosenBin = candidates[Math.floor(Math.random() * candidates.length)]!;
    } else {
      chosenBin = binsWithCards[0]!;
    }

    if (chosenBin && chosenBin.cards.length > 0) {
      const card = chosenBin.cards.shift()!;
      result.push(card);
      lastExId = chosenBin.exId;
    } else {
      break;
    }
  }

  return result;
};

export const activeWorkoutStore = {
  state,
  currentIndex,
  masterList,
  batchIndex,
  
  isFinished: computed<boolean>(() => {
    const cards = state.value;
    return cards.length === 0 || currentIndex.value >= cards.length;
  }),
  
  currentCard: computed<SessionCard | null>(() => {
    const cards = state.value;
    const idx = currentIndex.value;
    return cards[idx] || null;
  }),
  
  hasMoreBatches: computed<boolean>(() => {
    return (batchIndex.value + 1) * BATCH_SIZE < masterList.value.length;
  }),
  
  loadSession: (cards: readonly SessionCard[]) => {
    const weaved = weaveSessionCards(cards);
    const limit = userPreferencesStore.dailyReviewLimit.value;
    const cappedCards = weaved.slice(0, limit);
    masterList.value = cappedCards;
    batchIndex.value = 0;
    state.value = cappedCards.slice(0, BATCH_SIZE);
    currentIndex.value = 0;
  },
  
  startNextBatch: () => {
    const nextIndex = batchIndex.value + 1;
    const start = nextIndex * BATCH_SIZE;
    if (start < masterList.value.length) {
      batchIndex.value = nextIndex;
      state.value = masterList.value.slice(start, start + BATCH_SIZE);
      currentIndex.value = 0;
    }
  },
  
  next: () => {
    if (currentIndex.value < state.value.length) {
      currentIndex.value += 1;
    }
  },
  
  clear: () => {
    masterList.value = [];
    state.value = [];
    currentIndex.value = 0;
    batchIndex.value = 0;
  }
};

export { activeWorkoutStore as activeSessionStore };
