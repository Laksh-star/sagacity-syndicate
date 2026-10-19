import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FoundryVoiceTransport } from "../client/voice/foundry-transport.js";
import { OpenAIVoiceTransport } from "../client/voice/openai-transport.js";
import { createVoiceTransport } from "../client/voice/transport-factory.js";

describe("client voice transport boundary", () => {
  it("selects one provider transport behind the shared contract", () => {
    const sink = () => undefined;
    expect(createVoiceTransport("openai", sink)).toBeInstanceOf(OpenAIVoiceTransport);
    expect(createVoiceTransport("foundry", sink)).toBeInstanceOf(FoundryVoiceTransport);
  });

  it("keeps raw provider protocols out of the shared live session", () => {
    const shared = readFileSync(new URL("../client/voice/live-session.ts", import.meta.url), "utf8");
    expect(shared).not.toContain("session.input_transcript.delta");
    expect(shared).not.toContain("conversation.item.create");
    expect(shared).not.toContain("/api/live/session");
    expect(shared).not.toContain("/api/live/foundry");
    expect(shared).not.toMatch(/if \(this\.provider/u);
  });

  it("keeps each wire protocol in its provider transport", () => {
    const openai = readFileSync(new URL("../client/voice/openai-transport.ts", import.meta.url), "utf8");
    const foundry = readFileSync(new URL("../client/voice/foundry-transport.ts", import.meta.url), "utf8");
    expect(openai).toContain("/api/live/session");
    expect(openai).toContain("session.input_transcript.delta");
    expect(openai).not.toContain("/api/live/foundry");
    expect(foundry).toContain("/api/live/foundry");
    expect(foundry).toContain("conversation.item.create");
    expect(foundry).not.toContain("/api/live/session");
  });
});
