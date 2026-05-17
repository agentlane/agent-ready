import { readFile } from "node:fs/promises";
import type { Ticket } from "../types.js";

export async function loadTicketFromFile(path: string): Promise<Ticket> {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw);
  if (!obj.id || !obj.title) {
    throw new Error(`Invalid ticket file ${path}: missing 'id' or 'title'`);
  }
  return {
    id: String(obj.id),
    title: String(obj.title),
    body: String(obj.body ?? ""),
    labels: Array.isArray(obj.labels) ? obj.labels.map(String) : [],
    url: obj.url
  };
}
