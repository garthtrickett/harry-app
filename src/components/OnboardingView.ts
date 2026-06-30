import { effect } from "@preact/signals-core";
import { Effect } from "effect";
import { LitElement, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import {
  acceptOnboardingHealthWaiver,
  completeOnboardingStep,
  getCurrentOnboardingStep,
  getCurrentOnboardingStepDefinition,
  getOnboardingProgressPercentage,
  getOnboardingResumeStepId,
  loadOnboarding,
  onboardingState,
  saveOnboardingStepDraft,
  submitOnboardingPart1,
  submitOnboardingPart2,
  type ClientOnboardingReadModel
} from "../lib/client/stores/onboardingStore.ts";
import { clientLog } from "../lib/client/clientLog.ts";
import { runClientUnscoped } from "../lib/client/runtime.ts";
import { ONBOARDING_STEPS, type OnboardingStepId, type OnboardingStepStatus } from "../lib/shared/onboarding.ts";
import {
  buildHealthWaiverPayload,
  buildInitialQaPayload,
  buildNextStepsPayload,
  buildRhythmForSuccessPayload,
  buildWelcomeVideoPayload,
  draftBoolean,
  draftString,
  type OnboardingPart1Draft
} from "./onboardingPart1Payloads.ts";
import {
  buildAppWalkthroughPayload,
  buildInitialAssessmentPayload,
  buildInitialMeasurementsPayload,
  buildKitListPayload,
  buildNutritionTrackOneDayPayload
} from "./onboardingPart2Payloads.ts";

export const stepStatusLabel = (status: OnboardingStepStatus): string => {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In progress";
  return "Not started";
};

@customElement("onboarding-view")
export class OnboardingView extends LitElement {
  private disposeSignalEffect?: () => void;
  private localDrafts: Record<string, OnboardingPart1Draft> = {};
  private submittingStepId: OnboardingStepId | null = null;

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    runClientUnscoped(clientLog("info", "[OnboardingView] Mounted onboarding UI."));

    this.disposeSignalEffect = effect(() => {
      void onboardingState.value;
      this.requestUpdate();
    });

    runClientUnscoped(loadOnboarding());
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeSignalEffect?.();
  }

  private handleRefresh = () => {
    runClientUnscoped(clientLog("info", "[OnboardingView] Manual onboarding refresh requested."));
    runClientUnscoped(loadOnboarding());
  };

  private getPersistedStepPayload(stepId: OnboardingStepId): OnboardingPart1Draft {
    const step = onboardingState.value.readModel?.steps.find((candidate) => candidate.stepId === stepId);
    return step?.payload ?? {};
  }

  private getDraft(stepId: OnboardingStepId): OnboardingPart1Draft {
    return {
      ...this.getPersistedStepPayload(stepId),
      ...(this.localDrafts[stepId] ?? {})
    };
  }

  private setDraftValue(stepId: OnboardingStepId, field: string, value: string | boolean) {
    runClientUnscoped(clientLog("debug", `[OnboardingView] Draft update for ${stepId}.${field}`));
    this.localDrafts = {
      ...this.localDrafts,
      [stepId]: {
        ...(this.localDrafts[stepId] ?? {}),
        [field]: value
      }
    };
    this.requestUpdate();
  }

  private makeTextInputHandler(stepId: OnboardingStepId, field: string) {
    return (event: Event) => {
      const target = event.currentTarget;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        return;
      }

      this.setDraftValue(stepId, field, target.value);
    };
  }

  private makeCheckboxHandler(stepId: OnboardingStepId, field: string) {
    return (event: Event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement)) return;
      this.setDraftValue(stepId, field, target.checked);
    };
  }

  private setSubmitting(stepId: OnboardingStepId | null) {
    this.submittingStepId = stepId;
    this.requestUpdate();
  }

  private handleSaveDraft(stepId: OnboardingStepId, payload: Record<string, unknown>) {
    runClientUnscoped(clientLog("info", `[OnboardingView] Saving draft for onboarding step ${stepId}.`));
    runClientUnscoped(saveOnboardingStepDraft(stepId, payload));
  }

  private handleCompleteStep(stepId: OnboardingStepId, payload: Record<string, unknown>) {
    runClientUnscoped(clientLog("info", `[OnboardingView] Completing onboarding step ${stepId}.`));
    this.setSubmitting(stepId);

    const view = this;
    runClientUnscoped(
      Effect.gen(function* () {
        yield* completeOnboardingStep(stepId, payload);
        yield* Effect.sync(() => view.setSubmitting(null));
      })
    );
  }

  private handleAcceptWaiver() {
    const stepId: OnboardingStepId = "health_waiver";
    const payload = buildHealthWaiverPayload(this.getDraft(stepId));
    const signatureName = draftString(payload, "signatureName");
    const waiverVersion = draftString(payload, "waiverVersion", "2026-06-30");

    runClientUnscoped(clientLog("info", "[OnboardingView] Accepting health waiver from UI."));
    this.setSubmitting(stepId);

    const view = this;
    runClientUnscoped(
      Effect.gen(function* () {
        yield* acceptOnboardingHealthWaiver(signatureName, waiverVersion, {
          source: "onboarding_ui"
        });
        yield* Effect.sync(() => view.setSubmitting(null));
      })
    );
  }

  private handleConfirmNextSteps() {
    const stepId: OnboardingStepId = "part_1_next_steps";
    const payload = buildNextStepsPayload();

    runClientUnscoped(clientLog("info", "[OnboardingView] Finishing onboarding Part 1."));
    this.setSubmitting(stepId);

    const view = this;
    runClientUnscoped(
      Effect.gen(function* () {
        yield* completeOnboardingStep(stepId, payload);
        yield* submitOnboardingPart1();
        yield* Effect.sync(() => view.setSubmitting(null));
      })
    );
  }

  private handleSubmitPart2(payload: Record<string, unknown>) {
    const stepId: OnboardingStepId = "nutrition_track_one_day";

    runClientUnscoped(clientLog("info", "[OnboardingView] Completing nutrition step and submitting onboarding Part 2."));
    this.setSubmitting(stepId);

    const view = this;
    runClientUnscoped(
      Effect.gen(function* () {
        yield* completeOnboardingStep(stepId, payload);
        yield* submitOnboardingPart2();
        yield* Effect.sync(() => view.setSubmitting(null));
      })
    );
  }

  private renderLoading() {
    return html`
      <section data-testid="onboarding-loading" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-sm text-zinc-400">Loading your onboarding…</p>
      </section>
    `;
  }

  private renderError(message: string) {
    return html`
      <section data-testid="onboarding-error" class="rounded-2xl border border-red-900/60 bg-red-950/20 p-6">
        <h2 class="text-lg font-semibold text-red-100">Onboarding could not load</h2>
        <p class="mt-2 text-sm text-red-200/80">${message}</p>
        <button
          type="button"
          @click=${this.handleRefresh}
          class="mt-4 rounded-lg border border-red-800 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-950/60 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </section>
    `;
  }

  private renderStepList(readModel: ClientOnboardingReadModel) {
    const stepsById = new Map(readModel.steps.map((step) => [step.stepId, step]));

    return html`
      <ol class="mt-6 grid gap-2" data-testid="onboarding-step-list">
        ${ONBOARDING_STEPS.filter((step) => step.id !== "complete").map((definition) => {
          const step = stepsById.get(definition.id);
          const status = step?.status ?? "not_started";
          const isCurrent = definition.id === readModel.nextIncompleteStepId;

          return html`
            <li
              class="flex items-center justify-between rounded-xl border ${isCurrent ? "border-zinc-500 bg-zinc-900" : "border-zinc-850 bg-zinc-950"} px-4 py-3"
            >
              <div>
                <p class="text-sm font-medium text-zinc-100">${definition.title}</p>
                <p class="text-xs text-zinc-500">Part ${definition.part}</p>
              </div>
              <span class="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300">
                ${stepStatusLabel(status)}
              </span>
            </li>
          `;
        })}
      </ol>
    `;
  }

  private renderTextInput(stepId: OnboardingStepId, field: string, label: string, placeholder: string) {
    const draft = this.getDraft(stepId);

    return html`
      <label class="grid gap-2 text-sm">
        <span class="font-medium text-zinc-200">${label}</span>
        <input
          class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-500"
          .value=${draftString(draft, field)}
          placeholder=${placeholder}
          @input=${this.makeTextInputHandler(stepId, field)}
        />
      </label>
    `;
  }

  private renderTextArea(stepId: OnboardingStepId, field: string, label: string, placeholder: string) {
    const draft = this.getDraft(stepId);

    return html`
      <label class="grid gap-2 text-sm">
        <span class="font-medium text-zinc-200">${label}</span>
        <textarea
          class="min-h-24 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-500"
          .value=${draftString(draft, field)}
          placeholder=${placeholder}
          @input=${this.makeTextInputHandler(stepId, field)}
        ></textarea>
      </label>
    `;
  }

  private renderCheckbox(stepId: OnboardingStepId, field: string, label: string) {
    const draft = this.getDraft(stepId);

    return html`
      <label class="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        <input
          type="checkbox"
          class="mt-1"
          .checked=${draftBoolean(draft, field)}
          @change=${this.makeCheckboxHandler(stepId, field)}
        />
        <span>${label}</span>
      </label>
    `;
  }

  private renderSelect(stepId: OnboardingStepId, field: string, label: string, options: readonly string[]) {
    const draft = this.getDraft(stepId);

    return html`
      <label class="grid gap-2 text-sm">
        <span class="font-medium text-zinc-200">${label}</span>
        <select
          class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-500"
          .value=${draftString(draft, field, options[0] ?? "")}
          @change=${this.makeTextInputHandler(stepId, field)}
        >
          ${options.map((option) => html`<option value=${option}>${option}</option>`)}
        </select>
      </label>
    `;
  }

  private renderStepActions(
    stepId: OnboardingStepId,
    payload: Record<string, unknown>,
    completeLabel: string
  ) {
    const isSubmitting = this.submittingStepId === stepId;

    return html`
      <div class="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          @click=${() => this.handleSaveDraft(stepId, payload)}
          class="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          Save draft
        </button>
        <button
          type="button"
          ?disabled=${isSubmitting}
          @click=${() => this.handleCompleteStep(stepId, payload)}
          class="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 transition-colors cursor-pointer"
        >
          ${isSubmitting ? "Saving…" : completeLabel}
        </button>
      </div>
    `;
  }

  private renderWelcomeVideo() {
    const stepId: OnboardingStepId = "welcome_video";
    const payload = buildWelcomeVideoPayload();

    return html`
      <section data-testid="onboarding-welcome-video" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 1 · Fundamental</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Welcome Video</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Start here. This video sets the tone: consistency over perfection, a repeatable rhythm, and a clear path toward changing your body and your life.
        </p>
        <div class="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-6 text-center">
          <p class="text-sm font-medium text-zinc-100">Welcome to Harry App</p>
          <p class="mt-2 text-xs text-zinc-500">Video placeholder · add hosted video URL in the content pass</p>
        </div>
        ${this.renderStepActions(stepId, payload, "I watched this — continue")}
      </section>
    `;
  }

  private renderRhythmForSuccess() {
    const stepId: OnboardingStepId = "rhythm_for_success";
    const draft = this.getDraft(stepId);
    const payload = buildRhythmForSuccessPayload(draft);

    return html`
      <section data-testid="onboarding-rhythm" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 1 · Fundamental</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Rhythm for Success</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Define the rhythm you can actually repeat. This becomes your consistency contract.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderTextArea(stepId, "motivation", "Why are you starting this program now?", "I am starting now because…")}
          ${this.renderTextArea(stepId, "successResult", "What result would make the next 90 days a success?", "In 90 days I want…")}
          ${this.renderTextArea(stepId, "consistencyBlockers", "What has stopped you from being consistent before?", "The main things that get in my way are…")}
          ${this.renderTextInput(stepId, "weeklyTrainingRhythm", "Weekly training rhythm", "Example: Monday, Wednesday, Friday mornings")}
          ${this.renderTextInput(stepId, "preferredTrainingTime", "Preferred training time", "Example: 6:30am before work")}
          ${this.renderTextArea(stepId, "supportNeeds", "What support do you need to stay consistent?", "I need…")}
          ${this.renderCheckbox(stepId, "progressPhotosDeferred", "I understand progress photos are part of accountability, but I want to defer uploading them until media upload support is enabled.")}
        </div>
        ${this.renderStepActions(stepId, payload, "Complete rhythm")}
      </section>
    `;
  }

  private renderInitialQa() {
    const stepId: OnboardingStepId = "initial_qa";
    const payload = buildInitialQaPayload(this.getDraft(stepId));

    return html`
      <section data-testid="onboarding-initial-qa" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 1 · Fundamental</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Initial Q&amp;A</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Give enough context for your starting plan to be safe, realistic, and properly scaled.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderTextInput(stepId, "primaryGoal", "Primary goal", "Example: build strength and lose fat")}
          ${this.renderTextInput(stepId, "secondaryGoal", "Secondary goal", "Example: improve mobility")}
          ${this.renderTextInput(stepId, "trainingExperience", "Training experience", "Beginner, intermediate, advanced, returning after time off…")}
          ${this.renderTextInput(stepId, "currentWeeklyActivity", "Current weekly activity", "Example: 2 walks, no strength training")}
          ${this.renderTextArea(stepId, "injuryHistory", "Injury history", "List current or previous injuries, or write none.")}
          ${this.renderTextArea(stepId, "painOrLimitations", "Pain or movement limitations", "Anything painful, limited, or concerning?")}
          ${this.renderTextInput(stepId, "sleepQuality", "Sleep quality", "Example: 6–7 hours, interrupted")}
          ${this.renderTextInput(stepId, "stressLevel", "Stress level", "Low, medium, high — and why")}
          ${this.renderTextInput(stepId, "workSchedule", "Work schedule", "Example: desk job, shift work, FIFO…")}
          ${this.renderTextInput(stepId, "trainingLocation", "Training location", "Home, gym, park, mixed…")}
          ${this.renderTextInput(stepId, "preferredTrainingDays", "Preferred training days", "Example: Monday, Wednesday, Saturday")}
          ${this.renderTextArea(stepId, "biggestObstacle", "Biggest obstacle", "What is most likely to knock you off track?")}
          ${this.renderTextInput(stepId, "motivationStyle", "Motivation style", "Direct, supportive, data-driven, challenge-based…")}
          ${this.renderTextInput(stepId, "coachingPreference", "Coaching preference", "How do you like feedback?")}
          ${this.renderTextArea(stepId, "coachNotes", "Anything else your coach should know?", "Optional context…")}
        </div>
        ${this.renderStepActions(stepId, payload, "Complete Q&A")}
      </section>
    `;
  }

  private renderHealthWaiver() {
    const stepId: OnboardingStepId = "health_waiver";
    const draft = this.getDraft(stepId);
    const isSubmitting = this.submittingStepId === stepId;

    return html`
      <section data-testid="onboarding-health-waiver" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 1 · Safety</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Health Waiver</h2>
        <div class="mt-5 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm leading-6 text-zinc-300">
          <p>Exercise involves risk. Stop immediately if you experience chest pain, dizziness, unusual shortness of breath, sharp pain, or symptoms that concern you.</p>
          <p>This program is educational coaching support. It is not medical advice, diagnosis, or treatment.</p>
          <p>You confirm that you have disclosed relevant health information and will consult a medical professional where appropriate.</p>
        </div>
        <div class="mt-6 grid gap-4">
          ${this.renderCheckbox(stepId, "accepted", "I have read and accept the health waiver.")}
          ${this.renderTextInput(stepId, "signatureName", "Typed full name", "Type your full legal name")}
        </div>
        <div class="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            @click=${() => this.handleSaveDraft(stepId, buildHealthWaiverPayload(this.getDraft(stepId)))}
            class="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            Save draft
          </button>
          <button
            type="button"
            ?disabled=${isSubmitting}
            @click=${this.handleAcceptWaiver}
            class="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 transition-colors cursor-pointer"
          >
            ${isSubmitting ? "Accepting…" : "Accept waiver"}
          </button>
        </div>
      </section>
    `;
  }

  private renderNextSteps() {
    const isSubmitting = this.submittingStepId === "part_1_next_steps";

    return html`
      <section data-testid="onboarding-next-steps" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 1 · Complete</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Next Steps</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Part 1 is nearly complete. Part 2 will collect your kit list, app walkthrough confirmation, assessments, measurements, and one day of nutrition data.
        </p>
        <ul class="mt-5 grid gap-2 text-sm text-zinc-300">
          <li>• Set aside time for basic strength, mobility, and cardio assessments.</li>
          <li>• Have your training space and equipment nearby.</li>
          <li>• Track one normal day of eating when you reach the nutrition step.</li>
        </ul>
        <button
          type="button"
          ?disabled=${isSubmitting}
          @click=${this.handleConfirmNextSteps}
          class="mt-6 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 transition-colors cursor-pointer"
        >
          ${isSubmitting ? "Submitting Part 1…" : "Finish Part 1"}
        </button>
      </section>
    `;
  }

  private renderKitList() {
    const stepId: OnboardingStepId = "kit_list";
    const draft = this.getDraft(stepId);
    const payload = buildKitListPayload(draft);

    return html`
      <section data-testid="onboarding-kit-list" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 2 · Setup</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Kit List</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Tell us where you train and what equipment you can access so your first block is realistic.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderTextInput(stepId, "trainingLocation", "Where will you train most often?", "Home, gym, park, mixed…")}
          ${this.renderTextArea(stepId, "equipmentListText", "Equipment available", "One item per line, or comma separated")}
          ${this.renderCheckbox(stepId, "noEquipment", "I do not currently have equipment available.")}
        </div>
        ${this.renderStepActions(stepId, payload, "Complete kit list")}
      </section>
    `;
  }

  private renderAppWalkthrough() {
    const stepId: OnboardingStepId = "app_walkthrough_video";
    const payload = buildAppWalkthroughPayload();

    return html`
      <section data-testid="onboarding-app-walkthrough" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 2 · App setup</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">App Walkthrough Video</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Watch how to find your plan, submit check-ins, track workouts, and keep onboarding progress saved.
        </p>
        <div class="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-6 text-center">
          <p class="text-sm font-medium text-zinc-100">App walkthrough placeholder</p>
          <p class="mt-2 text-xs text-zinc-500">Video placeholder · add hosted walkthrough URL in the content pass</p>
        </div>
        ${this.renderStepActions(stepId, payload, "I watched the walkthrough")}
      </section>
    `;
  }

  private renderInitialAssessment() {
    const stepId: OnboardingStepId = "initial_assessment";
    const payload = buildInitialAssessmentPayload(this.getDraft(stepId));

    return html`
      <section data-testid="onboarding-initial-assessment" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 2 · Baseline</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Initial Assessment</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Complete safe strength, mobility, and cardio baselines. Skip anything unsafe and write notes for your coach.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderCheckbox(stepId, "strengthSubmitted", "Strength assessment completed.")}
          ${this.renderTextArea(stepId, "strengthNotes", "Strength notes", "Reps, regressions, pain, or anything you noticed.")}
          ${this.renderCheckbox(stepId, "mobilitySubmitted", "Mobility assessment completed.")}
          ${this.renderTextArea(stepId, "mobilityNotes", "Mobility notes", "Restrictions, asymmetries, or easy/hard movements.")}
          ${this.renderCheckbox(stepId, "cardioSubmitted", "Cardio assessment completed or safely skipped.")}
          ${this.renderTextArea(stepId, "cardioNotes", "Cardio notes", "Time, distance, heart rate, RPE, or why you skipped.")}
          ${this.renderTextArea(stepId, "painFlags", "Pain or concerning symptoms", "Write none, or describe what happened.")}
          ${this.renderTextInput(stepId, "perceivedDifficulty", "Overall perceived difficulty", "Example: 7/10")}
        </div>
        ${this.renderStepActions(stepId, payload, "Complete assessment")}
      </section>
    `;
  }

  private renderInitialMeasurements() {
    const stepId: OnboardingStepId = "initial_measurements";
    const payload = buildInitialMeasurementsPayload(this.getDraft(stepId));
    const unitSystem = draftString(this.getDraft(stepId), "unitSystem", "metric");

    return html`
      <section data-testid="onboarding-initial-measurements" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 2 · Baseline</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Initial Measurements</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Capture simple baseline measurements. Optional fields can stay blank. This is private progress data, not a judgement.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderSelect(stepId, "unitSystem", "Unit system", ["metric", "imperial"])}
          ${this.renderTextInput(stepId, "measurementDate", "Measurement date", "YYYY-MM-DD")}
          ${unitSystem === "imperial"
            ? this.renderTextInput(stepId, "bodyWeightLb", "Body weight (lb)", "Example: 180")
            : this.renderTextInput(stepId, "bodyWeightKg", "Body weight (kg)", "Example: 82")}
          ${unitSystem === "imperial"
            ? this.renderTextInput(stepId, "heightIn", "Height (in)", "Example: 71")
            : this.renderTextInput(stepId, "heightCm", "Height (cm)", "Example: 181")}
          <div class="grid gap-4 sm:grid-cols-2">
            ${this.renderTextInput(stepId, "waist", "Waist", "Optional")}
            ${this.renderTextInput(stepId, "hips", "Hips", "Optional")}
            ${this.renderTextInput(stepId, "chest", "Chest", "Optional")}
            ${this.renderTextInput(stepId, "arm", "Arm", "Optional")}
            ${this.renderTextInput(stepId, "thigh", "Thigh", "Optional")}
            ${this.renderTextInput(stepId, "neck", "Neck", "Optional")}
            ${this.renderTextInput(stepId, "calf", "Calf", "Optional")}
            ${this.renderTextInput(stepId, "restingHeartRate", "Resting heart rate", "Optional")}
          </div>
          ${this.renderTextArea(stepId, "notes", "Measurement notes", "Optional context…")}
        </div>
        ${this.renderStepActions(stepId, payload, "Complete measurements")}
      </section>
    `;
  }

  private renderNutritionMeal(stepId: OnboardingStepId, index: number) {
    return html`
      <div class="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p class="text-sm font-semibold text-zinc-100">Meal ${index}</p>
        <div class="grid gap-4 sm:grid-cols-2">
          ${this.renderTextInput(stepId, `meal${index}Time`, "Time", "Example: 08:00")}
          ${this.renderTextInput(stepId, `meal${index}Portion`, "Rough portion", "Example: 2 eggs, 2 slices")}
        </div>
        ${this.renderTextArea(stepId, `meal${index}Description`, "Food and drink", "What did you eat and drink?")}
        <div class="grid gap-4 sm:grid-cols-2">
          ${this.renderTextInput(stepId, `meal${index}Hunger`, "Hunger/fullness", "Example: hungry before, satisfied after")}
          ${this.renderTextInput(stepId, `meal${index}Energy`, "Energy", "Example: good, afternoon crash")}
        </div>
        ${this.renderTextArea(stepId, `meal${index}Notes`, "Meal notes", "Optional notes, social meals, cravings, missed items…")}
      </div>
    `;
  }

  private renderNutritionTracking() {
    const stepId: OnboardingStepId = "nutrition_track_one_day";
    const draft = this.getDraft(stepId);
    const payload = buildNutritionTrackOneDayPayload(draft);
    const isSubmitting = this.submittingStepId === stepId;

    return html`
      <section data-testid="onboarding-nutrition" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Part 2 · Nutrition baseline</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">Custom Nutrition GPT: Track 1 Day</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          Log one normal day of eating. This is educational baseline data for practical next steps, not a judgement or medical nutrition plan.
        </p>
        <div class="mt-6 grid gap-4">
          ${this.renderCheckbox(stepId, "nutritionScheduled", "I need to schedule this for later instead of submitting meals right now.")}
          ${this.renderSelect(stepId, "trainingDayType", "Was this a training day or rest day?", ["training day", "rest day", "mixed/other"])}
          ${this.renderNutritionMeal(stepId, 1)}
          ${this.renderNutritionMeal(stepId, 2)}
          ${this.renderNutritionMeal(stepId, 3)}
          ${this.renderNutritionMeal(stepId, 4)}
          ${this.renderTextArea(stepId, "cravings", "Cravings", "Any cravings or patterns?")}
          ${this.renderTextArea(stepId, "socialOrStressEating", "Social meals or stress eating", "Anything useful for context?")}
          ${this.renderTextArea(stepId, "missedMeals", "Missed meals or late entries", "Anything forgotten or added late?")}
          ${this.renderTextArea(stepId, "nutritionNotes", "Nutrition notes", "Anything else your coach should know?")}
        </div>
        <div class="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            @click=${() => this.handleSaveDraft(stepId, payload)}
            class="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            Save draft
          </button>
          <button
            type="button"
            ?disabled=${isSubmitting}
            @click=${() => this.handleSubmitPart2(payload)}
            class="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 transition-colors cursor-pointer"
          >
            ${isSubmitting ? "Submitting onboarding…" : "Finish onboarding"}
          </button>
        </div>
      </section>
    `;
  }

  private renderCompletionScreen(readModel: ClientOnboardingReadModel) {
    return html`
      <section data-testid="onboarding-complete" class="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Onboarding submitted</p>
        <h2 class="mt-2 text-2xl font-semibold text-emerald-50">You’re all set</h2>
        <p class="mt-3 text-sm leading-6 text-emerald-100/80">
          Your onboarding status is ${readModel.derivedStatus}. Your coach can now review your rhythm, Q&amp;A, waiver, kit, assessments, measurements, and nutrition baseline.
        </p>
        <div class="mt-5 grid gap-3 rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-4 text-sm text-emerald-100/80">
          <p>What happens next:</p>
          <ul class="grid gap-2">
            <li>• Your submission is saved for coach review.</li>
            <li>• Your first training plan can be matched to your baseline.</li>
            <li>• Nutrition support can use your one-day log as a starting point.</li>
          </ul>
        </div>
      </section>
    `;
  }

  private renderPart1Step() {
    const currentStepId = getOnboardingResumeStepId();
    const currentStep = getCurrentOnboardingStep();

    runClientUnscoped(
      clientLog("debug", `[OnboardingView] Rendering Part 1 step ${currentStepId} with status ${currentStep?.status ?? "missing"}.`)
    );

    if (currentStepId === "welcome_video") return this.renderWelcomeVideo();
    if (currentStepId === "rhythm_for_success") return this.renderRhythmForSuccess();
    if (currentStepId === "initial_qa") return this.renderInitialQa();
    if (currentStepId === "health_waiver") return this.renderHealthWaiver();
    if (currentStepId === "part_1_next_steps") return this.renderNextSteps();

    return null;
  }

  private renderPart2Step(readModel: ClientOnboardingReadModel) {
    const currentStepId = getOnboardingResumeStepId();
    const currentStep = getCurrentOnboardingStep();

    runClientUnscoped(
      clientLog("debug", `[OnboardingView] Rendering Part 2 step ${currentStepId} with status ${currentStep?.status ?? "missing"}.`)
    );

    if (currentStepId === "kit_list") return this.renderKitList();
    if (currentStepId === "app_walkthrough_video") return this.renderAppWalkthrough();
    if (currentStepId === "initial_assessment") return this.renderInitialAssessment();
    if (currentStepId === "initial_measurements") return this.renderInitialMeasurements();
    if (currentStepId === "nutrition_track_one_day") return this.renderNutritionTracking();

    return this.renderCompletionScreen(readModel);
  }

  private renderCurrentStep(readModel: ClientOnboardingReadModel) {
    if (
      readModel.derivedStatus === "submitted" ||
      readModel.derivedStatus === "coach_review" ||
      readModel.derivedStatus === "complete" ||
      readModel.nextIncompleteStepId === "complete"
    ) {
      return this.renderCompletionScreen(readModel);
    }

    const part1Step = this.renderPart1Step();
    if (part1Step) return part1Step;

    return this.renderPart2Step(readModel);
  }

  private renderReady(readModel: ClientOnboardingReadModel) {
    const progress = getOnboardingProgressPercentage();
    const currentDefinition = getCurrentOnboardingStepDefinition();

    return html`
      <div data-testid="onboarding-shell" class="mx-auto max-w-4xl space-y-6">
        <header class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Onboarding</p>
              <h1 class="mt-2 text-3xl font-bold text-zinc-50">Build your starting point</h1>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Complete each step so your first block starts from real context: rhythm, safety, kit, assessments, measurements, and nutrition baseline.
              </p>
              <p class="mt-3 text-xs text-zinc-500">Current step: ${currentDefinition.title}</p>
            </div>
            <button
              type="button"
              @click=${this.handleRefresh}
              class="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
          <div class="mt-6">
            <div class="flex items-center justify-between text-xs text-zinc-500">
              <span>Status: ${readModel.derivedStatus}</span>
              <span>${progress}% complete</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900">
              <div class="h-full rounded-full bg-zinc-100" style="width: ${progress}%"></div>
            </div>
          </div>
        </header>

        ${this.renderCurrentStep(readModel)}
        ${this.renderStepList(readModel)}
      </div>
    `;
  }

  override render() {
    const state = onboardingState.value;

    if (state.status === "loading" || state.status === "idle") {
      return this.renderLoading();
    }

    if (state.status === "error") {
      return this.renderError(state.errorMessage ?? "Unknown onboarding error.");
    }

    if (!state.readModel) {
      return nothing;
    }

    return this.renderReady(state.readModel);
  }
}
