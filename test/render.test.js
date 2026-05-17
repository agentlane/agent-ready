/**
 * Unit tests for renderText() and renderMarkdown().
 * Runs via: node --test test/render.test.js
 * Requires: npm run build
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderText, renderMarkdown } from "../dist/render/markdown.js";
import { renderSarif } from "../dist/render/sarif.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const baseOut = {
  schema_version: "1.0",
  agent_ready_version: "0.0.3",
  ticket_id: "PROJ-99",
  adapter: "file",
  rule_pack: "default",
  checked_at: "2026-01-01T00:00:00.000Z",
  summary: { passed: 8, failed: 0, warnings: 0 },
  ready: true,
  checks: [
    { id: "has-acceptance-criteria", severity: "error", status: "pass", message: "Found 3 acceptance criteria" },
    { id: "has-risk-classification", severity: "error", status: "pass", message: "Risk label found" },
  ],
};

const failOut = {
  ...baseOut,
  ready: false,
  summary: { passed: 6, failed: 2, warnings: 2 },
  checks: [
    { id: "has-acceptance-criteria", severity: "error", status: "fail", message: "No AC found", hint: "Add a checklist." },
    { id: "has-definition-of-done",  severity: "warn",  status: "fail", message: "No DoD found" },
    { id: "no-tribal-knowledge",     severity: "warn",  status: "fail", message: "Tribal-knowledge phrase(s): as discussed" },
    { id: "has-design-link",         severity: "warn",  status: "skip", message: "Not a UI ticket" },
    { id: "has-repo-target",         severity: "error", status: "fail", message: "No repo specified" },
    { id: "body-min-length",         severity: "error", status: "pass", message: "Body 150 >= 100" },
  ],
};

// ─── renderText ────────────────────────────────────────────────────────────

describe("renderText — ready ticket", () => {
  it("starts with ✓ and ticket id", () => {
    const out = renderText(baseOut);
    assert.ok(out.startsWith("✓ PROJ-99"), `Got: ${out.slice(0, 40)}`);
  });

  it("includes 'ready'", () => {
    assert.ok(renderText(baseOut).includes("ready"));
  });

  it("shows passed count", () => {
    assert.ok(renderText(baseOut).includes("8 checks passed"));
  });

  it("does not show warnings count when 0", () => {
    const text = renderText(baseOut);
    assert.ok(!text.includes("warning"), `Should not mention warnings: ${text.slice(0, 80)}`);
  });

  it("lists each check with its icon", () => {
    const text = renderText(baseOut);
    assert.ok(text.includes("has-acceptance-criteria"));
    assert.ok(text.includes("has-risk-classification"));
  });
});

describe("renderText — failing ticket", () => {
  it("starts with ✗ and ticket id", () => {
    const out = renderText(failOut);
    assert.ok(out.startsWith("✗ PROJ-99"), `Got: ${out.slice(0, 40)}`);
  });

  it("shows blocker and warning counts", () => {
    const text = renderText(failOut);
    assert.ok(text.includes("2 blocker(s)"));
    assert.ok(text.includes("2 warning(s)"));
  });

  it("uses ✗ icon for error-severity failures", () => {
    const text = renderText(failOut);
    // has-acceptance-criteria failed at error → ✗
    assert.ok(text.includes("✗"), "No ✗ icon found");
  });

  it("uses ⚠ icon for warn-severity failures", () => {
    const text = renderText(failOut);
    assert.ok(text.includes("⚠"), "No ⚠ icon found");
  });

  it("uses · icon for skipped rules", () => {
    const text = renderText(failOut);
    assert.ok(text.includes("·"), "No · icon found for skip");
  });

  it("uses ✓ icon for passing rules", () => {
    const text = renderText(failOut);
    // body-min-length is passing
    assert.ok(text.includes("✓"), "No ✓ icon found for pass");
  });
});

// ─── renderMarkdown ────────────────────────────────────────────────────────

describe("renderMarkdown — ready ticket", () => {
  it("contains the agent-ready heading", () => {
    assert.ok(renderMarkdown(baseOut).includes("### agent-ready check"));
  });

  it("uses **bold** ticket id", () => {
    assert.ok(renderMarkdown(baseOut).includes("**PROJ-99**"));
  });

  it("says 'ready for an agent'", () => {
    assert.ok(renderMarkdown(baseOut).includes("ready for an agent"));
  });

  it("renders a markdown table", () => {
    const md = renderMarkdown(baseOut);
    assert.ok(md.includes("| | Rule | Status |"), "Missing table header");
    assert.ok(md.includes("|---|---|---|"), "Missing table separator");
  });

  it("wraps rule ids in backticks", () => {
    const md = renderMarkdown(baseOut);
    assert.ok(md.includes("`has-acceptance-criteria`"));
  });

  it("does NOT include the failure CTA", () => {
    assert.ok(!renderMarkdown(baseOut).includes("Fix the blockers"));
  });
});

describe("renderMarkdown — failing ticket", () => {
  it("starts with ✗ in heading line", () => {
    const md = renderMarkdown(failOut);
    assert.ok(md.includes("✗ **PROJ-99**"));
  });

  it("shows blocker and warning counts in heading", () => {
    const md = renderMarkdown(failOut);
    assert.ok(md.includes("2 blocker(s)"));
    assert.ok(md.includes("2 warning(s)"));
  });

  it("renders hint text in italic after em dash", () => {
    const md = renderMarkdown(failOut);
    // has-acceptance-criteria has a hint
    assert.ok(md.includes("_Add a checklist._"), `Hint not found. Got:\n${md}`);
  });

  it("includes the failure call-to-action", () => {
    assert.ok(renderMarkdown(failOut).includes("Fix the blockers above"));
  });

  it("uses — icon for skipped rules", () => {
    const md = renderMarkdown(failOut);
    assert.ok(md.includes("| — |"), "No — icon for skip in markdown");
  });

  it("uses ⚠ icon for warn-severity failures", () => {
    assert.ok(renderMarkdown(failOut).includes("| ⚠ |"));
  });
});

// ─── edge cases ────────────────────────────────────────────────────────────

describe("renderText / renderMarkdown — edge cases", () => {
  it("handles empty checks array without crashing", () => {
    const out = { ...baseOut, checks: [], summary: { passed: 0, failed: 0, warnings: 0 } };
    assert.doesNotThrow(() => renderText(out));
    assert.doesNotThrow(() => renderMarkdown(out));
  });

  it("renderText shows warning count when non-zero on ready ticket", () => {
    const out = { ...baseOut, ready: true, summary: { passed: 7, failed: 0, warnings: 1 } };
    const text = renderText(out);
    assert.ok(text.includes("1 warning(s)"));
  });

  it("renderMarkdown shows warning count when non-zero on ready ticket", () => {
    const out = { ...baseOut, ready: true, summary: { passed: 7, failed: 0, warnings: 1 } };
    const md = renderMarkdown(out);
    assert.ok(md.includes("1 warning(s)"));
  });
});

// ─── renderSarif ───────────────────────────────────────────────────────────

describe("renderSarif — structure", () => {
  it("produces valid JSON", () => {
    assert.doesNotThrow(() => JSON.parse(renderSarif(failOut)));
  });

  it("has SARIF 2.1.0 schema and version", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    assert.ok(sarif.$schema.includes("sarif-schema-2.1.0"));
    assert.equal(sarif.version, "2.1.0");
  });

  it("has exactly one run", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    assert.equal(sarif.runs.length, 1);
  });

  it("driver name is agent-ready", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    assert.equal(sarif.runs[0].tool.driver.name, "agent-ready");
  });

  it("driver.rules lists all checks (including passes)", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r) => r.id);
    // failOut has 6 checks — all should appear in driver.rules
    assert.equal(ruleIds.length, failOut.checks.length);
  });

  it("results only contains failed checks (not passes or skips)", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    const results = sarif.runs[0].results;
    // failOut has 3 fails, 1 skip, 1 pass → 3 results
    const failedIds = failOut.checks.filter((c) => c.status === "fail").map((c) => c.id);
    assert.equal(results.length, failedIds.length);
    for (const r of results) {
      assert.ok(failedIds.includes(r.ruleId), `Unexpected ruleId in results: ${r.ruleId}`);
    }
  });

  it("maps error severity to SARIF level 'error'", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    const acResult = sarif.runs[0].results.find((r) => r.ruleId === "has-acceptance-criteria");
    assert.ok(acResult, "has-acceptance-criteria should be in results");
    assert.equal(acResult.level, "error");
  });

  it("maps warn severity to SARIF level 'warning'", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    const dodResult = sarif.runs[0].results.find((r) => r.ruleId === "has-definition-of-done");
    assert.ok(dodResult);
    assert.equal(dodResult.level, "warning");
  });

  it("includes ticket id in logicalLocations", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    for (const result of sarif.runs[0].results) {
      const loc = result.locations[0].logicalLocations[0];
      assert.equal(loc.name, failOut.ticket_id);
    }
  });

  it("appends hint to message when present", () => {
    const sarif = JSON.parse(renderSarif(failOut));
    const acResult = sarif.runs[0].results.find((r) => r.ruleId === "has-acceptance-criteria");
    assert.ok(acResult.message.text.includes("Add a checklist."), "Hint should appear in message");
  });

  it("produces valid JSON for a ready (passing) ticket too", () => {
    const sarif = JSON.parse(renderSarif(baseOut));
    assert.equal(sarif.runs[0].results.length, 0);
    assert.equal(sarif.runs[0].tool.driver.rules.length, baseOut.checks.length);
  });
});
