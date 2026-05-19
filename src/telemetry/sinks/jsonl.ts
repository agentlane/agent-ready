import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { LintOutput, JsonlSinkConfig } from "../../types.js";

export async function emitJsonl(
  out: LintOutput,
  cfg: JsonlSinkConfig,
  interpolate: (s: string) => string
): Promise<void> {
  const filePath = interpolate(cfg.path);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(out) + "\n", "utf8");
}
