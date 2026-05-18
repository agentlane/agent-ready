import type { Ticket } from "../types.js";

interface JiraIssue {
  key: string;
  fields: {
    summary: string | null;
    description: string | null;
    labels: string[];
    components: Array<{ name?: string | null }>;
    message?: string;
  };
  errorMessages?: string[];
  message?: string;
}

interface ParsedJiraTarget {
  key: string;
  baseUrl: string;
}

function parseJiraTarget(target: string): ParsedJiraTarget {
  // Full URL: https://acme.atlassian.net/browse/PROJ-123
  const urlMatch = target.match(
    /^https?:\/\/([^/\s]+\.atlassian\.net)\/browse\/([A-Z][A-Z0-9_]+-\d+)(?:[/?#].*)?$/
  );
  if (urlMatch) {
    return { baseUrl: `https://${urlMatch[1]}`, key: urlMatch[2] };
  }

  // Shorthand: PROJ-123 (requires JIRA_BASE_URL env var)
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(target)) {
    const baseUrl = (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
    if (!baseUrl) {
      throw new Error(
        "JIRA_BASE_URL is required when using a ticket key shorthand. " +
        "Set it to your Jira instance URL (e.g. https://acme.atlassian.net) " +
        "or use the full URL form: https://acme.atlassian.net/browse/PROJ-123"
      );
    }
    return { baseUrl, key: target };
  }

  throw new Error(
    "Invalid Jira target. Use PROJ-123 (with JIRA_BASE_URL set) or " +
    "https://<host>.atlassian.net/browse/PROJ-123"
  );
}

function jiraAuthHeader(): string {
  const email = process.env.JIRA_EMAIL ?? "";
  const token = process.env.JIRA_API_TOKEN ?? "";
  if (!email) {
    throw new Error(
      "JIRA_EMAIL is required for the jira adapter. " +
      "Set it to the email address associated with your Atlassian account."
    );
  }
  if (!token) {
    throw new Error(
      "JIRA_API_TOKEN is required for the jira adapter. " +
      "Generate one at https://id.atlassian.com/manage-profile/security/api-tokens"
    );
  }
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

export async function loadTicketFromJira(target: string): Promise<Ticket> {
  const { key, baseUrl } = parseJiraTarget(target);
  const authHeader = jiraAuthHeader();

  const url = `${baseUrl}/rest/api/2/issue/${key}?fields=summary,description,labels,components`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "agent-ready",
        Authorization: authHeader,
      },
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new Error(
      `Jira API request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as JiraIssue;
      const msg = body.errorMessages?.[0] ?? body.message;
      if (msg) detail = `: ${msg}`;
    } catch { /* ignore parse errors on error responses */ }
    throw new Error(`Jira issue fetch failed (${res.status})${detail}`);
  }

  const issue = (await res.json()) as JiraIssue;
  if (!issue.fields?.summary) {
    throw new Error(`Jira issue ${key} has no summary`);
  }

  return {
    id: issue.key,
    title: issue.fields.summary,
    body: issue.fields.description ?? "",
    labels: [
      ...(issue.fields.labels ?? []),
      ...(issue.fields.components ?? []).map((c) => c.name ?? "").filter(Boolean),
    ],
    url: `${baseUrl}/browse/${issue.key}`,
  };
}
