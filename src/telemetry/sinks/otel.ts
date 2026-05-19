/**
 * OTel sink — posts a single span to an OTLP/HTTP traces endpoint (no SDK dependency).
 *
 * Maps LintOutput to:
 *   - resource attribute: service.name
 *   - span attributes: ticket_id, adapter, ready, path_recommendation, context_tier, risk_classification
 *   - span events: one per CheckResult (id, status, severity, message)
 */
import { randomBytes } from "node:crypto";
import type { LintOutput, CheckResult, OtelSinkConfig } from "../../types.js";

// ── OTLP helpers ──────────────────────────────────────────────────────────────

function strVal(v: string) {
  return { stringValue: v };
}
function boolVal(v: boolean) {
  return { boolValue: v };
}
function attr(key: string, value: ReturnType<typeof strVal | typeof boolVal>) {
  return { key, value };
}

function nowNanos(): string {
  // Date.now() is millisecond precision; multiply to nanoseconds
  return String(BigInt(Date.now()) * 1_000_000n);
}

function makeSpan(out: LintOutput, serviceName: string) {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const startNs = String(BigInt(new Date(out.checked_at).getTime()) * 1_000_000n);
  const endNs = nowNanos();

  const spanAttrs = [
    attr("ticket_id", strVal(out.ticket_id)),
    attr("adapter", strVal(out.adapter)),
    attr("rule_pack", strVal(out.rule_pack)),
    attr("ready", boolVal(out.ready)),
    attr("path_recommendation", strVal(out.signals.path_recommendation)),
    attr("context_tier", strVal(out.signals.context_tier)),
    attr("risk_classification", strVal(out.signals.risk_classification)),
    attr("failed_count", strVal(String(out.summary.failed))),
    attr("warnings_count", strVal(String(out.summary.warnings))),
    attr("passed_count", strVal(String(out.summary.passed))),
  ];

  const events = out.checks.map((c: CheckResult) => ({
    name: `check.${c.id}`,
    timeUnixNano: endNs,
    attributes: [
      attr("status", strVal(c.status)),
      attr("severity", strVal(c.severity)),
      attr("message", strVal(c.message)),
    ],
  }));

  return {
    traceId,
    spanId,
    name: "agent_ready_check",
    kind: 1, // SPAN_KIND_SERVER
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    status: { code: out.ready ? 1 : 2 }, // OK : ERROR
    attributes: spanAttrs,
    events,
  };
}

// ── Sink ───────────────────────────────────────────────────────────────────────

export async function emitOtel(
  out: LintOutput,
  cfg: OtelSinkConfig,
  interpolate: (s: string) => string
): Promise<void> {
  const endpoint = interpolate(cfg.endpoint);
  const serviceName = cfg.service_name ?? "agent-ready";

  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [attr("service.name", strVal(serviceName))],
        },
        scopeSpans: [
          {
            scope: { name: "agent-ready" },
            spans: [makeSpan(out, serviceName)],
          },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "agent-ready",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OTel sink responded ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
