import type { LintOutput } from "../types.js";

export function renderMarkdown(out: LintOutput): string {
  const head = out.ready
    ? `✓ **${out.ticket_id}** — ready for an agent (${out.summary.passed} checks passed${out.summary.warnings ? `, ${out.summary.warnings} warning(s)` : ""})`
    : `✗ **${out.ticket_id}** — not ready (${out.summary.failed} blocker(s), ${out.summary.warnings} warning(s))`;

  const lines = [`### agent-ready check`, "", head, ""];
  if (out.checks.length) {
    lines.push("| | Rule | Status |");
    lines.push("|---|---|---|");
    for (const c of out.checks) {
      const icon = c.status === "pass" ? "✓" : c.status === "skip" ? "—" : c.severity === "warn" ? "⚠" : "✗";
      lines.push(`| ${icon} | \`${c.id}\` | ${c.message}${c.hint ? ` — _${c.hint}_` : ""} |`);
    }
  }
  if (!out.ready) {
    lines.push("", "**Fix the blockers above before handing this ticket to an AI agent.**");
  }
  return lines.join("\n");
}

export function renderText(out: LintOutput): string {
  const head = out.ready
    ? `✓ ${out.ticket_id}  ready  (${out.summary.passed} checks passed${out.summary.warnings ? `, ${out.summary.warnings} warning(s)` : ""})`
    : `✗ ${out.ticket_id}  not ready  (${out.summary.failed} blocker(s), ${out.summary.warnings} warning(s))`;
  const rows = out.checks.map((c) => {
    const icon = c.status === "pass" ? "✓" : c.status === "skip" ? "·" : c.severity === "warn" ? "⚠" : "✗";
    return `  ${icon} ${c.id.padEnd(28)}  ${c.message}`;
  });
  return [head, "", ...rows].join("\n");
}
