import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/config.js";

const openAI = {
  COUNCIL_PROVIDER: "openai",
  VOICE_PROVIDER: "openai",
  MOCK_COUNCIL: "false",
  OPENAI_API_KEY: "test-openai-key",
};

const foundry = {
  COUNCIL_PROVIDER: "foundry",
  VOICE_PROVIDER: "foundry",
  MOCK_COUNCIL: "false",
  FOUNDRY_OPENAI_ENDPOINT: "https://example.invalid/openai/v1",
  FOUNDRY_API_KEY: "test-foundry-key",
  FOUNDRY_COUNCIL_DEPLOYMENT: "foundry-council",
  FOUNDRY_SYNTHESIS_DEPLOYMENT: "foundry-synthesis",
  FOUNDRY_VOICE_ENDPOINT: "https://example.invalid",
};

describe("provider configuration", () => {
  it("uses only OpenAI model variables for an OpenAI council", () => {
    const config = loadConfig({
      ...openAI,
      OPENAI_COUNCIL_MODEL: "openai-council",
      OPENAI_SYNTHESIS_MODEL: "openai-synthesis",
      FOUNDRY_COUNCIL_DEPLOYMENT: "wrong-provider-council",
      FOUNDRY_SYNTHESIS_DEPLOYMENT: "wrong-provider-synthesis",
    });

    expect(config).toMatchObject({
      councilProvider: "openai",
      voiceProvider: "openai",
      councilModel: "openai-council",
      synthesisModel: "openai-synthesis",
      mockCouncil: false,
    });
  });

  it("uses only Foundry deployment variables for a Foundry council", () => {
    const config = loadConfig({
      ...foundry,
      OPENAI_COUNCIL_MODEL: "wrong-provider-council",
      OPENAI_SYNTHESIS_MODEL: "wrong-provider-synthesis",
    });

    expect(config).toMatchObject({
      councilProvider: "foundry",
      voiceProvider: "foundry",
      councilModel: "foundry-council",
      synthesisModel: "foundry-synthesis",
      mockCouncil: false,
    });
  });

  it("supports intentional mixed council and voice providers", () => {
    expect(loadConfig({
      ...openAI,
      VOICE_PROVIDER: "foundry",
      FOUNDRY_API_KEY: "test-foundry-key",
      FOUNDRY_VOICE_ENDPOINT: "https://example.invalid",
    })).toMatchObject({
      councilProvider: "openai",
      voiceProvider: "foundry",
    });
    expect(loadConfig({ ...foundry, VOICE_PROVIDER: "openai" })).toMatchObject({
      councilProvider: "foundry",
      voiceProvider: "openai",
    });
  });

  it.each([
    ["COUNCIL_PROVIDER", { ...openAI, COUNCIL_PROVIDER: "azure" }],
    ["VOICE_PROVIDER", { ...openAI, VOICE_PROVIDER: "realtime" }],
  ])("rejects an unsupported %s value", (name, env) => {
    expect(() => loadConfig(env)).toThrow(`${name} must be either "openai" or "foundry"`);
  });

  it("rejects an invalid mock flag", () => {
    expect(() => loadConfig({ ...openAI, MOCK_COUNCIL: "yes" })).toThrow("MOCK_COUNCIL must be either");
  });

  it("fails an explicitly live OpenAI council without an OpenAI key", () => {
    expect(() => loadConfig({ COUNCIL_PROVIDER: "openai", MOCK_COUNCIL: "false" })).toThrow("OPENAI_API_KEY");
  });

  it("fails an explicitly live Foundry council with incomplete settings", () => {
    expect(() => loadConfig({ COUNCIL_PROVIDER: "foundry", MOCK_COUNCIL: "false" })).toThrow("FOUNDRY_OPENAI_ENDPOINT");
  });

  it("fails fast when Foundry voice is missing its endpoint or shared key", () => {
    expect(() => loadConfig({ VOICE_PROVIDER: "foundry", MOCK_COUNCIL: "true", FOUNDRY_API_KEY: "test-foundry-key" }))
      .toThrow("FOUNDRY_VOICE_ENDPOINT");
    expect(() => loadConfig({ VOICE_PROVIDER: "foundry", MOCK_COUNCIL: "true", FOUNDRY_VOICE_ENDPOINT: "https://example.invalid" }))
      .toThrow("FOUNDRY_API_KEY");
  });

  it("fails fast when the Foundry voice endpoint is not a valid HTTPS URL", () => {
    expect(() => loadConfig({
      VOICE_PROVIDER: "foundry",
      MOCK_COUNCIL: "true",
      FOUNDRY_API_KEY: "test-foundry-key",
      FOUNDRY_VOICE_ENDPOINT: "http://example.invalid",
    })).toThrow("FOUNDRY_VOICE_ENDPOINT must be a valid HTTPS URL");
  });

  it("preserves keyless local mock startup while still validating providers", () => {
    expect(loadConfig({})).toMatchObject({ councilProvider: "openai", voiceProvider: "openai", mockCouncil: true });
    expect(() => loadConfig({ MOCK_COUNCIL: "true", VOICE_PROVIDER: "unknown" })).toThrow("VOICE_PROVIDER");
  });
});
