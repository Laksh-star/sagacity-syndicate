import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LiveDiagnosticEvent } from "../../shared/schemas.js";

export class LiveJsonlLogger {
  constructor(private readonly path = new URL("../../logs/live-events.jsonl", import.meta.url)) {}

  async write(entry: LiveDiagnosticEvent): Promise<void> {
    await mkdir(dirname(fileURLToPath(this.path)), { recursive: true });
    await appendFile(this.path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  }
}
