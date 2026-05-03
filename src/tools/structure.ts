import { VAULT_PATH, getAllNotes, readNote } from "../vault.js";
import * as fs from "fs";
import * as path from "path";

/** Recursive folder tree showing subfolders and note counts per folder */
export function handleGetVaultTree(args: Record<string, string>): string {
  const maxDepth = args.depth ? parseInt(args.depth, 10) : 4;

  function countNotes(dir: string): number {
    let count = 0;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) count += countNotes(full);
        else if (entry.name.endsWith(".md")) count++;
      }
    } catch {}
    return count;
  }

  function buildTree(dir: string, depth: number, indent: string): string[] {
    if (depth > maxDepth) return [];
    const lines: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const folder of folders) {
      const full = path.join(dir, folder.name);
      const notes = countNotes(full);
      lines.push(`${indent}📁 ${folder.name}/  (${notes} note${notes !== 1 ? "s" : ""})`);
      lines.push(...buildTree(full, depth + 1, indent + "  "));
    }

    // At leaf depth (or folders with no subfolders), list the .md files
    const hasSubfolders = folders.length > 0;
    if (!hasSubfolders || depth === maxDepth) {
      const files = entries
        .filter((e) => !e.isDirectory() && e.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const file of files) {
        lines.push(`${indent}📄 ${file.name}`);
      }
    }

    return lines;
  }

  const lines = buildTree(VAULT_PATH, 1, "");
  return lines.length ? lines.join("\n") : "(empty vault)";
}

/** N most recently modified notes */
export function handleGetRecentNotes(args: Record<string, string>): string {
  const limit = args.limit ? parseInt(args.limit, 10) : 10;
  const notes = getAllNotes();

  const withMtime = notes.map((notePath) => {
    const full = path.join(VAULT_PATH, notePath);
    const mtime = fs.statSync(full).mtimeMs;
    return { notePath, mtime };
  });

  withMtime.sort((a, b) => b.mtime - a.mtime);

  const top = withMtime.slice(0, limit);
  return top
    .map(({ notePath, mtime }) => {
      const dt = new Date(mtime).toISOString().replace("T", " ").slice(0, 16);
      return `${dt}  ${notePath}`;
    })
    .join("\n");
}

/** All tags across the vault with occurrence counts */
export function handleGetAllTags(_args: Record<string, string>): string {
  const counts: Record<string, number> = {};
  const inlineTag = /#([\w/-]+)/g;

  for (const notePath of getAllNotes()) {
    const content = readNote(notePath);

    // Frontmatter tags: array or inline
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      // tags: [a, b, c] or tags: a
      const tagsLine = fm.match(/^tags:\s*(.+)/m);
      if (tagsLine) {
        const raw = tagsLine[1].replace(/[\[\]]/g, "");
        for (const t of raw.split(",")) {
          const tag = t.trim();
          if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
        }
      }
      // tags:\n  - a
      const listTags = [...fm.matchAll(/^\s*-\s+(.+)/gm)];
      for (const m of listTags) {
        const tag = m[1].trim();
        if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }

    // Inline #tags (skip inside code blocks)
    const noCode = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
    for (const m of noCode.matchAll(inlineTag)) {
      counts[m[1]] = (counts[m[1]] ?? 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return "No tags found in vault.";
  return sorted.map(([tag, count]) => `#${tag}  (${count})`).join("\n");
}
