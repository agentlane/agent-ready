# agent-ready — Session Handoff

Everything a fresh Claude session needs to continue work on this repo without re-reading the full conversation history.

---

## What this project is

`agent-ready` is a **Definition-of-Ready linter for AI coding agents.**

Before Copilot, Cursor, Claude Code, or Codex starts work, `agent-ready` checks whether the issue has enough context to produce a safe, correct PR.

- **CLI:** `npx @syedshoaib/agent-ready check <ticket>`
- **GitHub Action:** posts a comment + sets/removes an `agent-ready` label on the issue
- **npm:** `@syedshoaib/agent-ready` at version `0.0.3`
- **GitHub:** `https://github.com/Schoaib/agent-ready` (public)
- **Local path:** `/Users/shoaib/GitHub/agent-ready`

---

## Repo layout

```
src/
  types.ts           — Ticket, Rule, RuleConfig, CheckResult, LintOutput types
  lint.ts            — lintTicket() orchestrator (async, Promise.all over rules)
  cli.ts             — CLI entry point (check command, format flag, adapter flag)
  rules/
    built-in.ts      — 12 built-in rules + runCustomRegex() + BUILTIN_RULES[]
  adapters/
    file.ts          — reads local JSON ticket file
    github.ts        — fetches GitHub Issue via API, normalises to Ticket shape
  render/
    markdown.ts      — renderText() and renderMarkdown()
    sarif.ts         — renderSarif() — SARIF 2.1.0 output

test/
  rules.test.js      — unit tests for all 12 rules + runCustomRegex
  lint.test.js       — integration tests for lintTicket()
  render.test.js     — unit tests for renderText, renderMarkdown, renderSarif

examples/tickets/
  bad-ticket.json    — fails most rules (used in CLI demo)
  good-ticket.json   — passes all rules

rule-packs/
  default.yaml       — default rule pack shipped with the tool

schema/
  output.schema.json     — stable JSON Schema for LintOutput (downstream tools)
  rule-pack.schema.json  — JSON Schema for rule pack YAML

docs/
  demo.gif               — terminal demo GIF (recorded with vhs)
  use-cases.md           — 3 full walkthroughs (OSS gate, enterprise, auto-dispatch)
  comment-screenshot.png — real GitHub Action comment screenshot (used in README)

action.yml             — GitHub Action definition (Docker-based)
Dockerfile             — Docker image for the Action
entrypoint.sh          — Action entrypoint: fetch issue → lint → comment → set label
```

---

## Current state

**Version:** `0.0.3`
**Tests:** 114 pass, 0 fail, 1 skip across 23 suites
**README score:** 9.1/10 (externally reviewed)
**CI:** green on every push (`node --test test/*.test.js` + build check)

### 12 built-in rules

| Rule ID | Severity | Notes |
|---|---|---|
| `has-acceptance-criteria` | error | min_count configurable, default 1 |
| `has-definition-of-done` | warn | looks for DoD section |
| `has-repo-target` | error | `repo:` in body or label |
| `has-risk-classification` | error | `risk:low/medium/high` label |
| `has-test-expectations` | warn | Jest/Playwright/Pytest/etc |
| `no-ambiguous-verbs` | warn | improve, optimize, clean up, etc |
| `body-min-length` | error | 100 chars default |
| `no-tribal-knowledge` | warn | "as discussed", "you know what I mean" |
| `t-shirt-size-present` | warn | `size:` in body or label |
| `has-design-link` | warn | only fires on ui/ux/frontend tickets |
| `restricted-paths-declared` | warn | auth/payment/IAM without risk:high |
| `links-resolve` | warn | **opt-in**, `enabled: false` by default |

### Output formats
`text` (default) · `markdown` (GitHub comment) · `json` (machine-readable) · `sarif` (GitHub code scanning)

### Adapters
`file` (local JSON) · `github` (GitHub Issues via API — uses `GITHUB_TOKEN` / `GH_TOKEN` / `gh auth token`)

---

## Key technical decisions

- **TypeScript ESM** — `"type": "module"`, NodeNext resolution, `.js` extensions in all imports
- **`Rule.run()` is async** — returns `CheckResult | Promise<CheckResult>`; `lintTicket()` uses `Promise.all`
- **`links-resolve` is opt-in** — `enabled: false` in `default.yaml` so offline CI doesn't break
- **GitHub Action is Docker-based** — `entrypoint.sh` handles the full fetch → lint → comment → label cycle
- **Label setter** — `set-label: true` adds/removes `agent-ready` label; label is auto-created if missing
- **Custom rules** — `type: regex` rules in any rule pack, validated by JSON Schema

---

## Open issues (active roadmap)

| # | Title | Priority |
|---|---|---|
| [#1](https://github.com/Schoaib/agent-ready/issues/1) | Native Jira/Linear CLI adapters | High — GitHub adapter done, Jira/Linear still todo |
| [#4](https://github.com/Schoaib/agent-ready/issues/4) | path_recommendation + context-tier output fields | Medium |
| [#6](https://github.com/Schoaib/agent-ready/issues/6) | Gatepack-ready evidence metadata in JSON output | Medium |
| [#17](https://github.com/Schoaib/agent-ready/issues/17) | LLM judge for no-ambiguous-verbs (opt-in) | Good first issue |

> Note: Issues #2, #3, #7, #9 are implemented but may still show open on GitHub — check if they need manual closing.

---

## Common commands

```bash
# Build
npm run build

# Test
npm test                   # runs node --test test/*.test.js

# Lint a local ticket
npx . check examples/tickets/bad-ticket.json
npx . check examples/tickets/good-ticket.json

# Lint a GitHub issue
npx . check Schoaib/agent-ready#1 --adapter github

# Output formats
npx . check examples/tickets/bad-ticket.json --format json
npx . check examples/tickets/bad-ticket.json --format sarif

# Push (bypasses branch protection — maintainer push)
git push
```

---

## Naming / org context

The project currently lives under `Schoaib` (personal GitHub) and `@syedshoaib` (npm).
Plan is to migrate to the **`agentlane`** org on both GitHub and npm:
- GitHub: `github.com/agentlane/agent-ready` (org name confirmed available)
- npm: `@agentlane/agent-ready` (scope confirmed available, 0 packages)

Migration not done yet — still under `Schoaib/agent-ready`.

---

## Product family context

`agent-ready` is Product 1 in the **agentlane** family:

```
agent-intercept   →   agent-ready   →   Gatepack   →   AI Contribution Ledger
(local AI proxy)      (ticket gate)     (PR evidence)   (survival metric)
```

Full ideas list: `/Users/shoaib/GitHub/agentic-sdlc-north-star/OSS_IDEAS.md`
agent-intercept brief: `/Users/shoaib/GitHub/agentic-sdlc-north-star/AGENT_INTERCEPT_BRIEF.md`

---

## What to work on next

Good starting points for a fresh session:

1. **Close stale issues** — verify #2, #7, #9 are closed on GitHub (commits reference them but may need manual close)
2. **Jira adapter** (#1) — follow the pattern in `src/adapters/github.ts`; normalise Jira issue to `Ticket` shape
3. **Linear adapter** (#1) — same pattern, Linear GraphQL API
4. **Migrate to `agentlane` org** — create org, transfer repo, update npm scope, update all README references
5. **LLM judge for no-ambiguous-verbs** (#17) — opt-in config, any provider via env var
