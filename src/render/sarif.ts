/**
 * SARIF 2.1.0 renderer for agent-ready lint output.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 *
 * Only failed/warning checks appear as `results`; all rules appear in
 * `driver.rules` so tooling can enumerate them even when passing.
 */
import type { LintOutput, CheckResult } from "../types.js";

const SARIF_SCHEMA = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

function sarifLevel(c: CheckResult): "error" | "warning" | "note" {
  if (c.severity === "error") return "error";
  if (c.severity === "warn") return "warning";
  return "note";
}

/** Convert a kebab-case rule id to PascalCase for SARIF ruleId name field. */
function toPascalCase(id: string): string {
  return id.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

export function renderSarif(out: LintOutput): string {
  const driverRules = out.checks.map((c) => ({
    id: c.id,
    name: toPascalCase(c.id),
    shortDescription: { text: c.message },
    helpUri: `https://github.com/agentlane/agent-ready#what-it-checks-12-built-in-rules`,
    properties: { severity: c.severity },
  }));

  const results = out.checks
    .filter((c) => c.status === "fail")
    .map((c) => ({
      ruleId: c.id,
      level: sarifLevel(c),
      message: {
        text: c.hint ? `${c.message} — ${c.hint}` : c.message,
      },
      locations: [
        {
          logicalLocations: [
            {
              name: out.ticket_id,
              kind: "module",
              decoratedName: `ticket:${out.ticket_id}`,
            },
          ],
        },
      ],
    }));

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agent-ready",
            version: out.agent_ready_version,
            informationUri: "https://github.com/agentlane/agent-ready",
            rules: driverRules,
          },
        },
        results,
        properties: {
          ticket_id: out.ticket_id,
          adapter: out.adapter,
          rule_pack: out.rule_pack,
          checked_at: out.checked_at,
          ready: out.ready,
        },
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
