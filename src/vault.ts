import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const VAULT_PATH = path.resolve(os.homedir(), "Documents/Code/obsidian-vault");

export function vaultPath(...parts: string[]): string {
  return path.join(VAULT_PATH, ...parts);
}

export function readNote(filePath: string): string {
  return fs.readFileSync(vaultPath(filePath), "utf-8");
}

export function writeNote(filePath: string, content: string): void {
  const full = vaultPath(filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

export function appendToNote(filePath: string, content: string): void {
  const full = vaultPath(filePath);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
  fs.writeFileSync(full, existing + "\n" + content, "utf-8");
}

export function noteExists(filePath: string): boolean {
  return fs.existsSync(vaultPath(filePath));
}

/** Recursively collect all .md file paths relative to vault root */
export function getAllNotes(dir: string = VAULT_PATH): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllNotes(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(path.relative(VAULT_PATH, full));
    }
  }
  return results;
}

export function todayFilename(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}.md`;
}
