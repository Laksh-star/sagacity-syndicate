export function VoiceControl({
  status, onConnect, onTalk,
}: {
  status: "offline" | "connecting" | "ready" | "talking";
  onConnect: () => void;
  onTalk: (active: boolean) => void;
}) {
  if (status === "offline" || status === "connecting") return <button className="voice-button" onClick={onConnect} disabled={status === "connecting"}>
    <span className="mic">●</span>
    <strong>{status === "connecting" ? "Connecting…" : "Start voice"}</strong>
    <small>GPT‑Live · Sutradhara</small>
  </button>;
  return <button
    className={`voice-button ${status === "talking" ? "voice-button--active" : ""}`}
    onPointerDown={() => onTalk(true)}
    onPointerUp={() => onTalk(false)}
    onPointerCancel={() => onTalk(false)}
    onPointerLeave={() => status === "talking" && onTalk(false)}
  >
    <span className="mic">●</span>
    <strong>{status === "talking" ? "Listening…" : "Hold to speak"}</strong>
    <small>{status === "talking" ? "Release when finished" : "Sutradhara is ready"}</small>
  </button>;
}
