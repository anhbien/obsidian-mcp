import { VAULT_PATH, getAllNotes, todayFilename } from "../vault.js";
import * as fs from "fs";
import * as path from "path";

export function handleHealthCheck(_args: Record<string, string>): string {
  if (!fs.existsSync(VAULT_PATH)) {
    return `ERROR: vault not reachable at ${VAULT_PATH}`;
  }

  const notes = getAllNotes();

  // Find the most recently modified note
  let latestFile = "";
  let latestMtime = 0;
  for (const notePath of notes) {
    const full = path.join(VAULT_PATH, notePath);
    const mtime = fs.statSync(full).mtimeMs;
    if (mtime > latestMtime) {
      latestMtime = mtime;
      latestFile = notePath;
    }
  }

  const lastModified = latestMtime
    ? new Date(latestMtime).toISOString().replace("T", " ").slice(0, 19)
    : "unknown";

  const todayNote = `Daily Notes/${todayFilename()}`;
  const hasTodayNote = fs.existsSync(path.join(VAULT_PATH, todayNote));

  return [
    `✅ Vault reachable: ${VAULT_PATH}`,
    `📝 Total notes: ${notes.length}`,
    `🕐 Last modified: ${lastModified} (${latestFile})`,
    `📅 Today's note (${todayFilename()}): ${hasTodayNote ? "exists" : "not created yet"}`,
  ].join("\n");
}
