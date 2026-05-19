# Programmatic API (SDK)

`@agentlane/agent-ready` ships a clean Node/TypeScript library API. You can call `lintTicket` directly from your own orchestrator, CI script, or agent — no CLI shell-out needed.

## Install

```bash
npm install @agentlane/agent-ready
```

## Quick start

```ts
import { lintTicket, loadTicketFromFile } from "@agentlane/agent-ready";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

// Load the default rule pack (or your own)
const pack = parseYaml(
  await readFile("node_modules/@agentlane/agent-ready/rule-packs/default.yaml", "utf8")
);

// Load a ticket from a JSON file …
const ticket = await loadTicketFromFile("./ticket.json");

// … or build one in-memory
// const ticket = { id: "PROJ-1", title: "…", body: "…", labels: ["risk:low"] };

const result = await lintTicket(ticket, pack, {
  adapter: "file",
  rulePackName: "default",
  rulePackVersion: String(pack.version),
});

console.log(result.ready);           // true | false
console.log(result.signals);         // { path_recommendation: "A", context_tier: "T1", risk_classification: "low" }
console.log(result.summary);         // { passed: 10, failed: 0, warnings: 1 }
```

## Entry points

| Import path | What it exports |
|---|---|
| `@agentlane/agent-ready` | Everything — functions, renderers, types |
| `@agentlane/agent-ready/adapters` | Just the four ticket-loading adapters |
| `@agentlane/agent-ready/render` | Just the three renderers |
| `@agentlane/agent-ready/types` | Type-only — for TypeScript consumers who only need type declarations |

---

## API reference

### `lintTicket(ticket, pack, opts) → Promise<LintOutput>`

The core linting function. Pure — no filesystem or network I/O in the hot path. Async because individual rules (e.g. `llm-judge-ambiguity`, `links-resolve`) may be async.

```ts
import { lintTicket } from "@agentlane/agent-ready";

const result = await lintTicket(ticket, pack, {
  adapter: "github",          // "file" | "github" | "jira" | "linear" | any string
  rulePackName: "default",    // displayed in the output JSON
  rulePackVersion: "1",       // displayed in the output JSON
  rulePackHash: "sha256…",    // optional: sha256 of the raw YAML for auditability
  source: {                   // optional: all fields are optional
    path: "/path/to/ticket.json",
    commit_sha: "abc123",
    ref: "main",
  },
});
```

**Returns:** [`LintOutput`](#lintoutput) — the full result object.

---

### Adapters

All adapters return `Promise<Ticket>`. They read environment variables directly — document these clearly when embedding in a server.

#### `loadTicketFromFile(path: string) → Promise<Ticket>`

Reads a JSON ticket file. The file must have `id` and `title` fields.

```ts
import { loadTicketFromFile } from "@agentlane/agent-ready";
// or: from "@agentlane/agent-ready/adapters"

const ticket = await loadTicketFromFile("./ticket.json");
```

#### `loadTicketFromGitHub(target: string) → Promise<Ticket>`

Fetches a GitHub Issue. `target` is `owner/repo#123` or a full `https://github.com/…/issues/123` URL.

**Env vars:** `GITHUB_TOKEN` or `GH_TOKEN` (optional — falls back to `gh auth token`).

```ts
import { loadTicketFromGitHub } from "@agentlane/agent-ready";

const ticket = await loadTicketFromGitHub("agentlane/agent-ready#1");
```

#### `loadTicketFromJira(target: string) → Promise<Ticket>`

Fetches a Jira Cloud issue. `target` is `PROJ-123` or a full `https://acme.atlassian.net/browse/PROJ-123` URL.

**Env vars:**

| Variable | Required | Description |
|---|---|---|
| `JIRA_BASE_URL` | Yes (shorthand only) | `https://acme.atlassian.net` |
| `JIRA_EMAIL` | Yes | Atlassian account email |
| `JIRA_API_TOKEN` | Yes | API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |

```ts
import { loadTicketFromJira } from "@agentlane/agent-ready";

process.env.JIRA_BASE_URL   = "https://acme.atlassian.net";
process.env.JIRA_EMAIL      = "you@example.com";
process.env.JIRA_API_TOKEN  = "your-api-token";

const ticket = await loadTicketFromJira("PROJ-123");
```

#### `loadTicketFromLinear(target: string) → Promise<Ticket>`

Fetches a Linear issue. `target` is `TEAM-123` or a full `https://linear.app/…/issue/TEAM-123` URL.

**Env vars:**

| Variable | Required | Description |
|---|---|---|
| `LINEAR_API_KEY` | Yes | Personal API key from [linear.app/settings/api](https://linear.app/settings/api) |

```ts
import { loadTicketFromLinear } from "@agentlane/agent-ready";

process.env.LINEAR_API_KEY = "lin_api_…";
const ticket = await loadTicketFromLinear("TEAM-123");
```

---

### Renderers

```ts
import { renderMarkdown, renderText, renderSarif } from "@agentlane/agent-ready";
// or: from "@agentlane/agent-ready/render"
```

#### `renderText(out: LintOutput) → string`

Plain-text output — same as the default CLI output.

#### `renderMarkdown(out: LintOutput) → string`

GitHub-flavored Markdown suitable for PR comments or issue comments.

#### `renderSarif(out: LintOutput) → string`

SARIF 2.1.0 JSON string — suitable for GitHub code-scanning upload.

---

## Types

```ts
import type {
  Ticket,
  RulePack,
  RuleConfig,
  BuiltinRuleConfig,
  RegexRuleConfig,
  SignalsConfig,
  LintOutput,
  LintSignals,
  LintSource,
  CheckResult,
  Rule,
  Severity,
  AgentPath,
  ContextTier,
  RiskClassification,
} from "@agentlane/agent-ready";
```

### `Ticket`

```ts
interface Ticket {
  id: string;       // e.g. "PROJ-123" or "#42"
  title: string;
  body: string;
  labels: string[]; // e.g. ["risk:low", "ui", "size:M"]
  url?: string;
}
```

### `LintOutput`

The full result object returned by `lintTicket`.

```ts
interface LintOutput {
  schema_version: "1.1";
  agent_ready_version: string;
  ticket_id: string;
  adapter: string;
  rule_pack: string;
  rule_pack_version: string;
  rule_pack_hash?: string;
  source: LintSource;
  signals: LintSignals;
  path_recommendation: AgentPath;    // "A" | "B" | "C"
  context_tier: ContextTier;         // "T1" | "T2" | "T3"
  checked_at: string;                // ISO timestamp
  ready: boolean;
  summary: { passed: number; failed: number; warnings: number };
  checks: CheckResult[];
}
```

### `CheckResult`

One entry per rule in `LintOutput.checks`.

```ts
interface CheckResult {
  id: string;
  severity: "error" | "warn" | "info";
  status: "pass" | "fail" | "skip";
  message: string;
  hint?: string;
  cost_usd?: number;   // populated by llm-judge-ambiguity when cost tracking is enabled
}
```

### `LintSignals`

Deterministic routing output derived from check results and labels.

```ts
interface LintSignals {
  path_recommendation: "A" | "B" | "C";
  context_tier: "T1" | "T2" | "T3";
  risk_classification: "low" | "medium" | "high";
}
```

---

## Complete example

See [`examples/sdk/programmatic.mjs`](../examples/sdk/programmatic.mjs) for a runnable end-to-end example that:

1. Loads the default rule pack
2. Lints both a bad and a good fixture ticket
3. Renders `renderText` output
4. Asserts the expected ready/not-ready result and exits non-zero on failure

Run it after `npm run build`:

```bash
node examples/sdk/programmatic.mjs
```

This example runs in CI on every PR (`npm run example:sdk`).
