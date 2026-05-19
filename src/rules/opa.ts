/**
 * OPA policy bridge — evaluate a Rego rule against a ticket.
 *
 * Two modes:
 *   remote   — POST { input } to an OPA REST server /v1/data/<path>
 *   embedded — shell out to `opa eval` CLI with the policy file
 *
 * Decision shape expected from OPA (either mode):
 *   boolean              → { allow: <value> }
 *   { allow, reason?, hint? } → used directly
 */
import { spawnSync } from "node:child_process";
import type { Ticket, LintSignals, OpaRuleConfig, CheckResult, Severity } from "../types.js";

// ── Shared input builder ───────────────────────────────────────────────────────

function buildInput(
  ticket: Ticket,
  signals: LintSignals,
  cfg: OpaRuleConfig
): Record<string, unknown> {
  const includes = cfg.input_includes ?? ["ticket", "signals"];
  const input: Record<string, unknown> = {};
  if (includes.includes("ticket")) input.ticket = ticket;
  if (includes.includes("signals")) input.signals = signals;
  return input;
}

// ── Decision normaliser ────────────────────────────────────────────────────────

interface OpaDecision {
  allow: boolean;
  reason?: string;
  hint?: string;
}

function normaliseResult(raw: unknown): OpaDecision {
  if (typeof raw === "boolean") return { allow: raw };
  if (raw !== null && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      allow: Boolean(r.allow),
      reason: typeof r.reason === "string" ? r.reason : undefined,
      hint: typeof r.hint === "string" ? r.hint : undefined,
    };
  }
  throw new Error(`Unexpected OPA result type: ${JSON.stringify(raw)}`);
}

// ── Remote mode ───────────────────────────────────────────────────────────────

async function evalRemote(
  input: Record<string, unknown>,
  cfg: OpaRuleConfig
): Promise<OpaDecision> {
  const base = (cfg.server ?? "http://localhost:8181").replace(/\/$/, "");
  // "data.pii.allow" → "/v1/data/pii/allow"
  const path = cfg.query.replace(/^data\./, "").replace(/\./g, "/");
  const url = `${base}/v1/data/${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "agent-ready" },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new Error(
      `OPA server request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = `: ${body.message}`;
    } catch { /* ignore */ }
    throw new Error(`OPA server responded ${res.status}${detail}`);
  }

  const body = (await res.json()) as { result?: unknown };
  if (body.result === undefined) {
    // OPA returns {} when the document is undefined (rule not defined)
    throw new Error(`OPA query "${cfg.query}" returned undefined — check policy path`);
  }
  return normaliseResult(body.result);
}

// ── Embedded mode (opa eval CLI) ──────────────────────────────────────────────

function evalEmbedded(
  input: Record<string, unknown>,
  cfg: OpaRuleConfig
): OpaDecision {
  if (!cfg.policy) {
    throw new Error('OPA rule with mode: "embedded" requires a "policy" field (path to .rego file)');
  }

  const result = spawnSync(
    "opa",
    ["eval", "--data", cfg.policy, "--stdin-input", "--format", "raw", cfg.query],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      timeout: 10_000,
    }
  );

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    const msg =
      code === "ENOENT"
        ? "opa CLI not found — install from https://www.openpolicyagent.org/docs/latest/#1-download-opa"
        : result.error.message;
    throw new Error(msg);
  }

  if (result.status !== 0) {
    throw new Error(`opa eval exited ${result.status}: ${(result.stderr ?? "").trim()}`);
  }

  const raw = (result.stdout ?? "").trim();

  // opa --format raw outputs the value directly
  // Could be "true", "false", or a JSON object
  if (raw === "true") return { allow: true };
  if (raw === "false") return { allow: false };

  try {
    return normaliseResult(JSON.parse(raw));
  } catch {
    throw new Error(`opa eval returned unexpected output: ${raw}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runOpaRule(
  ticket: Ticket,
  signals: LintSignals,
  id: string,
  cfg: OpaRuleConfig
): Promise<CheckResult> {
  const sev: Severity = cfg.severity ?? "error";
  const input = buildInput(ticket, signals, cfg);

  let decision: OpaDecision;
  try {
    const mode = cfg.mode ?? "remote";
    decision =
      mode === "embedded"
        ? evalEmbedded(input, cfg)
        : await evalRemote(input, cfg);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      severity: sev,
      status: "fail",
      message: `OPA evaluation error: ${msg}`,
    };
  }

  return {
    id,
    severity: sev,
    status: decision.allow ? "pass" : "fail",
    message: decision.allow
      ? (decision.reason ?? "OPA policy allows this ticket")
      : (decision.reason ?? "OPA policy denied this ticket"),
    hint: decision.hint,
  };
}
