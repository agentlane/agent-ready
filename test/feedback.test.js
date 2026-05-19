/**
 * Unit tests for the feedback loop (recordFeedback, generateReport).
 * Uses real tmpdir for JSONL files — no mocking needed.
 * Runs via: node --test test/feedback.test.js
 * Requires: npm run build
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { recordFeedback } from "../dist/feedback/record.js";
import { generateReport } from "../dist/feedback/report.js";

let tmpDir;

before(async () => { tmpDir = await mkdtemp(join(tmpdir(), "feedback-test-")); });
after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

// ── recordFeedback ────────────────────────────────────────────────────────────

describe("recordFeedback", () => {
  it("writes a valid FeedbackEvent JSON line to the ledger", async () => {
    const ledger = join(tmpDir, "r1.jsonl");
    const event = await recordFeedback({
      ticketId: "PROJ-1",
      outcome: "success",
      ledger,
    });

    const content = await readFile(ledger, "utf8");
    const parsed = JSON.parse(content.trim());

    assert.equal(parsed.feedback_schema_version, "1.0");
    assert.equal(parsed.ticket_id, "PROJ-1");
    assert.equal(parsed.outcome, "success");
    assert.ok(typeof parsed.recorded_at === "string");
    assert.equal(event.ticket_id, "PROJ-1");
  });

  it("includes optional fields when provided", async () => {
    const ledger = join(tmpDir, "r2.jsonl");
    await recordFeedback({
      ticketId: "PROJ-2",
      outcome: "partial",
      notes: "AC1 done, AC2 blocked",
      durationMin: 45,
      runId: "abc-123",
      ledger,
    });

    const parsed = JSON.parse((await readFile(ledger, "utf8")).trim());
    assert.equal(parsed.notes, "AC1 done, AC2 blocked");
    assert.equal(parsed.duration_min, 45);
    assert.equal(parsed.run_id, "abc-123");
  });

  it("appends multiple events as separate JSONL lines", async () => {
    const ledger = join(tmpDir, "r3.jsonl");
    await recordFeedback({ ticketId: "A-1", outcome: "success", ledger });
    await recordFeedback({ ticketId: "A-2", outcome: "failure", ledger });
    await recordFeedback({ ticketId: "A-3", outcome: "partial", ledger });

    const lines = (await readFile(ledger, "utf8")).trim().split("\n");
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[0]).ticket_id, "A-1");
    assert.equal(JSON.parse(lines[1]).outcome, "failure");
    assert.equal(JSON.parse(lines[2]).outcome, "partial");
  });

  it("creates parent directories if they don't exist", async () => {
    const ledger = join(tmpDir, "nested", "dir", "feedback.jsonl");
    await recordFeedback({ ticketId: "PROJ-X", outcome: "success", ledger });
    const content = await readFile(ledger, "utf8");
    assert.ok(content.length > 0);
  });

  it("each event has a recorded_at ISO timestamp", async () => {
    const ledger = join(tmpDir, "r4.jsonl");
    await recordFeedback({ ticketId: "PROJ-3", outcome: "success", ledger });
    const parsed = JSON.parse((await readFile(ledger, "utf8")).trim());
    assert.ok(new Date(parsed.recorded_at).getTime() > 0, "recorded_at should be a valid date");
  });

  it("outcome: failure is stored correctly", async () => {
    const ledger = join(tmpDir, "r5.jsonl");
    await recordFeedback({ ticketId: "PROJ-4", outcome: "failure", ledger });
    const parsed = JSON.parse((await readFile(ledger, "utf8")).trim());
    assert.equal(parsed.outcome, "failure");
  });
});

// ── generateReport ────────────────────────────────────────────────────────────

describe("generateReport", () => {
  it("returns a helpful message when ledger does not exist", async () => {
    const report = await generateReport({ ledger: join(tmpDir, "nonexistent.jsonl") });
    assert.ok(report.includes("No feedback ledger found"), `Got: ${report}`);
  });

  it("returns a summary with outcome counts", async () => {
    const ledger = join(tmpDir, "rpt1.jsonl");
    await recordFeedback({ ticketId: "P-1", outcome: "success", ledger });
    await recordFeedback({ ticketId: "P-2", outcome: "success", ledger });
    await recordFeedback({ ticketId: "P-3", outcome: "failure", ledger });

    const report = await generateReport({ ledger });
    assert.ok(report.includes("Total recorded runs: 3"), `Got: ${report}`);
    assert.ok(report.includes("success"), `Got: ${report}`);
    assert.ok(report.includes("failure"), `Got: ${report}`);
  });

  it("shows recent events section", async () => {
    const ledger = join(tmpDir, "rpt2.jsonl");
    await recordFeedback({ ticketId: "PROJ-99", outcome: "partial", notes: "Half done", ledger });

    const report = await generateReport({ ledger });
    assert.ok(report.includes("PROJ-99"), `Got: ${report}`);
    assert.ok(report.includes("partial"), `Got: ${report}`);
  });

  it("produces per-rule stats when runs JSONL is provided", async () => {
    const ledger = join(tmpDir, "rpt3-feedback.jsonl");
    const runsFile = join(tmpDir, "rpt3-runs.jsonl");

    // Write a mock LintOutput JSONL record
    const mockRun = {
      schema_version: "1.2",
      run_id: "run-abc-001",
      ticket_id: "PROJ-5",
      adapter: "file",
      rule_pack: "default",
      rule_pack_version: "1",
      source: { adapter: "file" },
      signals: { path_recommendation: "A", context_tier: "T1", risk_classification: "low" },
      path_recommendation: "A",
      context_tier: "T1",
      checked_at: new Date().toISOString(),
      ready: true,
      summary: { passed: 2, failed: 0, warnings: 0 },
      checks: [
        { id: "has-acceptance-criteria", status: "pass", severity: "error", message: "ok" },
        { id: "body-min-length", status: "pass", severity: "error", message: "ok" },
      ],
    };

    const { writeFile, appendFile } = await import("node:fs/promises");
    await writeFile(runsFile, JSON.stringify(mockRun) + "\n", "utf8");

    // Record feedback linked to that run
    await appendFile(
      ledger,
      JSON.stringify({
        feedback_schema_version: "1.0",
        ticket_id: "PROJ-5",
        run_id: "run-abc-001",
        outcome: "success",
        recorded_at: new Date().toISOString(),
      }) + "\n",
      "utf8"
    );

    const report = await generateReport({ ledger, runs: runsFile });
    assert.ok(report.includes("Per-rule predictive value"), `Got: ${report}`);
    assert.ok(report.includes("has-acceptance-criteria"), `Got: ${report}`);
  });

  it("handles an empty ledger gracefully", async () => {
    const { writeFile } = await import("node:fs/promises");
    const ledger = join(tmpDir, "empty.jsonl");
    await writeFile(ledger, "", "utf8");
    const report = await generateReport({ ledger });
    assert.ok(report.includes("empty"), `Got: ${report}`);
  });
});

// ── run_id on LintOutput ──────────────────────────────────────────────────────

describe("LintOutput.run_id", () => {
  it("lintTicket generates a unique run_id per call", async () => {
    const { lintTicket } = await import("../dist/index.js");

    const ticket = {
      id: "PROJ-T",
      title: "Test",
      body: "x".repeat(200),
      labels: ["risk:low"],
    };
    const pack = { version: 1, rules: {} };

    const [a, b] = await Promise.all([
      lintTicket(ticket, pack, { adapter: "file", rulePackName: "default" }),
      lintTicket(ticket, pack, { adapter: "file", rulePackName: "default" }),
    ]);

    assert.ok(typeof a.run_id === "string" && a.run_id.length > 0);
    assert.ok(typeof b.run_id === "string" && b.run_id.length > 0);
    assert.notEqual(a.run_id, b.run_id, "run_id should be unique per run");
  });

  it("run_id can be used to join feedback to LintOutput via JSONL", async () => {
    const { lintTicket } = await import("../dist/index.js");

    const ticket = {
      id: "PROJ-JOIN",
      title: "Join test",
      body: "x".repeat(200),
      labels: ["risk:low"],
    };
    const pack = { version: 1, rules: {} };
    const out = await lintTicket(ticket, pack, { adapter: "file", rulePackName: "default" });

    // Write LintOutput to runs JSONL
    const { appendFile } = await import("node:fs/promises");
    const runsFile = join(tmpDir, "join-runs.jsonl");
    const ledger = join(tmpDir, "join-feedback.jsonl");
    await appendFile(runsFile, JSON.stringify(out) + "\n", "utf8");

    // Record feedback with matching run_id
    await recordFeedback({
      ticketId: out.ticket_id,
      outcome: "success",
      runId: out.run_id,
      ledger,
    });

    // Generate report — should join and show per-rule stats
    const report = await generateReport({ ledger, runs: runsFile });
    assert.ok(report.includes("Per-rule predictive value"), `Got: ${report}`);
  });
});
