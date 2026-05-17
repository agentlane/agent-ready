/**
 * Integration tests for lintTicket().
 * Verifies that the orchestrator correctly aggregates rule results,
 * computes ready/not-ready, and respects enabled/disabled overrides.
 * Runs via: node --test test/lint.test.js
 * Requires: npm run build
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintTicket } from "../dist/lint.js";

// Shared opts
const opts = { adapter: "file", rulePackName: "default" };

// Empty pack → all built-ins run at their defaults
const emptyPack = { version: 1, rules: {} };
// Pack for good-ticket tests: disable opt-in network rules
const offlinePack = { version: 1, rules: { "links-resolve": { enabled: false } } };

// ─── Fixtures ──────────────────────────────────────────────────────────────

const badTicket = {
  id: "PROJ-1234",
  title: "Improve the checkout flow",
  body: "We should improve checkout. Make it better, you know what I mean. Discussed in the meeting.",
  labels: ["frontend"],
};

const goodTicket = {
  id: "PROJ-2042",
  title: "Add retry logic to checkout payment API",
  body: [
    "repo: acme/checkout",
    "",
    "## Problem",
    "Payment calls fail silently on network hiccup. Adds user frustration.",
    "A" + "x".repeat(50),
    "",
    "## Acceptance criteria",
    "- [ ] Retries up to 3 times with exponential backoff",
    "- [ ] Error surfaced to user after final failure",
    "- [ ] No duplicate charges (idempotency key sent)",
    "",
    "## Definition of Done",
    "- Unit tests pass (Jest)",
    "- E2E Playwright test covers the retry flow",
    "- PR reviewed by a second engineer",
    "",
    "## How to verify",
    "Run `jest payment` and the Playwright suite locally.",
    "",
    "size: M",
    "",
    "Design: https://figma.com/file/abc/Checkout",
  ].join("\n"),
  labels: ["risk:high", "size:m", "repo:acme-checkout", "frontend"],
};

// ─── bad ticket ────────────────────────────────────────────────────────────

describe("lintTicket — bad ticket", () => {
  it("returns ready: false", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    assert.equal(out.ready, false);
  });

  it("has at least 1 error-level failure", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    assert.ok(out.summary.failed >= 1);
  });

  it("contains the expected schema fields", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    assert.equal(out.schema_version, "1.1");
    assert.equal(out.ticket_id, "PROJ-1234");
    assert.equal(out.adapter, "file");
    assert.equal(out.rule_pack_version, "1");
    assert.deepEqual(out.source, { adapter: "file" });
    assert.equal(out.signals.path_recommendation, "C");
    assert.equal(out.path_recommendation, out.signals.path_recommendation);
    assert.equal(out.context_tier, out.signals.context_tier);
    assert.ok(typeof out.checked_at === "string");
    assert.ok(Array.isArray(out.checks));
  });

  it("flags no-tribal-knowledge for 'as discussed' + 'you know what i mean'", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    const tribal = out.checks.find((c) => c.id === "no-tribal-knowledge");
    assert.ok(tribal, "tribal-knowledge check missing");
    assert.equal(tribal.status, "fail");
  });

  it("flags no-ambiguous-verbs for 'improve'", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    const ambig = out.checks.find((c) => c.id === "no-ambiguous-verbs");
    assert.ok(ambig);
    assert.equal(ambig.status, "fail");
  });

  it("does not run opt-in LLM judge unless enabled", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    const judge = out.checks.find((c) => c.id === "llm-judge-ambiguity");
    assert.equal(judge, undefined);
  });

  it("flags has-risk-classification (no label)", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    const risk = out.checks.find((c) => c.id === "has-risk-classification");
    assert.ok(risk);
    assert.equal(risk.status, "fail");
  });
});

// ─── good ticket ───────────────────────────────────────────────────────────

describe("lintTicket — good ticket", () => {
  it("returns ready: true", async () => {
    const out = await lintTicket(goodTicket, offlinePack, opts);
    assert.equal(out.ready, true);
  });

  it("has 0 error-level failures", async () => {
    const out = await lintTicket(goodTicket, offlinePack, opts);
    assert.equal(out.summary.failed, 0);
  });

  it("passes all built-in rules (or skips non-applicable)", async () => {
    const out = await lintTicket(goodTicket, offlinePack, opts);
    for (const c of out.checks) {
      assert.ok(
        c.status === "pass" || c.status === "skip",
        `Expected pass/skip for ${c.id}, got ${c.status}: ${c.message}`
      );
    }
  });

  it("derives high-risk UI signals deterministically", async () => {
    const out = await lintTicket(goodTicket, offlinePack, opts);
    assert.equal(out.signals.risk_classification, "high");
    assert.equal(out.signals.path_recommendation, "C");
    assert.equal(out.signals.context_tier, "T3");
  });
});

// ─── rule pack overrides ────────────────────────────────────────────────────

describe("lintTicket — rule pack overrides", () => {
  it("skips a rule when enabled: false", async () => {
    const pack = {
      version: 1,
      rules: { "has-risk-classification": { enabled: false } },
    };
    const out = await lintTicket(badTicket, pack, opts);
    const found = out.checks.find((c) => c.id === "has-risk-classification");
    assert.equal(found, undefined, "Rule should be absent when disabled");
  });

  it("changes severity via rule pack", async () => {
    const pack = {
      version: 1,
      rules: { "has-acceptance-criteria": { severity: "warn" } },
    };
    const out = await lintTicket(badTicket, pack, opts);
    const ac = out.checks.find((c) => c.id === "has-acceptance-criteria");
    assert.ok(ac);
    assert.equal(ac.severity, "warn");
  });

  it("ready: true when only warn-level failures remain", async () => {
    // Disable all error-severity rules; ticket still has warn failures
    const pack = {
      version: 1,
      rules: {
        "has-acceptance-criteria": { enabled: false },
        "has-repo-target": { enabled: false },
        "has-risk-classification": { enabled: false },
        "body-min-length": { enabled: false },
      },
    };
    const out = await lintTicket(badTicket, pack, opts);
    assert.equal(out.ready, true);
    assert.equal(out.summary.failed, 0);
  });

  it("runs custom regex rule", async () => {
    const pack = {
      version: 1,
      rules: {
        "custom-epic-link": {
          type: "regex",
          pattern: "EPIC-\\d+",
          field: "body",
          severity: "error",
          message: "Must reference an epic",
        },
      },
    };
    const out = await lintTicket(badTicket, pack, opts);
    const custom = out.checks.find((c) => c.id === "custom-epic-link");
    assert.ok(custom, "Custom rule should appear in checks");
    assert.equal(custom.status, "fail");
    assert.equal(custom.message, "Must reference an epic");
  });

  it("allows rule packs to tune signal thresholds and values", async () => {
    const pack = {
      version: 1,
      signals: {
        path_recommendation: {
          default: "A",
          warning_threshold: 1,
          warning_value: "C",
        },
        context_tier: {
          default: "T1",
          warning_value: "T3",
        },
      },
      rules: {
        "has-acceptance-criteria": { enabled: false },
        "has-repo-target": { enabled: false },
        "has-risk-classification": { enabled: false },
        "body-min-length": { enabled: false },
      },
    };
    const out = await lintTicket(badTicket, pack, opts);
    assert.equal(out.signals.path_recommendation, "C");
    assert.equal(out.signals.context_tier, "T3");
  });
});

// ─── summary counts ────────────────────────────────────────────────────────

describe("lintTicket — summary arithmetic", () => {
  it("passed + failed + warnings equals visible checks (excl. skip)", async () => {
    const out = await lintTicket(badTicket, emptyPack, opts);
    const nonSkip = out.checks.filter((c) => c.status !== "skip").length;
    const total = out.summary.passed + out.summary.failed + out.summary.warnings;
    assert.equal(total, nonSkip);
  });
});
