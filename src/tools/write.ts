import { writeNote, appendToNote, noteExists } from "../vault.js";

export function handleWriteNote(args: Record<string, string>): string {
  const { path: notePath, content, overwrite } = args;
  if (noteExists(notePath) && overwrite !== "true") {
    return `Error: note already exists: "${notePath}". Pass overwrite=true to replace it.`;
  }
  writeNote(notePath, content);
  return `Written: ${notePath}`;
}

export function handleAppendToNote(args: Record<string, string>): string {
  const { path: notePath, content } = args;
  if (!noteExists(notePath)) {
    return `Error: note not found: "${notePath}"`;
  }
  appendToNote(notePath, content);
  return `Appended to: ${notePath}`;
}
