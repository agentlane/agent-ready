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

/** Options for built-in rules. All fields are optional and rule-specific. */
export interface BuiltinRuleConfig {
  type?: never; // discriminant — built-in rules have no `type` field
  enabled?: boolean;
  severity?: Severity;
  // has-acceptance-criteria, body-min-length
  min_count?: number;
  // no-ambiguous-verbs
  extra_terms?: string[];
  // has-design-link
  labels?: string[];
  // llm-judge-ambiguity
  provider?: "openai" | "anthropic" | "portkey" | "custom";
  model?: string;
  threshold?: number;
  base_url?: string;
  api_key_env?: string;
  cost_per_1k_input?: number;
  cost_per_1k_output?: number;
  // links-resolve
  timeout_ms?: number;
  skip_domains?: string[];
  // restricted-paths-declared
  keywords?: string[];
  paths?: string[];
}

/** Options for user-defined regex rules (type: "regex" in rule pack). */
export interface RegexRuleConfig {
  type: "regex";
  enabled?: boolean;
  severity?: Severity;
  pattern: string;
  field: "title" | "body" | "labels" | "any";
  flags?: string;
  must_match?: boolean;
  message?: string;
}

/** Options for user-defined OPA policy rules (type: "opa" in rule pack). */
export interface OpaRuleConfig {
  type: "opa";
  enabled?: boolean;
  severity?: Severity;
  /**
   * Evaluation mode.
   *  - "remote"   POST to an OPA REST server (default)
   *  - "embedded" Shell out to `opa eval` CLI (requires opa installed)
   */
  mode?: "remote" | "embedded";
  /** OPA server base URL, e.g. "http://localhost:8181". Remote mode only. */
  server?: string;
  /** Path to a .rego policy file. Embedded mode only. */
  policy?: string;
  /**
   * OPA query, e.g. "data.security.allow" or "data.pii.decision".
   * For remote mode this becomes the URL path: /v1/data/security/allow.
   * The result must be a boolean or an object with shape
   * { allow: boolean, reason?: string, hint?: string }.
   */
  query: string;
  /**
   * Which parts of the lint context to include in OPA input.
   * Defaults to ["ticket", "signals"].
   */
  input_includes?: Array<"ticket" | "signals">;
}

/** Discriminated union: built-in rule config vs. custom regex vs. OPA policy. */
export type RuleConfig = BuiltinRuleConfig | RegexRuleConfig | OpaRuleConfig;

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

// ── Telemetry sink config ──────────────────────────────────────────────────────

export interface WebhookSinkConfig {
  type: "webhook";
  /** URL to POST the LintOutput JSON to. Supports ${ENV_VAR} interpolation. */
  url: string;
  /** Optional extra request headers. Values support ${ENV_VAR} interpolation. */
  headers?: Record<string, string>;
}

export interface JsonlSinkConfig {
  type: "jsonl";
  /** File path to append JSONL records to. Supports ${ENV_VAR} interpolation. */
  path: string;
}

export interface OtelSinkConfig {
  type: "otel";
  /**
   * OTLP/HTTP endpoint (traces). Example: http://localhost:4318/v1/traces
   * Supports ${ENV_VAR} interpolation.
   */
  endpoint: string;
  /** Service name attribute. Defaults to "agent-ready". */
  service_name?: string;
}

export type SinkConfig = WebhookSinkConfig | JsonlSinkConfig | OtelSinkConfig;


export interface OutputConfig {
  sinks?: SinkConfig[];
}

export interface RulePack {
  version: 1;
  extends?: string;
  rules: Record<string, RuleConfig>;
  signals?: SignalsConfig;
  output?: OutputConfig;
}

export interface CheckResult {
  id: string;
  severity: Severity;
  status: "pass" | "fail" | "skip";
  message: string;
  hint?: string;
  cost_usd?: number;
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
  schema_version: "1.2";
  agent_ready_version: string;
  /** UUIDv4 generated per run — join key for feedback events. */
  run_id: string;
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

// ── Feedback loop ─────────────────────────────────────────────────────────────

/** Outcome of a downstream agent run, captured via `agent-ready feedback record`. */
export interface FeedbackEvent {
  feedback_schema_version: "1.0";
  /** The ticket that was checked. */
  ticket_id: string;
  /** Optional join key to a past LintOutput.run_id. */
  run_id?: string;
  /** How the agent run went. */
  outcome: "success" | "partial" | "failure";
  /** Free-text notes from the team. */
  notes?: string;
  /** How long the agent ran (minutes). */
  duration_min?: number;
  /** ISO timestamp when this feedback was recorded. */
  recorded_at: string;
  /** git user.email of the person recording feedback, if available. */
  recorded_by?: string;
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  defaultEnabled?: boolean;
  run(ticket: Ticket, config: BuiltinRuleConfig): CheckResult | Promise<CheckResult>;
}
