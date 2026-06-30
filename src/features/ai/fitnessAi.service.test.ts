import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { generateWorkoutRoutine, AiServiceError } from "./fitnessAi.service";
import { mastra } from "../../../mastra.config";

vi.mock("../../../mastra.config", () => {
  const mockAgent = {
    generate: vi.fn()
  };
  return {
    mastra: {
      getAgentById: vi.fn(() => mockAgent)
    }
  };
});

describe("AI Workout Generation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a structured workout routine successfully", async () => {
    const mockOutput = {
      progression_details: "Standard calisthenics workout plan.",
      execution_instructions: "3 sets of 10 dips",
      target_exercises: [
        { movement: "Push-Up" },
        { movement: "Pull-Up" }
      ]
    };

    const mockAgent = mastra.getAgentById("calisthenics-fitness-coach");
    vi.mocked(mockAgent!.generate).mockResolvedValue({
      object: mockOutput,
      text: "",
      toolCalls: [],
      steps: []
    } as any);

    const program = generateWorkoutRoutine("Generate workout");
    const result = await Effect.runPromise(program);

    expect(result).toEqual(mockOutput);
  });

  it("should fail with AiServiceError when agent generation fails", async () => {
    const mockAgent = mastra.getAgentById("calisthenics-fitness-coach");
    vi.mocked(mockAgent!.generate).mockRejectedValue(new Error("LLM Timeout"));

    const program = generateWorkoutRoutine("Generate workout");
    const result = await Effect.runPromise(Effect.either(program));

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(AiServiceError);
      expect((result.left as any).message).toContain("Failed to generate structured plan via Mastra AI");
    }
  });
});
