import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FoundryAgentRuntime } from "../server/agents/foundry-runtime.js";
import { AgentOutputError } from "../server/agents/runtime.js";
import { DecisionScrollOutputSchema, SpecialistOpinionSchema } from "../shared/schemas.js";
const schema = z.object({ answer: z.string() });
const done = (id: string, text = '{"answer":"yes"}') => ({ id, status: "completed", output_text: text,
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 2 }, output_tokens_details: { reasoning_tokens: 1 } } });
const mock = () => ({ create: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() });
const runtime = (responses: ReturnType<typeof mock>) => new FoundryAgentRuntime({ responses } as unknown as OpenAI, 0, 1_000);
describe("Foundry runtime", () => {
  it("runs background responses and maps usage without stream dependence", async () => {
    const r = mock(); r.create.mockResolvedValue({ id: "r1", status: "queued" }); r.retrieve.mockResolvedValue(done("r1"));
    const onSessionId = vi.fn(); const result = await runtime(r).start({ model: "deployment", instructions: "instructions", input: "input", schema, onSessionId });
    expect(result.output).toEqual({ answer: "yes" }); expect(result.telemetry?.usage?.cachedInputTokens).toBe(2);
    expect(onSessionId).toHaveBeenCalledWith("r1"); expect(r.create.mock.calls[0][0]).toMatchObject({
      background: true, store: true, stream: false, text: { format: { type: "json_schema", strict: true } },
    });
  });
  it("resends instructions, chains the latest response and publishes new ids", async () => {
    const r = mock(); r.create.mockResolvedValueOnce(done("r1")).mockResolvedValueOnce(done("r2")); const agent = runtime(r);
    await agent.start({ model: "deployment", instructions: "keep", input: "one", schema }); const onSessionId = vi.fn();
    const result = await agent.continue({ sessionId: "r1", input: "two", schema, onSessionId });
    expect(result.sessionId).toBe("r2"); expect(onSessionId).toHaveBeenCalledWith("r2");
    expect(r.create.mock.calls[1][0]).toMatchObject({ instructions: "keep", previous_response_id: "r1" });
  });
  it("bounds schema repair to two turns and sums usage", async () => {
    const r = mock(); r.create.mockResolvedValueOnce(done("r1", "bad")).mockResolvedValueOnce(done("r2"));
    const result = await runtime(r).start({ model: "d", instructions: "i", input: "q", schema });
    expect(result.telemetry).toMatchObject({ repaired: true, usage: { totalTokens: 30 } }); expect(r.create).toHaveBeenCalledTimes(2);
    expect(r.create.mock.calls[1][0].input).toContain("Fix these validation errors exactly");
    const broken = mock(); broken.create.mockResolvedValueOnce(done("r1", "bad")).mockResolvedValueOnce(done("r2", "bad")).mockResolvedValueOnce(done("r3", "bad"));
    await expect(runtime(broken).start({ model: "d", instructions: "i", input: "q", schema })).rejects.toBeInstanceOf(AgentOutputError);
    expect(broken.create).toHaveBeenCalledTimes(3);
  });
  it("cancels in-flight work with idempotency headers and leaves completed work alone", async () => {
    const r = mock(); r.retrieve.mockResolvedValueOnce({ status: "in_progress" }).mockResolvedValueOnce(done("r1"));
    const agent = runtime(r); await agent.cancel("r1", "key"); await agent.cancel("r1", "key");
    expect(r.cancel).toHaveBeenCalledTimes(1); expect(r.cancel).toHaveBeenCalledWith("r1", expect.objectContaining({ headers: { "Idempotency-Key": "key" } }));
  });
  it("fails explicitly on lost continuation context", async () => {
    await expect(runtime(mock()).continue({ sessionId: "missing", input: "q", schema })).rejects.toThrow("rebuild the council");
  });
  it("maps unavailable and terminal statuses", async () => {
    const r = mock(); r.retrieve.mockResolvedValueOnce({ status: "queued" }).mockResolvedValueOnce(done("r1")).mockResolvedValueOnce({ status: "cancelled" }).mockRejectedValueOnce(new Error("offline")); const agent = runtime(r);
    expect(await agent.status("r")).toBe("in_progress"); expect(await agent.status("r")).toBe("idle"); expect(await agent.status("r")).toBe("failed"); expect(await agent.status("r")).toBe("unavailable");
  });
});

describe("Foundry cancellation and failures", () => {
  it("cancels background work after caller abort without reusing aborted signal", async () => {
    const r = mock(); const controller = new AbortController();
    r.create.mockResolvedValue({ id: "r1", status: "in_progress" });
    r.retrieve.mockResolvedValue({ id: "r1", status: "in_progress" });
    r.cancel.mockResolvedValue({ status: "cancelled" });
    const operation = runtime(r).start({ model: "d", instructions: "i", input: "q", schema, signal: controller.signal,
      onSessionId: () => controller.abort(new Error("superseded")) });
    await expect(operation).rejects.toThrow("superseded"); expect(r.cancel).toHaveBeenCalledTimes(1);
    expect(r.cancel.mock.calls[0][1].signal).toBeUndefined();
  });
  it("surfaces failed provider state without schema repair or duplicate creation", async () => {
    const r = mock(); r.create.mockResolvedValue({ id: "r1", status: "failed", error: { message: "blocked" } });
    r.retrieve.mockResolvedValue({ status: "failed" });
    await expect(runtime(r).start({ model: "d", instructions: "i", input: "q", schema })).rejects.toMatchObject({ providerStatus: "failed" });
    expect(r.create).toHaveBeenCalledTimes(1);
  });
});

it("compresses a second oversize result with the full JSON and no inherited response chain", async () => {
 const small = z.object({ answer: z.string().max(20) });
 const r = mock(); const long = JSON.stringify({answer: "A complete recommendation with preserved conditions."});
 r.create.mockResolvedValueOnce(done("a",long)).mockResolvedValueOnce(done("b",long)).mockResolvedValueOnce(done("c",'{"answer":"Choose if safe."}'));
 const result = await runtime(r).start({model:"d",instructions:"i",input:"q",schema:small});
 expect(result.output.answer).toBe("Choose if safe.");expect(result.telemetry?.usage?.totalTokens).toBe(45);
 expect(r.create.mock.calls[2][0].input).toContain(long);expect(r.create.mock.calls[2][0].previous_response_id).toBeUndefined();
 expect(r.create.mock.calls[0][0].text.verbosity).toBe("low");
});

it("recovers complete bounded specialist text after both provider repairs remain oversized", async () => {
 const firstStance="Prioritize relationship-led channels for durable consulting work.";
 const secondStance="Use marketplaces only as a time-boxed bridge while the owned pipeline develops, and measure whether they produce acceptable margins and repeat business under realistic delivery conditions.";
 const firstRecommendation="Run a four-week channel comparison with the same offer, a fixed weekly time budget, and lead-quality, close-rate, and revenue-per-hour measures.";
 const secondRecommendation="After the comparison, concentrate effort on the channel producing the strongest qualified pipeline while retaining the other only when it fills a clearly defined short-term gap.";
 const invalid=JSON.stringify({phase:"opinion",agent:"examiner",stance:`${firstStance} ${secondStance}`,observations:["Channel economics should determine the choice."],recommendation:`${firstRecommendation} ${secondRecommendation}`,confidence:.78,uncertainties:[]});
 expect(JSON.parse(invalid).stance.length).toBeGreaterThan(240);expect(JSON.parse(invalid).recommendation.length).toBeGreaterThan(300);
 const r=mock();r.create.mockResolvedValueOnce(done("r1",invalid)).mockResolvedValueOnce(done("r2",invalid)).mockResolvedValueOnce(done("r3",invalid));
 const result=await runtime(r).start({model:"d",instructions:"i",input:"q",schema:SpecialistOpinionSchema});
 expect(result.output.stance).toBe(firstStance);expect(result.output.recommendation).toBe(firstRecommendation);
 expect(result.telemetry).toMatchObject({repaired:true,recovered:true});expect(r.create).toHaveBeenCalledTimes(3);
});

it("never recovers identity or enum violations as if they were length-only errors", async () => {
 const invalid=JSON.stringify({phase:"opinion",agent:"intruder",stance:"Proceed carefully.",observations:["Risk exists."],recommendation:"Pilot first.",confidence:.7,uncertainties:[]});
 const r=mock();r.create.mockResolvedValueOnce(done("r1",invalid)).mockResolvedValueOnce(done("r2",invalid)).mockResolvedValueOnce(done("r3",invalid));
 await expect(runtime(r).start({model:"d",instructions:"i",input:"q",schema:SpecialistOpinionSchema})).rejects.toBeInstanceOf(AgentOutputError);
});

it("recovers only obvious mechanical prose damage after bounded repairs", async () => {
 const invalid=JSON.stringify({
   decision:"Prioritize LinkedIn for relationship-led work with explicit metrics and .",
   rationale:"LinkedIn better supports higher-value consulting relationships.",
   forethought:"Protect against an overreliance on one channel.",
   quickaction:"Run a six-week comparison and track deal size,.",
   examiner:"Validate whether the target buyer actually uses the chosen channel.",
   triggerToReconvene:"Review after six weeks or ten qualified conversations.",confidence:.78,
 });
 const r=mock();r.create.mockResolvedValueOnce(done("r1",invalid)).mockResolvedValueOnce(done("r2",invalid)).mockResolvedValueOnce(done("r3",invalid));
 const result=await runtime(r).start({model:"d",instructions:"i",input:"q",schema:DecisionScrollOutputSchema});
 expect(result.output.decision).toBe("Prioritize LinkedIn for relationship-led work with explicit metrics.");
 expect(result.output.quickaction).toBe("Run a six-week comparison and track deal size.");
 expect(result.telemetry).toMatchObject({repaired:true,recovered:true});
});

it("uses completion headroom instead of accepting cap-shaped semantic truncation", async () => {
 const truncated="Run an 8-week split test. Weeks 1–2: polish LinkedIn profile, publish four value posts, and send 20 targeted outreach messages. Weeks 1–8: submit 8–12 tailored marketplace proposals. Track weekly leads, meetings, closed revenue, and gross margin. Decision rule: after 8 weeks, choose the channelthat.";
 expect(truncated).toHaveLength(300);
 const invalid=JSON.stringify({phase:"opinion",agent:"quickaction",stance:"Run a bounded channel test.",observations:["Compare qualified meetings and gross margin."],recommendation:truncated,confidence:.74,uncertainties:[]});
 const r=mock();r.create.mockResolvedValueOnce(done("r1",invalid)).mockResolvedValueOnce(done("r2",invalid)).mockResolvedValueOnce(done("r3",invalid));
 const result=await runtime(r).start({model:"d",instructions:"i",input:"q",schema:SpecialistOpinionSchema});
 expect(result.output.recommendation.length).toBeLessThanOrEqual(270);
 expect(result.output.recommendation).not.toContain("channelthat");
 expect(result.output.recommendation).toMatch(/[.!?]$/u);
 expect(result.telemetry).toMatchObject({repaired:true,recovered:true});
});
