import type { CheckResult, LintOutput, RulePack, Ticket } from "./types.js";
import { BUILTIN_RULES, runCustomRegex } from "./rules/built-in.js";

const VERSION = "0.0.1";

export function lintTicket(
  ticket: Ticket,
  pack: RulePack,
  opts: { adapter: string; rulePackName: string }
): LintOutput {
  const checks: CheckResult[] = [];
  const ruleConfigs = pack.rules || {};
  const builtinIds = new Set(BUILTIN_RULES.map((r) => r.id));

  for (const rule of BUILTIN_RULES) {
    const cfg = ruleConfigs[rule.id] ?? { enabled: true };
    if (cfg.enabled === false) continue;
    checks.push(rule.run(ticket, cfg));
  }

  for (const [id, cfg] of Object.entries(ruleConfigs)) {
    if (builtinIds.has(id)) continue;
    if (cfg.enabled === false) continue;
    if (cfg.type === "regex") {
      checks.push(runCustomRegex(ticket, id, cfg));
    }
  }

  const failed = checks.filter((c) => c.status === "fail" && c.severity === "error").length;
  const warnings = checks.filter((c) => c.status === "fail" && c.severity === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;

  return {
    schema_version: "1.0",
    agent_ready_version: VERSION,
    ticket_id: ticket.id,
    adapter: opts.adapter,
    rule_pack: opts.rulePackName,
    checked_at: new Date().toISOString(),
    ready: failed === 0,
    summary: { passed, failed, warnings },
    checks
  };
}
