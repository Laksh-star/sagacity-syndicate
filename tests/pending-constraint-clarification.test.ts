import { describe, expect, it } from "vitest";
import { PendingConstraintClarificationController } from "../client/voice/pending-constraint-clarification.js";

describe("pending constraint clarification", () => {
  it("keeps a short yes attached to the possible change and asks for a value", () => {
    const pending = new PendingConstraintClarificationController();
    pending.begin("Eight weeks seems too long.");
    expect(pending.resolve("Yes.")).toMatchObject({
      kind: "needs_value",
      pending: { sourceText: "Eight weeks seems too long." },
    });
    expect(pending.current()?.sourceText).toBe("Eight weeks seems too long.");
  });

  it("carries a supplied replacement value with the original context", () => {
    const pending = new PendingConstraintClarificationController();
    pending.begin("Eight weeks seems too long.");
    const result = pending.resolve("Make it four weeks.");
    expect(result).toMatchObject({ kind: "candidate" });
    expect(result.kind === "candidate" && result.combinedText).toContain("Eight weeks seems too long");
    expect(result.kind === "candidate" && result.combinedText).toContain("Make it four weeks");
  });

  it("clears a rejected possible change", () => {
    const pending = new PendingConstraintClarificationController();
    pending.begin("Eight weeks seems too long.");
    expect(pending.resolve("No.").kind).toBe("rejected");
    expect(pending.current()).toBeUndefined();
  });
});
