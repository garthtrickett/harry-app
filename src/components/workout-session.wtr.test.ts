import { html, fixture, expect } from "@open-wc/testing";
import "./WorkoutSession";
import { WorkoutSession } from "./WorkoutSession";
import { activeSessionStore } from "../lib/client/stores/activeWorkoutStore";
import { exerciseProgressStore } from "../lib/client/stores/exerciseStore";
import { runClientPromise } from "../lib/client/runtime";

describe("WorkoutSession Component - Comprehension-First Review Loop", () => {
  beforeEach(async () => {
    activeSessionStore.clear();
    await runClientPromise(exerciseProgressStore.clear());
  });

  it("should render finished state when study queue is empty", async () => {
    const el = await fixture<WorkoutSession>(html`<study-session></study-session>`);
    
    const heading = el.querySelector("h2");
    expect(heading).to.exist;
    expect(heading?.textContent).to.contain("Workout Completed!");
  });
});
