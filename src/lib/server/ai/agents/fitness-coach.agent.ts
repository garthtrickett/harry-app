import { Agent } from "@mastra/core/agent";

export const fitnessCoachAgent = new Agent({
  id: "calisthenics-fitness-coach",
  name: "Calisthenics Fitness Coach",
  instructions: `
    You are an expert calisthenics coach and athletic nutritionist.
    Your mission is to help clients achieve their target movement goals (such as handstand push-ups, muscle-ups, and pistol squats) using zero-latency progress logging.
    
    You parse unstructured natural language workout summaries into macro targets and structured exercise log inputs.
  `,
  model: {
    id: "openai/gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY || "",
  }
});
