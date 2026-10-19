import { describe, expect, it } from "vitest";
import { isAllowedBrowserOrigin, normalizeAllowedOrigins } from "../server/origin-policy.js";

describe("voice origin policy", () => {
  it("normalizes configured local and hosted HTTPS origins", () => {
    expect(normalizeAllowedOrigins([
      "http://localhost:5173/",
      "https://sagacity.example.com",
      "https://sagacity.example.com/",
    ])).toEqual([
      "http://localhost:5173",
      "https://sagacity.example.com",
    ]);
  });

  it("allows an explicitly configured hosted origin", () => {
    const allowed = normalizeAllowedOrigins(["https://sagacity.example.com"]);
    expect(isAllowedBrowserOrigin("https://sagacity.example.com", allowed)).toBe(true);
  });

  it("rejects missing, malformed, or unconfigured origins", () => {
    const allowed = normalizeAllowedOrigins(["https://sagacity.example.com"]);
    expect(isAllowedBrowserOrigin(undefined, allowed)).toBe(false);
    expect(isAllowedBrowserOrigin("not a URL", allowed)).toBe(false);
    expect(isAllowedBrowserOrigin("https://other.example.com", allowed)).toBe(false);
  });

  it.each([
    "wss://sagacity.example.com",
    "https://user@sagacity.example.com",
    "https://sagacity.example.com/path",
    "https://sagacity.example.com?debug=true",
  ])("fails an unsafe configured origin: %s", (origin) => {
    expect(() => normalizeAllowedOrigins([origin])).toThrow("bare HTTP(S) origins");
  });

  it("fails malformed configured origins", () => {
    expect(() => normalizeAllowedOrigins(["not a URL"])).toThrow("invalid origin");
  });
});
