# MCP Server Integration

`agent-ready` ships an MCP (Model Context Protocol) server that exposes `agent_ready_check` as a tool. Any MCP-compatible client — Claude Desktop, Cursor, or your own custom agent — can call it inline as part of its reasoning loop.

## How it works

```
Agent (Claude Desktop / Cursor / custom)
  │
  │  tools/call  agent_ready_check({ target, adapter, format })
  ▼
agent-ready MCP server (stdio)
  │
  ├─ loads ticket  (file / GitHub / Jira / Linear)
  ├─ loads rule pack (.agent-ready/rules.yaml or bundled default)
  └─ runs lintTicket() → returns LintOutput
  │
  ▼
Agent reads LintOutput.ready, signals, checks[]
and decides what to do next
```

## Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agent-ready": {
      "command": "npx",
      "args": ["-y", "--package=@agentlane/agent-ready", "agent-ready-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_...",
        "JIRA_BASE_URL": "https://acme.atlassian.net",
        "JIRA_EMAIL": "you@example.com",
        "JIRA_API_TOKEN": "...",
        "LINEAR_API_KEY": "lin_api_..."
      }
    }
  }
}
```

Restart Claude Desktop. The `agent_ready_check` tool will appear in the tool list.

## Cursor configuration

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "agent-ready": {
      "command": "npx",
      "args": ["-y", "--package=@agentlane/agent-ready", "agent-ready-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

## Tool: `agent_ready_check`

### Input

| Field | Type | Required | Description |
|---|---|---|---|
| `target` | string | **yes** | Ticket to check — see formats below |
| `adapter` | `file \| github \| jira \| linear` | no | Source adapter. Defaults to `file` |
| `rules` | string | no | Path to a custom rule pack YAML |
| `format` | `json \| text \| markdown \| sarif` | no | Output format. Defaults to `json` |

**Target formats:**
- Local file: `/abs/path/ticket.json` or `./relative/ticket.json`
- GitHub: `owner/repo#123` or `https://github.com/owner/repo/issues/123`
- Jira: `PROJ-123` or `https://acme.atlassian.net/browse/PROJ-123`
- Linear: `TEAM-123` or `https://linear.app/workspace/issue/TEAM-123`

### Output (format=json, default)

Returns the full `LintOutput` object as a JSON string. Key fields:

```json
{
  "ready": true,
  "signals": {
    "path_recommendation": "B",
    "context_tier": "T2",
    "risk_classification": "low"
  },
  "summary": { "passed": 10, "failed": 0, "warnings": 1 },
  "checks": [
    { "id": "has-acceptance-criteria", "status": "pass", "message": "Found 4 acceptance criteria" },
    ...
  ]
}
```

See [schema/output.schema.json](../schema/output.schema.json) for the full schema.

### Output (other formats)

- **`text`** — same as the default CLI output (plain text, ✓/✗/⚠ icons)
- **`markdown`** — GitHub-flavored Markdown suitable for pasting into issue comments
- **`sarif`** — SARIF 2.1.0 JSON for code-scanning tools

## Rule pack resolution

The server looks for a rule pack in this order:

1. The `rules` argument (if provided)
2. `.agent-ready/rules.yaml` in the **current working directory** (where the server was launched)
3. The bundled default rule pack

Set the `cwd` in your MCP config if you want the server to pick up a project-specific rule pack:

```json
{
  "mcpServers": {
    "agent-ready": {
      "command": "npx",
      "args": ["-y", "--package=@agentlane/agent-ready", "agent-ready-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Environment variables

All adapters read credentials from environment variables. Set them in the `env` block of your MCP server config (Claude Desktop / Cursor) or in the process environment if running manually.

| Variable | Adapter | Description |
|---|---|---|
| `GITHUB_TOKEN` or `GH_TOKEN` | github | GitHub personal access token (or falls back to `gh auth token`) |
| `JIRA_BASE_URL` | jira (shorthand only) | `https://acme.atlassian.net` |
| `JIRA_EMAIL` | jira | Atlassian account email |
| `JIRA_API_TOKEN` | jira | API token from id.atlassian.com |
| `LINEAR_API_KEY` | linear | Personal API key from linear.app/settings/api |

## Worked example

After wiring the server into Claude Desktop, you can ask Claude:

> "Check if GitHub issue agentlane/agent-ready#5 is ready for a coding agent."

Claude calls `agent_ready_check({ target: "agentlane/agent-ready#5", adapter: "github" })` and gets back a `LintOutput`. It then reasons about the result:

> "The ticket is **not ready** — it has 2 blockers: no acceptance criteria and no risk classification label. I'd suggest adding `risk:low` and at least two acceptance criteria before assigning it to an agent."

## Custom agent integration

For a custom MCP client (Node.js):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "--package=@agentlane/agent-ready", "agent-ready-mcp"],
  env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
});

const client = new Client({ name: "my-agent", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const result = await client.callTool({
  name: "agent_ready_check",
  arguments: { target: "owner/repo#42", adapter: "github" },
});

const out = JSON.parse(result.content[0].text);

if (!out.ready) {
  console.log("Ticket not ready — blockers:", out.checks.filter(c => c.status === "fail" && c.severity === "error"));
  process.exit(1);
}

// Proceed with agent run — use out.signals to choose execution path
console.log("Path:", out.signals.path_recommendation); // "A" | "B" | "C"
```

## Programmatic alternative

If you don't want the MCP transport overhead, use the SDK directly — see [docs/sdk.md](sdk.md).
