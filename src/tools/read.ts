import { readNote, noteExists, getAllNotes } from "../vault.js";
import * as path from "path";

export function handleReadNote(args: Record<string, string>): string {
  const { path: notePath } = args;

  if (noteExists(notePath)) {
    return readNote(notePath);
  }

  // Fuzzy fallback: find first note whose filename contains the query
  const query = notePath.toLowerCase();
  const match = getAllNotes().find((p) => path.basename(p).toLowerCase().includes(query));
  if (match) return readNote(match);

  return `Error: note not found: "${notePath}"`;
}

export function handleFindNote(args: Record<string, string>): string {
  const { query } = args;
  const q = query.toLowerCase();
  const matches = getAllNotes().filter((p) => path.basename(p).toLowerCase().includes(q));
  if (matches.length === 0) return "No notes found.";
  return matches.join("\n");
}
