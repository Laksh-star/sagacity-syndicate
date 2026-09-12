import { describe, expect, it } from "vitest";
import { buildVoiceDecisionContext } from "../client/voice/decision-context.js";
import type { VoiceTurn } from "../client/voice/turn-tracker.js";

describe("voice decision context", () => {
  it("uses the delegation's completed causal turn even before React transcript state settles", () => {
    const causalTurn: VoiceTurn = {
      id: "voice_turn_0",
      role: "user",
      text: "Should I relocate for an AI role?",
      complete: true,
    };

    expect(buildVoiceDecisionContext("", [], causalTurn)).toBe(
      "Voice conversation:\nUser: Should I relocate for an AI role?",
    );
  });

  it("combines typed context and voice without duplicating the causal turn", () => {
    const causalTurn: VoiceTurn = {
      id: "voice_turn_0",
      role: "user",
      text: "My deadline is January.",
      complete: true,
    };
    const result = buildVoiceDecisionContext("I am considering Bangalore.", [causalTurn], causalTurn);

    expect(result).toContain("I am considering Bangalore.");
    expect(result.match(/My deadline is January\./gu)).toHaveLength(1);
  });
});
