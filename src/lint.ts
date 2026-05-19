import { randomUUID } from "node:crypto";
import type {
  AgentPath,
  BuiltinRuleConfig,
  CheckResult,
  ContextTier,
  LintOutput,
  LintSignals,
  OpaRuleConfig,
  RegexRuleConfig,
  RulePack,
  Ticket
} from "./types.js";
import { BUILTIN_RULES, runCustomRegex } from "./rules/built-in.js";
import { runOpaRule } from "./rules/opa.js";
import { VERSION } from "./version.js";

const UI_LABELS = new Set(["ui", "ux", "frontend", "design"]);

function ticketLabels(ticket: Ticket): string[] {
  return ticket.labels.map((label) => label.toLowerCase());
}

function isUiTicket(ticket: Ticket): boolean {
  return ticketLabels(ticket).some((label) => UI_LABELS.has(label));
}

function deriveRisk(ticket: Ticket, pack: RulePack): LintSignals["risk_classification"] {
  const cfg = pack.signals?.risk_classification ?? {};
  const prefix = (cfg.label_prefix ?? "risk:").toLowerCase();
  const defaultRisk = cfg.default ?? "medium";
  const risk = ticketLabels(ticket)
    .find((label) => label.startsWith(prefix))
    ?.slice(prefix.length);

  if (risk === "low" || risk === "medium" || risk === "high") return risk;
  return defaultRisk;
}

function bumpPath(current: AgentPath, next: AgentPath): AgentPath {
  const order: Record<AgentPath, number> = { A: 1, B: 2, C: 3 };
  return order[next] > order[current] ? next : current;
}

function bumpTier(current: ContextTier, next: ContextTier): ContextTier {
  const order: Record<ContextTier, number> = { T1: 1, T2: 2, T3: 3 };
  return order[next] > order[current] ? next : current;
}

function deriveSignals(ticket: Ticket, checks: CheckResult[], pack: RulePack): LintSignals {
  const failed = checks.filter((c) => c.status === "fail" && c.severity === "error").length;
  const warnings = checks.filter((c) => c.status === "fail" && c.severity === "warn").length;
  const risk = deriveRisk(ticket, pack);
  const uiTicket = isUiTicket(ticket);

  const pathCfg = pack.signals?.path_recommendation ?? {};
  const warningThreshold = pathCfg.warning_threshold ?? 2;
  let path = pathCfg.default ?? "A";
  if (uiTicket) path = bumpPath(path, pathCfg.ui_value ?? "B");
  if (warnings >= warningThreshold) path = bumpPath(path, pathCfg.warning_value ?? "B");
  if (failed > 0) path = bumpPath(path, pathCfg.fail_value ?? "C");
  if (risk === "high") path = bumpPath(path, pathCfg.high_risk_value ?? "C");

  const tierCfg = pack.signals?.context_tier ?? {};
  const bodyLength = ticket.body.trim().length;
  let tier = tierCfg.default ?? "T1";
  if (uiTicket) tier = bumpTier(tier, tierCfg.ui_value ?? "T2");
  if (warnings >= warningThreshold) tier = bumpTier(tier, tierCfg.warning_value ?? "T2");
  if (failed > 0) tier = bumpTier(tier, tierCfg.fail_value ?? "T2");
  if (bodyLength >= (tierCfg.body_length_t2 ?? 800)) tier = bumpTier(tier, "T2");
  if (bodyLength >= (tierCfg.body_length_t3 ?? 2000)) tier = bumpTier(tier, "T3");
  if (risk === "high") tier = bumpTier(tier, tierCfg.high_risk_value ?? "T3");

  return {
    path_recommendation: path,
    context_tier: tier,
    risk_classification: risk
  };
}

function cleanSource(source: LintOutput["source"]): LintOutput["source"] {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as LintOutput["source"];
}

export async function lintTicket(
  ticket: Ticket,
  pack: RulePack,
  opts: {
    adapter: string;
    rulePackName: string;
    rulePackVersion?: string;
    rulePackHash?: string;
    source?: Partial<LintOutput["source"]>;
  }
): Promise<LintOutput> {
  const ruleConfigs = pack.rules || {};
  const builtinIds = new Set(BUILTIN_RULES.map((r) => r.id));

  // ── Phase 1: built-in + custom-regex rules (parallel) ──────────────────────
  const phase1: Promise<CheckResult>[] = [];

  for (const rule of BUILTIN_RULES) {
    const raw = ruleConfigs[rule.id] ?? { enabled: rule.defaultEnabled ?? true };
    // Skip if user has accidentally given a built-in rule ID a non-builtin type
    const rawType = (raw as { type?: string }).type;
    if (rawType === "regex" || rawType === "opa") continue;
    const cfg = raw as BuiltinRuleConfig;
    if (cfg.enabled === false) continue;
    phase1.push(Promise.resolve().then(() => rule.run(ticket, cfg)));
  }

  for (const [id, cfg] of Object.entries(ruleConfigs)) {
    if (builtinIds.has(id)) continue;
    if (cfg.enabled === false) continue;
    if (cfg.type === "regex") {
      phase1.push(Promise.resolve().then(() => runCustomRegex(ticket, id, cfg as RegexRuleConfig)));
    }
  }

  const phase1Checks = await Promise.all(phase1);

  // Derive intermediate signals from phase 1 results — used as OPA input so
  // policies can reason about path/tier/risk without a chicken-and-egg problem.
  const intermediateSignals = deriveSignals(ticket, phase1Checks, pack);

  // ── Phase 2: OPA policy rules (sequential; depend on intermediate signals) ─
  const phase2: Promise<CheckResult>[] = [];

  for (const [id, cfg] of Object.entries(ruleConfigs)) {
    if (cfg.enabled === false) continue;
    if (cfg.type === "opa") {
      phase2.push(runOpaRule(ticket, intermediateSignals, id, cfg as OpaRuleConfig));
    }
  }

  const phase2Checks = await Promise.all(phase2);
  const checks = [...phase1Checks, ...phase2Checks];

  const failed = checks.filter((c) => c.status === "fail" && c.severity === "error").length;
  const warnings = checks.filter((c) => c.status === "fail" && c.severity === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  // Final signals account for OPA rule results
  const signals = deriveSignals(ticket, checks, pack);
  const source = cleanSource({
    adapter: opts.adapter,
    url: ticket.url,
    ...opts.source
  });

  return {
    schema_version: "1.2",
    agent_ready_version: VERSION,
    run_id: randomUUID(),
    ticket_id: ticket.id,
    adapter: opts.adapter,
    rule_pack: opts.rulePackName,
    rule_pack_version: opts.rulePackVersion ?? String(pack.version),
    rule_pack_hash: opts.rulePackHash,
    source,
    signals,
    path_recommendation: signals.path_recommendation,
    context_tier: signals.context_tier,
    checked_at: new Date().toISOString(),
    ready: failed === 0,
    summary: { passed, failed, warnings },
    checks
  };
}
