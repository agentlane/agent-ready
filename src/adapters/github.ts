import { execFileSync } from "node:child_process";
import type { Ticket } from "../types.js";

interface GitHubIssue {
  number: number;
  title: string | null;
  body: string | null;
  html_url: string;
  labels: Array<string | { name?: string | null }>;
  message?: string;
}

interface ParsedGitHubTarget {
  owner: string;
  repo: string;
  issueNumber: number;
}

function parseGitHubTarget(target: string): ParsedGitHubTarget {
  const shorthand = target.match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/);
  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2],
      issueNumber: Number(shorthand[3])
    };
  }

  const url = target.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)(?:[/?#].*)?$/);
  if (url) {
    return {
      owner: url[1],
      repo: url[2],
      issueNumber: Number(url[3])
    };
  }

  throw new Error("Invalid GitHub target. Use owner/repo#123 or https://github.com/owner/repo/issues/123");
}

function githubToken(): string | undefined {
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) return envToken;

  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

function normalizeLabels(labels: GitHubIssue["labels"]): string[] {
  return labels
    .map((label) => {
      if (typeof label === "string") return label;
      return label.name ?? "";
    })
    .filter(Boolean);
}

export async function loadTicketFromGitHub(target: string): Promise<Ticket> {
  const { owner, repo, issueNumber } = parseGitHubTarget(target);
  const token = githubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-ready"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      headers,
      signal: controller.signal
    });
  } catch (err: unknown) {
    throw new Error(`GitHub API request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = `: ${body.message}`;
    } catch { /* ignore parse errors on error responses */ }
    throw new Error(`GitHub issue fetch failed (${res.status})${detail}`);
  }

  const issue = (await res.json()) as GitHubIssue;
  if (!issue.title) {
    throw new Error(`GitHub issue ${owner}/${repo}#${issueNumber} has no title`);
  }

  return {
    id: `#${issue.number}`,
    title: issue.title,
    body: issue.body ?? "",
    labels: normalizeLabels(issue.labels),
    url: issue.html_url
  };
}
