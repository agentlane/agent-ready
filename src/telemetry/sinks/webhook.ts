import type { LintOutput, WebhookSinkConfig } from "../../types.js";

export async function emitWebhook(
  out: LintOutput,
  cfg: WebhookSinkConfig,
  interpolate: (s: string) => string
): Promise<void> {
  const url = interpolate(cfg.url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "agent-ready",
  };

  for (const [key, value] of Object.entries(cfg.headers ?? {})) {
    headers[key] = interpolate(value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(out),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`webhook sink responded ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
