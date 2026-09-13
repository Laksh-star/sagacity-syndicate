import type { DecisionScroll } from "../../shared/schemas.js";
import { createCouncilThinkingContext } from "../../shared/voice.js";

export type LiveSessionBootstrap = {
  status: "NOT_STARTED" | "COMPLETED";
  statusDetail: string;
  thinkingContext?: string;
};

export function createLiveSessionBootstrap(scroll?: DecisionScroll): LiveSessionBootstrap {
  if (!scroll) {
    return {
      status: "NOT_STARTED",
      statusDetail: "The council is waiting. Converse naturally and ask only necessary clarification. Do not say the council is working until status becomes ACTIVE.",
    };
  }
  return {
    status: "COMPLETED",
    statusDetail: "A verified Decision Scroll has been restored and is visible. Use the quiet verified context for follow-up questions. Do not ask the user to restate the prior decision, and do not repeat the briefing unless asked.",
    thinkingContext: createCouncilThinkingContext(scroll),
  };
}
