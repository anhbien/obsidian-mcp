import * as http from "http";

const PORT = 27183;

function callBridge(endpoint: string, params: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const url = new URL(`http://127.0.0.1:${PORT}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    http
      .get(url.toString(), (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", () => {
        resolve(
          JSON.stringify({ error: "Obsidian is not running or bridge unavailable. Open Obsidian to use this tool." })
        );
      });
  });
}

export async function handleGetBacklinks(args: Record<string, string>): Promise<string> {
  const { path } = args;
  const raw = await callBridge("/backlinks", { path });
  try {
    const parsed = JSON.parse(raw) as { backlinks?: string[]; error?: string };
    if (parsed.error) return `Error: ${parsed.error}`;
    if (!parsed.backlinks?.length) return `No backlinks found for "${path}".`;
    return `Backlinks to "${path}":\n${parsed.backlinks.join("\n")}`;
  } catch {
    return raw;
  }
}

export async function handleGetTags(args: Record<string, string>): Promise<string> {
  const { path } = args;
  const raw = await callBridge("/tags", { path });
  try {
    const parsed = JSON.parse(raw) as { tags?: string[]; error?: string };
    if (parsed.error) return `Error: ${parsed.error}`;
    if (!parsed.tags?.length) return `No tags found in "${path}".`;
    return `Tags in "${path}":\n${parsed.tags.join(", ")}`;
  } catch {
    return raw;
  }
}

export async function handleGetMetadata(args: Record<string, string>): Promise<string> {
  const { path } = args;
  const raw = await callBridge("/metadata", { path });
  try {
    const parsed = JSON.parse(raw) as { metadata?: Record<string, unknown>; error?: string };
    if (parsed.error) return `Error: ${parsed.error}`;
    if (!parsed.metadata || !Object.keys(parsed.metadata).length) return `No frontmatter in "${path}".`;
    return `Metadata for "${path}":\n${JSON.stringify(parsed.metadata, null, 2)}`;
  } catch {
    return raw;
  }
}
