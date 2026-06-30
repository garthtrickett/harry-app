import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { effect } from "@preact/signals-core";
import { ReactiveSamController } from "../lib/client/reactive-sam-controller";
import { activeSessionStore } from "../lib/client/stores/activeWorkoutStore";
import { exerciseProgressStore, ExerciseProgress } from "../lib/client/stores/exerciseStore";
import { enqueueTransaction } from "../lib/client/sync/OutboxQueue";
import { clientLog } from "../lib/client/clientLog";
import { runClientUnscoped, type BaseClientContext } from "../lib/client/runtime";
import { navigate } from "../lib/client/router";
import { Effect } from "effect";

export const calculateSrsUpdate = (
  current: { easeFactor: number; repetitions: number; intervalDays: number },
  isCorrect: boolean
) => {
  let easeFactor = current.easeFactor || 2.5;
  let repetitions = current.repetitions || 0;
  let intervalDays = current.intervalDays || 0;

  if (isCorrect) {
    repetitions = repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.ceil(intervalDays * easeFactor);
    }

    if (intervalDays >= 5) {
      const fuzzRange = 0.05;
      const fuzzFactor = 1 + (Math.random() * (fuzzRange * 2) - fuzzRange);
      intervalDays = Math.max(1, Math.round(intervalDays * fuzzFactor));
    }

    const easeBonus = repetitions >= 3 ? 0.25 : 0.15;
    easeFactor = Math.max(1.3, easeFactor + easeBonus);
  } else {
    if (intervalDays >= 7) {
      intervalDays = Math.max(3, Math.ceil(intervalDays * 0.20));
    } else {
      intervalDays = 1;
    }
    repetitions = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + intervalDays);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    intervalDays,
    nextReview: nextReview.toISOString(),
  };
};

export interface StudySessionModel {
  readonly audioPlaying: boolean;
  readonly explanationVisible: boolean;
}

export type StudySessionAction =
  | { type: "PLAY_AUDIO"; audioUrl: string }
  | { type: "SUBMIT_GRADE"; exerciseId: string; isCorrect: boolean }
  | { type: "TOGGLE_EXPLANATION" }
  | { type: "FORCE_MASTER"; exerciseId: string };

const initialModel: StudySessionModel = {
  audioPlaying: false,
  explanationVisible: false,
};

const update = (model: StudySessionModel, action: StudySessionAction): StudySessionModel => {
  switch (action.type) {
    case "PLAY_AUDIO":
      return {
        ...model,
        audioPlaying: true,
      };
    case "FORCE_MASTER":
    case "SUBMIT_GRADE":
      return {
        ...model,
        audioPlaying: false,
        explanationVisible: false,
      };
    case "TOGGLE_EXPLANATION":
      return {
        ...model,
        explanationVisible: !model.explanationVisible,
      };
    default:
      return model;
  }
};

@customElement("study-session")
export class WorkoutSession extends LitElement {
  private controller!: ReactiveSamController<this, StudySessionModel, StudySessionAction, never, BaseClientContext>;
  private audioInstance: HTMLAudioElement | null = null;
  private _disposeEffect?: () => void;

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    this._disposeEffect = effect(() => {
      void activeSessionStore.state.value;
      void activeSessionStore.currentIndex.value;
      void activeSessionStore.batchIndex.value;
      this.requestUpdate();
    });

    this.controller = new ReactiveSamController(
      this,
      initialModel,
      update,
      (action, model, propose) => this.handleAction(action, model, propose)
    );

    super.connectedCallback();

    const firstCard = activeSessionStore.currentCard.value;
    if (firstCard && typeof firstCard.audioUrl === "string") {
      this.controller.propose({ type: "PLAY_AUDIO", audioUrl: firstCard.audioUrl });
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._disposeEffect?.();
  }

  private handleAction(
    action: StudySessionAction,
    _model: StudySessionModel,
    _propose: (action: StudySessionAction) => void
  ): Effect.Effect<void, never, BaseClientContext> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const program = Effect.gen(function* () {
      yield* clientLog("info", `[WorkoutSession] Action processed: ${action.type}`);

      if (action.type === "PLAY_AUDIO") {
        yield* Effect.sync(() => {
          if (self.audioInstance) {
            self.audioInstance.pause();
          }
          self.audioInstance = new Audio(action.audioUrl);
          self.audioInstance.play().catch((e: unknown) => {
            console.warn("[WorkoutSession] Failed to play media asset:", e);
          });
        });
      }

      if (action.type === "FORCE_MASTER") {
        const { exerciseId } = action;
        
        const currentProgress = (exerciseProgressStore.state.peek()).find((p: ExerciseProgress) => p.id === exerciseId) || {
          id: exerciseId,
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString()
        };

        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + 21);

        const forcedMetrics = {
          easeFactor: currentProgress.easeFactor || 2.5,
          repetitions: 3,
          intervalDays: 21,
          nextReview: nextReviewDate.toISOString(),
        };

        yield* clientLog("info", `[WorkoutSession] Force completed exerciseId=${exerciseId}:`, forcedMetrics);

        yield* exerciseProgressStore.put({
          id: exerciseId,
          easeFactor: forcedMetrics.easeFactor,
          repetitions: forcedMetrics.repetitions,
          intervalDays: forcedMetrics.intervalDays,
          nextReview: forcedMetrics.nextReview,
        });

        yield* enqueueTransaction("record_review", {
          grammarPointId: exerciseId,
          easeFactor: forcedMetrics.easeFactor,
          repetitions: forcedMetrics.repetitions,
          intervalDays: forcedMetrics.intervalDays,
          nextReview: forcedMetrics.nextReview,
        });

        yield* Effect.sync(() => {
          activeSessionStore.next();
          const nextCard = activeSessionStore.currentCard.value;
          if (nextCard && typeof nextCard.audioUrl === "string") {
            _propose({ type: "PLAY_AUDIO", audioUrl: nextCard.audioUrl });
          }
        });
      }

      if (action.type === "SUBMIT_GRADE") {
        const { exerciseId, isCorrect } = action;
        
        const currentProgress = (exerciseProgressStore.state.peek()).find((p: ExerciseProgress) => p.id === exerciseId) || {
          id: exerciseId,
          easeFactor: 2.5,
          repetitions: 0,
          intervalDays: 0,
          nextReview: new Date().toISOString()
        };

        const metrics = calculateSrsUpdate(
          {
            easeFactor: currentProgress.easeFactor,
            repetitions: currentProgress.repetitions,
            intervalDays: currentProgress.intervalDays,
          },
          isCorrect
        );

        yield* clientLog("info", `[WorkoutSession] Recalculated metrics for exerciseId=${exerciseId}:`, metrics);

        yield* exerciseProgressStore.put({
          id: exerciseId,
          easeFactor: metrics.easeFactor,
          repetitions: metrics.repetitions,
          intervalDays: metrics.intervalDays,
          nextReview: metrics.nextReview,
        });

        yield* enqueueTransaction("record_review", {
          grammarPointId: exerciseId,
          easeFactor: metrics.easeFactor,
          repetitions: metrics.repetitions,
          intervalDays: metrics.intervalDays,
          nextReview: metrics.nextReview,
        });

        yield* Effect.sync(() => {
          activeSessionStore.next();
          const nextCard = activeSessionStore.currentCard.value;
          if (nextCard && typeof nextCard.audioUrl === "string") {
            _propose({ type: "PLAY_AUDIO", audioUrl: nextCard.audioUrl });
          }
        });
      }
    });

    return program.pipe(
      Effect.catchAll((err) =>
        clientLog("error", `[WorkoutSession] Action execution failed for action: ${action.type}`, err)
      )
    );
  }

  override render() {
    const cards = activeSessionStore.state.value;
    const currentIndex = activeSessionStore.currentIndex.value;
    const isFinished = activeSessionStore.isFinished.value;
    const currentCard = activeSessionStore.currentCard.value;
    const { explanationVisible } = this.controller.model;

    if (isFinished) {
      const hasMore = activeSessionStore.hasMoreBatches.value;
      if (hasMore) {
        return html`
          <div class="max-w-xl mx-auto py-12 px-6 bg-zinc-950 border border-zinc-800 rounded-lg text-center space-y-6 animate-fade-in">
            <div class="inline-flex p-4 bg-green-500/10 text-green-500 rounded-full">
              <span class="text-3xl">💪</span>
            </div>
            <h2 class="text-2xl font-bold">Batch Completed!</h2>
            <p class="text-zinc-400 text-sm">
              Excellent work! You cleared this workout chunk of 15 sets. Take a quick break or continue to the next block.
            </p>
            <div class="flex items-center justify-center gap-4">
              <button
                @click=${() => runClientUnscoped(navigate("/"))}
                class="px-6 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-medium rounded text-sm transition-colors cursor-pointer"
              >
                Finished
              </button>
              <button
                @click=${() => { activeSessionStore.startNextBatch(); }}
                class="px-6 py-2 bg-zinc-100 hover:bg-white text-zinc-900 font-bold rounded text-sm transition-colors cursor-pointer"
              >
                Next Chunk
              </button>
            </div>
          </div>
        `;
      }

      return html`
        <div class="max-w-xl mx-auto py-12 px-6 bg-zinc-950 border border-zinc-800 rounded-lg text-center space-y-6">
          <div class="inline-flex p-4 bg-green-500/10 text-green-500 rounded-full">
            <span class="text-3xl">🎉</span>
          </div>
          <h2 class="text-2xl font-bold">Workout Completed!</h2>
          <p class="text-zinc-400 text-sm">
            All caught up with your daily fitness targets. Workout metrics have been queued and are syncing offline.
          </p>
          <button
            @click=${() => runClientUnscoped(navigate("/"))}
            class="px-6 py-2 bg-zinc-100 hover:bg-white text-zinc-900 font-medium rounded text-sm transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      `;
    }

    if (!currentCard) {
      return html`
        <div class="max-w-xl mx-auto py-12 text-center text-zinc-400">
          Loading movements...
        </div>
      `;
    }

    return html`
      <div class="max-w-xl mx-auto space-y-6">
        <div class="flex items-center justify-between text-xs text-zinc-500">
          <span>Set ${currentIndex + 1} of ${cards.length}</span>
          <span>Progress: ${Math.round((currentIndex / cards.length) * 100)}%</span>
        </div>
        <div class="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
          <div class="bg-green-500 h-full transition-all duration-300" style="width: ${(currentIndex / cards.length) * 100}%"></div>
        </div>

        <div class="bg-zinc-950 border border-zinc-800 rounded-xl shadow-lg overflow-hidden min-h-[340px] flex flex-col justify-between p-8 space-y-6">
          <div class="flex-1 flex flex-col justify-center items-center text-center space-y-6">
            <div class="space-y-2">
              <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Instructions</span>
              <p class="text-lg text-zinc-300">${currentCard.instructions}</p>
            </div>

            <div class="space-y-3 w-full border-t border-zinc-900/60 pt-6">
              <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Movement Execution</span>
              <div class="p-4 bg-zinc-900/40 border border-zinc-800/40 rounded-lg flex items-center justify-center">
                <span class="text-2xl text-white font-semibold">
                  ${currentCard.movementExecution}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-3">
              ${currentCard.audioUrl
                ? html`
                    <button
                      @click=${() => this.controller.propose({ type: "PLAY_AUDIO", audioUrl: currentCard.audioUrl! })}
                      class="p-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded-full transition-colors border border-zinc-800 cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                      title="Play execution cue"
                    >
                      🔊 Cue Audio
                    </button>
                  `
                : ""}

              ${currentCard.explanation
                ? html`
                    <button
                      @click=${() => this.controller.propose({ type: "TOGGLE_EXPLANATION" })}
                      class="p-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded-full transition-colors border border-zinc-800 cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                      title="Toggle coaching pointers"
                    >
                      💡 ${explanationVisible ? "Hide Tips" : "Coaching Tips"}
                    </button>
                  `
                : ""}
            </div>

            ${currentCard.explanation && explanationVisible
              ? html`
                  <div class="w-full text-left p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-2 animate-fade-in">
                    <span class="text-xs font-semibold text-green-400 uppercase tracking-wider block">Trainer Pointers</span>
                    <p class="text-xs text-zinc-300 leading-relaxed">${currentCard.explanation}</p>
                  </div>
                `
              : ""}
          </div>

          <div class="pt-4 border-t border-zinc-900 flex flex-col gap-4 w-full">
            <div class="grid grid-cols-2 gap-4 w-full">
              <button
                @click=${() => this.controller.propose({ type: "SUBMIT_GRADE", exerciseId: currentCard.exerciseId, isCorrect: false })}
                class="py-3 bg-red-650 hover:bg-red-600 text-white font-bold rounded-lg transition-colors text-sm cursor-pointer"
              >
                Failed
              </button>
              <button
                @click=${() => this.controller.propose({ type: "SUBMIT_GRADE", exerciseId: currentCard.exerciseId, isCorrect: true })}
                class="py-3 bg-green-650 hover:bg-green-600 text-white font-bold rounded-lg transition-colors text-sm cursor-pointer"
              >
                Completed
              </button>
            </div>
            <button
              @click=${() => this.controller.propose({ type: "FORCE_MASTER", exerciseId: currentCard.exerciseId })}
              class="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-medium rounded-lg transition-colors text-xs cursor-pointer border border-zinc-700 flex items-center justify-center gap-1.5"
            >
              🎓 Graduate Movement
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
