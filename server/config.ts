import "dotenv/config";
import { normalizeAllowedOrigins } from "./origin-policy.js";

export type ProviderName = "openai" | "foundry";

export type AppConfig = {
  voiceProvider: ProviderName;
  foundryVoiceEndpoint?: string;
  foundryVoiceModel: string;
  allowedOrigins: string[];
  councilProvider: ProviderName;
  foundryEndpoint?: string;
  foundryApiKey?: string;
  port: number;
  apiKey?: string;
  liveModel: string;
  councilModel: string;
  synthesisModel: string;
  mockCouncil: boolean;
};

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function provider(name: "COUNCIL_PROVIDER" | "VOICE_PROVIDER", value: string | undefined): ProviderName {
  const candidate = optional(value) ?? "openai";
  if (candidate !== "openai" && candidate !== "foundry") {
    throw new Error(`${name} must be either "openai" or "foundry"; received "${candidate}".`);
  }
  return candidate;
}

function explicitBoolean(name: string, value: string | undefined): boolean | undefined {
  const candidate = optional(value);
  if (candidate === undefined) return undefined;
  if (candidate === "true") return true;
  if (candidate === "false") return false;
  throw new Error(`${name} must be either "true" or "false"; received "${candidate}".`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const councilProvider = provider("COUNCIL_PROVIDER", env.COUNCIL_PROVIDER);
  const voiceProvider = provider("VOICE_PROVIDER", env.VOICE_PROVIDER);
  const apiKey = optional(env.OPENAI_API_KEY);
  const foundryApiKey = optional(env.FOUNDRY_API_KEY);
  const foundryEndpoint = optional(env.FOUNDRY_OPENAI_ENDPOINT);
  const foundryVoiceEndpoint = optional(env.FOUNDRY_VOICE_ENDPOINT);
  const foundryCouncilDeployment = optional(env.FOUNDRY_COUNCIL_DEPLOYMENT);
  const foundrySynthesisDeployment = optional(env.FOUNDRY_SYNTHESIS_DEPLOYMENT);
  const configuredMock = explicitBoolean("MOCK_COUNCIL", env.MOCK_COUNCIL);
  const mockCouncil = configuredMock ?? (councilProvider === "openai" && !apiKey);

  if (!mockCouncil && councilProvider === "openai" && !apiKey) {
    throw new Error("OpenAI council requires OPENAI_API_KEY when MOCK_COUNCIL is false.");
  }
  if (!mockCouncil && councilProvider === "foundry") {
    const missing = [
      !foundryEndpoint && "FOUNDRY_OPENAI_ENDPOINT",
      !foundryApiKey && "FOUNDRY_API_KEY",
      !foundryCouncilDeployment && "FOUNDRY_COUNCIL_DEPLOYMENT",
      !foundrySynthesisDeployment && "FOUNDRY_SYNTHESIS_DEPLOYMENT",
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(`Foundry council requires ${missing.join(", ")} when MOCK_COUNCIL is false.`);
    }
  }
  if (voiceProvider === "foundry") {
    const missing = [
      !foundryVoiceEndpoint && "FOUNDRY_VOICE_ENDPOINT",
      !foundryApiKey && "FOUNDRY_API_KEY",
    ].filter(Boolean);
    if (missing.length) throw new Error(`Foundry voice requires ${missing.join(", ")}.`);
    try {
      const endpoint = new URL(foundryVoiceEndpoint as string);
      if (endpoint.protocol !== "https:") throw new Error("not HTTPS");
    } catch {
      throw new Error("FOUNDRY_VOICE_ENDPOINT must be a valid HTTPS URL.");
    }
  }

  const councilModel = councilProvider === "foundry"
    ? foundryCouncilDeployment ?? "mock-council"
    : optional(env.OPENAI_COUNCIL_MODEL) ?? "gpt-6-astra";
  const synthesisModel = councilProvider === "foundry"
    ? foundrySynthesisDeployment ?? "mock-synthesis"
    : optional(env.OPENAI_SYNTHESIS_MODEL) ?? "gpt-6-astra";

  return {
    voiceProvider,
    foundryVoiceEndpoint,
    foundryVoiceModel: optional(env.FOUNDRY_VOICE_MODEL) ?? "gpt-realtime",
    allowedOrigins: normalizeAllowedOrigins((env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,http://127.0.0.1:8787")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)),
    councilProvider,
    foundryEndpoint,
    foundryApiKey,
    port: Number(env.PORT ?? 8787),
    apiKey,
    liveModel: optional(env.OPENAI_LIVE_MODEL) ?? "gpt-live-1",
    councilModel,
    synthesisModel,
    mockCouncil,
  };
}

export const config = loadConfig();
