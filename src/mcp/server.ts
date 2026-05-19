#!/usr/bin/env node
/**
 * agent-ready MCP server — exposes `agent_ready_check` as an MCP tool.
 *
 * Wire into Claude Desktop / Cursor:
 *   command: npx
 *   args:    ["@agentlane/agent-ready", "agent-ready-mcp"]
 *
 * See docs/mcp.md for full configuration examples.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { RulePack } from "../types.js";
import { lintTicket } from "../lint.js";
import { emitLintOutput } from "../telemetry/emit.js";
import { loadTicketFromFile } from "../adapters/file.js";
import { loadTicketFromGitHub } from "../adapters/github.js";
import { loadTicketFromJira } from "../adapters/jira.js";
import { loadTicketFromLinear } from "../adapters/linear.js";
import { renderMarkdown, renderText } from "../render/markdown.js";
import { renderSarif } from "../render/sarif.js";
import { VERSION } from "../version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Rule pack loading ─────────────────────────────────────────────────────────

async function loadRulePack(customPath?: string): Promise<{
  pack: RulePack;
  name: string;
  version: string;
  hash: string;
}> {
  // 1. Explicit custom path
  // 2. cwd/.agent-ready/rules.yaml
  // 3. Bundled default
  const bundledDefault = resolve(__dirname, "..", "..", "rule-packs", "default.yaml");

  let filePath = customPath ?? bundledDefault;

  if (!customPath) {
    const localPath = resolve(process.cwd(), ".agent-ready", "rules.yaml");
    try {
      await readFile(localPath, "utf8");
      filePath = localPath;
    } catch {
      // fall back to bundled default
    }
  }

  const raw = await readFile(filePath, "utf8");
  const pack = parseYaml(raw) as RulePack;
  const hash = createHash("sha256").update(raw).digest("hex");
  const name = customPath ? filePath : (filePath === bundledDefault ? "default" : filePath);

  return { pack, name, version: String(pack.version), hash };
}

// ── Tool schema ───────────────────────────────────────────────────────────────

const TOOL_DEFINITION = {
  name: "agent_ready_check",
  description:
    "Check whether a ticket (GitHub Issue, Jira ticket, Linear issue, or local JSON file) " +
    "has enough context for an AI coding agent to produce a safe, correct PR. " +
    "Returns a LintOutput object with signals (path_recommendation, context_tier, risk_classification), " +
    "per-rule check results, and a top-level `ready` boolean.",
  inputSchema: {
    type: "object" as const,
    properties: {
      target: {
        type: "string",
        description:
          "The ticket to check. Accepted formats:\n" +
          "  • Local file:  /abs/path/to/ticket.json  or  ./relative/ticket.json\n" +
          "  • GitHub:      owner/repo#123  or  https://github.com/owner/repo/issues/123\n" +
          "  • Jira:        PROJ-123  or  https://acme.atlassian.net/browse/PROJ-123\n" +
          "  • Linear:      TEAM-123  or  https://linear.app/acme/issue/TEAM-123",
      },
      adapter: {
        type: "string",
        enum: ["file", "github", "jira", "linear"],
        description:
          'Source adapter. Defaults to "file" for local paths. ' +
          'Set "github", "jira", or "linear" to fetch from the corresponding service.',
      },
      rules: {
        type: "string",
        description:
          "Optional path to a custom rule pack YAML. " +
          "If omitted, looks for .agent-ready/rules.yaml in the current directory, " +
          "then falls back to the built-in default rule pack.",
      },
      format: {
        type: "string",
        enum: ["json", "text", "markdown", "sarif"],
        description:
          'Output format. Defaults to "json" (full LintOutput object). ' +
          '"text" and "markdown" return human-readable strings. ' +
          '"sarif" returns SARIF 2.1.0 JSON.',
      },
    },
    required: ["target"],
  },
};

// ── Server factory (exported for testing) ─────────────────────────────────────

export function createMcpServer(): Server {
  const server = new Server(
    { name: "agent-ready", version: VERSION },
    { capabilities: { tools: {} } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [TOOL_DEFINITION],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "agent_ready_check") {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const args = (request.params.arguments ?? {}) as {
      target?: string;
      adapter?: string;
      rules?: string;
      format?: string;
    };

    if (!args.target) {
      return {
        content: [{ type: "text" as const, text: "Missing required argument: target" }],
        isError: true,
      };
    }

    const adapterName = (args.adapter ?? "file") as "file" | "github" | "jira" | "linear";
    const format = (args.format ?? "json") as "json" | "text" | "markdown" | "sarif";

    try {
      // Load ticket
      const ticket =
        adapterName === "github" ? await loadTicketFromGitHub(args.target) :
        adapterName === "jira"   ? await loadTicketFromJira(args.target)   :
        adapterName === "linear" ? await loadTicketFromLinear(args.target) :
        await loadTicketFromFile(args.target);

      // Load rule pack
      const { pack, name, version, hash } = await loadRulePack(args.rules);

      // Run lint
      const out = await lintTicket(ticket, pack, {
        adapter: adapterName,
        rulePackName: name,
        rulePackVersion: version,
        rulePackHash: hash,
      });

      // Telemetry: emit to configured sinks (fail-soft)
      const sinks = pack.output?.sinks ?? [];
      if (sinks.length) {
        await emitLintOutput(out, sinks);
      }

      // Format output
      let text: string;
      if (format === "text") {
        text = renderText(out);
      } else if (format === "markdown") {
        text = renderMarkdown(out);
      } else if (format === "sarif") {
        text = renderSarif(out);
      } else {
        text = JSON.stringify(out, null, 2);
      }

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `agent-ready error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until the transport closes (stdin EOF / process signal)
}

// Guard: only start the stdio server when this file is the direct entry point.
// When imported as a library (e.g. in tests), skip the blocking stdio setup.
const _isMain =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`agent-ready-mcp: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
