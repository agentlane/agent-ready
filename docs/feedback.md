# Feedback Loop

`agent-ready` grades tickets before an agent picks them up. The feedback loop closes the loop: record what happened when the agent actually ran, then use that data to see which rules reliably predict success.

## Flow

```
1. agent-ready check PROJ-123 --format json   # produces LintOutput with run_id
2. Agent runs → succeeds or fails
3. agent-ready feedback record \
     --ticket-id PROJ-123 \
     --run-id <run_id from step 1> \
     --outcome success|partial|failure \
     --duration-min 22
4. agent-ready feedback report \
     --runs .agent-ready/runs.jsonl            # joins to LintOutput via run_id
```

## Commands

### `agent-ready feedback record`

Record the outcome of an agent run and append it to the feedback ledger (JSONL).

```bash
agent-ready feedback record \
  --ticket-id PROJ-123 \
  --outcome success \
  --notes "Agent completed all 3 ACs; test suite green" \
  --duration-min 22 \
  --run-id <uuid>            # optional: links to a past LintOutput
  --ledger .agent-ready/feedback.jsonl   # default path
```

| Flag | Required | Description |
|---|---|---|
| `--ticket-id` | yes | The ticket that was run |
| `--outcome` | yes | `success`, `partial`, or `failure` |
| `--notes` | no | Free-text notes about the run |
| `--duration-min` | no | How long the agent ran (minutes) |
| `--run-id` | no | `LintOutput.run_id` from the earlier check — enables per-rule analysis |
| `--ledger` | no | Ledger file path. Default: `.agent-ready/feedback.jsonl` |

The `run_id` is the join key. Get it from the `check` output:

```bash
RUN_ID=$(agent-ready check PROJ-123 --format json | jq -r '.run_id')
# ... agent runs ...
agent-ready feedback record --ticket-id PROJ-123 --run-id "$RUN_ID" --outcome success
```

### `agent-ready feedback report`

Read the ledger and print a summary. If a runs JSONL file is provided (from the `jsonl` telemetry sink), the report adds a per-rule predictive value table.

```bash
agent-ready feedback report \
  --ledger .agent-ready/feedback.jsonl \
  --runs .agent-ready/runs.jsonl
```

| Flag | Required | Description |
|---|---|---|
| `--ledger` | no | Ledger file path. Default: `.agent-ready/feedback.jsonl` |
| `--runs` | no | LintOutput JSONL file (from `telemetry.jsonl` sink). Enables per-rule analysis. |

**Example output:**

```
agent-ready feedback report
==========================================

Total recorded runs: 42
  ✓ success    28  (67%)
  ~ partial     9  (21%)
  ✗ failure     5  (12%)

Recent events (last 5):
  ✓ PROJ-201         success    14/05/2026  22 min
  ~ PROJ-198         partial    12/05/2026  38 min
      notes: AC1-3 done, AC4 blocked on missing fixture
  ✗ PROJ-195         failure    10/05/2026  61 min
  ...

Per-rule predictive value:
  Rule                            Pass→Success  Fail→Success  Signal
  ────────────────────────────────────────────────────────────────────
  has-acceptance-criteria         91%           23%           strong ↑
  has-test-expectations           88%           31%           strong ↑
  body-min-length                 79%           44%           moderate
  no-ambiguous-verbs              71%           68%           neutral
  t-shirt-size-present            62%           71%           inverse ↓

  Tip: 'strong ↑' rules are reliable predictors of agent success — consider raising their severity.
```

The **per-rule predictive value** table shows, for each rule:
- **Pass→Success**: how often the agent succeeded when this rule passed
- **Fail→Success**: how often the agent succeeded when this rule failed
- **Signal**: `strong ↑` (>20 pp gap), `moderate` (5–20 pp), `neutral`, or `inverse ↓`

High-signal rules are the most reliable early warning signals. Low-signal or inverse rules may be candidates for disabling or relaxing.

## Feedback event schema

Each event is one JSON line in the ledger:

```json
{
  "feedback_schema_version": "1.0",
  "ticket_id": "PROJ-123",
  "run_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "outcome": "success",
  "notes": "Agent completed all ACs; PR merged without changes",
  "duration_min": 22,
  "recorded_at": "2026-05-14T09:31:00.000Z",
  "recorded_by": "you@example.com"
}
```

| Field | Type | Description |
|---|---|---|
| `feedback_schema_version` | `"1.0"` | Schema version for forward compatibility |
| `ticket_id` | string | The ticket that was run |
| `run_id` | string? | Join key to `LintOutput.run_id` |
| `outcome` | `success \| partial \| failure` | How the agent run went |
| `notes` | string? | Free-text notes |
| `duration_min` | number? | Agent run duration in minutes |
| `recorded_at` | ISO string | When this feedback was recorded |
| `recorded_by` | string? | `git config user.email`, if available |

## LintOutput `run_id`

Every `LintOutput` (v1.2+) now includes a `run_id` field — a UUIDv4 generated per lint run:

```json
{
  "schema_version": "1.2",
  "run_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ticket_id": "PROJ-123",
  "ready": true,
  ...
}
```

Use the `jsonl` telemetry sink to persist LintOutputs automatically:

```yaml
output:
  sinks:
    - type: jsonl
      path: .agent-ready/runs.jsonl
```

Then pass `--runs .agent-ready/runs.jsonl` to `feedback report` to unlock per-rule analysis.

## Programmatic use

```ts
import { recordFeedback, generateReport } from "@agentlane/agent-ready";

// Record an outcome
await recordFeedback({
  ticketId: "PROJ-123",
  outcome: "success",
  runId: lintOut.run_id,   // from a previous lintTicket() call
  durationMin: 22,
  ledger: ".agent-ready/feedback.jsonl",
});

// Generate a report
const report = await generateReport({
  ledger: ".agent-ready/feedback.jsonl",
  runs: ".agent-ready/runs.jsonl",
});
console.log(report);
```

## Out of scope for v0.2

- **ML calibration** — `report` shows correlations, doesn't auto-tune thresholds. Automatic threshold tuning is a v0.3 concern.
- **Web UI** — JSONL + CLI report is the v0.2 deliverable.
