import { getAllNotes, readNote, vaultPath } from "../vault.js";
import * as fs from "fs";
import * as path from "path";

export function handleSearchVault(args: Record<string, string>): string {
  const { query, max_results } = args;
  const limit = max_results ? parseInt(max_results, 10) : 20;
  const q = query.toLowerCase();
  const hits: { file: string; line: number; excerpt: string }[] = [];

  for (const notePath of getAllNotes()) {
    if (hits.length >= limit) break;
    const content = readNote(notePath);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ file: notePath, line: i + 1, excerpt: lines[i].trim().slice(0, 120) });
        if (hits.length >= limit) break;
      }
    }
  }

  if (hits.length === 0) return "No results found.";
  return hits.map((h) => `${h.file}:${h.line}  ${h.excerpt}`).join("\n");
}

export function handleListFolder(args: Record<string, string>): string {
  const { path: folderPath = "" } = args;
  const full = vaultPath(folderPath);
  if (!fs.existsSync(full)) return `Error: folder not found: "${folderPath}"`;

  const entries = fs.readdirSync(full, { withFileTypes: true });
  const lines = entries
    .filter((e: fs.Dirent) => !e.name.startsWith("."))
    .map((e: fs.Dirent) => `${e.isDirectory() ? "[folder]" : "[file]  "} ${e.name}`);

  return lines.length ? lines.join("\n") : "(empty)";
}
