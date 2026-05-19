import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { FeedbackEvent } from "../types.js";

export interface RecordOptions {
  ticketId: string;
  outcome: "success" | "partial" | "failure";
  notes?: string;
  durationMin?: number;
  runId?: string;
  ledger: string;
}

function gitEmail(): string | undefined {
  try {
    return (
      execFileSync("git", ["config", "user.email"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

export async function recordFeedback(opts: RecordOptions): Promise<FeedbackEvent> {
  const event: FeedbackEvent = {
    feedback_schema_version: "1.0",
    ticket_id: opts.ticketId,
    outcome: opts.outcome,
    recorded_at: new Date().toISOString(),
  };

  if (opts.runId) event.run_id = opts.runId;
  if (opts.notes) event.notes = opts.notes;
  if (opts.durationMin !== undefined) event.duration_min = opts.durationMin;

  const email = gitEmail();
  if (email) event.recorded_by = email;

  await mkdir(dirname(opts.ledger), { recursive: true });
  await appendFile(opts.ledger, JSON.stringify(event) + "\n", "utf8");

  return event;
}
