import { effect } from "@preact/signals-core";
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

export const stepStatusLabel = (status: OnboardingStepStatus): string => {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In progress";
  return "Not started";
};

@customElement("onboarding-view")
export class OnboardingView extends LitElement {
  private disposeSignalEffect?: () => void;

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    runClientUnscoped(clientLog("info", "[OnboardingView] Mounted onboarding shell."));

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

  private renderPlaceholderStep(readModel: ClientOnboardingReadModel) {
    const currentStep = getCurrentOnboardingStep();
    const definition = getCurrentOnboardingStepDefinition();

    return html`
      <section data-testid="onboarding-placeholder-step" class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Current step</p>
        <h2 class="mt-2 text-2xl font-semibold text-zinc-100">${definition.title}</h2>
        <p class="mt-3 text-sm leading-6 text-zinc-400">
          This is the onboarding shell placeholder. The next patch will replace this panel with the real Part 1 screen for this step.
        </p>
        <dl class="mt-5 grid gap-3 rounded-xl border border-zinc-850 bg-zinc-900/60 p-4 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-zinc-500">Step ID</dt>
            <dd class="font-mono text-zinc-200">${readModel.nextIncompleteStepId}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-zinc-500">Step status</dt>
            <dd class="text-zinc-200">${stepStatusLabel(currentStep?.status ?? "not_started")}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-zinc-500">Resume target</dt>
            <dd class="font-mono text-zinc-200">${getOnboardingResumeStepId()}</dd>
          </div>
        </dl>
      </section>
    `;
  }

  private renderReady(readModel: ClientOnboardingReadModel) {
    const progress = getOnboardingProgressPercentage();

    return html`
      <div data-testid="onboarding-shell" class="mx-auto max-w-4xl space-y-6">
        <header class="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.25em] text-zinc-500">Onboarding</p>
              <h1 class="mt-2 text-3xl font-bold text-zinc-50">Build your starting point</h1>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                You do not need to be perfect. You need a rhythm you can repeat. This shell will guide the full onboarding flow step by step.
              </p>
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

        ${this.renderPlaceholderStep(readModel)}
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
