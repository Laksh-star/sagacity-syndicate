import { appendFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LiveDiagnosticEvent } from "../../shared/schemas.js";

export class LiveJsonlLogger {
  constructor(private readonly path = process.env.LOG_DIRECTORY ? pathToFileURL(resolve(process.env.LOG_DIRECTORY, "live-events.jsonl")) : new URL("../../logs/live-events.jsonl", import.meta.url)) {}

  async write(entry: LiveDiagnosticEvent): Promise<void> {
    await mkdir(dirname(fileURLToPath(this.path)), { recursive: true });
    await appendFile(this.path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  }
}
