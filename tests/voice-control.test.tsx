/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceControl, type PushToTalkStopReason } from "../client/components/VoiceControl.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.replaceChildren();
});

function pointerEvent(type: string, pointerId = 7): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "mouse" },
    button: { value: 0 },
  });
  return event;
}

function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const transitions: Array<{ active: boolean; reason?: PushToTalkStopReason }> = [];
  act(() => root.render(<VoiceControl
    status="ready"
    productMode="conversation"
    playbackState="idle"
    onConnect={() => undefined}
    onTalk={(active, reason) => transitions.push({ active, reason })}
  />));
  const button = container.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Voice button did not render.");
  const captures = new Set<number>();
  button.setPointerCapture = vi.fn((pointerId) => captures.add(pointerId));
  button.hasPointerCapture = vi.fn((pointerId) => captures.has(pointerId));
  button.releasePointerCapture = vi.fn((pointerId) => captures.delete(pointerId));
  const dispatch = (type: string, pointerId = 7) => act(() => { button.dispatchEvent(pointerEvent(type, pointerId)); });
  return { button, captures, dispatch, transitions };
}

describe("push-to-talk pointer boundary", () => {
  it("captures the pointer and ignores drift outside the button", () => {
    const { button, captures, dispatch, transitions } = setup();
    dispatch("pointerdown");
    dispatch("pointerleave");

    expect(button.setPointerCapture).toHaveBeenCalledWith(7);
    expect(captures.has(7)).toBe(true);
    expect(transitions).toEqual([{ active: true }]);
  });

  it("stops once on deliberate pointer release", () => {
    const { button, dispatch, transitions } = setup();
    dispatch("pointerdown");
    dispatch("pointerup");
    dispatch("pointercancel");

    expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(transitions).toEqual([
      { active: true },
      { active: false, reason: "pointer_up" },
    ]);
  });

  it("stops safely when the browser cancels the pointer", () => {
    const { dispatch, transitions } = setup();
    dispatch("pointerdown");
    dispatch("pointercancel");
    expect(transitions.at(-1)).toEqual({ active: false, reason: "pointer_cancel" });
  });

  it("uses lost capture as a final safety stop without duplicating release", () => {
    const { dispatch, transitions } = setup();
    dispatch("pointerdown");
    dispatch("lostpointercapture");
    dispatch("pointerup");
    expect(transitions).toEqual([
      { active: true },
      { active: false, reason: "lost_pointer_capture" },
    ]);
  });
});
