import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider error boundaries", () => {
  it.each([
    "../client/App.tsx",
    "../client/api.ts",
    "../client/components/VoiceControl.tsx",
    "../client/voice/live-session.ts",
    "../client/voice/openai-transport.ts",
    "../client/voice/foundry-transport.ts",
  ])("keeps shared UI errors provider-neutral in %s", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).not.toMatch(/GPT-Live|Foundry voice/u);
  });

  it("retains OpenAI-specific wording inside the OpenAI transport", () => {
    const source = readFileSync(new URL("../server/live/session.ts", import.meta.url), "utf8");
    expect(source).toContain("GPT-Live");
  });

  it("retains Foundry-specific wording inside the Foundry transport", () => {
    const source = readFileSync(new URL("../server/live/foundry-session.ts", import.meta.url), "utf8");
    expect(source).toContain("Voice Live upstream");
  });
});
