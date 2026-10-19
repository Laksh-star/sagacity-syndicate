import { describe, expect, it, vi } from "vitest";
import { moderatedFoundryResponse } from "../server/live/foundry-session.js";
import { FoundryVoiceTransport } from "../client/voice/foundry-transport.js";
import { LiveVoiceSession } from "../client/voice/live-session.js";
import { LivePlaybackController } from "../client/voice/playback-controller.js";
function setup() {
  const sent: Array<Record<string, any>> = [];
  const session = new LiveVoiceSession();
  const output = { muted: false };
  const transport = new FoundryVoiceTransport((event) => {
    (session as unknown as { handleTransportEvent: (value: typeof event) => void }).handleTransportEvent(event);
  });
  Object.assign(transport, { ready: true, relay: { readyState: 1, send: (value: string) => sent.push(JSON.parse(value)) } });
  Object.assign(session, {
    transport,
    ready: true,
    playback: new LivePlaybackController(output),
    stream: { getAudioTracks: () => [{ enabled: false }] },
  });
  const handle = (event: object) => transport.handleEvent(event as Parameters<typeof transport.handleEvent>[0]);
  return { session, transport, sent, handle, output };
}
describe("Foundry voice adapter", () => {
  it("waits for item acknowledgement before briefing, never speaks prompt text as a script", () => {
    const { session, sent, handle } = setup(); const acks: unknown[] = [];
    session.addEventListener("append.acknowledged", (event) => acks.push((event as CustomEvent).detail));
    const id = session.appendCommentary("Paraphrase the verified recommendation conversationally.", null);
    expect(sent).toHaveLength(1); expect(acks).toHaveLength(0);
    expect(sent[0].item.role).toBe("system");
    expect(sent[0].item.id.length).toBeLessThanOrEqual(32);
    expect(sent[0].item.id).toMatch(/^item_[a-f0-9]{27}$/);
    handle({ type: "conversation.item.created", item: { id: sent[0].item.id } });
    expect(acks).toEqual([{ kind: "commentary", clientEventId: id }]);
    expect(sent[1]).toEqual({ type: "response.create", response: { instructions: "Paraphrase the verified recommendation conversationally." } });
    expect(sent[1].response.pre_generated_assistant_message).toBeUndefined();
  });
  it("speaks app clarification only after accepted instruction item", () => {
    const { session, sent, handle } = setup();
    session.appendInstructions("Authoritative status: CLARIFYING. Ask one brief question about the user's goal.", null);
    expect(sent.filter(event => event.type === "response.create")).toHaveLength(0);
    handle({ type: "conversation.item.created", item: { id: sent[0].item.id } });
    expect(sent.filter(event => event.type === "response.create")).toHaveLength(1);
    expect(sent.at(-1)?.response.instructions).toContain("Ask one brief question");
  });
  it("keeps verified context quiet", () => {
    const { session, sent, handle } = setup(); session.appendThinking("Verified facts", null);
    handle({ type: "conversation.item.created", item: { id: sent[0].item.id } }); expect(sent).toHaveLength(1);
  });
  it("deduplicates final user transcription without manufacturing delegation", () => {
    const { session, sent, handle } = setup(); const turns: unknown[] = []; let delegations = 0;
    session.addEventListener("turn.completed", (event) => turns.push((event as CustomEvent).detail));
    session.addEventListener("delegation", () => delegations++);
    const event = { type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "I need to decide whether to change jobs." };
    vi.useFakeTimers(); handle(event); handle(event); vi.advanceTimersByTime(1_000); vi.useRealTimers(); expect(turns).toHaveLength(1); expect(turns[0]).toMatchObject({ role: "user", text: event.transcript, complete: true }); expect(delegations).toBe(0);
    expect(sent.filter(e => e.type === "response.create")).toHaveLength(0);
  });
  it("does not generate a competing response while material confirmation commentary is pending", () => {
    const { session, sent, handle } = setup(); session.appendInstructions("Authoritative council status: CLARIFYING. A material change awaits confirmation.", null);
    handle({ type: "conversation.item.created", item: { id: sent[0].item.id } }); expect(sent).toHaveLength(1);
  });
});

describe("Foundry voice response serialization", () => {
  it("queues spoken instructions rather than creating concurrent responses", () => {
    const { session, sent, handle } = setup();
    session.appendCommentary("first", null);
    handle({ type: "conversation.item.created", item: { id: sent[0].item.id } });
    session.appendCommentary("second", null);
    handle({ type: "conversation.item.created", item: { id: sent[2].item.id } });
    expect(sent.filter((event) => event.type === "response.create")).toHaveLength(1);
    handle({ type: "response.done" });
    expect(sent.filter((event) => event.type === "response.create")).toHaveLength(2);
    expect(sent.at(-1)?.response.instructions).toBe("second");
  });
});


describe("Foundry event ordering", () => {
  it("deduplicates event ids across relay and data channels", () => {
    const { session, handle } = setup(); const turns: unknown[] = [];
    session.addEventListener("turn", (event) => turns.push((event as CustomEvent).detail));
    handle({ type: "response.created", event_id: "created", response: { id: "r1" } });
    const event = { type: "response.audio_transcript.delta", event_id: "delta", response_id: "r1", delta: "Hello." };
    handle(event); handle(event);
    expect(turns).toHaveLength(1); expect(turns[0]).toMatchObject({ text: "Hello." });
  });
});

 it("retains moderator instructions on every provider response", () => {
  const response = moderatedFoundryResponse("Never choose products. Clarify then wait for council.", { instructions: "Ask about the user's goal.", modalities: ["audio"] });
  expect(response.instructions).toContain("Never choose products.");
  expect(response.instructions).toContain("Ask about the user's goal.");
  expect(response.modalities).toEqual(["audio"]);
});

it("speaks the exact captured question rather than generating another clarifier", () => {
 const result = moderatedFoundryResponse("moderator rules", { instructions: "CAPTURED_DECISION_CONFIRMATION: Which assistant should we choose?" });
 expect(result.instructions).toBeUndefined();
 expect(result.pre_generated_assistant_message).toMatchObject({role: "assistant", content: [{type: "text", text: "I captured the decision as: Which assistant should we choose? Is that the decision you want the council to answer?"}]});
});

it("coalesces VAD segments while held and after release into one completed utterance", () => {
 vi.useFakeTimers(); const {session,handle}=setup(); const completed: any[]=[];
 session.addEventListener("turn.completed", e=>completed.push((e as CustomEvent).detail)); session.setTalking(true);
 handle({type:"conversation.item.input_audio_transcription.completed",item_id:"seg1",transcript:"Which assistant"});
 vi.advanceTimersByTime(2000); expect(completed).toHaveLength(0);
 handle({type:"conversation.item.input_audio_transcription.completed",item_id:"seg2",transcript:"should our company adopt?"});
 session.setTalking(false); vi.advanceTimersByTime(500);
 handle({type:"conversation.item.input_audio_transcription.completed",item_id:"seg3",transcript:"For research and coding."});
 vi.advanceTimersByTime(999); expect(completed).toHaveLength(0); vi.advanceTimersByTime(1);
 expect(completed).toHaveLength(1); expect(completed[0].text).toBe("Which assistant should our company adopt? For research and coding."); vi.useRealTimers();
});
it("waits for delayed ASR rather than completing an empty release", () => {
 vi.useFakeTimers(); const {session,handle}=setup(); const completed: any[]=[];
 session.addEventListener("turn.completed",e=>completed.push((e as CustomEvent).detail)); session.setTalking(true);session.setTalking(false);
 vi.advanceTimersByTime(2000);expect(completed).toHaveLength(0);
 handle({type:"conversation.item.input_audio_transcription.completed",item_id:"late",transcript:"yes"}); vi.advanceTimersByTime(1000);
 expect(completed).toHaveLength(1); expect(completed[0].text).toBe("yes");vi.useRealTimers();
});
it("records distinct response and provider buffer timing events",()=> {
 const {session,handle}=setup();const events: any[]=[];session.addEventListener("diagnostic",e=>events.push((e as CustomEvent).detail));
 handle({type:"response.created",response:{id:"r-time"}});handle({type:"output_audio_buffer.started",response_id:"r-time"});
 expect(events.map(e=>e.event)).toEqual(["live.response.created","live.playback.started","live.audio.started"]);expect(events[0].clientTimestamp).toBeTruthy();expect(events[0].clientMonotonicMs).toBeGreaterThanOrEqual(0);
});
it("keeps original currency text visible while provider speaks normalized text",()=>{
 const {session,sent,handle}=setup();const turns: any[]=[];session.addEventListener("turn",e=>turns.push((e as CustomEvent).detail));
 session.appendCommentary("CAPTURED_DECISION_CONFIRMATION: Wait after a ₹1,00,000 drop?",null);handle({type:"conversation.item.created",item:{id:sent[0].item.id}});
 handle({type:"response.created",response:{id:"r-currency"}});handle({type:"response.audio_transcript.delta",response_id:"r-currency",delta:"Wait after one lakh rupees?"});expect(turns).toHaveLength(0);
 handle({type:"output_audio_buffer.started",response_id:"r-currency"});
 expect(turns.at(-1).text).toContain("₹1,00,000");expect(turns.at(-1).complete).toBe(false);
 handle({type:"response.done",response:{id:"r-currency",status:"completed"}});
 expect(turns.at(-1).text).toContain("₹1,00,000");expect(turns.at(-1).text).not.toContain("one lakh rupees");expect(turns.at(-1).complete).toBe(true);
 expect(turns.filter(turn=>turn.text.includes("₹1,00,000") && !turn.complete)).toHaveLength(1);
});
it("resumes exact confirmation audio without requiring a transcript delta",()=>{
 vi.useFakeTimers(); const {session,sent,handle,output}=setup(); const diagnostics: any[]=[]; const turns:any[]=[];
 session.addEventListener("diagnostic",e=>diagnostics.push((e as CustomEvent).detail));
 session.addEventListener("turn",e=>turns.push((e as CustomEvent).detail));
 session.setTalking(true);
 handle({type:"conversation.item.input_audio_transcription.completed",item_id:"decision",transcript:"Should I focus on LinkedIn or Upwork?"});
 session.setTalking(false);vi.advanceTimersByTime(1_000);
 expect(output.muted).toBe(true);
 session.appendCommentary("CAPTURED_DECISION_CONFIRMATION: Should I focus on LinkedIn or Upwork?",null);
 const item=sent.find(event=>event.type==="conversation.item.create");
 handle({type:"conversation.item.created",item:{id:item?.item.id}});
 handle({type:"response.created",response:{id:"r-confirm"}});
 handle({type:"output_audio_buffer.started",response_id:"r-confirm"});
 expect(output.muted).toBe(false);
 expect(diagnostics.some(event=>event.event==="live.playback.resumed")).toBe(true);
 expect(turns.at(-1)).toMatchObject({role:"sutradhara",text:"I captured the decision as: Should I focus on LinkedIn or Upwork? Is that the decision you want the council to answer?",complete:false});
 handle({type:"response.done",response:{id:"r-confirm",status:"completed"}});
 expect(turns.at(-1).complete).toBe(true);
 vi.useRealTimers();
});
