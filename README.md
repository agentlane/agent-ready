# agent-ready

> Make every ticket ready for AI coding agents.

`agent-ready` is a Definition-of-Ready linter that runs **before** an AI coding agent picks up a ticket. It answers one question: *is this issue actually ready for an agent to work on?*

If the answer is no, it tells you exactly what's missing — in seconds, in CI, in the PR comment, before any tokens are spent.

```bash
$ npx agent-ready check examples/tickets/bad-ticket.json

✗ PROJ-1234  not ready  (3 issues)

  ✗ missing-acceptance-criteria   No acceptance criteria found
  ✗ no-repo-target                Ticket does not specify the target repo
  ⚠ ambiguous-verb                "improve" is ambiguous — prefer "add", "fix", "remove"

  Fix the issues above, then re-run. Until this ticket passes, do not hand it to an agent.
```

```bash
$ npx agent-ready check examples/tickets/good-ticket.json

✓ PROJ-2042  ready  (12 checks passed)

  Agent path recommendation:  B  (multi-agent, complex domain)
  Risk classification:        medium
  Estimated context tier:     T2  (frontend → DLS catalog)
```

## Why this exists

Every team adopting Copilot, Cursor, Claude Code, or Codex agents hits the same wall:

> **Garbage tickets → garbage PRs.**

Agents are confident and fast. Without a clear ticket, that's a liability — they invent context, miss the real requirement, and silently burn tokens.

`agent-ready` is the cheap, automated gate that catches this. It runs in 50ms, has zero infrastructure, and plugs into Issue templates and PR workflows everyone already uses.

It's the **front door** of the agentic SDLC: prove the ticket is ready before any agent touches it.

## What it checks (default rule pack)

| Rule | What it looks for |
|---|---|
| `has-acceptance-criteria` | At least N acceptance criteria (numbered list, checklist, or Gherkin) |
| `has-definition-of-done` | A DoD section or linked DoD |
| `has-repo-target` | `repo:` field or label specifies which repo this ticket modifies |
| `has-risk-classification` | A risk label (`risk:low`, `risk:medium`, `risk:high`) |
| `has-design-link` | Figma/Ardoq link present if the ticket has a `ui` label |
| `has-test-expectations` | Test plan or "How to verify" section |
| `no-ambiguous-verbs` | Flags vague verbs (`improve`, `optimize`, `clean up`, `refactor`) without specifics |
| `body-min-length` | Body is at least 100 characters |
| `no-tribal-knowledge` | Flags phrases like "as discussed", "you know what I mean", "the usual way" |
| `links-resolve` | All linked URLs return 2xx |
| `restricted-paths-declared` | If the ticket might touch auth/payments/secrets, the risk class must be `high` |
| `t-shirt-size-present` | A complexity hint (`size:S`, `size:M`, `size:L`) |

Every rule can be enabled, disabled, or tuned in a YAML rule pack. Custom rules ship as plugins.

## Install

```bash
# One-off use
npx agent-ready check <ticket-id-or-file>

# Or install globally
npm i -g agent-ready
agent-ready check PROJ-1234
```

## Usage

```bash
# From a local JSON file (great for testing rule packs)
agent-ready check ./ticket.json

# From GitHub Issues
agent-ready check owner/repo#123 --adapter github

# From Jira
agent-ready check PROJ-1234 --adapter jira

# From Linear
agent-ready check ENG-456 --adapter linear

# Use a custom rule pack
agent-ready check PROJ-1234 --rules ./my-rules.yaml

# Output formats
agent-ready check PROJ-1234 --format markdown   # PR comment
agent-ready check PROJ-1234 --format sarif      # Code scanning
agent-ready check PROJ-1234 --format json       # Machine-readable
```

## GitHub Action

Drop this into `.github/workflows/agent-ready.yml`:

```yaml
name: Agent-Ready Check
on:
  issues:
    types: [opened, edited, labeled]
  issue_comment:
    types: [created]

jobs:
  check:
    runs-on: ubuntu-latest
    permissions: { issues: write }
    steps:
      - uses: agent-ready/action@v0
        with:
          rules: .agent-ready/rules.yaml   # optional
          comment-on-issue: true
```

The action runs on every issue open/edit, comments the result back on the issue, and sets a status. When the issue is ready, label it `agent-ready` and your agent workflow can pick it up with confidence.

## Rule pack format

Rule packs are plain YAML. Mix built-ins with custom rules:

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

## How it composes with the rest of your stack

`agent-ready` is the **first** gate. It doesn't replace your existing tools — it makes them work better.

| Tool | What it does | When it runs |
|---|---|---|
| **`agent-ready`** | Is this *ticket* ready for an agent? | Issue open → before agent picks up |
| Spec Kit / Linear specs | Authoring help for the spec itself | While writing the ticket |
| Your AI coding agent | Implements the change | After `agent-ready` passes |
| Gatepack *(coming soon)* | Per-PR signed evidence bundle | After agent submits PR |
| Evidence Gate Action | Traditional CI evidence (SBOM, SAST, tests) | During CI |
| OPA / your policy engine | Decision enforcement | Throughout |

## Status

`v0` — schemas, CLI scaffold, GitHub Action wrapper, and example tickets all work. Built-in rules are minimal; the surface area to contribute new rules is intentionally small.

**Roadmap:**
- v0.1: Jira + Linear adapters, LLM judge for `no-ambiguous-verbs`
- v0.2: VS Code extension (lint as you type the issue)
- v0.3: Companion product `gatepack` — signed per-PR evidence bundle that includes the `agent-ready` pre-flight result

## Contributing

Rules are the easiest contribution path. One rule = one TypeScript file in `src/rules/built-in/` + one test fixture in `examples/tickets/`. PRs welcome.

## License

MIT.
