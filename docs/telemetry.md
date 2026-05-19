# Telemetry & Observability

`agent-ready` can emit `LintOutput` to one or more observability sinks after each lint run. This enables dashboards, trend analysis, and integration with your existing AI-platform observability stack — without blocking or affecting the lint result.

All sink failures are **fail-soft**: errors are printed to stderr but never cause the lint run to fail or change the exit code.

## Configuration

Add an `output` section to your rule pack:

```yaml
# .agent-ready/rules.yaml
version: 1
extends: default

rules:
  # ... your rule overrides ...

output:
  sinks:
    - type: webhook
      url: https://my-collector.example.com/agent-ready
      headers:
        Authorization: "Bearer ${WEBHOOK_TOKEN}"

    - type: jsonl
      path: ./.agent-ready/runs.jsonl

    - type: otel
      endpoint: http://localhost:4318/v1/traces
      service_name: agent-ready
```

Sinks are fanned out in parallel. All three types can be used simultaneously.

## Sink reference

### `webhook`

POSTs the full `LintOutput` JSON to a URL. 5-second timeout, no retry.

```yaml
- type: webhook
  url: https://my-collector.example.com/agent-ready
  headers:
    Authorization: "Bearer ${WEBHOOK_TOKEN}"
    X-Source: ci
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | HTTP(S) endpoint. Supports `${ENV_VAR}` interpolation. |
| `headers` | object | no | Extra request headers. Values support `${ENV_VAR}` interpolation. |

The body is `JSON.stringify(LintOutput)` with `Content-Type: application/json`.

**Langfuse integration:** POST to a Langfuse ingestion endpoint, map `LintOutput.ticket_id` to the trace name, and use `signals.*` as metadata. Langfuse's UI will show pass/fail rates per ticket source over time.

### `jsonl`

Appends one JSON line per run to a file. Parent directories are created automatically.

```yaml
- type: jsonl
  path: ./.agent-ready/runs.jsonl
```

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | File path. Supports `${ENV_VAR}` interpolation. |

Each line is `JSON.stringify(LintOutput) + "\n"`. The file grows over time — rotate or ship it with your log aggregator (Loki, Splunk, etc.).

**Grafana integration:** Ship the JSONL file to Grafana Loki as a structured log source. Query `{job="agent-ready"} | json | ready="false"` to find tickets that failed readiness checks.

### `otel`

Posts a single OTLP/HTTP span to an OpenTelemetry collector (no SDK dependency — uses `fetch` directly).

```yaml
- type: otel
  endpoint: http://localhost:4318/v1/traces
  service_name: agent-ready
```

| Field | Type | Required | Description |
|---|---|---|---|
| `endpoint` | string | yes | OTLP/HTTP traces endpoint. Supports `${ENV_VAR}` interpolation. |
| `service_name` | string | no | `service.name` resource attribute. Defaults to `"agent-ready"`. |

**Span structure:**
- **Resource attribute:** `service.name`
- **Span name:** `agent_ready_check`
- **Span attributes:** `ticket_id`, `adapter`, `rule_pack`, `ready`, `path_recommendation`, `context_tier`, `risk_classification`, `failed_count`, `warnings_count`, `passed_count`
- **Span events:** one per `CheckResult` — `check.<rule_id>` with attributes `status`, `severity`, `message`
- **Span status:** `OK` when `ready: true`, `ERROR` when `ready: false`

Works with any OTLP-compatible backend: Jaeger, Tempo (Grafana), Honeycomb, Datadog, etc.

## Env var interpolation

Both URLs and string values support `${VAR_NAME}` substitution. Unknown variables are replaced with an empty string.

```yaml
output:
  sinks:
    - type: webhook
      url: https://collector.example.com/${ENV}/agent-ready
      headers:
        Authorization: "Bearer ${WEBHOOK_TOKEN}"
    - type: jsonl
      path: ${LOG_DIR}/agent-ready/runs.jsonl
    - type: otel
      endpoint: ${OTEL_ENDPOINT}
```

## CLI opt-out

Pass `--no-telemetry` to skip all sinks for a single run, even if they're configured in the rule pack:

```bash
agent-ready check ./ticket.json --no-telemetry
```

## Programmatic use

```ts
import { lintTicket, emitLintOutput } from "@agentlane/agent-ready";

const out = await lintTicket(ticket, pack, { adapter: "file", rulePackName: "default" });

// Emit to any combination of sinks
await emitLintOutput(out, [
  { type: "webhook", url: "https://my-collector.example.com/agent-ready" },
  { type: "jsonl", path: "./.agent-ready/runs.jsonl" },
]);
```

`emitLintOutput` returns `Promise<void>` and never throws — all failures are logged to stderr.

## Schema mapping

The `LintOutput` written to each sink matches the published JSON schema at [`schema/output.schema.json`](../schema/output.schema.json). Downstream consumers (Grafana dashboards, OPA policies, Gatepack) can safely key on:

| Field | Type | Description |
|---|---|---|
| `ticket_id` | string | Join key to the originating ticket |
| `ready` | boolean | Top-level pass/fail |
| `signals.path_recommendation` | `"A" \| "B" \| "C"` | Agent execution path |
| `signals.context_tier` | `"T1" \| "T2" \| "T3"` | Ticket context richness |
| `signals.risk_classification` | `"low" \| "medium" \| "high"` | Derived risk level |
| `checked_at` | ISO timestamp | When the lint ran |
| `summary.failed` | number | Number of error-severity failures |
