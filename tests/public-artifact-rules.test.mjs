import { describe, expect, it } from "vitest";

import {
  isPrivateOnlyPath,
  scanBinaryBuffer,
  scanTextLine,
} from "../scripts/public-artifact-rules.mjs";

describe("public artifact hygiene rules", () => {
  it("classifies the port journal and social working set as private-only", () => {
    expect(isPrivateOnlyPath("FOUNDRY_PORT.md")).toBe(true);
    expect(isPrivateOnlyPath("social/medium-azure-port/part-1/index.md")).toBe(true);
    expect(isPrivateOnlyPath("README.md")).toBe(false);
  });

  it("allows empty, documented, and test-only key placeholders", () => {
    const openAiKey = ["OPENAI", "API", "KEY"].join("_");
    const foundryKey = ["FOUNDRY", "API", "KEY"].join("_");
    expect(scanTextLine(`${openAiKey}=`)).toEqual([]);
    expect(scanTextLine(`${openAiKey}=your-project-key`)).toEqual([]);
    expect(scanTextLine(`${foundryKey}: "test-foundry-key",`)).toEqual([]);
  });

  it("flags secrets, Azure resource identifiers, and provider identifiers without returning values", () => {
    const secretAssignment = ["FOUNDRY_API_KEY", "real-secret-value"].join("=");
    const azureHostname = ["https://private-name", "services", "ai", "azure", "com"].join(".");
    const providerItem = ["item", "1234567890abcdefghijkl"].join("_");
    expect(scanTextLine(secretAssignment)).toContain(
      "non-placeholder secret assignment (FOUNDRY_API_KEY)",
    );
    expect(scanTextLine(azureHostname)).toContain(
      "Azure-hosted resource hostname",
    );
    expect(scanTextLine(providerItem)).toContain(
      "delegation or provider item identifier",
    );
  });

  it("detects metadata in public images", () => {
    const signature = Buffer.from("89504e470d0a1a0a", "hex");
    const type = Buffer.from("tEXt", "ascii");
    const chunk = Buffer.concat([Buffer.alloc(4), type, Buffer.alloc(4)]);
    expect(scanBinaryBuffer(Buffer.concat([signature, chunk]), ".png")).toContain(
      "PNG contains tEXt metadata",
    );
    expect(scanBinaryBuffer(Buffer.from("header Exif\0\0 payload"), ".jpg")).toContain(
      "JPEG contains EXIF metadata",
    );
  });
});
