import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { ReactiveSamController } from "../lib/client/reactive-sam-controller";
import { tokenState } from "../lib/client/stores/authStore";
import { exerciseProgressStore } from "../lib/client/stores/exerciseStore.ts";
import { enqueueTransaction } from "../lib/client/sync/OutboxQueue";
import { clientLog } from "../lib/client/clientLog";
import { runClientUnscoped, runClientPromise, type BaseClientContext } from "../lib/client/runtime";
import { navigate } from "../lib/client/router";
import { Effect } from "effect";

export interface TargetExercise {
  readonly movement: string;
  readonly cue?: string;
}

export interface WorkoutRoutine {
  readonly progression_details: string;
  readonly execution_instructions: string;
  readonly target_exercises: readonly TargetExercise[];
}

export interface AiGeneratorModel {
  readonly prompt: string;
  readonly isGenerating: boolean;
  readonly generatedCard: WorkoutRoutine | null;
  readonly error: string | null;
  readonly theme: "none" | "warmup" | "strength" | "endurance" | "cooldown";
}

export type AiGeneratorAction =
  | { type: "UPDATE_PROMPT"; prompt: string }
  | { type: "CHANGE_THEME"; theme: AiGeneratorModel["theme"] }
  | { type: "START_GENERATION" }
  | { type: "GENERATION_SUCCESS"; data: WorkoutRoutine }
  | { type: "GENERATION_ERROR"; error: string }
  | { type: "RESET_GENERATION" };

const initialModel: AiGeneratorModel = {
  prompt: "",
  isGenerating: false,
  generatedCard: null,
  error: null,
  theme: "none",
};

const update = (model: AiGeneratorModel, action: AiGeneratorAction): AiGeneratorModel => {
  switch (action.type) {
    case "UPDATE_PROMPT":
      return { ...model, prompt: action.prompt };
    case "CHANGE_THEME":
      return { ...model, theme: action.theme };
    case "START_GENERATION":
      return { ...model, isGenerating: true, error: null, generatedCard: null };
    case "GENERATION_SUCCESS":
      return { ...model, isGenerating: false, generatedCard: action.data };
    case "GENERATION_ERROR":
      return { ...model, isGenerating: false, error: action.error };
    case "RESET_GENERATION":
      return { ...model, prompt: "", generatedCard: null, error: null };
    default:
      return model;
  }
};

@customElement("ai-generator")
export class AiLogCoach extends LitElement {
  private controller!: ReactiveSamController<this, AiGeneratorModel, AiGeneratorAction, never, BaseClientContext>;

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    this.controller = new ReactiveSamController(
      this,
      initialModel,
      update,
      (action, model, propose) => this.handleAction(action, model, propose)
    );
    super.connectedCallback();
  }

  private handleAction(
    action: AiGeneratorAction,
    model: AiGeneratorModel,
    propose: (action: AiGeneratorAction) => void
  ): Effect.Effect<void, never, BaseClientContext> {
    return Effect.gen(function* () {
      yield* clientLog("info", `[AiLogCoach] SAM action hook: ${action.type}`);

              if (action.type === "START_GENERATION") {
                const token = tokenState.value;
                if (!token) {
                  propose({ type: "GENERATION_ERROR", error: "Your session has expired. Please log in again." });
                  return;
                }

                let promptText = model.prompt;
                if (model.theme !== "none") {
                  promptText = `Context [${model.theme.toUpperCase()} STYLE]: ${model.prompt}`;
                }

                yield* clientLog("info", `[AiLogCoach] Invoking AI generation endpoint: "${promptText}"`);

                const response = yield* Effect.tryPromise({
                  try: () =>
                    fetch("/api/ai/generate", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ prompt: promptText }),
                    }),
                  catch: (err) => new Error(`HTTP request failed: ${String(err)}`),
                });

                if (!response.ok) {
                  propose({ type: "GENERATION_ERROR", error: `Mastra AI returned error status ${response.status}` });
                  return;
                }

                const payload = yield* Effect.tryPromise({
                  try: () => response.json() as Promise<{ success: boolean; data: WorkoutRoutine; error?: string }>,
                  catch: (err) => new Error(`Failed to parse structured JSON: ${String(err)}`),
                });

                if (payload.success && payload.data) {
                  propose({ type: "GENERATION_SUCCESS", data: payload.data });
                } else {
                  propose({ type: "GENERATION_ERROR", error: payload.error || "Mastra response is malformed." });
                }
              }
            }).pipe(
              Effect.catchAll((err) =>
                clientLog("error", `[AiLogCoach] Action execution failed for ${action.type}`, err)
              )
            );
          }

          private async handleSaveCard() {
            const generated = this.controller.model.generatedCard;
            if (!generated) return;

            const cardId = crypto.randomUUID();

            const progressData = {
              id: cardId,
              easeFactor: 2.5,
              repetitions: 0,
              intervalDays: 0,
              nextReview: new Date().toISOString(),
            };

            await runClientPromise(
              Effect.gen(function* () {
                yield* clientLog("info", `[AiLogCoach] Storing exercise in offline store, ID: ${cardId}`);
                yield* exerciseProgressStore.put(progressData);

                yield* clientLog("info", "[AiLogCoach] Enqueuing record_review outbox transaction for background sync...");
                yield* enqueueTransaction("record_review", {
                  exerciseId: cardId,
                  easeFactor: 2.5,
                  repetitions: 0,
                  intervalDays: 0,
                  nextReview: progressData.nextReview,
                });

                yield* clientLog("info", "[AiLogCoach] Save sequence completed. Routing home.");
                yield* navigate("/");
              })
            );
          }

          override render() {
            const { prompt, isGenerating, generatedCard, error, theme } = this.controller.model;

            return html`
              <div class="max-w-xl mx-auto space-y-6">
                <div class="border-b border-zinc-800 pb-4 flex items-center justify-between">
                  <div>
                    <h1 class="text-2xl font-bold">AI Workout Planner</h1>
                    <p class="text-sm text-zinc-400">Leverage Mastra LLM to compose customized training templates and goals.</p>
                  </div>
                  <button
                    @click=${() => runClientUnscoped(navigate("/"))}
                    class="px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 rounded text-sm font-medium border border-zinc-800 transition-colors cursor-pointer"
                  >
                    Back to Dashboard
                  </button>
                </div>

                <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-6 shadow-md">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Workout Prompt</label>
                    <textarea
                      .value=${prompt}
                      @input=${(e: Event) => this.controller.propose({ type: "UPDATE_PROMPT", prompt: (e.target as HTMLTextAreaElement).value })}
                      placeholder="e.g. Planning a 15-minute core routine at home with no equipment."
                      class="w-full h-24 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-green-500 text-sm"
                      ?disabled=${isGenerating}
                    ></textarea>
                  </div>

                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Thematic Focus</label>
                    <div class="grid grid-cols-5 gap-2">
                      ${(["none", "warmup", "strength", "endurance", "cooldown"] as const).map(
                        (s) => html`
                          <button
                            @click=${() => this.controller.propose({ type: "CHANGE_THEME", theme: s })}
                            class="py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${theme === s
                              ? "bg-green-500/10 border-green-500 text-green-400"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}"
                            ?disabled=${isGenerating}
                          >
                            ${s.toUpperCase()}
                          </button>
                        `
                      )}
                    </div>
                  </div>

                  <button
                    @click=${() => this.controller.propose({ type: "START_GENERATION" })}
                    class="w-full py-3 bg-zinc-100 hover:bg-white text-zinc-900 font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 cursor-pointer"
                    ?disabled=${isGenerating || !prompt.trim()}
                  >
                    ${isGenerating
                      ? html`<span class="animate-spin rounded-full h-4 w-4 border-2 border-zinc-900 border-t-transparent"></span> Generating workout...`
                      : "Generate workout with Mastra AI"}
                  </button>

                  ${error ? html`<div class="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">${error}</div>` : ""}
                </div>

                ${generatedCard
                  ? html`
                      <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-6 shadow-md animate-fade-in">
                        <h3 class="text-sm font-bold text-zinc-400 border-b border-zinc-800 pb-2">Workout Plan Preview</h3>
                        
                        <div class="space-y-4">
                          <div>
                            <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Goals (Progression)</span>
                            <p class="text-sm text-zinc-300 mt-1">${generatedCard.progression_details}</p>
                          </div>

                          <div>
                            <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Routines (Instructions)</span>
                            <p class="text-sm text-zinc-300 mt-1">${generatedCard.execution_instructions}</p>
                          </div>

                          <div>
                            <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Reps / Moves</span>
                            <div class="mt-2 p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
                              <span class="text-2xl text-white font-semibold">
                                ${generatedCard.execution_instructions}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          @click=${() => this.handleSaveCard()}
                          class="w-full py-3 bg-green-650 hover:bg-green-600 text-white font-bold rounded-lg transition-colors text-sm cursor-pointer"
                        >
                          Save Workout to Dashboard
                        </button>
                      </div>
                    `
                  : ""}
              </div>
            `;
          }
        }
