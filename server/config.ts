import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  apiKey: process.env.OPENAI_API_KEY,
  liveModel: process.env.OPENAI_LIVE_MODEL ?? "gpt-live-1",
  councilModel: process.env.OPENAI_COUNCIL_MODEL ?? "gpt-6-astra",
  synthesisModel: process.env.OPENAI_SYNTHESIS_MODEL ?? "gpt-6-astra",
  mockCouncil: process.env.MOCK_COUNCIL === "true" || !process.env.OPENAI_API_KEY,
};
