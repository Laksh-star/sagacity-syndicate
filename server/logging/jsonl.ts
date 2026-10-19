import { appendFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type LogEntry = {
  at: string;
  deliberationId: string;
  conversationRevision: number;
  deliberationRevision: number;
  event: string;
  data?: unknown;
};

export class JsonlLogger {
  constructor(private readonly path = process.env.LOG_DIRECTORY ? pathToFileURL(resolve(process.env.LOG_DIRECTORY, "deliberations.jsonl")) : new URL("../../logs/deliberations.jsonl", import.meta.url)) {}

  async write(entry: Omit<LogEntry, "at">): Promise<void> {
    await mkdir(dirname(fileURLToPath(this.path)), { recursive: true });
    await appendFile(this.path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  }
}
