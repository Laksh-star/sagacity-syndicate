import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "README.md", "ARCHITECTURE.md", "FEATURE_MATRIX.md", "USER_GUIDE.md", "TEST_PLAN.md", "IMPLEMENTATION_NOTE.md", "docs"], {
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

const forbidden = [
  { label: "GPT-Live session identifier", pattern: /\blive_u7_[A-Za-z0-9_-]{12,}\b/gu },
  { label: "provider session identifier", pattern: /\bsess_[A-Za-z0-9_-]{12,}\b/gu },
  { label: "delegation identifier", pattern: /\bitem_[A-Za-z0-9_-]{16,}\b/gu },
  { label: "OpenAI-style secret", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gu },
  { label: "non-placeholder API key assignment", pattern: /\bOPENAI_API_KEY\s*=\s*(?!your-project-key\b|$)[^\s#]+/gu },
];

const violations = [];
for (const file of tracked) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) violations.push(`${file}:${index + 1} ${rule.label}`);
    }
  }
}

if (violations.length) {
  console.error("Public artifact hygiene check failed. Redact these values; the matched values are intentionally not printed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Public artifact hygiene check passed (${tracked.length} tracked documentation files).`);
