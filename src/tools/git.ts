import { execSync } from "child_process";
import * as os from "os";

const PROJECTS: Record<string, string> = {
  "obsidian-mcp": `${os.homedir()}/Documents/Code/obsidian-mcp`,
  "obsidian-claude-panel": `${os.homedir()}/Documents/Code/obsidian-claude-panel`,
  "obsidian-finance-sync": `${os.homedir()}/Documents/Code/obsidian-finance-sync`,
};

function syncProject(name: string, dir: string): string {
  try {
    const status = execSync("git status --porcelain", { cwd: dir }).toString().trim();
    if (!status) return `${name}: nothing to commit`;

    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16);
    execSync("git add -A", { cwd: dir });
    execSync(`git commit -m "auto: ${timestamp}"`, { cwd: dir });
    execSync("git push", { cwd: dir });

    const lines = status.split("\n").length;
    return `${name}: committed and pushed (${lines} file${lines !== 1 ? "s" : ""} changed)`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `${name}: error — ${msg.split("\n")[0]}`;
  }
}

export function handleGitSync(args: Record<string, string>): string {
  const project = args.project?.trim();

  if (project && project !== "all") {
    const dir = PROJECTS[project];
    if (!dir) {
      return `Unknown project "${project}". Valid options: ${Object.keys(PROJECTS).join(", ")}, all`;
    }
    return syncProject(project, dir);
  }

  return Object.entries(PROJECTS)
    .map(([name, dir]) => syncProject(name, dir))
    .join("\n");
}
