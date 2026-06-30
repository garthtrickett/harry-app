export type NutritionGptSummaryPayload = {
  readonly summary: string;
  readonly coachSnapshot: string;
  readonly easyWins: readonly string[];
  readonly clarifyingQuestions: readonly string[];
  readonly mealCount: number;
  readonly medicalDisclaimer: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const payloadString = (payload: Record<string, unknown>, field: string): string => {
  const value = payload[field];
  return typeof value === "string" ? value.trim() : "";
};

const normaliseMealEntries = (payload: Record<string, unknown>): readonly Record<string, unknown>[] => {
  const mealEntries = payload.mealEntries;
  if (!Array.isArray(mealEntries)) return [];
  return mealEntries.filter(isRecord);
};

const textIncludesProteinCue = (text: string): boolean => {
  return /protein|egg|eggs|chicken|fish|beef|lamb|pork|tofu|tempeh|yoghurt|yogurt|milk|whey|beans|lentils/i.test(text);
};

const textIncludesProduceCue = (text: string): boolean => {
  return /fruit|vegetable|salad|greens|berries|banana|apple|broccoli|spinach|carrot|tomato/i.test(text);
};

export const createNutritionSummaryPayloadFromNutritionStep = (
  payload: Record<string, unknown>
): NutritionGptSummaryPayload => {
  const mealEntries = normaliseMealEntries(payload);
  const mealDescriptions = mealEntries
    .map((entry) => payloadString(entry, "description"))
    .filter((description) => description.length > 0);
  const combinedMeals = mealDescriptions.join(" ");
  const trainingDayType = payloadString(payload, "trainingDayType") || "not specified";
  const cravings = payloadString(payload, "cravings");
  const missedMeals = payloadString(payload, "missedMeals");
  const easyWins: string[] = [];
  const clarifyingQuestions: string[] = [];

  if (mealEntries.length < 3) {
    easyWins.push("Build a simple repeatable meal rhythm so the day is easier to review and improve.");
  }

  if (!textIncludesProteinCue(combinedMeals)) {
    easyWins.push("Add one clear protein anchor to at least one meal so training recovery has a stronger starting point.");
  }

  if (!textIncludesProduceCue(combinedMeals)) {
    easyWins.push("Add one fruit or vegetable serving to make the baseline day more nutrient-dense without overhauling everything.");
  }

  if (cravings.length > 0) {
    clarifyingQuestions.push("What time of day did the cravings feel strongest, and what was happening around that time?");
  }

  if (missedMeals.length > 0) {
    clarifyingQuestions.push("Were missed meals caused by appetite, schedule, preparation, or forgetting to log?");
  }

  if (mealDescriptions.some((description) => description.length < 12)) {
    clarifyingQuestions.push("Can you add rough portions for any meals that are currently vague?");
  }

  if (easyWins.length === 0) {
    easyWins.push("Keep the current structure and focus on consistent logging before changing too many variables.");
  }

  if (clarifyingQuestions.length === 0) {
    clarifyingQuestions.push("Which meal felt easiest to repeat on a normal training week?");
  }

  return {
    summary: `Logged ${mealEntries.length} meal${mealEntries.length === 1 ? "" : "s"} for a ${trainingDayType}. The current baseline gives the coach enough context to discuss rhythm, portions, hunger, energy, and practical next steps without making medical claims.`,
    coachSnapshot: `Meals logged: ${mealEntries.length}. Training day type: ${trainingDayType}. Cravings noted: ${cravings || "none provided"}. Missed meals noted: ${missedMeals || "none provided"}.`,
    easyWins,
    clarifyingQuestions,
    mealCount: mealEntries.length,
    medicalDisclaimer: "Nutrition support is educational coaching guidance only and is not medical advice, diagnosis, or treatment."
  };
};