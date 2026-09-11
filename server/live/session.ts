import OpenAI from "openai";
import { config } from "../config.js";
import { loadPrompt } from "../prompts.js";

export async function createLiveSession(sdp: string) {
  if (!config.apiKey) throw new Error("Set OPENAI_API_KEY to enable GPT-Live.");
  const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0 });
  return client.live.create({
    session: {
      model: config.liveModel,
      instructions: await loadPrompt("sutradhara"),
      delegation: { type: "client" },
      audio: { output: { voice: "cedar" } },
    },
    transport: { type: "webrtc", sdp },
  });
}
