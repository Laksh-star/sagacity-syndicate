import {
  CouncilEventSchema,
  VoiceInterruptionAssessmentSchema,
  VoiceReadinessAssessmentSchema,
  type CouncilEvent,
  type DeliberationRequest,
  type LiveDiagnosticEvent,
  type VoiceInterruptionAssessment,
  type VoiceInterruptionRequest,
  type VoiceReadinessAssessment,
  type VoiceReadinessRequest,
} from "../shared/schemas";

export async function streamDeliberation(
  request: DeliberationRequest,
  onEvent: (event: CouncilEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/deliberations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Council request failed (${response.status}).`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line) as unknown;
      const parsed = CouncilEventSchema.safeParse(raw);
      if (parsed.success) onEvent(parsed.data);
    }
    if (done) break;
  }
}

export async function interruptDeliberation(id: string, nextConversationRevision: number): Promise<void> {
  await fetch(`/api/deliberations/${encodeURIComponent(id)}/interrupt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nextConversationRevision, reason: "User added or changed a constraint." }),
  });
}

export async function assessVoiceInterruption(request: VoiceInterruptionRequest): Promise<VoiceInterruptionAssessment> {
  const response = await fetch("/api/voice/interruption-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Voice interruption assessment failed (${response.status}).`);
  return VoiceInterruptionAssessmentSchema.parse(await response.json());
}

export async function assessVoiceReadiness(request: VoiceReadinessRequest): Promise<VoiceReadinessAssessment> {
  const response = await fetch("/api/voice/readiness-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Voice readiness assessment failed (${response.status}).`);
  return VoiceReadinessAssessmentSchema.parse(await response.json());
}

export function recordLiveDiagnostic(event: LiveDiagnosticEvent): void {
  void fetch("/api/live/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
