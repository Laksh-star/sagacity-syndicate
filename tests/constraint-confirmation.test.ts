import { describe, expect, it } from "vitest";
import { classifyConfirmationReply, confirmationPrompt, createConstraintConfirmation } from "../shared/constraint-confirmation.js";
import { clearPendingConstraint, loadPendingConstraint, persistPendingConstraint } from "../client/pending-constraint.js";

const material = (changedConstraint: string, confidence = 0.99) => ({
  material: true as const,
  changedConstraint,
  reason: "The hard constraint changed.",
  confidence,
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("material constraint confirmation", () => {
  it("keeps now and not as different interpretations requiring confirmation", () => {
    const now = createConstraintConfirmation(material("The total budget is now ₹40,000, replacing ₹1,00,000."), 3, 100);
    const not = createConstraintConfirmation(material("The total budget is not ₹40,000."), 4, 200);

    expect(now.changedConstraint).toContain("now ₹40,000");
    expect(not.changedConstraint).toContain("not ₹40,000");
    expect(now.confirmationQuestion).not.toEqual(not.confirmationQuestion);
    expect(confirmationPrompt(not)).toContain("paused before reconvening");
  });

  it("shows directional values for explicit currency replacement", () => {
    const confirmation = createConstraintConfirmation(material("The new total is ₹40,000. This replaces the earlier ₹1,00,000."), 5, 100);
    expect(confirmation.newValue).toContain("₹40,000");
    expect(confirmation.previousValue).toBe("₹1,00,000");
    expect(confirmation.confirmationQuestion).toContain("replacing");
  });

  it("shows directional values for a deadline correction", () => {
    const confirmation = createConstraintConfirmation(material("The deadline is next week, not next month."), 6, 100);
    expect(confirmation.newValue).toBe("next week");
    expect(confirmation.previousValue).toBe("next month");
  });

  it("keeps ambiguous partial corrections bounded instead of inventing values", () => {
    const confirmation = createConstraintConfirmation(material("The budget is forty thousand, not...", 0.61), 7, 100);
    expect(confirmation.newValue).toBeUndefined();
    expect(confirmation.previousValue).toBeUndefined();
    expect(confirmation.confirmationQuestion).toContain("The budget is forty thousand, not");
    expect(confirmation.interpretationConfidence).toBe(0.61);
  });

  it("recognizes acceptance, rejection, and a replacement statement", () => {
    expect(classifyConfirmationReply("Yes, correct.")).toBe("accept");
    expect(classifyConfirmationReply("No, that is wrong.")).toBe("reject");
    expect(classifyConfirmationReply("The deadline is Friday instead.")).toBe("replace");
  });

  it("restores and clears a pending confirmation across refresh", () => {
    const storage = memoryStorage();
    const confirmation = createConstraintConfirmation(material("I cannot relocate."), 8, 1234);
    persistPendingConstraint(confirmation, storage);
    expect(loadPendingConstraint(storage)).toEqual(confirmation);
    clearPendingConstraint(storage);
    expect(loadPendingConstraint(storage)).toBeUndefined();
  });
});
