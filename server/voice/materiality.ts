import {
  VoiceInterruptionAssessmentSchema,
  type VoiceInterruptionAssessment,
  type VoiceInterruptionRequest,
} from "../../shared/schemas.js";
import { obviousNonMaterialAssessment } from "../../shared/voice-policy.js";
import type { AgentRuntime } from "../agents/runtime.js";
import { loadPrompt } from "../prompts.js";
import { z } from "zod";

// OpenAI strict structured outputs require every key to be present. The public
// application type keeps changedConstraint optional, while the provider wire
// schema uses an explicit null for non-material utterances.
const VoiceInterruptionWireSchema = z.object({
  material: z.boolean(),
  changedConstraint: z.string().trim().min(1).max(400).nullable(),
  reason: z.string().trim().min(1).max(280).regex(/[.!?]$/),
  confidence: z.number().min(0).max(1),
}).strict();

export class VoiceMaterialityAssessor {
  constructor(private readonly runtime: AgentRuntime, private readonly model: string) {}

  async assess(request: VoiceInterruptionRequest): Promise<VoiceInterruptionAssessment> {
    const obvious = obviousNonMaterialAssessment(request.utterance, Boolean(request.currentScroll));
    if (obvious) return obvious;
    try {
      const run = await this.runtime.start({
        model: this.model,
        instructions: await loadPrompt("voice-materiality"),
        input: JSON.stringify(request),
        schema: VoiceInterruptionWireSchema,
      });
      const wire = VoiceInterruptionWireSchema.parse(run.output);
      return VoiceInterruptionAssessmentSchema.parse({
        material: wire.material,
        ...(wire.changedConstraint ? { changedConstraint: wire.changedConstraint } : {}),
        reason: wire.reason,
        confidence: wire.confidence,
      });
    } catch {
      return {
        material: false,
        reason: "The possible change was ambiguous, so the current council work is preserved until the user clarifies it.",
        confidence: 0,
      };
    }
  }
}
