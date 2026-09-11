import { readFile } from "node:fs/promises";

export async function loadPrompt(name: string): Promise<string> {
  const url = new URL(`../prompts/${name}.md`, import.meta.url);
  return (await readFile(url, "utf8")).trim();
}
