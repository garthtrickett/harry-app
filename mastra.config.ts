import { Mastra } from "@mastra/core/mastra";
import { fitnessCoachAgent } from "./src/lib/server/ai/agents/fitness-coach.agent";

export const mastra = new Mastra({
  agents: {
    fitnessCoachAgent,
  },
});
