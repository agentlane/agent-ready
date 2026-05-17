# agent-ready

> Make every ticket ready for AI coding agents.

`agent-ready` is a Definition-of-Ready linter that runs **before** an AI coding agent picks up a ticket. It answers one question: *is this issue actually ready for an agent to work on?*

If the answer is no, it tells you exactly what's missing — in seconds, in CI, in the PR comment, before any tokens are spent.

![agent-ready demo](docs/demo.gif)

```bash
$ npx @syedshoaib/agent-ready check examples/tickets/bad-ticket.json

✗ PROJ-1234  not ready  (4 blocker(s), 6 warning(s))

  ✗ has-acceptance-criteria       No acceptance criteria found (need at least 1)
  ⚠ has-definition-of-done        No Definition of Done found
  ✗ has-repo-target               Ticket does not specify the target repo
  ✗ has-risk-classification       No risk classification label
  ⚠ has-test-expectations         No test expectations described
  ⚠ no-ambiguous-verbs            Ambiguous verb(s): improve, make it better
  ✗ body-min-length               Body too short: 91 chars (need >= 100)
  ⚠ no-tribal-knowledge           Tribal-knowledge phrase(s): you know what i mean
  ⚠ t-shirt-size-present          No t-shirt size estimate
  ⚠ has-design-link               UI ticket has no design link
```

```bash
$ npx @syedshoaib/agent-ready check examples/tickets/good-ticket.json

✓ PROJ-2042  ready  (10 checks passed)
```

## Why this exists

Every team adopting Copilot, Cursor, Claude Code, or Codex agents hits the same wall:

> **Garbage tickets → garbage PRs.**

Agents are confident and fast. Without a clear ticket, that's a liability — they invent context, miss the real requirement, and silently burn tokens.

`agent-ready` is the cheap, automated gate that catches this. It runs in 50ms, has zero infrastructure, and plugs into Issue templates and PR workflows everyone already uses.

It's the **front door** of the agentic SDLC: prove the ticket is ready before any agent touches it.

### Before vs. after

| Without `agent-ready` | With `agent-ready` |
|---|---|
| Agent invents missing context | Ticket validated before agent picks it up |
| Vague verbs slip through ("improve", "clean up") | Ambiguous verbs flagged at issue-open time |
| No design link → agent guesses UI | UI tickets require a Figma/Miro link |
| Agent burns tokens on a half-baked ticket | CI fails fast (50 ms) before any tokens are spent |
| No repo target → wrong codebase modified | `repo:` field enforced as a blocker |
| Subjective PR review ("this doesn't match the ticket") | Objective AC checklist baked into the ticket |

## What it checks (10 built-in rules)

| Rule | What it looks for |
|---|---|
| `has-acceptance-criteria` | At least N acceptance criteria (numbered list, checklist, or Given/When) |
| `has-definition-of-done` | A DoD section in the body |
| `has-repo-target` | `repo:` in the body or a `repo:<name>` label |
| `has-risk-classification` | A `risk:low`/`risk:medium`/`risk:high` label |
| `has-design-link` | Figma/Ardoq/Miro/Excalidraw link present when the ticket has a `ui`/`ux`/`frontend` label |
| `has-test-expectations` | "How to verify" / test plan / Playwright / Jest / Pytest mentioned |
| `no-ambiguous-verbs` | Flags vague verbs (`improve`, `optimize`, `clean up`, `refactor`, `enhance`, …) |
| `body-min-length` | Body is at least 100 characters (configurable) |
| `no-tribal-knowledge` | Flags phrases like "as discussed", "you know what I mean", "the usual way" |
| `t-shirt-size-present` | `size:` in the body or a `size:S|M|L|XL` label |

Plus user-defined custom rules of `type: regex` (see [Rule pack format](#rule-pack-format)).

Every rule can be enabled, disabled, or tuned in a YAML rule pack.

> **Coming next:** see the [open issues](https://github.com/Schoaib/agent-ready/issues) for planned rules and features.

## Install

```bash
# One-off use with a local ticket file
npx @syedshoaib/agent-ready check <path-to-ticket-json>

# Or fetch a real GitHub Issue
npx @syedshoaib/agent-ready check owner/repo#123 --adapter github

# Or install globally
npm i -g @syedshoaib/agent-ready
agent-ready check ./ticket.json
```

> The CLI supports local JSON tickets and GitHub Issues. GitHub auth uses `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`. Native Jira/Linear CLI adapters are planned.

## Usage

```bash
# Lint a ticket from a local JSON file
agent-ready check examples/tickets/bad-ticket.json
agent-ready check examples/tickets/good-ticket.json

# Lint a GitHub Issue
agent-ready check Schoaib/agent-ready#1 --adapter github
agent-ready check https://github.com/Schoaib/agent-ready/issues/1 --adapter github

# Use a custom rule pack
agent-ready check ./ticket.json --rules ./my-rules.yaml

# Output formats
agent-ready check ./ticket.json --format text       # default
agent-ready check ./ticket.json --format markdown   # PR comment
agent-ready check ./ticket.json --format json       # machine-readable
```

Exit codes: `0` ready · `1` not ready · `2` usage error.

## GitHub Action

Drop this into `.github/workflows/agent-ready.yml`:

```yaml
name: Agent-Ready Check
on:
  issues:
    types: [opened, edited, labeled]

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v6
      - uses: Schoaib/agent-ready@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          rules: .agent-ready/rules.yaml   # optional
          comment-on-issue: true
          fail-on-not-ready: true
```

The action fetches the triggering issue from the GitHub API, normalizes it into the linter's ticket shape, runs the lint, posts the result as a comment, and writes outputs (`ready`, `failed-count`, `warnings-count`). When `fail-on-not-ready: true`, the step exits non-zero so the issue check shows red until the ticket is fixed.

> **Coming next:** [issue #3](https://github.com/Schoaib/agent-ready/issues/3) tracks adding an automatic `agent-ready` label so downstream workflows can trigger on the label rather than parsing comments.

## Rule pack format

Rule packs are plain YAML. Mix built-ins with custom rules of `type: regex`:

```yaml
# .agent-ready/rules.yaml
version: 1
extends: default

rules:
  has-acceptance-criteria:
    enabled: true
    min_count: 2
    severity: error

  no-ambiguous-verbs:
    enabled: true
    severity: warn
    extra_terms: [tidy, polish, modernize]

  custom-mentions-jira-epic:
    type: regex
    pattern: 'EPIC-\d+'
    field: body
    severity: error
    message: "Ticket must link to a parent epic (EPIC-XXX)"
```

JSON Schemas are published in [`schema/`](schema/) — both the rule pack format ([`rule-pack.schema.json`](schema/rule-pack.schema.json)) and the CLI output ([`output.schema.json`](schema/output.schema.json)). The output schema is stable across versions; downstream tools (e.g. [Gatepack](#how-it-composes-with-the-rest-of-your-stack)) can safely consume it.

## How it composes with the rest of your stack

`agent-ready` is the **first** gate. It doesn't replace your existing tools — it makes them work better.

| Tool | What it does | When it runs |
|---|---|---|
| **`agent-ready`** | Is this *ticket* ready for an agent? | Issue open → before agent picks up |
| Spec Kit / Linear specs | Authoring help for the spec itself | While writing the ticket |
| Your AI coding agent | Implements the change | After `agent-ready` passes |
| Gatepack *(planned)* | Per-PR signed evidence bundle (includes `agent-ready` pre-flight result) | After agent submits PR |
| Evidence Gate Action | Traditional CI evidence (SBOM, SAST, tests) | During CI |
| OPA / your policy engine | Decision enforcement | Throughout |

## Status

**Current release: 0.0.3.** Schemas, CLI, file and GitHub adapters, 10 built-in rules, regex custom rules, JSON/markdown/text renderers, GitHub Action (Docker-based), and a CI workflow that runs the bad/good demo on every PR. All verified end-to-end.

## Releases

GitHub Action users should pin either:

```yaml
- uses: Schoaib/agent-ready@v0.0.3  # exact release
- uses: Schoaib/agent-ready@v0      # floating major tag — always latest stable
```

### Roadmap

Track all planned work in [GitHub Issues](https://github.com/Schoaib/agent-ready/issues). Highlights:

- Native CLI adapters for Jira and Linear ([#1](https://github.com/Schoaib/agent-ready/issues/1))
- `links-resolve` and `restricted-paths-declared` rules ([#2](https://github.com/Schoaib/agent-ready/issues/2))
- Automatic `agent-ready` label setter on issues ([#3](https://github.com/Schoaib/agent-ready/issues/3))
- SARIF output format ([#7](https://github.com/Schoaib/agent-ready/issues/7))
- LLM judge for `no-ambiguous-verbs` — opt-in ([#17](https://github.com/Schoaib/agent-ready/issues/17))
- VS Code extension: lint as you type
- Node plugin loader for custom rules (beyond regex)

## Contributing

Rules are the easiest contribution path — one rule = one entry in `src/rules/built-in.ts` + one fixture in `examples/tickets/`. Browse [good first issues](https://github.com/Schoaib/agent-ready/issues?q=is%3Aopen+label%3A%22good+first+issue%22) to get started. PRs welcome.

## License

MIT.
