import { todayFilename, noteExists, readNote, writeNote, VAULT_PATH } from "../vault.js";
import * as path from "path";
import * as fs from "fs";

const DAILY_FOLDER = "Daily Notes";
const TEMPLATE_PATH = `${DAILY_FOLDER}/Template - Daily Note.md`;

export function handleDailyNote(args: Record<string, string>): string {
  const filename = todayFilename();
  const notePath = `${DAILY_FOLDER}/${filename}`;

  if (noteExists(notePath)) {
    return readNote(notePath);
  }

  // Create from template if it exists
  let content = `# 📅 ${filename.replace(".md", "")}\n`;
  if (noteExists(TEMPLATE_PATH)) {
    const template = readNote(TEMPLATE_PATH);
    content = template;
  }

  writeNote(notePath, content);
  return `Created today's note: ${notePath}\n\n${content}`;
}
