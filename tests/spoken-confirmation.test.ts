import { expect, it } from "vitest";
import { spokenConfirmationQuestion } from "../server/live/spoken-confirmation.js";
import { moderatedFoundryResponse } from "../server/live/foundry-session.js";
it("spells the exact problematic rupee amount without changing other question text", () => {
 const original="Should I annuitize ICICI holdings after an approximate ₹1,00,000 drop?";
 expect(spokenConfirmationQuestion(original)).toBe("Should I annuitize ICICI holdings after an approximate one lakh rupees drop?");
 expect(original).toContain("₹1,00,000");
 const r=moderatedFoundryResponse("rules",{instructions:`CAPTURED_DECISION_CONFIRMATION: ${original}`});
 expect(JSON.stringify(r)).toContain("one lakh rupees");expect(r.instructions).toBeUndefined();
});
it("preserves INR value including paise, lakh, crore and singular rupee",()=>{
 for(const [raw,spoken] of [["₹1","one rupee"],["₹0","zero rupees"],["₹40,000","forty thousand rupees"],["INR 100000","one lakh rupees"],["Rs. 1,00,000.50","one lakh rupees and fifty paise"],["₹1,00,00,000","one crore rupees"],["₹1.01","one rupee and one paisa"]])expect(spokenConfirmationQuestion(raw)).toBe(spoken);
});
it("does not guess malformed grouping, unrelated numbers or unsupported currency",()=>{
 for(const raw of ["₹1,00,00", "₹1000000000", "$1,00,000", "20 people, 1,00,000 shares", "October 2, 2026", "₹1.005"])expect(spokenConfirmationQuestion(raw)).toBe(raw);
});
it("normalizes inside punctuation without touching noncurrency digits",()=>{
 expect(spokenConfirmationQuestion("A ₹1,00,000 drop, over 2 months?")).toBe("A one lakh rupees drop, over 2 months?");
});
