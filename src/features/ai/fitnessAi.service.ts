import { Effect, Data } from "effect";
import { mastra } from "../../../mastra.config";
import { z } from "zod";

export const TargetExerciseSchema = z.object({
  movement: z.string().describe("The exercise movement name (e.g. Push-Up)."),
  cue: z.string().optional().describe("Coaching cue guidelines or targets.")
});

export const WorkoutRoutineSchema = z.object({
  progression_details: z.string().describe("Workout progression details."),
  execution_instructions: z.string().describe("Sets, reps, or custom instructions."),
  target_exercises: z.array(TargetExerciseSchema).describe("List of target exercises.")
});

export type TargetExercise = z.infer<typeof TargetExerciseSchema>;
export type WorkoutRoutine = z.infer<typeof WorkoutRoutineSchema>;

export class AiServiceError extends Data.TaggedError("AiServiceError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const generateWorkoutRoutine = (prompt: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[AiService] Requesting structured plan generation from Mastra for prompt: "${prompt}"`);

    const agent = yield* Effect.sync(() => mastra.getAgentById("calisthenics-fitness-coach"));
    if (!agent) {
      yield* Effect.logError("[AiService] Mastra failed to retrieve 'calisthenics-fitness-coach'.");
      return yield* Effect.fail(new AiServiceError({ message: "Mastra Agent 'calisthenics-fitness-coach' not registered." }));
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        agent.generate(prompt, {
          structuredOutput: {
            schema: WorkoutRoutineSchema,
          },
        }),
      catch: (error) => {
        return new AiServiceError({
          message: `Failed to generate structured plan via Mastra AI. Error: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        });
      },
    });

    yield* Effect.logInfo("[AiService] Successfully received structured output from Mastra.");
    
    const result = (response as { object: WorkoutRoutine }).object;
    yield* Effect.logInfo(`[AiService] Parsed result details - Progression: "${result.progression_details}", Execution: "${result.execution_instructions}"`);

    return result;
  });
