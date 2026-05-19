#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import type { RulePack } from "./types.js";
import { VERSION } from "./version.js";
import { lintTicket } from "./lint.js";
import { loadTicketFromFile } from "./adapters/file.js";
import { loadTicketFromGitHub } from "./adapters/github.js";
import { loadTicketFromJira } from "./adapters/jira.js";
import { loadTicketFromLinear } from "./adapters/linear.js";
import { renderMarkdown, renderText } from "./render/markdown.js";
import { renderSarif } from "./render/sarif.js";
import { emitLintOutput } from "./telemetry/emit.js";
import { recordFeedback } from "./feedback/record.js";
import { generateReport } from "./feedback/report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Args {
  command: "check" | "feedback-record" | "feedback-report" | "help" | "version";
  target?: string;
  adapter: "file" | "github" | "jira" | "linear";
  rules?: string;
  format: "text" | "markdown" | "json" | "sarif" | "all";
  noTelemetry: boolean;
  // feedback record
  feedbackTicketId?: string;
  feedbackOutcome?: "success" | "partial" | "failure";
  feedbackNotes?: string;
  feedbackDurationMin?: number;
  feedbackRunId?: string;
  feedbackLedger: string;
  // feedback report
  feedbackRuns?: string;
}

const DEFAULT_LEDGER = ".agent-ready/feedback.jsonl";

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "help",
    adapter: "file",
    format: "text",
    noTelemetry: false,
    feedbackLedger: DEFAULT_LEDGER,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--adapter")           args.adapter = argv[++i] as Args["adapter"];
    else if (a === "--rules")        args.rules = argv[++i];
    else if (a === "--format")       args.format = argv[++i] as Args["format"];
    else if (a === "--no-telemetry") args.noTelemetry = true;
    else if (a === "--ticket-id")    args.feedbackTicketId = argv[++i];
    else if (a === "--outcome") {
      const v = argv[++i];
      if (v !== "success" && v !== "partial" && v !== "failure") {
        console.error(`agent-ready: --outcome must be one of: success, partial, failure`);
        process.exit(2);
      }
      args.feedbackOutcome = v;
    }
    else if (a === "--notes")        args.feedbackNotes = argv[++i];
    else if (a === "--duration-min") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n)) {
        console.error(`agent-ready: --duration-min must be a finite number`);
        process.exit(2);
      }
      args.feedbackDurationMin = n;
    }
    else if (a === "--run-id")       args.feedbackRunId = argv[++i];
    else if (a === "--ledger")       args.feedbackLedger = argv[++i];
    else if (a === "--runs")         args.feedbackRuns = argv[++i];
    else if (a === "-h" || a === "--help")    args.command = "help";
    else if (a === "-v" || a === "--version") args.command = "version";
    else rest.push(a);
  }

  if (rest[0] === "check" && rest[1]) {
    args.command = "check";
    args.target = rest[1];
  } else if (rest[0] === "feedback" && rest[1] === "record") {
    args.command = "feedback-record";
  } else if (rest[0] === "feedback" && rest[1] === "report") {
    args.command = "feedback-report";
  } else if (rest[0] === "help") {
    args.command = "help";
  } else if (rest[0]) {
    args.command = "check";
    args.target = rest[0];
  }
  return args;
}

async function loadRulePack(path?: string): Promise<{ pack: RulePack; name: string; version: string; hash: string }> {
  const defaultPath = resolve(__dirname, "..", "rule-packs", "default.yaml");
  const file = path ?? defaultPath;
  const raw = await readFile(file, "utf8");
  const pack = parseYaml(raw) as RulePack;
  const hash = createHash("sha256").update(raw).digest("hex");
  return { pack, name: path ? file : "default", version: String(pack.version), hash };
}

function gitValue(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

function usage(): string {
  return `agent-ready — Make every ticket ready for AI coding agents.

Usage:
  agent-ready check <ticket-or-file> [--adapter file|github|jira|linear] [--rules <path>] [--format text|markdown|json|sarif|all] [--no-telemetry]
  agent-ready feedback record --ticket-id <id> --outcome success|partial|failure [--notes <text>] [--duration-min <n>] [--run-id <uuid>] [--ledger <path>]
  agent-ready feedback report [--ledger <path>] [--runs <lint-jsonl-path>]
  agent-ready --version
  agent-ready --help

Examples:
  agent-ready check examples/tickets/bad-ticket.json
  agent-ready check examples/tickets/good-ticket.json --format markdown
  agent-ready check owner/repo#123 --adapter github
  agent-ready check PROJ-123 --adapter jira
  agent-ready check TEAM-123 --adapter linear
  agent-ready feedback record --ticket-id PROJ-123 --outcome success --duration-min 22
  agent-ready feedback report --runs .agent-ready/runs.jsonl
`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "version") {
    console.log(VERSION);
    return 0;
  }

  // ── feedback record ──────────────────────────────────────────────────────
  if (args.command === "feedback-record") {
    if (!args.feedbackTicketId) {
      console.error("agent-ready: --ticket-id is required for feedback record");
      return 2;
    }
    if (!args.feedbackOutcome) {
      console.error("agent-ready: --outcome (success|partial|failure) is required for feedback record");
      return 2;
    }
    const event = await recordFeedback({
      ticketId: args.feedbackTicketId,
      outcome: args.feedbackOutcome,
      notes: args.feedbackNotes,
      durationMin: args.feedbackDurationMin,
      runId: args.feedbackRunId,
      ledger: args.feedbackLedger,
    });
    console.log(`✓ Feedback recorded → ${args.feedbackLedger}`);
    console.log(`  ticket: ${event.ticket_id}  outcome: ${event.outcome}  at: ${event.recorded_at}`);
    if (event.run_id) console.log(`  run_id: ${event.run_id}`);
    return 0;
  }

  // ── feedback report ──────────────────────────────────────────────────────
  if (args.command === "feedback-report") {
    const report = await generateReport({
      ledger: args.feedbackLedger,
      runs: args.feedbackRuns,
    });
    console.log(report);
    return 0;
  }

  if (args.command === "help" || !args.target) {
    console.log(usage());
    return 0;
  }
  const ticket =
    args.adapter === "github" ? await loadTicketFromGitHub(args.target)  :
    args.adapter === "jira"   ? await loadTicketFromJira(args.target)    :
    args.adapter === "linear" ? await loadTicketFromLinear(args.target)  :
    await loadTicketFromFile(args.target);
  const { pack, name, version, hash } = await loadRulePack(args.rules);
  const out = await lintTicket(ticket, pack, {
    adapter: args.adapter,
    rulePackName: name,
    rulePackVersion: version,
    rulePackHash: hash,
    source: {
      path: args.adapter === "file" ? resolve(args.target) : undefined,
      commit_sha: args.adapter === "file" ? gitValue(["rev-parse", "HEAD"]) : undefined,
      ref: args.adapter === "file" ? gitValue(["rev-parse", "--abbrev-ref", "HEAD"]) : undefined
    }
  });

  if (args.format === "json") console.log(JSON.stringify(out, null, 2));
  else if (args.format === "markdown") console.log(renderMarkdown(out));
  else if (args.format === "sarif") console.log(renderSarif(out));
  else if (args.format === "all") {
    // Single-pass envelope: json + markdown in one call (avoids double link-check etc.)
    console.log(JSON.stringify({ json: out, markdown: renderMarkdown(out) }, null, 2));
  } else console.log(renderText(out));

  // Telemetry: emit to configured sinks (fail-soft; never affects exit code)
  if (!args.noTelemetry) {
    const sinks = pack.output?.sinks ?? [];
    if (sinks.length) {
      await emitLintOutput(out, sinks);
    }
  }

  return out.ready ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`agent-ready: ${err?.message ?? err}`);
    process.exit(2);
  });
