# agent-ready — Use Cases

Three concrete walkthroughs showing `agent-ready` in real-world scenarios.

---

## Use case 1 — Open-source maintainer

> *"I accept AI-generated PRs from contributors. I want to require a good issue before any agent starts work."*

### The problem

Contributors use Copilot, Cursor, or Claude Code to generate PRs. When the issue is vague — no acceptance criteria, ambiguous scope — the agent invents context and the PR misses the mark. You spend more time reviewing and requesting changes than the PR is worth.

### The solution

Add `agent-ready` as a required issue check. Contributors can't meaningfully start until the issue passes.

**`.github/workflows/agent-ready.yml`**
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
      - uses: agentlane/agent-ready@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-issue: true
          fail-on-not-ready: true
          set-label: true
```

**What happens:**
1. Contributor opens an issue
2. `agent-ready` comments with the exact missing fields
3. Contributor fixes the issue
4. `agent-ready` re-runs, passes, and sets the `agent-ready` label
5. Contributor (or bot) starts the coding agent — issue has everything it needs

### Custom rule pack for OSS

```yaml
# .agent-ready/rules.yaml
version: 1
extends: default

rules:
  has-acceptance-criteria:
    min_count: 2          # require at least 2 ACs
    severity: error

  no-ambiguous-verbs:
    severity: error       # block on vague language, not just warn

  custom-issue-type:
    type: regex
    pattern: '^(feat|fix|chore|docs):'
    field: title
    severity: warn
    message: "Title should start with a conventional type (feat:, fix:, etc.)"
```

---

## Use case 2 — Enterprise SDLC gate (DevSecOps)

> *"We're rolling out Claude Code agents for sprint work. The platform team wants an auditable pre-flight gate before agents touch restricted paths."*

### The problem

Agents can modify auth, payment, or infra code without the ticket explicitly acknowledging the risk. Compliance needs evidence that high-risk work was declared and approved before the agent started.

### The solution

Use `agent-ready` with a strict enterprise rule pack — `restricted-paths-declared` set to `error`, a Jira epic link required, stricter AC count. Pipe the JSON output into your evidence bundle.

**`.agent-ready/rules.yaml`**
```yaml
version: 1
extends: default

rules:
  has-acceptance-criteria:
    min_count: 3
    severity: error

  restricted-paths-declared:
    severity: error          # block, not just warn, for restricted scope
    keywords:
      - auth
      - payment
      - identity
      - iam
      - terraform
      - kubernetes

  has-risk-classification:
    severity: error

  custom-jira-epic:
    type: regex
    pattern: '[A-Z]+-\d+'
    field: body
    severity: error
    message: "Ticket must reference a parent Jira epic (e.g. PLAT-1234)"

  links-resolve:
    enabled: true            # verify design/spec links are live
    timeout_ms: 8000
    skip_domains:
      - localhost
      - internal.company.com
```

**Collecting SARIF evidence:**
```bash
agent-ready check owner/repo#123 --adapter github --format sarif > reports/agent-ready-123.sarif
```

Upload the SARIF to GitHub Advanced Security or store it in your evidence bundle alongside SBOM, SAST, and test results. The stable [output schema](../schema/output.schema.json) is designed for downstream ingestion.

**Audit trail:** the JSON output includes `checked_at`, `rule_pack`, `adapter`, and `ticket_id` — everything needed to reconstruct the pre-flight state at any point in the future.

---

## Use case 3 — Automated Copilot / Cursor / Claude Code dispatch

> *"I want to kick off my coding agent automatically when an issue is ready — not manually, not on every edit."*

### The problem

Running an agent on every issue edit is wasteful and noisy. You want a crisp trigger: the issue passed the readiness gate → start the agent. Once.

### The solution

Two workflows: `agent-ready` gates and labels; a second workflow dispatches the agent on the label event.

**Workflow 1 — gate and label (runs on every issue edit):**
```yaml
# .github/workflows/agent-ready.yml
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
      - uses: agentlane/agent-ready@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-issue: true
          fail-on-not-ready: false   # don't block — just label
          set-label: true
```

**Workflow 2 — dispatch agent (runs only when label appears):**
```yaml
# .github/workflows/start-agent.yml
name: Start coding agent
on:
  issues:
    types: [labeled]

jobs:
  dispatch:
    if: github.event.label.name == 'agent-ready'
    runs-on: ubuntu-latest
    steps:
      - name: Log the trigger
        run: echo "Issue #${{ github.event.issue.number }} passed — starting agent"

      # Option A: Invoke Claude Code via CLI
      # - run: claude --issue ${{ github.event.issue.html_url }}

      # Option B: Trigger a separate workflow
      # - uses: actions/github-script@v7
      #   with:
      #     script: |
      #       github.rest.actions.createWorkflowDispatch({
      #         owner: context.repo.owner,
      #         repo: context.repo.repo,
      #         workflow_id: 'run-agent.yml',
      #         ref: 'main',
      #         inputs: { issue_number: '${{ github.event.issue.number }}' }
      #       })

      # Option C: Notify a webhook / Slack / queue
      # - run: curl -X POST ${{ secrets.AGENT_WEBHOOK }} -d '{"issue": ${{ github.event.issue.number }}}'
```

**Why this is better than triggering on `issues: opened`:**
- The label is removed when the issue is edited back into a failing state — the agent won't trigger twice
- No polling required — the label event is instant
- Works with any agent: Copilot, Cursor, Claude Code, a custom script, a queue-based system

---

## Further reading

- [Rule pack format](../README.md#rule-pack-format) — tuning and custom rules
- [Output schema](../schema/output.schema.json) — stable contract for downstream tools
- [Contributing](../README.md#contributing) — add your own rules or use-case docs
