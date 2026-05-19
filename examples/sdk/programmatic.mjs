/**
 * Programmatic API smoke test.
 * Shows how to use @agentlane/agent-ready as a library.
 *
 * Run from repo root after `npm run build`:
 *   node examples/sdk/programmatic.mjs
 */

// In a real project these would be:
//   import { lintTicket, loadTicketFromFile } from "@agentlane/agent-ready";
import { lintTicket, loadTicketFromFile } from "../../dist/index.js";
import { renderText } from "../../dist/render/index.js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// Load the default rule pack directly
const defaultPackPath = resolve(repoRoot, "rule-packs/default.yaml");
const pack = parseYaml(await readFile(defaultPackPath, "utf8"));

// ── Example 1: lint a "bad" ticket ───────────────────────────────────────────
const badTicket = await loadTicketFromFile(
  resolve(repoRoot, "examples/tickets/bad-ticket.json")
);

const badResult = await lintTicket(badTicket, pack, {
  adapter: "file",
  rulePackName: "default",
  rulePackVersion: String(pack.version),
});

console.log("=== bad-ticket.json ===");
console.log(renderText(badResult));
console.log();

// ── Example 2: lint a "good" ticket ──────────────────────────────────────────
const goodTicket = await loadTicketFromFile(
  resolve(repoRoot, "examples/tickets/good-ticket.json")
);

const goodResult = await lintTicket(goodTicket, pack, {
  adapter: "file",
  rulePackName: "default",
  rulePackVersion: String(pack.version),
});

console.log("=== good-ticket.json ===");
console.log(renderText(goodResult));
console.log();

// ── Assertions (CI gate) ──────────────────────────────────────────────────────
if (badResult.ready) {
  console.error("FAIL: bad-ticket should not be ready");
  process.exit(1);
}
if (!goodResult.ready) {
  console.error("FAIL: good-ticket should be ready");
  process.exit(1);
}

console.log("✓ Programmatic API smoke test passed");
