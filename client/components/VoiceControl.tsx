import { useRef, type PointerEvent as ReactPointerEvent } from "react";

export type PushToTalkStopReason = "pointer_up" | "pointer_cancel" | "lost_pointer_capture";

export function VoiceControl({
  status, productMode, playbackState, onConnect, onTalk,
}: {
  status: "offline" | "connecting" | "ready" | "talking";
  productMode: "conversation" | "deliberating" | "completed" | "reconvening";
  playbackState: "idle" | "speaking" | "suppressed" | "awaiting_response";
  onConnect: () => void;
  onTalk: (active: boolean, stopReason?: PushToTalkStopReason) => void;
}) {
  const activePointer = useRef<number | undefined>(undefined);
  const beginTalking = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== undefined) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onTalk(true);
  };
  const stopTalking = (event: ReactPointerEvent<HTMLButtonElement>, reason: PushToTalkStopReason) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = undefined;
    if (reason !== "lost_pointer_capture" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onTalk(false, reason);
  };
  if (status === "offline" || status === "connecting") return <button className="voice-button" onClick={onConnect} disabled={status === "connecting"}>
    <span className="mic">●</span>
    <strong>{status === "connecting" ? "Connecting…" : "Start voice"}</strong>
    <small>GPT‑Live · Sutradhara</small>
  </button>;
  const playbackCopy = status === "talking" ? "Your turn · Sutradhara audio paused"
    : playbackState === "speaking" ? "Sutradhara is speaking"
      : playbackState === "awaiting_response" ? "Waiting for Sutradhara"
        : playbackState === "suppressed" ? "Sutradhara interrupted"
          : "Sutradhara is ready";
  return <><button
    className={`voice-button ${status === "talking" ? "voice-button--active" : ""}`}
    onPointerDown={beginTalking}
    onPointerUp={(event) => stopTalking(event, "pointer_up")}
    onPointerCancel={(event) => stopTalking(event, "pointer_cancel")}
    onLostPointerCapture={(event) => stopTalking(event, "lost_pointer_capture")}
  >
    <span className="mic">●</span>
    <strong>{status === "talking" ? "Listening…" : productMode === "completed" ? "Ask Sutradhara" : "Hold to speak"}</strong>
    <small>{status === "talking" ? "Release when finished" : productMode === "deliberating" || productMode === "reconvening" ? "Ask a process question or add a constraint" : productMode === "completed" ? "Explore the verified decision" : "Hold when you want to speak"}</small>
  </button><p className={`playback-status playback-status--${playbackState}`} aria-live="polite"><i />{playbackCopy}</p></>;
}
