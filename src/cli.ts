#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { RulePack } from "./types.js";
import { lintTicket } from "./lint.js";
import { loadTicketFromFile } from "./adapters/file.js";
import { loadTicketFromGitHub } from "./adapters/github.js";
import { renderMarkdown, renderText } from "./render/markdown.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Args {
  command: "check" | "help" | "version";
  target?: string;
  adapter: "file" | "github" | "jira" | "linear";
  rules?: string;
  format: "text" | "markdown" | "json";
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: "help", adapter: "file", format: "text" };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--adapter") args.adapter = argv[++i] as Args["adapter"];
    else if (a === "--rules") args.rules = argv[++i];
    else if (a === "--format") args.format = argv[++i] as Args["format"];
    else if (a === "-h" || a === "--help") args.command = "help";
    else if (a === "-v" || a === "--version") args.command = "version";
    else rest.push(a);
  }
  if (rest[0] === "check" && rest[1]) {
    args.command = "check";
    args.target = rest[1];
  } else if (rest[0] === "help") {
    args.command = "help";
  } else if (rest[0]) {
    args.command = "check";
    args.target = rest[0];
  }
  return args;
}

async function loadRulePack(path?: string): Promise<{ pack: RulePack; name: string }> {
  const defaultPath = resolve(__dirname, "..", "rule-packs", "default.yaml");
  const file = path ?? defaultPath;
  const raw = await readFile(file, "utf8");
  const pack = parseYaml(raw) as RulePack;
  return { pack, name: path ? file : "default" };
}

function usage(): string {
  return `agent-ready — Make every ticket ready for AI coding agents.

Usage:
  agent-ready check <ticket-or-file> [--adapter file|github|jira|linear] [--rules <path>] [--format text|markdown|json]
  agent-ready --version
  agent-ready --help

Examples:
  agent-ready check examples/tickets/bad-ticket.json
  agent-ready check examples/tickets/good-ticket.json --format markdown
  agent-ready check owner/repo#123 --adapter github
  agent-ready check https://github.com/owner/repo/issues/123 --adapter github
`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "version") {
    console.log("0.0.1");
    return 0;
  }
  if (args.command === "help" || !args.target) {
    console.log(usage());
    return 0;
  }
  if (args.adapter === "jira" || args.adapter === "linear") {
    console.error(`Adapter '${args.adapter}' is not implemented yet. Use --adapter file or --adapter github.`);
    return 2;
  }

  const ticket = args.adapter === "github"
    ? await loadTicketFromGitHub(args.target)
    : await loadTicketFromFile(args.target);
  const { pack, name } = await loadRulePack(args.rules);
  const out = lintTicket(ticket, pack, { adapter: args.adapter, rulePackName: name });

  if (args.format === "json") console.log(JSON.stringify(out, null, 2));
  else if (args.format === "markdown") console.log(renderMarkdown(out));
  else console.log(renderText(out));

  return out.ready ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`agent-ready: ${err?.message ?? err}`);
    process.exit(2);
  });
