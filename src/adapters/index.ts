/**
 * @agentlane/agent-ready/adapters — all ticket adapters
 *
 *   import { loadTicketFromFile, loadTicketFromGitHub } from "@agentlane/agent-ready/adapters";
 */

export { loadTicketFromFile } from "./file.js";
export { loadTicketFromGitHub } from "./github.js";
export { loadTicketFromJira } from "./jira.js";
export { loadTicketFromLinear } from "./linear.js";
