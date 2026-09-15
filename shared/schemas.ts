import { z } from "zod";

export const AgentNameSchema = z.enum(["forethought", "quickaction", "examiner"]);
export type AgentName = z.infer<typeof AgentNameSchema>;

const short = (max: number) => z.string().trim().min(1).max(max);
const complete = (max: number) => short(max).regex(/[.!?]$/, "Write a complete sentence ending in punctuation.");

export const SpecialistOpinionSchema = z.object({
  phase: z.literal("opinion"),
  agent: AgentNameSchema,
  stance: complete(240),
  observations: z.array(complete(220)).min(1).max(4),
  recommendation: complete(300),
  confidence: z.number().min(0).max(1),
  uncertainties: z.array(complete(180)).max(3),
}).strict();
export type SpecialistOpinion = z.infer<typeof SpecialistOpinionSchema>;

export const CritiqueSchema = z.object({
  phase: z.literal("critique"),
  critic: AgentNameSchema,
  targetAgents: z.array(AgentNameSchema).min(1).max(2),
  agreements: z.array(complete(180)).max(2),
  challenges: z.array(complete(220)).min(1).max(3),
  revisionAdvice: complete(280),
  severity: z.enum(["low", "medium", "high"]),
}).strict();
export type Critique = z.infer<typeof CritiqueSchema>;

export const SpecialistTurnSchema = z.discriminatedUnion("phase", [SpecialistOpinionSchema, CritiqueSchema]);
export type SpecialistTurn = z.infer<typeof SpecialistTurnSchema>;

export const ImpactRouteSchema = z.object({
  material: z.boolean(),
  affectedAgents: z.array(AgentNameSchema).max(3),
  reason: complete(280),
  preservedFields: z.array(z.enum([
    "decision", "rationale", "forethought", "quickaction", "examiner", "triggerToReconvene", "confidence",
  ])).max(7),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((route, ctx) => {
  if (route.material && route.affectedAgents.length === 0) {
    ctx.addIssue({ code: "custom", message: "Material changes must affect at least one agent." });
  }
  if (!route.material && route.affectedAgents.length > 0) {
    ctx.addIssue({ code: "custom", message: "Non-material changes cannot affect agents." });
  }
  if (new Set(route.affectedAgents).size !== route.affectedAgents.length) {
    ctx.addIssue({ code: "custom", message: "Affected agents must be unique." });
  }
});
export type ImpactRoute = z.infer<typeof ImpactRouteSchema>;

export const DecisionScrollSchema = z.object({
  decision: complete(500),
  rationale: complete(900),
  forethought: complete(300),
  quickaction: complete(300),
  examiner: complete(300),
  triggerToReconvene: complete(300),
  confidence: z.number().min(0).max(1),
}).strict();
export type DecisionScroll = z.infer<typeof DecisionScrollSchema>;

export const CouncilContributionSchema = z.object({
  agent: AgentNameSchema,
  openedWith: complete(300),
  challenged: complete(300),
  survived: complete(300),
}).strict();
export type CouncilContribution = z.infer<typeof CouncilContributionSchema>;

export const CouncilCritiqueEdgeSchema = z.object({
  critic: AgentNameSchema,
  target: AgentNameSchema,
  challenge: complete(220),
  severity: z.enum(["low", "medium", "high"]),
}).strict().superRefine((edge, ctx) => {
  if (edge.critic === edge.target) ctx.addIssue({ code: "custom", message: "A specialist cannot critique itself." });
});
export type CouncilCritiqueEdge = z.infer<typeof CouncilCritiqueEdgeSchema>;

export const CouncilTraceSchema = z.object({
  contributions: z.object({
    forethought: CouncilContributionSchema,
    quickaction: CouncilContributionSchema,
    examiner: CouncilContributionSchema,
  }).strict(),
  critiqueEdges: z.array(CouncilCritiqueEdgeSchema).max(6),
}).strict().superRefine((trace, ctx) => {
  for (const agent of AgentNameSchema.options) {
    if (trace.contributions[agent].agent !== agent) {
      ctx.addIssue({ code: "custom", message: `Contribution key ${agent} must match its agent identity.` });
    }
  }
});
export type CouncilTrace = z.infer<typeof CouncilTraceSchema>;

export const VoiceBriefSchema = z.object({
  recommendation: complete(280),
  why: complete(320),
  keyTension: complete(260),
  immediateNextStep: complete(260),
  reconveneTrigger: complete(240).optional(),
}).strict().superRefine((brief, ctx) => {
  const words = Object.values(brief).filter(Boolean).join(" ").trim().split(/\s+/u).length;
  if (words > 120) ctx.addIssue({ code: "custom", message: "A Voice Brief must contain no more than 120 words." });
});
export type VoiceBrief = z.infer<typeof VoiceBriefSchema>;

export const VoiceInterruptionAssessmentSchema = z.object({
  material: z.boolean(),
  changedConstraint: short(400).optional(),
  reason: complete(280),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((assessment, ctx) => {
  if (assessment.material && !assessment.changedConstraint) {
    ctx.addIssue({ code: "custom", message: "A material interruption must state the changed constraint." });
  }
});
export type VoiceInterruptionAssessment = z.infer<typeof VoiceInterruptionAssessmentSchema>;

export const VoiceInterruptionRequestSchema = z.object({
  utterance: short(1_000),
  currentContext: short(8_000),
  phase: z.enum(["deliberating", "completed"]),
  currentScroll: DecisionScrollSchema.optional(),
}).strict();
export type VoiceInterruptionRequest = z.infer<typeof VoiceInterruptionRequestSchema>;

export const VoiceReadinessAssessmentSchema = z.object({
  action: z.enum(["clarify", "convene"]),
  missingInformation: z.array(short(160)).max(2),
  reason: complete(240),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((assessment, ctx) => {
  if (assessment.action === "convene" && assessment.missingInformation.length) {
    ctx.addIssue({ code: "custom", message: "A ready decision cannot list missing information." });
  }
  if (assessment.action === "clarify" && assessment.missingInformation.length === 0) {
    ctx.addIssue({ code: "custom", message: "A clarification assessment must identify missing information." });
  }
});
export type VoiceReadinessAssessment = z.infer<typeof VoiceReadinessAssessmentSchema>;

export const VoiceReadinessRequestSchema = z.object({
  latestTurn: short(1_000),
  currentContext: short(8_000),
  completedUserTurns: z.array(short(1_000)).min(1).max(8),
}).strict();
export type VoiceReadinessRequest = z.infer<typeof VoiceReadinessRequestSchema>;

export const LiveDiagnosticNameSchema = z.enum([
  "live.session.started", "live.user_turn.started", "live.user_turn.completed",
  "live.delegation.created", "live.delegation.fallback", "live.delegation.bound_to_revision", "live.readiness.assessed", "council.started",
  "council.phase", "council.completed", "live.thinking.sent", "live.commentary.sent",
  "live.instructions.sent", "live.commentary.acknowledged", "live.thinking.acknowledged", "live.instructions.acknowledged", "live.interruption.received",
  "live.interruption.materiality", "council.cancel.requested", "council.stale_result.discarded",
  "live.session.closed", "live.error",
  "live.playback.started", "live.playback.suppressed", "live.playback.resumed", "live.playback.stale_audio.discarded",
]);
export type LiveDiagnosticName = z.infer<typeof LiveDiagnosticNameSchema>;

export const LiveDiagnosticEventSchema = z.object({
  event: LiveDiagnosticNameSchema,
  sessionId: z.string().trim().max(120).optional(),
  delegationId: z.string().trim().max(120).optional(),
  conversationRevision: z.number().int().nonnegative().optional(),
  deliberationRevision: z.number().int().nonnegative().optional(),
  detail: z.string().trim().max(500).optional(),
}).strict();
export type LiveDiagnosticEvent = z.infer<typeof LiveDiagnosticEventSchema>;

export const DeliberationRequestSchema = z.object({
  deliberationId: z.string().trim().min(1).max(100).optional(),
  conversationRevision: z.number().int().nonnegative(),
  deliberationRevision: z.number().int().nonnegative(),
  context: short(8_000),
  changedConstraint: z.string().trim().min(1).max(1_000).optional(),
  previousScroll: DecisionScrollSchema.optional(),
}).strict();
export type DeliberationRequest = z.infer<typeof DeliberationRequestSchema>;

export const CouncilPhaseSchema = z.enum([
  "idle", "clarifying", "ready", "routing", "independent", "cross_examining",
  "synthesizing", "completed", "interrupted", "failed",
]);
export type CouncilPhase = z.infer<typeof CouncilPhaseSchema>;

export const AgentCardStateSchema = z.enum(["waiting", "thinking", "challenging", "done", "error"]);
export type AgentCardState = z.infer<typeof AgentCardStateSchema>;

export const CouncilEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("council.phase"), phase: CouncilPhaseSchema }),
  z.object({ type: z.literal("agent.state"), agent: AgentNameSchema, state: AgentCardStateSchema }),
  z.object({ type: z.literal("router.result"), route: ImpactRouteSchema }),
  z.object({ type: z.literal("council.result"), scroll: DecisionScrollSchema, trace: CouncilTraceSchema.optional(), mode: z.enum(["initial", "selective", "full", "preserved"]) }),
  z.object({ type: z.literal("council.error"), message: z.string().max(500) }),
  z.object({ type: z.literal("council.interrupted"), reason: z.string().max(500) }),
]);
export type CouncilEvent = z.infer<typeof CouncilEventSchema>;

export const jsonSchemaFor = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7" });
