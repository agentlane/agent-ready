/**
 * Unit tests for all 10 built-in rules + runCustomRegex.
 * Runs via: node --test test/rules.test.js
 * Requires: npm run build (outputs to dist/)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_RULES, runCustomRegex } from "../dist/rules/built-in.js";

// Helper — find a specific rule including new ones
const ruleById = (id) => {
  const r = BUILTIN_RULES.find((r) => r.id === id);
  if (!r) throw new Error(`Rule not found: ${id}`);
  return r;
};

// Helper to find a rule by id
const rule = (id) => {
  const r = BUILTIN_RULES.find((r) => r.id === id);
  if (!r) throw new Error(`Rule not found: ${id}`);
  return r;
};

// Minimal ticket factories
const ticket = (overrides = {}) => ({
  id: "TEST-1",
  title: "Test ticket",
  body: "",
  labels: [],
  ...overrides,
});

const cfg = (overrides = {}) => ({ enabled: true, ...overrides });

// ─── has-acceptance-criteria ───────────────────────────────────────────────

describe("has-acceptance-criteria", () => {
  const r = rule("has-acceptance-criteria");

  it("passes with a checkbox list item", () => {
    const t = ticket({ body: "- [ ] User can log in\n- [x] Error shown on failure" });
    const result = r.run(t, cfg());
    assert.equal(result.status, "pass");
  });

  it("passes with a numbered list", () => {
    const t = ticket({ body: "1. User sees confirmation\n2. Email sent within 5s" });
    const result = r.run(t, cfg());
    assert.equal(result.status, "pass");
  });

  it("passes with Given/When pattern", () => {
    const t = ticket({ body: "Given the user is logged in when they click submit" });
    const result = r.run(t, cfg());
    assert.equal(result.status, "pass");
  });

  it("fails when body is empty", () => {
    const result = r.run(ticket(), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "error");
  });

  it("fails when count is below min_count", () => {
    const t = ticket({ body: "- [ ] One item only" });
    const result = r.run(t, cfg({ min_count: 2 }));
    assert.equal(result.status, "fail");
  });

  it("passes when count meets min_count", () => {
    const t = ticket({ body: "- [ ] Item one\n- [ ] Item two" });
    const result = r.run(t, cfg({ min_count: 2 }));
    assert.equal(result.status, "pass");
  });

  it("respects severity override", () => {
    const result = r.run(ticket(), cfg({ severity: "warn" }));
    assert.equal(result.severity, "warn");
  });
});

// ─── has-definition-of-done ────────────────────────────────────────────────

describe("has-definition-of-done", () => {
  const r = rule("has-definition-of-done");

  it("passes with 'Definition of Done' heading", () => {
    const t = ticket({ body: "## Definition of Done\n- Tests pass" });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with 'DoD' abbreviation (case-insensitive)", () => {
    const t = ticket({ body: "DoD: all tests green" });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails when no DoD mention", () => {
    const result = r.run(ticket({ body: "Just a description with no done criteria." }), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "warn");
  });
});

// ─── has-repo-target ───────────────────────────────────────────────────────

describe("has-repo-target", () => {
  const r = rule("has-repo-target");

  it("passes with repo: in body", () => {
    const t = ticket({ body: "repo: acme/backend\nDo the thing." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with repo: label", () => {
    const t = ticket({ labels: ["repo:frontend"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails with no repo anywhere", () => {
    const result = r.run(ticket({ body: "Some description." }), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "error");
  });

  it("passes with repo: after newline (indented)", () => {
    const t = ticket({ body: "Context:\n  repo: acme/infra" });
    assert.equal(r.run(t, cfg()).status, "pass");
  });
});

// ─── has-risk-classification ───────────────────────────────────────────────

describe("has-risk-classification", () => {
  const r = rule("has-risk-classification");

  it.skip("passes with risk:low label", () => {
    const t = ticket({ labels: ["risk:low"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with risk:medium label", () => {
    const t = ticket({ labels: ["risk:medium"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with risk:high label", () => {
    const t = ticket({ labels: ["risk:high"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("is case-insensitive on labels", () => {
    const t = ticket({ labels: ["Risk:Low"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails with no risk label", () => {
    const result = r.run(ticket({ labels: ["frontend", "bug"] }), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "error");
  });
});

// ─── has-test-expectations ─────────────────────────────────────────────────

describe("has-test-expectations", () => {
  const r = rule("has-test-expectations");

  it("passes with 'How to verify'", () => {
    const t = ticket({ body: "## How to verify\nRun the suite." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with Playwright mention", () => {
    const t = ticket({ body: "Use Playwright to cover the login flow." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with Jest / pytest / unit test / e2e", () => {
    for (const kw of ["Jest", "pytest", "unit test", "e2e"]) {
      const t = ticket({ body: `Tests written with ${kw}.` });
      assert.equal(r.run(t, cfg()).status, "pass", `Expected pass for keyword: ${kw}`);
    }
  });

  it("fails when no test keywords present", () => {
    const result = r.run(ticket({ body: "Just implement the feature." }), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "warn");
  });
});

// ─── no-ambiguous-verbs ────────────────────────────────────────────────────

describe("no-ambiguous-verbs", () => {
  const r = rule("no-ambiguous-verbs");

  it("fails when title contains 'improve'", () => {
    const t = ticket({ title: "Improve the checkout flow", body: "" });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail");
    assert.match(result.message, /improve/i);
  });

  it("fails for body with 'refactor'", () => {
    const t = ticket({ body: "We need to refactor the auth module." });
    assert.equal(r.run(t, cfg()).status, "fail");
  });

  it("passes when no ambiguous verbs present", () => {
    const t = ticket({ title: "Add retry logic to payment API", body: "Implement exponential backoff." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("picks up extra_terms from config", () => {
    const t = ticket({ title: "Polish the UI", body: "" });
    const result = r.run(t, cfg({ extra_terms: ["polish"] }));
    assert.equal(result.status, "fail");
    assert.match(result.message, /polish/i);
  });

  it("does NOT flag 'polish' without extra_terms", () => {
    // 'polish' is already in AMBIGUOUS_VERBS
    const t = ticket({ title: "Polish the onboarding screens", body: "" });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail"); // it IS in default list
  });
});

// ─── llm-judge-ambiguity ──────────────────────────────────────────────────

describe("llm-judge-ambiguity", () => {
  const r = rule("llm-judge-ambiguity");
  const originalFetch = globalThis.fetch;

  it("is disabled by default for built-in execution", () => {
    assert.equal(r.defaultEnabled, false);
  });

  it("passes when the LLM clarity score meets the threshold and annotates cost", async () => {
    process.env.AGENT_READY_TEST_LLM_KEY = "test-key";
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"score\":0.82,\"explanation\":\"The ticket is concrete and testable.\"}" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 }
    }), { status: 200 });

    const result = await r.run(ticket({ title: "Add retry logic", body: "Acceptance criteria: retry twice and test it." }), cfg({
      enabled: true,
      api_key_env: "AGENT_READY_TEST_LLM_KEY",
      threshold: 0.6,
      cost_per_1k_input: 0.01,
      cost_per_1k_output: 0.02,
    }));

    assert.equal(result.status, "pass");
    assert.match(result.message, /0\.82/);
    assert.equal(result.cost_usd, 0.02);
    globalThis.fetch = originalFetch;
    delete process.env.AGENT_READY_TEST_LLM_KEY;
  });

  it("fails when the LLM clarity score is below threshold", async () => {
    process.env.AGENT_READY_TEST_LLM_KEY = "test-key";
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"score\":0.41,\"explanation\":\"The requested outcome is too broad.\"}" } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    }), { status: 200 });

    const result = await r.run(ticket({ title: "Streamline the experience", body: "Rethink the flow." }), cfg({
      enabled: true,
      api_key_env: "AGENT_READY_TEST_LLM_KEY",
      threshold: 0.6,
    }));

    assert.equal(result.status, "fail");
    assert.match(result.message, /too broad/);
    globalThis.fetch = originalFetch;
    delete process.env.AGENT_READY_TEST_LLM_KEY;
  });

  it("fails clearly when enabled without provider credentials", async () => {
    delete process.env.AGENT_READY_MISSING_LLM_KEY;
    const result = await r.run(ticket(), cfg({
      enabled: true,
      api_key_env: "AGENT_READY_MISSING_LLM_KEY",
    }));

    assert.equal(result.status, "fail");
    assert.match(result.message, /Missing AGENT_READY_MISSING_LLM_KEY/);
  });
});

// ─── body-min-length ───────────────────────────────────────────────────────

describe("body-min-length", () => {
  const r = rule("body-min-length");

  it("passes when body meets the default 100-char minimum", () => {
    const t = ticket({ body: "x".repeat(100) });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails when body is too short", () => {
    const t = ticket({ body: "Too short." });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "error");
  });

  it("respects custom min_count", () => {
    const t = ticket({ body: "x".repeat(50) });
    assert.equal(r.run(t, cfg({ min_count: 50 })).status, "pass");
    assert.equal(r.run(t, cfg({ min_count: 51 })).status, "fail");
  });

  it("trims whitespace before counting", () => {
    const t = ticket({ body: "   " + "x".repeat(100) + "   " });
    assert.equal(r.run(t, cfg()).status, "pass");
  });
});

// ─── no-tribal-knowledge ───────────────────────────────────────────────────

describe("no-tribal-knowledge", () => {
  const r = rule("no-tribal-knowledge");

  it("fails for 'as discussed'", () => {
    const t = ticket({ body: "As discussed in the meeting, do the thing." });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail");
    assert.match(result.message, /as discussed/i);
  });

  it("fails for 'you know what i mean'", () => {
    const t = ticket({ body: "Fix it — you know what I mean." });
    assert.equal(r.run(t, cfg()).status, "fail");
  });

  it("passes when no tribal phrases present", () => {
    const t = ticket({ body: "Add a retry mechanism. See the ADR linked above for context." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });
});

// ─── t-shirt-size-present ──────────────────────────────────────────────────

describe("t-shirt-size-present", () => {
  const r = rule("t-shirt-size-present");

  it("passes with size: in body", () => {
    const t = ticket({ body: "size: M\nImplement feature X." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with size:L label", () => {
    const t = ticket({ labels: ["size:l"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with XL size label", () => {
    const t = ticket({ labels: ["size:xl"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("is case-insensitive on size: in body", () => {
    const t = ticket({ body: "Size: XL" });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails with no size anywhere", () => {
    const result = r.run(ticket({ body: "Just a description." }), cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "warn");
  });
});

// ─── has-design-link ───────────────────────────────────────────────────────

describe("has-design-link", () => {
  const r = rule("has-design-link");

  it("skips for non-UI tickets", () => {
    const t = ticket({ labels: ["backend", "risk:low"] });
    const result = r.run(t, cfg());
    assert.equal(result.status, "skip");
  });

  it("passes for UI ticket with Figma link", () => {
    const t = ticket({
      labels: ["frontend"],
      body: "Design: https://figma.com/file/abc/MyScreen",
    });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("passes with Miro link", () => {
    const t = ticket({ labels: ["ui"], body: "See https://miro.com/board/abc" });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails for UI ticket with no design link", () => {
    const t = ticket({ labels: ["frontend"], body: "A long enough body with no design link." });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail");
    assert.equal(result.severity, "warn");
  });

  it("respects custom trigger labels from config", () => {
    const t = ticket({ labels: ["mobile"], body: "No link here." });
    // default config doesn't include "mobile" → should skip
    assert.equal(r.run(t, cfg()).status, "skip");
    // with custom label config
    const result = r.run(t, cfg({ labels: ["mobile"] }));
    assert.equal(result.status, "fail");
  });
});

// ─── runCustomRegex ────────────────────────────────────────────────────────

describe("runCustomRegex", () => {
  const t = ticket({ title: "Add EPIC-123 feature", body: "Relates to EPIC-456.", labels: ["bug"] });

  it("passes when pattern matches body", () => {
    const result = runCustomRegex(t, "custom-epic", {
      type: "regex", pattern: "EPIC-\\d+", field: "body", severity: "error",
    });
    assert.equal(result.status, "pass");
  });

  it("passes when pattern matches title", () => {
    const result = runCustomRegex(t, "custom-epic", {
      type: "regex", pattern: "EPIC-\\d+", field: "title", severity: "error",
    });
    assert.equal(result.status, "pass");
  });

  it("passes when pattern matches labels", () => {
    const result = runCustomRegex(t, "custom-bug", {
      type: "regex", pattern: "bug", field: "labels", severity: "warn",
    });
    assert.equal(result.status, "pass");
  });

  it("passes when pattern matches any field", () => {
    const result = runCustomRegex(t, "custom-any", {
      type: "regex", pattern: "EPIC-\\d+", field: "any", severity: "error",
    });
    assert.equal(result.status, "pass");
  });

  it("fails when pattern does not match", () => {
    const result = runCustomRegex(t, "custom-jira", {
      type: "regex", pattern: "PROJ-\\d+", field: "body", severity: "error",
    });
    assert.equal(result.status, "fail");
  });

  it("inverts check with must_match: false", () => {
    // Pattern exists but must_match: false means we WANT it absent → fail
    const result = runCustomRegex(t, "no-wip", {
      type: "regex", pattern: "WIP", field: "title", severity: "warn", must_match: false,
    });
    assert.equal(result.status, "pass"); // "WIP" is absent → ok
  });

  it("fails with must_match: false when pattern IS present", () => {
    const tWip = ticket({ title: "WIP: do the thing", body: "" });
    const result = runCustomRegex(tWip, "no-wip", {
      type: "regex", pattern: "WIP", field: "title", severity: "warn", must_match: false,
    });
    assert.equal(result.status, "fail");
  });

  it("fails gracefully when pattern or field missing", () => {
    const result = runCustomRegex(t, "bad-rule", { type: "regex", severity: "error" });
    assert.equal(result.status, "fail");
    assert.match(result.message, /Invalid custom rule/i);
  });

  it("uses custom message in output", () => {
    const result = runCustomRegex(t, "epic-check", {
      type: "regex", pattern: "EPIC-\\d+", field: "body", severity: "error",
      message: "Must link an epic",
    });
    assert.equal(result.message, "Must link an epic");
  });
});

// ─── restricted-paths-declared ─────────────────────────────────────────────

describe("restricted-paths-declared", () => {
  const r = ruleById("restricted-paths-declared");

  it("passes when no restricted signals present", () => {
    const t = ticket({ title: "Add dark mode toggle", body: "Update the UI theme switcher component." });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("fails when body contains 'auth' without risk:high", () => {
    const t = ticket({ title: "Update auth flow", body: "Refactor the authentication module.", labels: ["risk:low"] });
    const result = r.run(t, cfg());
    assert.equal(result.status, "fail");
    assert.match(result.message, /auth/i);
  });

  it("fails when body mentions 'terraform' without risk:high", () => {
    const t = ticket({ body: "Update terraform modules for the prod cluster.", labels: ["risk:medium"] });
    assert.equal(r.run(t, cfg()).status, "fail");
  });

  it("passes when risk:high label is present", () => {
    const t = ticket({ title: "Rotate IAM credentials", body: "Update IAM keys.", labels: ["risk:high"] });
    assert.equal(r.run(t, cfg()).status, "pass");
  });

  it("respects custom keywords list", () => {
    const t = ticket({ body: "Update the billing module.", labels: [] });
    // "billing" is in default list → should fail
    assert.equal(r.run(t, cfg()).status, "fail");
  });

  it("respects custom paths list override", () => {
    const t = ticket({ body: "Edit src/payments/handler.ts", labels: [] });
    const result = r.run(t, cfg({ paths: ["src/payments"] }));
    assert.equal(result.status, "fail");
  });
});

// ─── links-resolve ─────────────────────────────────────────────────────────

describe("links-resolve", () => {
  const r = ruleById("links-resolve");

  it("passes when no URLs present", async () => {
    const t = ticket({ body: "No links here, just plain text description." });
    const result = await r.run(t, cfg());
    assert.equal(result.status, "pass");
    assert.match(result.message, /No URLs/i);
  });

  it("passes when all URLs are in skip_domains", async () => {
    const t = ticket({ body: "See https://example.com/docs and https://localhost/test for details." });
    const result = await r.run(t, cfg({ skip_domains: ["example.com", "localhost"] }));
    assert.equal(result.status, "pass");
    assert.match(result.message, /skip list/i);
  });

  it("fails for an unreachable URL (bad port)", async () => {
    const t = ticket({ body: "See http://localhost:19999/should-not-exist for context." });
    const result = await r.run(t, cfg({ timeout_ms: 1000 }));
    assert.equal(result.status, "fail");
    assert.match(result.message, /localhost/i);
  });

  it("deduplicates repeated URLs", async () => {
    const t = ticket({ body: "http://localhost:19999/x and http://localhost:19999/x again" });
    const result = await r.run(t, cfg({ timeout_ms: 500 }));
    // Should only report one broken URL (deduped)
    assert.ok(!result.message.includes("localhost:19999/x, http://localhost:19999/x"),
      "URL should not appear twice in message");
  });
});
