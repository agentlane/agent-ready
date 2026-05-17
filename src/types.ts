export type Severity = "error" | "warn" | "info";

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

export interface RulePack {
  version: 1;
  extends?: string;
  rules: Record<string, RuleConfig>;
}

export interface CheckResult {
  id: string;
  severity: Severity;
  status: "pass" | "fail" | "skip";
  message: string;
  hint?: string;
}

export interface LintOutput {
  schema_version: "1.0";
  agent_ready_version: string;
  ticket_id: string;
  adapter: string;
  rule_pack: string;
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
