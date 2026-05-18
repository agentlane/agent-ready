import type { Ticket } from "../types.js";

interface LinearIssueResponse {
  data?: {
    issue?: {
      identifier: string;
      title: string;
      description: string | null;
      url: string;
      labels?: {
        nodes: Array<{ name: string }>;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

interface ParsedLinearTarget {
  key: string; // e.g. "TEAM-123"
}

function parseLinearTarget(target: string): ParsedLinearTarget {
  // Full URL: https://linear.app/<workspace>/issue/TEAM-123 (optional trailing path)
  const urlMatch = target.match(
    /^https?:\/\/linear\.app\/[^/\s]+\/issue\/([A-Z][A-Z0-9_]+-\d+)(?:[/?#].*)?$/
  );
  if (urlMatch) {
    return { key: urlMatch[1] };
  }

  // Shorthand: TEAM-123
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(target)) {
    return { key: target };
  }

  throw new Error(
    "Invalid Linear target. Use TEAM-123 or " +
    "https://linear.app/<workspace>/issue/TEAM-123"
  );
}

function linearApiKey(): string {
  const key = process.env.LINEAR_API_KEY ?? "";
  if (!key) {
    throw new Error(
      "LINEAR_API_KEY is required for the linear adapter. " +
      "Generate one at https://linear.app/settings/api"
    );
  }
  return key;
}

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      identifier
      title
      description
      url
      labels {
        nodes {
          name
        }
      }
    }
  }
`.trim();

export async function loadTicketFromLinear(target: string): Promise<Ticket> {
  const { key } = parseLinearTarget(target);
  const apiKey = linearApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "agent-ready",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: ISSUE_QUERY, variables: { id: key } }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new Error(
      `Linear API request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { errors?: Array<{ message: string }> };
      const msg = body.errors?.[0]?.message;
      if (msg) detail = `: ${msg}`;
    } catch { /* ignore parse errors on error responses */ }
    throw new Error(`Linear API request failed (${res.status})${detail}`);
  }

  const payload = (await res.json()) as LinearIssueResponse;

  // GraphQL can return HTTP 200 with an errors array
  if (payload.errors?.length) {
    throw new Error(`Linear API error: ${payload.errors[0].message}`);
  }

  const issue = payload.data?.issue;
  if (!issue) {
    throw new Error(`Linear issue ${key} not found or not accessible`);
  }

  return {
    id: issue.identifier,
    title: issue.title,
    body: issue.description ?? "",
    labels: (issue.labels?.nodes ?? []).map((n) => n.name).filter(Boolean),
    url: issue.url,
  };
}
