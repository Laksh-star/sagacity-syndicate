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
  z.object({ type: z.literal("council.result"), scroll: DecisionScrollSchema, mode: z.enum(["initial", "selective", "full", "preserved"]) }),
  z.object({ type: z.literal("council.error"), message: z.string().max(500) }),
  z.object({ type: z.literal("council.interrupted"), reason: z.string().max(500) }),
]);
export type CouncilEvent = z.infer<typeof CouncilEventSchema>;

export const jsonSchemaFor = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7" });
