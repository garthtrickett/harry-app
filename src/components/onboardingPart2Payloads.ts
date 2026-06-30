import { draftBoolean, draftString, type OnboardingPart1Draft } from "./onboardingPart1Payloads.ts";

export type OnboardingPart2Draft = OnboardingPart1Draft;

export const draftNumber = (
  draft: OnboardingPart2Draft,
  field: string
): number | undefined => {
  const value = draft[field];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const splitEquipmentList = (value: string): readonly string[] => {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const buildKitListPayload = (
  draft: OnboardingPart2Draft
): Record<string, unknown> => ({
  trainingLocation: draftString(draft, "trainingLocation"),
  equipmentList: splitEquipmentList(draftString(draft, "equipmentListText")),
  noEquipment: draftBoolean(draft, "noEquipment")
});

export const buildAppWalkthroughPayload = (): Record<string, unknown> => ({
  confirmed: true,
  watchedPercentage: 100
});

export const buildInitialAssessmentPayload = (
  draft: OnboardingPart2Draft
): Record<string, unknown> => ({
  strengthSubmitted: draftBoolean(draft, "strengthSubmitted"),
  mobilitySubmitted: draftBoolean(draft, "mobilitySubmitted"),
  cardioSubmitted: draftBoolean(draft, "cardioSubmitted"),
  strengthNotes: draftString(draft, "strengthNotes"),
  mobilityNotes: draftString(draft, "mobilityNotes"),
  cardioNotes: draftString(draft, "cardioNotes"),
  painFlags: draftString(draft, "painFlags"),
  perceivedDifficulty: draftString(draft, "perceivedDifficulty")
});

export const buildInitialMeasurementsPayload = (
  draft: OnboardingPart2Draft
): Record<string, unknown> => {
  const unitSystem = draftString(draft, "unitSystem", "metric");

  return {
    unitSystem,
    measurementDate: draftString(draft, "measurementDate"),
    bodyWeightKg: draftNumber(draft, "bodyWeightKg"),
    bodyWeightLb: draftNumber(draft, "bodyWeightLb"),
    heightCm: draftNumber(draft, "heightCm"),
    heightIn: draftNumber(draft, "heightIn"),
    waist: draftNumber(draft, "waist"),
    hips: draftNumber(draft, "hips"),
    chest: draftNumber(draft, "chest"),
    arm: draftNumber(draft, "arm"),
    thigh: draftNumber(draft, "thigh"),
    neck: draftNumber(draft, "neck"),
    calf: draftNumber(draft, "calf"),
    restingHeartRate: draftNumber(draft, "restingHeartRate"),
    notes: draftString(draft, "notes")
  };
};

const buildMealEntry = (
  draft: OnboardingPart2Draft,
  index: number
): Record<string, unknown> | null => {
  const mealDescription = draftString(draft, `meal${index}Description`);
  const mealTime = draftString(draft, `meal${index}Time`);
  const portion = draftString(draft, `meal${index}Portion`);
  const hunger = draftString(draft, `meal${index}Hunger`);
  const energy = draftString(draft, `meal${index}Energy`);
  const notes = draftString(draft, `meal${index}Notes`);

  if (
    mealDescription.trim().length === 0 &&
    mealTime.trim().length === 0 &&
    portion.trim().length === 0
  ) {
    return null;
  }

  return {
    mealNumber: index,
    time: mealTime,
    description: mealDescription,
    portion,
    hunger,
    energy,
    notes
  };
};

export const buildNutritionTrackOneDayPayload = (
  draft: OnboardingPart2Draft
): Record<string, unknown> => {
  const nutritionDayStatus = draftBoolean(draft, "nutritionScheduled")
    ? "scheduled"
    : "submitted";
  const mealEntries = [1, 2, 3, 4]
    .map((index) => buildMealEntry(draft, index))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  return {
    nutritionDayStatus,
    mealEntries,
    trainingDayType: draftString(draft, "trainingDayType"),
    cravings: draftString(draft, "cravings"),
    socialOrStressEating: draftString(draft, "socialOrStressEating"),
    missedMeals: draftString(draft, "missedMeals"),
    nutritionNotes: draftString(draft, "nutritionNotes")
  };
};