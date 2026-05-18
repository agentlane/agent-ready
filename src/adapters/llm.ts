import type { BuiltinRuleConfig, Ticket } from "../types.js";

export interface AmbiguityJudgeResult {
  score: number;
  explanation: string;
  cost_usd?: number;
}

interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

function providerOf(cfg: BuiltinRuleConfig): NonNullable<BuiltinRuleConfig["provider"]> {
  return cfg.provider ?? "openai";
}

function apiKeyEnv(cfg: BuiltinRuleConfig): string {
  if (cfg.api_key_env) return cfg.api_key_env;
  switch (providerOf(cfg)) {
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "portkey": return "PORTKEY_API_KEY";
    default: return "OPENAI_API_KEY";
  }
}

function baseUrl(cfg: BuiltinRuleConfig): string {
  if (cfg.base_url) return cfg.base_url.replace(/\/$/, "");
  switch (providerOf(cfg)) {
    case "anthropic": return "https://api.anthropic.com";
    case "portkey": return "https://api.portkey.ai/v1";
    default: return "https://api.openai.com/v1";
  }
}

function modelOf(cfg: BuiltinRuleConfig): string {
  if (cfg.model) return cfg.model;
  return providerOf(cfg) === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini";
}

function judgePrompt(ticket: Ticket): string {
  return [
    "Score this software ticket for implementation clarity.",
    "Return only JSON: {\"score\":0.0,\"explanation\":\"one sentence\"}.",
    "Score 1.0 means concrete, testable, and ready for an AI coding agent.",
    "Score 0.0 means vague, ambiguous, or missing required context.",
    "",
    `Title: ${ticket.title}`,
    `Labels: ${(ticket.labels || []).join(", ")}`,
    "Body:",
    ticket.body || ""
  ].join("\n");
}

function parseJsonObject(text: string): { score?: unknown; explanation?: unknown; cost_usd?: unknown } {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function clampScore(score: unknown): number {
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) throw new Error("LLM judge response missing numeric score");
  return Math.min(1, Math.max(0, n));
}

function explanationOf(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("LLM judge response missing explanation");
  }
  return value.trim().replace(/\s+/g, " ");
}

function costFromUsage(cfg: BuiltinRuleConfig, usage: LlmUsage, directCost?: unknown): number | undefined {
  if (typeof directCost === "number" && Number.isFinite(directCost)) return Number(directCost.toFixed(6));
  const inputRate = cfg.cost_per_1k_input;
  const outputRate = cfg.cost_per_1k_output;
  if (inputRate === undefined || outputRate === undefined) return undefined;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return Number((((input / 1000) * inputRate) + ((output / 1000) * outputRate)).toFixed(6));
}

function openAiPayload(ticket: Ticket, cfg: BuiltinRuleConfig): object {
  return {
    model: modelOf(cfg),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a strict ticket-readiness ambiguity judge." },
      { role: "user", content: judgePrompt(ticket) }
    ],
    temperature: 0
  };
}

function anthropicPayload(ticket: Ticket, cfg: BuiltinRuleConfig): object {
  return {
    model: modelOf(cfg),
    max_tokens: 200,
    temperature: 0,
    system: "You are a strict ticket-readiness ambiguity judge.",
    messages: [{ role: "user", content: judgePrompt(ticket) }]
  };
}

async function postJson(url: string, headers: Record<string, string>, body: object): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LLM judge request failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return JSON.parse(text);
}

function readOpenAiResponse(raw: unknown): { content: string; usage: LlmUsage; directCost?: unknown } {
  const obj = raw as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    cost_usd?: unknown;
  };
  const content = obj.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM judge response missing content");
  return {
    content,
    usage: {
      inputTokens: obj.usage?.prompt_tokens,
      outputTokens: obj.usage?.completion_tokens
    },
    directCost: obj.cost_usd
  };
}

function readAnthropicResponse(raw: unknown): { content: string; usage: LlmUsage; directCost?: unknown } {
  const obj = raw as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    cost_usd?: unknown;
  };
  const content = obj.content?.map((part) => part.text ?? "").join("").trim();
  if (!content) throw new Error("LLM judge response missing content");
  return {
    content,
    usage: {
      inputTokens: obj.usage?.input_tokens,
      outputTokens: obj.usage?.output_tokens
    },
    directCost: obj.cost_usd
  };
}

export async function judgeAmbiguity(ticket: Ticket, cfg: BuiltinRuleConfig): Promise<AmbiguityJudgeResult> {
  const provider = providerOf(cfg);
  const key = process.env[apiKeyEnv(cfg)];
  if (!key) {
    throw new Error(`Missing ${apiKeyEnv(cfg)} for llm-judge-ambiguity`);
  }

  if (provider === "anthropic") {
    const raw = await postJson(`${baseUrl(cfg)}/v1/messages`, {
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    }, anthropicPayload(ticket, cfg));
    const { content, usage, directCost } = readAnthropicResponse(raw);
    const parsed = parseJsonObject(content);
    return {
      score: clampScore(parsed.score),
      explanation: explanationOf(parsed.explanation),
      cost_usd: costFromUsage(cfg, usage, parsed.cost_usd ?? directCost)
    };
  }

  const raw = await postJson(`${baseUrl(cfg)}/chat/completions`, {
    Authorization: `Bearer ${key}`
  }, openAiPayload(ticket, cfg));
  const { content, usage, directCost } = readOpenAiResponse(raw);
  const parsed = parseJsonObject(content);
  return {
    score: clampScore(parsed.score),
    explanation: explanationOf(parsed.explanation),
    cost_usd: costFromUsage(cfg, usage, parsed.cost_usd ?? directCost)
  };
}
