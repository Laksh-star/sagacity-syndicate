import {
  VoiceReadinessAssessmentSchema,
  type VoiceReadinessAssessment,
  type VoiceReadinessRequest,
} from "../../shared/schemas.js";
import type { AgentRunTelemetry, AgentRuntime } from "../agents/runtime.js";
import { loadPrompt } from "../prompts.js";
import { z } from "zod";

import { isVoiceNonAnswer } from "../../shared/voice-intake.js";

const explicitConvene = /\b(convene|delegate|send (?:it|this|that) to (?:the )?council|put (?:it|this|that) to (?:the )?council|go ahead)\b/iu;

// Provider strict structured outputs require every declared property in
// `required`. The application schema keeps decisionQuestion optional, while
// the provider wire schema represents absence explicitly as null.
export const VoiceReadinessWireSchema = z.object({
  action: z.enum(["clarify", "convene"]),
  decisionQuestion: z.string().trim().min(1).max(600).nullable(),
  missingInformation: z.array(z.string().trim().min(1).max(160)).max(2),
  reason: z.string().trim().min(1).max(240).regex(/[.!?]$/),
  confidence: z.number().min(0).max(1),
}).strict();

export class VoiceReadinessAssessor {
  constructor(private readonly runtime: AgentRuntime, private readonly model: string) {}

  async assess(request: VoiceReadinessRequest, signal?: AbortSignal, onTelemetry?: (telemetry?: AgentRunTelemetry) => void): Promise<VoiceReadinessAssessment> {
    if (isVoiceNonAnswer(request.latestTurn)) return { action: "clarify", missingInformation: ["a substantive answer to the pending clarification"], reason: "A pause or listening acknowledgement is not decision context.", confidence: 1 };
    const accumulated = [request.currentContext, ...request.completedUserTurns].join("\n").trim();
    if (explicitConvene.test(request.latestTurn) && accumulated.length >= 24) {
      return { action: "convene", missingInformation: [], reason: "The user explicitly asked to convene with decision context already available.", confidence: 0.99 };
    }
    try {
      const run = await this.runtime.start({
        model: this.model,
        instructions: await loadPrompt("voice-readiness"),
        input: JSON.stringify(request),
        schema: VoiceReadinessWireSchema,
        metadata: { application: "sagacity-syndicate", stage: "voice_readiness" },
        signal,
      });
      onTelemetry?.(run.telemetry);
      const wire = VoiceReadinessWireSchema.parse(run.output);
      return VoiceReadinessAssessmentSchema.parse({
        ...wire,
        ...(wire.decisionQuestion ? { decisionQuestion: wire.decisionQuestion } : {}),
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      return { action: "clarify", missingInformation: ["the decision or choice to examine"], reason: "The accumulated voice context does not yet identify a clear decision.", confidence: 0.55 };
    }
  }
}
