import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { VAULT_PATH, resolveNote } from "../vault.js";

// ── patch_note ────────────────────────────────────────────────────────────────

type SectionOp = "append_to_section" | "prepend_to_section" | "replace_section";

function findSectionBounds(
  lines: string[],
  sectionQuery: string
): { headingIdx: number; headingLevel: number; endIdx: number } | null {
  const query = sectionQuery.replace(/^#+\s*/, "").toLowerCase();

  let headingIdx = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (m && m[2].trim().toLowerCase().includes(query)) {
      headingIdx = i;
      headingLevel = m[1].length;
      break;
    }
  }

  if (headingIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }

  return { headingIdx, headingLevel, endIdx };
}

function applySection(text: string, section: string, op: SectionOp, content: string): string | null {
  const lines = text.split("\n");
  const bounds = findSectionBounds(lines, section);
  if (!bounds) return null;

  const { headingIdx, endIdx } = bounds;
  const contentLines = content === "" ? [] : content.split("\n");

  switch (op) {
    case "append_to_section":
      lines.splice(endIdx, 0, ...contentLines);
      break;
    case "prepend_to_section":
      lines.splice(headingIdx + 1, 0, ...contentLines);
      break;
    case "replace_section":
      lines.splice(headingIdx + 1, endIdx - headingIdx - 1, ...contentLines);
      break;
  }

  return lines.join("\n");
}

export function handlePatchNote(args: Record<string, string>): string {
  const { path: notePath, operation, old_text, new_text, section, content, replace_all } = args;

  if (!notePath) return "Error: path is required.";
  if (!operation) return "Error: operation is required (replace | append_to_section | prepend_to_section | replace_section).";

  const resolved = resolveNote(notePath);
  if (!resolved) return `Error: note not found — "${notePath}"`;

  const full = path.join(VAULT_PATH, resolved);
  let text = fs.readFileSync(full, "utf-8");

  switch (operation) {
    case "replace": {
      if (old_text === undefined || old_text === "") return "Error: old_text is required for replace.";
      if (!text.includes(old_text)) return `Error: old_text not found in "${resolved}".`;
      const updated =
        replace_all === "true"
          ? text.split(old_text).join(new_text ?? "")
          : text.replace(old_text, new_text ?? "");
      fs.writeFileSync(full, updated, "utf-8");
      return `Replaced in "${resolved}".`;
    }

    case "append_to_section":
    case "prepend_to_section":
    case "replace_section": {
      if (!section) return `Error: section is required for ${operation}.`;
      if (content === undefined) return "Error: content is required.";
      const patched = applySection(text, section, operation, content);
      if (!patched) return `Error: section "${section}" not found in "${resolved}".`;
      fs.writeFileSync(full, patched, "utf-8");
      return `Section "${section}" updated in "${resolved}".`;
    }

    default:
      return `Error: unknown operation "${operation}". Valid: replace | append_to_section | prepend_to_section | replace_section`;
  }
}

// ── upsert_frontmatter ────────────────────────────────────────────────────────

export function handleUpsertFrontmatter(args: Record<string, string>): string {
  const { path: notePath, updates } = args;

  if (!notePath) return "Error: path is required.";
  if (!updates) return 'Error: updates is required — JSON object e.g. {"status":"Active"}. Set a value to null to delete the key.';

  let updateObj: Record<string, unknown>;
  try {
    updateObj = JSON.parse(updates);
    if (typeof updateObj !== "object" || Array.isArray(updateObj)) throw new Error();
  } catch {
    return 'Error: updates must be a valid JSON object, e.g. {"status":"Active","tags":["work"]}';
  }

  const resolved = resolveNote(notePath);
  if (!resolved) return `Error: note not found — "${notePath}"`;

  const full = path.join(VAULT_PATH, resolved);
  const text = fs.readFileSync(full, "utf-8");

  // Split out existing frontmatter and body
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let fm: Record<string, unknown> = {};
  let body = text;

  if (fmMatch) {
    try {
      fm = (yaml.load(fmMatch[1]) as Record<string, unknown>) ?? {};
    } catch {
      return "Error: existing frontmatter is not valid YAML — fix it manually first.";
    }
    body = text.slice(fmMatch[0].length);
  }

  // Apply updates: null = delete key
  const changes: string[] = [];
  for (const [key, value] of Object.entries(updateObj)) {
    if (value === null) {
      if (key in fm) {
        delete fm[key];
        changes.push(`deleted "${key}"`);
      }
    } else {
      fm[key] = value;
      changes.push(`${key} → ${JSON.stringify(value)}`);
    }
  }

  if (changes.length === 0) return "No changes — keys were already up to date.";

  const newFm = yaml.dump(fm, { lineWidth: -1, quotingType: '"' }).trimEnd();
  fs.writeFileSync(full, `---\n${newFm}\n---\n${body}`, "utf-8");

  return `Frontmatter updated in "${resolved}": ${changes.join(", ")}`;
}
