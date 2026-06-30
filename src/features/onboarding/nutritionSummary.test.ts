import { describe, expect, it } from "vitest";
import { createNutritionSummaryPayloadFromNutritionStep } from "./nutritionSummary.ts";

describe("nutrition GPT summary payload", () => {
  it("summarises one-day nutrition without medical claims", () => {
    const summary = createNutritionSummaryPayloadFromNutritionStep({
      nutritionDayStatus: "submitted",
      trainingDayType: "training day",
      cravings: "Chocolate after dinner",
      missedMeals: "Skipped lunch because work ran late",
      mealEntries: [
        {
          time: "08:00",
          description: "Eggs on toast with banana",
          portion: "2 eggs, 2 slices"
        },
        {
          time: "19:00",
          description: "Chicken rice bowl with salad",
          portion: "1 bowl"
        }
      ]
    });

    expect(summary.mealCount).toBe(2);
    expect(summary.summary).toContain("Logged 2 meals");
    expect(summary.coachSnapshot).toContain("training day");
    expect(summary.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(summary.medicalDisclaimer).toContain("not medical advice");
  });

  it("adds practical easy wins when logged meals lack obvious anchors", () => {
    const summary = createNutritionSummaryPayloadFromNutritionStep({
      nutritionDayStatus: "submitted",
      trainingDayType: "rest day",
      mealEntries: [
        {
          time: "10:00",
          description: "Coffee and toast",
          portion: "quick breakfast"
        }
      ]
    });

    expect(summary.easyWins.some((win) => win.includes("meal rhythm"))).toBe(true);
    expect(summary.easyWins.some((win) => win.includes("protein anchor"))).toBe(true);
    expect(summary.easyWins.some((win) => win.includes("fruit or vegetable"))).toBe(true);
  });
});