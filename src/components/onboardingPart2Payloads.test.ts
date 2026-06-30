import { describe, expect, it } from "vitest";
import {
  buildAppWalkthroughPayload,
  buildInitialAssessmentPayload,
  buildInitialMeasurementsPayload,
  buildKitListPayload,
  buildNutritionTrackOneDayPayload,
  draftNumber,
  splitEquipmentList
} from "./onboardingPart2Payloads.ts";

describe("onboarding Part 2 payload builders", () => {
  it("splits equipment lists from comma and newline separated text", () => {
    expect(splitEquipmentList("Pull-up bar, rings\nDumbbells")).toEqual([
      "Pull-up bar",
      "rings",
      "Dumbbells"
    ]);
  });

  it("builds kit list payloads with equipment or no-equipment state", () => {
    expect(
      buildKitListPayload({
        trainingLocation: "Home gym",
        equipmentListText: "Pull-up bar\nRings",
        noEquipment: false
      })
    ).toEqual({
      trainingLocation: "Home gym",
      equipmentList: ["Pull-up bar", "Rings"],
      noEquipment: false
    });

    expect(
      buildKitListPayload({
        trainingLocation: "Park",
        noEquipment: true
      })
    ).toMatchObject({
      trainingLocation: "Park",
      equipmentList: [],
      noEquipment: true
    });
  });

  it("builds walkthrough and assessment payloads", () => {
    expect(buildAppWalkthroughPayload()).toEqual({
      confirmed: true,
      watchedPercentage: 100
    });

    expect(
      buildInitialAssessmentPayload({
        strengthSubmitted: true,
        mobilitySubmitted: true,
        cardioSubmitted: true,
        painFlags: "No pain."
      })
    ).toMatchObject({
      strengthSubmitted: true,
      mobilitySubmitted: true,
      cardioSubmitted: true,
      painFlags: "No pain."
    });
  });

  it("normalises measurement numbers without throwing on empty values", () => {
    expect(draftNumber({ bodyWeightKg: "82.5" }, "bodyWeightKg")).toBe(82.5);
    expect(draftNumber({ bodyWeightKg: "" }, "bodyWeightKg")).toBeUndefined();

    expect(
      buildInitialMeasurementsPayload({
        unitSystem: "metric",
        bodyWeightKg: "82",
        heightCm: "181",
        waist: "84"
      })
    ).toMatchObject({
      unitSystem: "metric",
      bodyWeightKg: 82,
      heightCm: 181,
      waist: 84
    });
  });

  it("builds submitted and scheduled nutrition payloads", () => {
    expect(
      buildNutritionTrackOneDayPayload({
        meal1Time: "08:00",
        meal1Description: "Eggs and toast",
        meal1Portion: "2 eggs, 2 slices",
        trainingDayType: "training day"
      })
    ).toMatchObject({
      nutritionDayStatus: "submitted",
      mealEntries: [
        {
          mealNumber: 1,
          time: "08:00",
          description: "Eggs and toast",
          portion: "2 eggs, 2 slices"
        }
      ],
      trainingDayType: "training day"
    });

    expect(
      buildNutritionTrackOneDayPayload({
        nutritionScheduled: true
      })
    ).toMatchObject({
      nutritionDayStatus: "scheduled",
      mealEntries: []
    });
  });
});