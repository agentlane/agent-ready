/**
 * @agentlane/agent-ready — public programmatic API
 *
 * Primary entry point. Import what you need:
 *
 *   import { lintTicket, loadTicketFromFile } from "@agentlane/agent-ready";
 *   import type { Ticket, LintOutput } from "@agentlane/agent-ready";
 *
 * Sub-path imports also work:
 *   import { loadTicketFromGitHub } from "@agentlane/agent-ready/adapters";
 *   import { renderMarkdown } from "@agentlane/agent-ready/render";
 */

// Core linting function
export { lintTicket } from "./lint.js";

// Adapters
export { loadTicketFromFile } from "./adapters/file.js";
export { loadTicketFromGitHub } from "./adapters/github.js";
export { loadTicketFromJira } from "./adapters/jira.js";
export { loadTicketFromLinear } from "./adapters/linear.js";

// Renderers
export { renderMarkdown, renderText } from "./render/markdown.js";
export { renderSarif } from "./render/sarif.js";

// Telemetry
export { emitLintOutput } from "./telemetry/emit.js";

// Public types (type-only re-exports for tree-shaking)
export type {
  Ticket,
  RulePack,
  RuleConfig,
  BuiltinRuleConfig,
  RegexRuleConfig,
  SignalsConfig,
  OutputConfig,
  SinkConfig,
  WebhookSinkConfig,
  JsonlSinkConfig,
  OtelSinkConfig,
  LintOutput,
  LintSignals,
  LintSource,
  CheckResult,
  Rule,
  Severity,
  AgentPath,
  ContextTier,
  RiskClassification,
} from "./types.js";
