export type OnboardingPart1Draft = Record<string, unknown>;

export const draftString = (
  draft: OnboardingPart1Draft,
  field: string,
  fallback = ""
): string => {
  const value = draft[field];
  return typeof value === "string" ? value : fallback;
};

export const draftBoolean = (
  draft: OnboardingPart1Draft,
  field: string,
  fallback = false
): boolean => {
  const value = draft[field];
  return typeof value === "boolean" ? value : fallback;
};

export const buildWelcomeVideoPayload = (): Record<string, unknown> => ({
  confirmed: true,
  watchedPercentage: 100
});

export const buildRhythmForSuccessPayload = (
  draft: OnboardingPart1Draft
): Record<string, unknown> => ({
  motivation: draftString(draft, "motivation"),
  successResult: draftString(draft, "successResult"),
  consistencyBlockers: draftString(draft, "consistencyBlockers"),
  weeklyTrainingRhythm: draftString(draft, "weeklyTrainingRhythm"),
  preferredTrainingTime: draftString(draft, "preferredTrainingTime"),
  supportNeeds: draftString(draft, "supportNeeds"),
  progressPhotosDeferred: draftBoolean(draft, "progressPhotosDeferred"),
  requiredProgressPhotoCount: draftBoolean(draft, "progressPhotosDeferred") ? 0 : 3
});

export const buildInitialQaPayload = (
  draft: OnboardingPart1Draft
): Record<string, unknown> => ({
  primaryGoal: draftString(draft, "primaryGoal"),
  secondaryGoal: draftString(draft, "secondaryGoal"),
  trainingExperience: draftString(draft, "trainingExperience"),
  currentWeeklyActivity: draftString(draft, "currentWeeklyActivity"),
  injuryHistory: draftString(draft, "injuryHistory"),
  painOrLimitations: draftString(draft, "painOrLimitations"),
  sleepQuality: draftString(draft, "sleepQuality"),
  stressLevel: draftString(draft, "stressLevel"),
  workSchedule: draftString(draft, "workSchedule"),
  trainingLocation: draftString(draft, "trainingLocation"),
  preferredTrainingDays: draftString(draft, "preferredTrainingDays"),
  biggestObstacle: draftString(draft, "biggestObstacle"),
  motivationStyle: draftString(draft, "motivationStyle"),
  coachingPreference: draftString(draft, "coachingPreference"),
  coachNotes: draftString(draft, "coachNotes")
});

export const buildHealthWaiverPayload = (
  draft: OnboardingPart1Draft,
  waiverVersion = "2026-06-30"
): Record<string, unknown> => ({
  accepted: draftBoolean(draft, "accepted"),
  signatureName: draftString(draft, "signatureName"),
  waiverVersion
});

export const buildNextStepsPayload = (): Record<string, unknown> => ({
  confirmed: true
});