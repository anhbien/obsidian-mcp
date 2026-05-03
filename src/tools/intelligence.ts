import { VAULT_PATH, getAllNotes, readNote } from "../vault.js";
import * as fs from "fs";
import * as path from "path";

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Extract all wiki-link targets from content (strips aliases and heading anchors) */
function parseWikiLinks(content: string): string[] {
  const targets: string[] = [];
  // Strip code blocks so we don't count links inside them
  const noCode = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  for (const m of noCode.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    targets.push(m[1].trim());
  }
  return targets;
}

/** Map from basename-lowercase → vault-relative path(s) */
function buildNoteIndex(notes: string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const n of notes) {
    const key = path.basename(n, ".md").toLowerCase();
    const arr = idx.get(key) ?? [];
    arr.push(n);
    idx.set(key, arr);
  }
  return idx;
}

/** Check if a wiki-link target resolves to a real note */
function resolves(target: string, idx: Map<string, string[]>, notes: string[]): boolean {
  // Exact path match (e.g. [[Daily Notes/2026-05-03]])
  if (notes.includes(target + ".md") || notes.includes(target)) return true;
  // Basename match
  return idx.has(target.toLowerCase());
}

/** Parse frontmatter + inline tags from note content */
function parseTags(content: string): string[] {
  const tags = new Set<string>();

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const inline = fm.match(/^tags:\s*\[(.+)\]/m);
    const plain = fm.match(/^tags:\s*(\S+)$/m);
    const list = [...fm.matchAll(/^\s*-\s+(.+)/gm)];

    if (inline) {
      for (const t of inline[1].split(",")) tags.add(t.trim().replace(/['"]/g, ""));
    } else if (plain) {
      tags.add(plain[1].trim());
    }
    for (const m of list) tags.add(m[1].trim());
  }

  const noCode = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  for (const m of noCode.matchAll(/#([\w/-]+)/g)) tags.add(m[1]);

  return [...tags];
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

/** Notes with no incoming wiki links */
export function handleFindOrphanNotes(args: Record<string, string>): string {
  const folder = args.folder?.toLowerCase();
  const notes = getAllNotes();
  const idx = buildNoteIndex(notes);

  const linkedTo = new Set<string>();

  for (const notePath of notes) {
    const content = readNote(notePath);
    for (const target of parseWikiLinks(content)) {
      const key = target.toLowerCase();
      const matches = idx.get(key) ?? [];
      for (const m of matches) linkedTo.add(m);
      // Also add exact path form
      linkedTo.add(target + ".md");
      linkedTo.add(target);
    }
  }

  const skip = /template|claude\.md|moc\.md/i;

  const orphans = notes.filter((n) => {
    if (skip.test(n)) return false;
    if (folder && !n.toLowerCase().startsWith(folder)) return false;
    return !linkedTo.has(n);
  });

  if (orphans.length === 0) return "No orphan notes found.";
  return `Orphan notes (${orphans.length}) — no incoming wiki links:\n\n` + orphans.join("\n");
}

/** Wiki links that don't resolve to any existing note */
export function handleFindBrokenLinks(args: Record<string, string>): string {
  const notes = getAllNotes();
  const idx = buildNoteIndex(notes);

  const broken: { source: string; link: string }[] = [];

  for (const notePath of notes) {
    if (/template/i.test(notePath)) continue;
    const content = readNote(notePath);
    for (const target of parseWikiLinks(content)) {
      if (!resolves(target, idx, notes)) {
        broken.push({ source: notePath, link: target });
      }
    }
  }

  if (broken.length === 0) return "No broken links found.";
  const lines = broken.map((b) => `${b.source}\n  → [[${b.link}]]`);
  return `Broken links (${broken.length}):\n\n` + lines.join("\n\n");
}

/** Notes connected to a given note by shared tags, outgoing links, backlinks, or folder */
export function handleRelatedNotes(args: Record<string, string>): string {
  const { path: notePath, limit } = args;
  if (!notePath) return "Error: path is required.";
  const max = limit ? parseInt(limit, 10) : 15;

  const notes = getAllNotes();
  const idx = buildNoteIndex(notes);

  // Normalize the input path
  const resolved =
    notes.find((n) => n === notePath) ??
    notes.find((n) => n.toLowerCase() === notePath.toLowerCase()) ??
    (idx.get(path.basename(notePath, ".md").toLowerCase()) ?? [])[0];

  if (!resolved) return `Error: note not found — "${notePath}"`;

  const targetContent = readNote(resolved);
  const targetTags = new Set(parseTags(targetContent));
  const targetLinks = new Set(parseWikiLinks(targetContent).map((l) => l.toLowerCase()));
  const targetFolder = path.dirname(resolved);

  const scores = new Map<string, number>();

  const add = (notePath: string, points: number, reason: string) => {
    if (notePath === resolved) return;
    scores.set(notePath, (scores.get(notePath) ?? 0) + points);
  };

  for (const n of notes) {
    if (n === resolved || /template/i.test(n)) continue;
    const content = readNote(n);
    const tags = parseTags(content);
    const links = parseWikiLinks(content);

    // Shared tags
    for (const t of tags) {
      if (targetTags.has(t)) add(n, 2, "shared-tag");
    }

    // This note links to target
    for (const l of links) {
      const matches = idx.get(l.toLowerCase()) ?? [];
      if (matches.includes(resolved)) add(n, 3, "backlink");
    }

    // Target links to this note
    const basename = path.basename(n, ".md").toLowerCase();
    if (targetLinks.has(basename)) add(n, 3, "outgoing-link");

    // Same folder
    if (path.dirname(n) === targetFolder) add(n, 1, "same-folder");
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);

  if (ranked.length === 0) return `No related notes found for "${resolved}".`;

  const lines = ranked.map(([n, score]) => `(score: ${score})  ${n}`);
  return `Related notes for "${resolved}":\n\n` + lines.join("\n");
}

/** All notes matching a tag (exact or partial match) */
export function handleSearchByTag(args: Record<string, string>): string {
  const { tag } = args;
  if (!tag) return "Error: tag is required.";
  const query = tag.replace(/^#/, "").toLowerCase();

  const matches: string[] = [];

  for (const notePath of getAllNotes()) {
    const content = readNote(notePath);
    const tags = parseTags(content).map((t) => t.toLowerCase());
    if (tags.some((t) => t === query || t.includes(query))) {
      matches.push(notePath);
    }
  }

  if (matches.length === 0) return `No notes found with tag "#${query}".`;
  return `Notes tagged #${query} (${matches.length}):\n\n` + matches.join("\n");
}

/** Comprehensive vault health dashboard */
export function handleVaultStats(_args: Record<string, string>): string {
  const notes = getAllNotes();
  const idx = buildNoteIndex(notes);

  // Notes by top-level folder
  const byFolder: Record<string, number> = {};
  for (const n of notes) {
    const top = n.split("/")[0] ?? "(root)";
    byFolder[top] = (byFolder[top] ?? 0) + 1;
  }

  // Backlink counts and broken link count
  const backlinkCount = new Map<string, number>();
  let brokenCount = 0;
  const linkedTo = new Set<string>();

  for (const notePath of notes) {
    if (/template/i.test(notePath)) continue;
    const content = readNote(notePath);
    for (const target of parseWikiLinks(content)) {
      const key = target.toLowerCase();
      const matches = idx.get(key) ?? [];
      if (matches.length > 0) {
        for (const m of matches) {
          linkedTo.add(m);
          backlinkCount.set(m, (backlinkCount.get(m) ?? 0) + 1);
        }
      } else if (!resolves(target, idx, notes)) {
        brokenCount++;
      }
    }
  }

  // Orphan count
  const skipPattern = /template|claude\.md|moc\.md/i;
  const orphanCount = notes.filter((n) => !skipPattern.test(n) && !linkedTo.has(n)).length;

  // Most linked notes (top 10)
  const topLinked = [...backlinkCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Notes modified in the last 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = notes.filter((n) => {
    try {
      return fs.statSync(path.join(VAULT_PATH, n)).mtimeMs >= cutoff;
    } catch {
      return false;
    }
  }).length;

  const folderLines = Object.entries(byFolder)
    .sort((a, b) => b[1] - a[1])
    .map(([f, c]) => `  ${f.padEnd(30)} ${c}`)
    .join("\n");

  const topLinkedLines = topLinked
    .map(([n, c]) => `  (${String(c).padStart(3)} links)  ${n}`)
    .join("\n");

  return [
    `Vault Stats`,
    `─────────────────────────────`,
    `Total notes:      ${notes.length}`,
    `Modified (7d):    ${recentCount}`,
    `Orphan notes:     ${orphanCount}`,
    `Broken links:     ${brokenCount}`,
    ``,
    `Notes by folder:`,
    folderLines,
    ``,
    `Most linked notes:`,
    topLinkedLines || "  (none)",
  ].join("\n");
}
