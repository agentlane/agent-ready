# OPA Policy Bridge

`agent-ready` can delegate rule decisions to [Open Policy Agent](https://www.openpolicyagent.org/) (OPA) policies written in Rego. Governance / platform teams write policy-as-code that `agent-ready` evaluates as part of each lint run.

## Why OPA rules?

Built-in rules and custom regex rules are powerful but static — they can't reason about complex relationships between ticket fields, signals, labels, and org-specific context. OPA rules:

- Are written in a declarative language (Rego) with full boolean logic
- Can be maintained centrally in a policy repo and served via an OPA server
- Produce rich output: `allow`, `reason`, and `hint` per decision
- Run after built-in rules and receive derived `signals` as input — enabling policies that enforce risk routing

## Rule config

Add an OPA rule to your rule pack with `type: opa`:

```yaml
# .agent-ready/rules.yaml
version: 1
extends: default

rules:
  enforce-pii-risk:
    type: opa
    mode: remote
    server: http://localhost:8181
    query: data.pii.decision
    input_includes: [ticket, signals]
    severity: error

  enforce-payment-gate:
    type: opa
    mode: remote
    server: http://localhost:8181
    query: data.payment.decision
    severity: error

  local-infra-check:
    type: opa
    mode: embedded
    policy: ./policies/infra.rego
    query: data.infra.decision
    severity: error
```

### Config fields

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `"opa"` | — | Required discriminant |
| `enabled` | boolean | `true` | Set `false` to skip this rule |
| `severity` | `error \| warn` | `error` | Severity when the policy denies |
| `mode` | `remote \| embedded` | `remote` | Evaluation mode |
| `server` | string | `http://localhost:8181` | OPA REST server base URL (remote only) |
| `policy` | string | — | Path to `.rego` file (embedded only) |
| `query` | string | — | **Required.** OPA query, e.g. `data.pii.decision` |
| `input_includes` | `["ticket", "signals"]` | both | Which context to pass as OPA input |

## Evaluation modes

### Remote mode

Posts `{ "input": { "ticket": ..., "signals": ... } }` to the OPA REST server:

```
POST {server}/v1/data/{path}
Content-Type: application/json

{ "input": { "ticket": { ... }, "signals": { ... } } }
```

The path is derived from `query`: `data.pii.decision` → `/v1/data/pii/decision`.

Requires an OPA server. Run one locally:

```bash
opa run --server
# Serves on http://localhost:8181 by default
```

Or deploy OPA as a sidecar alongside your CI runner. The server URL is configurable per-rule.

### Embedded mode

Shells out to the `opa eval` CLI with the policy file and JSON input piped via stdin:

```bash
opa eval --data policy.rego --stdin-input --format raw "data.pii.decision" < input.json
```

Requires `opa` installed on the machine running `agent-ready`. Install from [openpolicyagent.org](https://www.openpolicyagent.org/docs/latest/#1-download-opa).

## OPA decision shape

Your Rego policy should produce one of:

**Simple boolean** — only pass/fail, no message:
```rego
allow if { not mentions_pii }
```

**Decision object** — with `reason` and optional `hint`:
```rego
decision := {"allow": allow, "reason": reason, "hint": hint}
```

| Field | Type | Description |
|---|---|---|
| `allow` | boolean | `true` = pass, `false` = fail |
| `reason` | string | Message shown in lint output |
| `hint` | string | Optional actionable hint |

## Input shape

When `input_includes: [ticket, signals]` (default), OPA receives:

```json
{
  "input": {
    "ticket": {
      "id": "PROJ-123",
      "title": "Add payment integration",
      "body": "...",
      "labels": ["feature", "risk:low"]
    },
    "signals": {
      "path_recommendation": "B",
      "context_tier": "T2",
      "risk_classification": "low"
    }
  }
}
```

`signals` are derived from the built-in and regex rules that ran before OPA rules — so your policy can enforce that a ticket with certain signals meets additional requirements.

## Example policies

Three example policies are provided in [`examples/policies/`](../examples/policies/):

### `pii.rego` — PII restricted-scope gate

Denies tickets that mention personal data / PII unless they're labeled `risk:high`.

```rego
allow if { not mentions_pii }
allow if { mentions_pii; is_high_risk }
```

### `payment.rego` — Payment / financial data routing

Denies payment tickets that aren't both `risk:high` and sized `L` or `XL`.

### `infra.rego` — Infrastructure change gate

Denies infrastructure tickets (terraform, k8s, etc.) that lack `risk:high` and a rollback plan in the body.

## Wiring with an OPA server

Load all three example policies at once:

```bash
opa run --server examples/policies/
```

Then configure your rule pack:

```yaml
rules:
  pii-gate:
    type: opa
    mode: remote
    query: data.pii.decision
    severity: error

  payment-gate:
    type: opa
    mode: remote
    query: data.payment.decision
    severity: error

  infra-gate:
    type: opa
    mode: remote
    query: data.infra.decision
    severity: error
```

## Execution order and signals

OPA rules run in a **second phase** after all built-in and custom regex rules complete. This means:

1. Built-in rules run → `signals` are computed from their results
2. OPA rules receive `{ ticket, signals }` as input
3. OPA results are merged with phase-1 results
4. Final `signals` are re-computed over all checks

This two-phase approach ensures OPA policies can reason about derived signals (e.g. "deny if risk is medium and path is C") without a chicken-and-egg problem.

## Out of scope

- Authoring a full policy library — the three examples are starting points; teams write their own
- OPA bundle distribution — point at your own policy repo or OPA bundle server
- Multi-tenant OPA isolation — rule packs provide per-project config; org-level multi-tenancy is v0.3+
