export function VoiceControl({
  status, productMode, playbackState, onConnect, onTalk,
}: {
  status: "offline" | "connecting" | "ready" | "talking";
  productMode: "conversation" | "deliberating" | "completed" | "reconvening";
  playbackState: "idle" | "speaking" | "suppressed" | "awaiting_response";
  onConnect: () => void;
  onTalk: (active: boolean) => void;
}) {
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
    onPointerDown={() => onTalk(true)}
    onPointerUp={() => onTalk(false)}
    onPointerCancel={() => onTalk(false)}
    onPointerLeave={() => status === "talking" && onTalk(false)}
  >
    <span className="mic">●</span>
    <strong>{status === "talking" ? "Listening…" : productMode === "completed" ? "Ask Sutradhara" : "Hold to speak"}</strong>
    <small>{status === "talking" ? "Release when finished" : productMode === "deliberating" || productMode === "reconvening" ? "Ask a process question or add a constraint" : productMode === "completed" ? "Explore the verified decision" : "Hold when you want to speak"}</small>
  </button><p className={`playback-status playback-status--${playbackState}`} aria-live="polite"><i />{playbackCopy}</p></>;
}
