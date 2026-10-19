const PLACEHOLDER_PREFIXES = [
  "<", "${", "your-", "replace-", "example-", "sample-", "test-", "fake-", "dummy-",
];

export const PRIVATE_ONLY_PATHS = ["FOUNDRY_PORT.md", "social/"];

export function isPrivateOnlyPath(file) {
  return file === "FOUNDRY_PORT.md" || file.startsWith("social/");
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^["']/u, "").replace(/["',;\s]+$/u, "").toLowerCase();
  return normalized === "" || normalized === "undefined" || normalized === "null" ||
    PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const directRules = [
  { label: "GPT-Live session identifier", pattern: /\blive_u7_[A-Za-z0-9_-]{12,}\b/u },
  { label: "provider session identifier", pattern: /\bsess_[A-Za-z0-9_-]{12,}\b/u },
  { label: "delegation or provider item identifier", pattern: /\bitem_[A-Za-z0-9_-]{16,}\b/u },
  { label: "provider response/run/call identifier", pattern: /\b(?:resp|run|call)_[A-Za-z0-9_-]{16,}\b/u },
  { label: "OpenAI-style secret", pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u },
  { label: "Azure-hosted resource hostname", pattern: /\b[A-Za-z0-9-]+\.(?:azurewebsites\.net|openai\.azure\.com|services\.ai\.azure\.com)\b/iu },
  { label: "Azure resource identifier", pattern: /\/subscriptions\/[A-Za-z0-9-]+\/resourceGroups\/[A-Za-z0-9_.()-]+/iu },
];

const sensitiveAssignment = /["']?\b(OPENAI_API_KEY|FOUNDRY_API_KEY|AZURE_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)|[A-Z0-9_]*CLIENT_SECRET|[A-Z0-9_]*ACCESS_TOKEN)["']?\s*(?:=|:)\s*([^\s#}]+)/giu;
const identityAssignment = /["']?\b(AZURE_(?:SUBSCRIPTION|TENANT|CLIENT)_ID|FOUNDRY_(?:RESOURCE|PROJECT)_ID)["']?\s*(?:=|:)\s*([^\s#}]+)/giu;

export function scanTextLine(line) {
  const labels = [];
  for (const rule of directRules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(line)) labels.push(rule.label);
  }

  sensitiveAssignment.lastIndex = 0;
  for (const match of line.matchAll(sensitiveAssignment)) {
    if (!isPlaceholder(match[2])) labels.push(`non-placeholder secret assignment (${match[1]})`);
  }

  identityAssignment.lastIndex = 0;
  for (const match of line.matchAll(identityAssignment)) {
    if (!isPlaceholder(match[2])) labels.push(`non-placeholder Azure identity assignment (${match[1]})`);
  }
  return [...new Set(labels)];
}

function extractPngMetadata(buffer) {
  if (buffer.length < 8 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return [];
  const metadata = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) break;
    if (["tEXt", "iTXt", "zTXt"].includes(type)) metadata.push(type);
    offset = end;
  }
  return metadata;
}

export function scanBinaryBuffer(buffer, extension) {
  const labels = [];
  const ascii = buffer.toString("latin1");
  for (const rule of directRules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(ascii)) labels.push(`embedded ${rule.label}`);
  }
  if (extension === ".png") {
    for (const type of extractPngMetadata(buffer)) labels.push(`PNG contains ${type} metadata`);
  }
  if ([".jpg", ".jpeg"].includes(extension) && buffer.includes(Buffer.from("Exif\0\0", "ascii"))) {
    labels.push("JPEG contains EXIF metadata");
  }
  return [...new Set(labels)];
}
