import { FoundryVoiceTransport } from "./foundry-transport.js";
import { OpenAIVoiceTransport } from "./openai-transport.js";
import type { VoiceProvider, VoiceTransport, VoiceTransportSink } from "./provider-transport.js";

export function createVoiceTransport(provider: VoiceProvider, sink: VoiceTransportSink): VoiceTransport {
  return provider === "foundry"
    ? new FoundryVoiceTransport(sink)
    : new OpenAIVoiceTransport(sink);
}
