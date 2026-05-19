import { readFile } from "node:fs/promises";
import type { FeedbackEvent, LintOutput } from "../types.js";

export interface ReportOptions {
  /** Path to the feedback JSONL ledger. */
  ledger: string;
  /** Optional: path to a LintOutput JSONL file (from the jsonl telemetry sink). */
  runs?: string;
}

interface RuleStats {
  id: string;
  successWhenPass: number;
  successWhenFail: number;
  totalPass: number;
  totalFail: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctOf(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function outcomeIcon(outcome: string): string {
  if (outcome === "success") return "✓";
  if (outcome === "partial") return "~";
  return "✗";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

// ── Report generator ──────────────────────────────────────────────────────────

export async function generateReport(opts: ReportOptions): Promise<string> {
  // ── Read feedback ledger ──────────────────────────────────────────────────
  let raw: string;
  try {
    raw = await readFile(opts.ledger, "utf8");
  } catch {
    return (
      `No feedback ledger found at ${opts.ledger}\n\n` +
      `Record your first event:\n` +
      `  agent-ready feedback record --ticket-id PROJ-123 --outcome success`
    );
  }

  const events: FeedbackEvent[] = [];
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    try {
      events.push(JSON.parse(line) as FeedbackEvent);
    } catch {
      process.stderr.write(`agent-ready feedback: skipping malformed line in ${opts.ledger}\n`);
    }
  }

  if (events.length === 0) {
    return `Feedback ledger at ${opts.ledger} is empty.`;
  }

  // ── Summary by outcome ────────────────────────────────────────────────────
  const counts = { success: 0, partial: 0, failure: 0 };
  for (const e of events) counts[e.outcome]++;
  const total = events.length;

  // ── Per-rule predictive value (requires runs JSONL) ───────────────────────
  let ruleStats: Map<string, RuleStats> | undefined;

  if (opts.runs) {
    try {
      const runsRaw = await readFile(opts.runs, "utf8");
      const runMap = new Map<string, LintOutput>();
      for (const line of runsRaw.trim().split("\n").filter(Boolean)) {
        try {
          const out = JSON.parse(line) as LintOutput;
          if (out.run_id) runMap.set(out.run_id, out);
        } catch {
          process.stderr.write(`agent-ready feedback: skipping malformed line in ${opts.runs}\n`);
        }
      }

      ruleStats = new Map<string, RuleStats>();
      for (const event of events) {
        if (!event.run_id) continue;
        const run = runMap.get(event.run_id);
        if (!run) continue;
        const isSuccess = event.outcome === "success";
        for (const check of run.checks) {
          let s = ruleStats.get(check.id);
          if (!s) {
            s = { id: check.id, successWhenPass: 0, successWhenFail: 0, totalPass: 0, totalFail: 0 };
            ruleStats.set(check.id, s);
          }
          if (check.status === "pass") {
            s.totalPass++;
            if (isSuccess) s.successWhenPass++;
          } else if (check.status === "fail") {
            s.totalFail++;
            if (isSuccess) s.successWhenFail++;
          }
        }
      }
    } catch {
      /* runs file unreadable — skip per-rule analysis */
    }
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push("agent-ready feedback report");
  lines.push("=".repeat(42));
  lines.push("");
  lines.push(`Total recorded runs: ${total}`);
  lines.push(`  ✓ success  ${String(counts.success).padStart(4)}  (${pctOf(counts.success, total)}%)`);
  lines.push(`  ~ partial  ${String(counts.partial).padStart(4)}  (${pctOf(counts.partial, total)}%)`);
  lines.push(`  ✗ failure  ${String(counts.failure).padStart(4)}  (${pctOf(counts.failure, total)}%)`);

  // Recent events (last 5)
  lines.push("");
  lines.push(`Recent events (last ${Math.min(5, events.length)}):`);
  const recent = [...events].reverse().slice(0, 5);
  for (const e of recent) {
    const when = new Date(e.recorded_at).toLocaleDateString();
    lines.push(
      `  ${outcomeIcon(e.outcome)} ${pad(e.ticket_id, 16)} ${pad(e.outcome, 10)} ${when}` +
      (e.duration_min !== undefined ? `  ${e.duration_min} min` : "")
    );
    if (e.notes) lines.push(`      notes: ${e.notes}`);
  }

  // Per-rule predictive value table
  if (ruleStats && ruleStats.size > 0) {
    lines.push("");
    lines.push("Per-rule predictive value:");
    lines.push(
      "  " +
      pad("Rule", 32) +
      pad("Pass→Success", 14) +
      pad("Fail→Success", 14) +
      "Signal"
    );
    lines.push("  " + "─".repeat(72));

    const sorted = [...ruleStats.values()].sort((a, b) => {
      const da = pctOf(a.successWhenPass, a.totalPass) - pctOf(a.successWhenFail, a.totalFail);
      const db = pctOf(b.successWhenPass, b.totalPass) - pctOf(b.successWhenFail, b.totalFail);
      return db - da;
    });

    for (const r of sorted) {
      const ps = pctOf(r.successWhenPass, r.totalPass);
      const fs = pctOf(r.successWhenFail, r.totalFail);
      const diff = ps - fs;
      const signal =
        diff > 20 ? "strong ↑" : diff > 5 ? "moderate" : diff < -5 ? "inverse ↓" : "neutral";
      lines.push(
        `  ${pad(r.id, 32)}${pad(`${ps}%`, 14)}${pad(`${fs}%`, 14)}${signal}`
      );
    }

    lines.push("");
    lines.push(
      "  Tip: 'strong ↑' rules are reliable predictors of agent success — " +
      "consider raising their severity."
    );
  } else if (opts.runs) {
    lines.push("");
    lines.push(
      "  (No joined run data — ensure run_id is recorded with each feedback event " +
      "and telemetry.jsonl is specified)"
    );
  }

  return lines.join("\n");
}
