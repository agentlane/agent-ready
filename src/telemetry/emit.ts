/**
 * emitLintOutput — fan out a LintOutput to all configured telemetry sinks.
 *
 * Failures in individual sinks are logged to stderr but never fail the
 * overall lint run (fail-soft via Promise.allSettled).
 */
import type { LintOutput, SinkConfig } from "../types.js";
import { emitWebhook } from "./sinks/webhook.js";
import { emitJsonl } from "./sinks/jsonl.js";
import { emitOtel } from "./sinks/otel.js";

/** Replace ${VAR} with process.env.VAR in a string. Unknown vars become "". */
function interpolateEnv(s: string): string {
  return s.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? "");
}

export async function emitLintOutput(out: LintOutput, sinks: SinkConfig[]): Promise<void> {
  if (!sinks.length) return;

  const results = await Promise.allSettled(
    sinks.map(async (sink) => {
      if (sink.type === "webhook") {
        await emitWebhook(out, sink, interpolateEnv);
      } else if (sink.type === "jsonl") {
        await emitJsonl(out, sink, interpolateEnv);
      } else if (sink.type === "otel") {
        await emitOtel(out, sink, interpolateEnv);
      }
    })
  );

  for (const r of results) {
    if (r.status === "rejected") {
      process.stderr.write(
        `agent-ready telemetry: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}\n`
      );
    }
  }
}
