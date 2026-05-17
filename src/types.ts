export type Severity = "error" | "warn" | "info";
export type AgentPath = "A" | "B" | "C";
export type ContextTier = "T1" | "T2" | "T3";
export type RiskClassification = "low" | "medium" | "high";

export interface Ticket {
  id: string;
  title: string;
  body: string;
  labels: string[];
  url?: string;
}

export interface RuleConfig {
  enabled?: boolean;
  severity?: Severity;
  min_count?: number;
  extra_terms?: string[];
  labels?: string[];
  // links-resolve
  timeout_ms?: number;
  skip_domains?: string[];
  // restricted-paths-declared
  keywords?: string[];
  paths?: string[];
  // custom-regex fields
  type?: "regex";
  pattern?: string;
  flags?: string;
  field?: "title" | "body" | "labels" | "any";
  must_match?: boolean;
  message?: string;
}

export interface SignalsConfig {
  risk_classification?: {
    default?: RiskClassification;
    label_prefix?: string;
  };
  path_recommendation?: {
    default?: AgentPath;
    warning_threshold?: number;
    warning_value?: AgentPath;
    fail_value?: AgentPath;
    high_risk_value?: AgentPath;
    ui_value?: AgentPath;
  };
  context_tier?: {
    default?: ContextTier;
    body_length_t2?: number;
    body_length_t3?: number;
    warning_value?: ContextTier;
    fail_value?: ContextTier;
    high_risk_value?: ContextTier;
    ui_value?: ContextTier;
  };
}

export interface RulePack {
  version: 1;
  extends?: string;
  rules: Record<string, RuleConfig>;
  signals?: SignalsConfig;
}

export interface CheckResult {
  id: string;
  severity: Severity;
  status: "pass" | "fail" | "skip";
  message: string;
  hint?: string;
}

export interface LintSignals {
  path_recommendation: AgentPath;
  context_tier: ContextTier;
  risk_classification: RiskClassification;
}

export interface LintSource {
  adapter: string;
  url?: string;
  path?: string;
  commit_sha?: string;
  ref?: string;
}

export interface LintOutput {
  schema_version: "1.1";
  agent_ready_version: string;
  ticket_id: string;
  adapter: string;
  rule_pack: string;
  rule_pack_version: string;
  rule_pack_hash?: string;
  source: LintSource;
  signals: LintSignals;
  path_recommendation: AgentPath;
  context_tier: ContextTier;
  checked_at: string;
  ready: boolean;
  summary: { passed: number; failed: number; warnings: number };
  checks: CheckResult[];
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  run(ticket: Ticket, config: RuleConfig): CheckResult | Promise<CheckResult>;
}
