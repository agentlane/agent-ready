import type { Rule, Ticket, RuleConfig, CheckResult, Severity } from "../types.js";
import { judgeAmbiguity } from "../adapters/llm.js";

const AMBIGUOUS_VERBS = [
  "improve", "optimize", "clean up", "cleanup", "refactor",
  "enhance", "fix it", "make it better", "tidy", "polish", "modernize"
];

const TRIBAL_PHRASES = [
  "as discussed", "you know what i mean", "the usual way",
  "like before", "as agreed", "per our chat", "as we talked about"
];

const RISK_LABELS = ["risk:low", "risk:medium", "risk:high"];
const SIZE_LABELS = ["size:s", "size:m", "size:l", "size:xs", "size:xl"];

function pass(id: string, severity: Severity, message: string): CheckResult {
  return { id, severity, status: "pass", message };
}
function fail(id: string, severity: Severity, message: string, hint?: string): CheckResult {
  return { id, severity, status: "fail", message, hint };
}

function severityOf(cfg: RuleConfig, fallback: Severity): Severity {
  return cfg.severity ?? fallback;
}

function bodyLower(t: Ticket): string {
  return (t.body || "").toLowerCase();
}

function labelsLower(t: Ticket): string[] {
  return (t.labels || []).map((l) => l.toLowerCase());
}

const hasAcceptanceCriteria: Rule = {
  id: "has-acceptance-criteria",
  defaultSeverity: "error",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const min = cfg.min_count ?? 1;
    const body = ticket.body || "";
    const matches = body.match(/^\s*[-*]\s*\[[ x]\]\s+.+$/gm) || [];
    const numbered = body.match(/^\s*\d+\.\s+.+$/gm) || [];
    const givenWhenThen = body.match(/given\s+.+\bwhen\b/gi) || [];
    const total = matches.length + numbered.length + givenWhenThen.length;
    const headingPresent = /acceptance\s+criteria/i.test(body);
    if (total >= min || (headingPresent && total > 0)) {
      return pass(this.id, sev, `Found ${total} acceptance criteria`);
    }
    return fail(
      this.id,
      sev,
      `No acceptance criteria found (need at least ${min})`,
      "Add a checklist, numbered list, or Given/When/Then under an 'Acceptance criteria' heading."
    );
  }
};

const hasDefinitionOfDone: Rule = {
  id: "has-definition-of-done",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const found = /definition\s+of\s+done|\bdod\b/i.test(ticket.body || "");
    return found
      ? pass(this.id, sev, "DoD section found")
      : fail(this.id, sev, "No Definition of Done found", "Add a 'Definition of Done' section listing test, doc, and review requirements.");
  }
};

const hasRepoTarget: Rule = {
  id: "has-repo-target",
  defaultSeverity: "error",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const body = ticket.body || "";
    const inBody = /(^|\n)\s*repo\s*:\s*\S+/i.test(body);
    const inLabel = labelsLower(ticket).some((l) => l.startsWith("repo:"));
    if (inBody || inLabel) return pass(this.id, sev, "Target repo specified");
    return fail(this.id, sev, "Ticket does not specify the target repo", "Add `repo: owner/name` to the body or a `repo:<name>` label.");
  }
};

const hasRiskClassification: Rule = {
  id: "has-risk-classification",
  defaultSeverity: "error",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const found = labelsLower(ticket).some((l) => RISK_LABELS.includes(l));
    return found
      ? pass(this.id, sev, "Risk classification label found")
      : fail(this.id, sev, "No risk classification label", "Add one of: risk:low, risk:medium, risk:high");
  }
};

const hasTestExpectations: Rule = {
  id: "has-test-expectations",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const body = bodyLower(ticket);
    const found = /how to verify|test plan|playwright|jest|pytest|unit test|e2e/i.test(body);
    return found
      ? pass(this.id, sev, "Test expectations described")
      : fail(this.id, sev, "No test expectations described", "Add a 'How to verify' or 'Test plan' section.");
  }
};

const noAmbiguousVerbs: Rule = {
  id: "no-ambiguous-verbs",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const extras = (cfg.extra_terms || []).map((s) => s.toLowerCase());
    const all = [...AMBIGUOUS_VERBS, ...extras];
    const haystack = `${ticket.title} ${ticket.body}`.toLowerCase();
    const hits = all.filter((v) => new RegExp(`\\b${v}\\b`, "i").test(haystack));
    return hits.length === 0
      ? pass(this.id, sev, "No ambiguous verbs")
      : fail(this.id, sev, `Ambiguous verb(s): ${hits.join(", ")}`, "Prefer concrete verbs like 'add', 'fix', 'remove', 'replace'.");
  }
};

const llmJudgeAmbiguity: Rule = {
  id: "llm-judge-ambiguity",
  defaultSeverity: "warn",
  defaultEnabled: false,
  async run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const threshold = cfg.threshold ?? 0.6;
    try {
      const judged = await judgeAmbiguity(ticket, cfg);
      const message = `LLM clarity score ${judged.score.toFixed(2)}: ${judged.explanation}`;
      const result = judged.score >= threshold
        ? pass(this.id, sev, message)
        : fail(this.id, sev, message, `Raise the clarity score to at least ${threshold}.`);
      if (judged.cost_usd !== undefined) result.cost_usd = judged.cost_usd;
      return result;
    } catch (err) {
      return fail(
        this.id,
        sev,
        `LLM ambiguity judge unavailable: ${err instanceof Error ? err.message : String(err)}`,
        "Disable the rule or configure provider, model, API key env var, and base URL."
      );
    }
  }
};

const bodyMinLength: Rule = {
  id: "body-min-length",
  defaultSeverity: "error",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const min = cfg.min_count ?? 100;
    const len = (ticket.body || "").trim().length;
    return len >= min
      ? pass(this.id, sev, `Body length ${len} >= ${min}`)
      : fail(this.id, sev, `Body too short: ${len} chars (need >= ${min})`, "Expand the description with context, AC, and test plan.");
  }
};

const noTribalKnowledge: Rule = {
  id: "no-tribal-knowledge",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const body = bodyLower(ticket);
    const hits = TRIBAL_PHRASES.filter((p) => body.includes(p));
    return hits.length === 0
      ? pass(this.id, sev, "No tribal-knowledge phrases")
      : fail(this.id, sev, `Tribal-knowledge phrase(s): ${hits.join("; ")}`, "Replace with explicit detail. The agent has no prior chat context.");
  }
};

const tShirtSizePresent: Rule = {
  id: "t-shirt-size-present",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const body = ticket.body || "";
    const inBody = /(^|\n)\s*size\s*:\s*(xs|s|m|l|xl)\b/i.test(body);
    const inLabel = labelsLower(ticket).some((l) => SIZE_LABELS.includes(l));
    if (inBody || inLabel) return pass(this.id, sev, "T-shirt size present");
    return fail(this.id, sev, "No t-shirt size estimate", "Add `size: S|M|L|XL` to the body or a `size:<x>` label.");
  }
};

const hasDesignLink: Rule = {
  id: "has-design-link",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const triggerLabels = (cfg.labels || ["ui", "ux", "frontend"]).map((s) => s.toLowerCase());
    const ticketLabels = labelsLower(ticket);
    const triggered = triggerLabels.some((l) => ticketLabels.includes(l));
    if (!triggered) return { id: this.id, severity: sev, status: "skip", message: "Not a UI ticket" };
    const body = ticket.body || "";
    const found = /figma\.com|ardoq\.com|miro\.com|excalidraw\.com/i.test(body);
    return found
      ? pass(this.id, sev, "Design link found")
      : fail(this.id, sev, "UI ticket has no design link", "Link to the Figma/Ardoq/Miro source of truth.");
  }
};

// ─── restricted-paths-declared ────────────────────────────────────────────

const DEFAULT_RESTRICTED_KEYWORDS = [
  "auth", "authentication", "authorization", "oauth", "saml", "sso", "jwt",
  "payment", "checkout", "billing", "stripe", "invoice",
  "password", "secret", "credential", "private key", "api key",
  "identity", "iam", "rbac",
  "terraform", "kubernetes", "k8s", "helm",
  "migration", "schema migration",
];

const DEFAULT_RESTRICTED_PATHS = [
  "src/auth", "src/payment", "src/identity", "src/secrets",
  "infra/", "terraform/", "k8s/", "kubernetes/",
  ".env", "secrets/", "credentials/",
];

const restrictedPathsDeclared: Rule = {
  id: "restricted-paths-declared",
  defaultSeverity: "warn",
  run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const haystack = `${ticket.title || ""} ${ticket.body || ""}`.toLowerCase();
    const keywords = (cfg.keywords ?? DEFAULT_RESTRICTED_KEYWORDS).map((k) => k.toLowerCase());
    const paths = (cfg.paths ?? DEFAULT_RESTRICTED_PATHS).map((p) => p.toLowerCase());
    const hits = [...keywords, ...paths].filter((term) => haystack.includes(term));
    if (hits.length === 0) return pass(this.id, sev, "No restricted-scope signals detected");
    const hasHighRisk = labelsLower(ticket).includes("risk:high");
    if (hasHighRisk) {
      return pass(this.id, sev, `Restricted scope declared with risk:high (signals: ${hits.slice(0, 3).join(", ")})`);
    }
    return fail(
      this.id, sev,
      `Restricted-scope signals without risk:high: ${hits.slice(0, 3).join(", ")}`,
      "Add risk:high label or explicitly acknowledge the restricted scope in the ticket."
    );
  },
};

// ─── links-resolve ────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s)>\]"'`]+/g;

const linksResolve: Rule = {
  id: "links-resolve",
  defaultSeverity: "warn",
  async run(ticket, cfg) {
    const sev = severityOf(cfg, this.defaultSeverity);
    const timeoutMs = cfg.timeout_ms ?? 5000;
    const skipDomains = (cfg.skip_domains ?? []).map((d: string) => d.toLowerCase());
    const urls = [...new Set((ticket.body || "").match(URL_REGEX) ?? [])];
    if (urls.length === 0) return pass(this.id, sev, "No URLs to check");

    const toCheck = urls.filter((url) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return !skipDomains.some((d) => host.includes(d));
      } catch { return false; }
    });
    if (toCheck.length === 0) return pass(this.id, sev, "All URLs are in skip list");

    const broken: string[] = [];
    for (const url of toCheck) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const resp = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "agent-ready-link-checker/1.0" },
        });
        clearTimeout(timer);
        if (!resp.ok) broken.push(url);
      } catch {
        broken.push(url);
      }
    }

    if (broken.length === 0) return pass(this.id, sev, `All ${toCheck.length} URL(s) resolved`);
    return fail(
      this.id, sev,
      `Unresolvable URL(s): ${broken.join(", ")}`,
      "Fix or remove links that time out or return errors."
    );
  },
};

export const BUILTIN_RULES: Rule[] = [
  hasAcceptanceCriteria,
  hasDefinitionOfDone,
  hasRepoTarget,
  hasRiskClassification,
  hasTestExpectations,
  noAmbiguousVerbs,
  llmJudgeAmbiguity,
  bodyMinLength,
  noTribalKnowledge,
  tShirtSizePresent,
  hasDesignLink,
  restrictedPathsDeclared,
  linksResolve,
];

export function runCustomRegex(ticket: Ticket, id: string, cfg: RuleConfig): CheckResult {
  const sev = cfg.severity ?? "error";
  if (!cfg.pattern || !cfg.field) {
    return fail(id, sev, "Invalid custom rule (missing pattern or field)");
  }
  const re = new RegExp(cfg.pattern, cfg.flags ?? "i");
  let haystack = "";
  switch (cfg.field) {
    case "title": haystack = ticket.title || ""; break;
    case "body": haystack = ticket.body || ""; break;
    case "labels": haystack = (ticket.labels || []).join(" "); break;
    case "any": haystack = `${ticket.title || ""} ${ticket.body || ""} ${(ticket.labels || []).join(" ")}`; break;
  }
  const matched = re.test(haystack);
  const want = cfg.must_match !== false;
  const ok = matched === want;
  return ok
    ? pass(id, sev, cfg.message || `Custom regex passed (${cfg.field})`)
    : fail(id, sev, cfg.message || `Custom regex failed (${cfg.field})`);
}
