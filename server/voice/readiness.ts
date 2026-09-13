import {
  VoiceReadinessAssessmentSchema,
  type VoiceReadinessAssessment,
  type VoiceReadinessRequest,
} from "../../shared/schemas.js";
import type { AgentRuntime } from "../agents/runtime.js";
import { loadPrompt } from "../prompts.js";

const explicitConvene = /\b(convene|delegate|send (?:it|this|that) to (?:the )?council|put (?:it|this|that) to (?:the )?council|go ahead)\b/iu;

export class VoiceReadinessAssessor {
  constructor(private readonly runtime: AgentRuntime, private readonly model: string) {}

  async assess(request: VoiceReadinessRequest): Promise<VoiceReadinessAssessment> {
    const accumulated = [request.currentContext, ...request.completedUserTurns].join("\n").trim();
    if (explicitConvene.test(request.latestTurn) && accumulated.length >= 24) {
      return { action: "convene", missingInformation: [], reason: "The user explicitly asked to convene with decision context already available.", confidence: 0.99 };
    }
    try {
      const run = await this.runtime.start({
        model: this.model,
        instructions: await loadPrompt("voice-readiness"),
        input: JSON.stringify(request),
        schema: VoiceReadinessAssessmentSchema,
        metadata: { application: "sagacity-syndicate", stage: "voice_readiness" },
      });
      return VoiceReadinessAssessmentSchema.parse(run.output);
    } catch {
      if (accumulated.length >= 80) {
        return { action: "convene", missingInformation: [], reason: "The accumulated voice context contains a recognizable decision for bounded analysis.", confidence: 0.55 };
      }
      return { action: "clarify", missingInformation: ["the decision or choice to examine"], reason: "The accumulated voice context does not yet identify a clear decision.", confidence: 0.55 };
    }
  }
}
