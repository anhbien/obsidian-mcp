import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleReadNote, handleFindNote } from "./tools/read.js";
import { handleWriteNote, handleAppendToNote } from "./tools/write.js";
import { handleSearchVault, handleListFolder } from "./tools/search.js";
import { handleDailyNote } from "./tools/daily.js";
import { handleHealthCheck } from "./tools/health.js";
import { handleGetBacklinks, handleGetTags, handleGetMetadata } from "./tools/bridge.js";
import { handleGitSync } from "./tools/git.js";

const server = new Server(
  { name: "obsidian-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "health_check",
    description: "Verify the vault is reachable. Returns note count, last modified file, and whether today's daily note exists.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_note",
    description: "Read a note by its vault-relative path (e.g. 'Daily Notes/2026-05-03.md'). Falls back to fuzzy filename match if exact path not found.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path or partial filename" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_note",
    description: "Create or overwrite a note. Requires overwrite=true to replace an existing file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path, e.g. 'Daily Notes/2026-05-03.md'" },
        content: { type: "string", description: "Full note content" },
        overwrite: { type: "string", description: "Pass 'true' to overwrite an existing note" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "append_to_note",
    description: "Append content to the end of an existing note.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path" },
        content: { type: "string", description: "Content to append" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "search_vault",
    description: "Full-text search across all notes. Returns file path, line number, and matching excerpt.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        max_results: { type: "string", description: "Max results to return (default: 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_folder",
    description: "List files and folders at a vault path. Use empty string for vault root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative folder path, or empty string for root" },
      },
      required: [],
    },
  },
  {
    name: "daily_note",
    description: "Get today's daily note (YYYY-MM-DD.md). Returns content if it exists, or creates it from the template.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "find_note",
    description: "Fuzzy search for notes by filename. Returns all matching vault-relative paths.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Partial filename to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_backlinks",
    description: "Get all notes that link to a given note. Requires Obsidian to be running.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path, e.g. 'Side Projects/PropAI/PropAI.md'" },
      },
      required: ["path"],
    },
  },
  {
    name: "get_tags",
    description: "Get all tags (frontmatter + inline) for a note. Requires Obsidian to be running.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path" },
      },
      required: ["path"],
    },
  },
  {
    name: "get_metadata",
    description: "Get frontmatter metadata for a note. Requires Obsidian to be running.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path" },
      },
      required: ["path"],
    },
  },
  {
    name: "git_sync",
    description: "Commit and push any uncommitted changes for Obsidian tools (obsidian-mcp, obsidian-claude-panel, obsidian-finance-sync). Pass a project name to sync one, or omit/pass 'all' to sync all three.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project to sync: 'obsidian-mcp', 'obsidian-claude-panel', 'obsidian-finance-sync', or 'all' (default)",
        },
      },
      required: [],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, string>;

  let result: string;
  switch (name) {
    case "health_check":    result = handleHealthCheck(a); break;
    case "read_note":       result = handleReadNote(a); break;
    case "write_note":      result = handleWriteNote(a); break;
    case "append_to_note":  result = handleAppendToNote(a); break;
    case "search_vault":    result = handleSearchVault(a); break;
    case "list_folder":     result = handleListFolder(a); break;
    case "daily_note":      result = handleDailyNote(a); break;
    case "find_note":       result = handleFindNote(a); break;
    case "get_backlinks":   result = await handleGetBacklinks(a); break;
    case "get_tags":        result = await handleGetTags(a); break;
    case "get_metadata":    result = await handleGetMetadata(a); break;
    case "git_sync":        result = handleGitSync(a); break;
    default:                result = `Error: unknown tool "${name}"`;
  }

  return { content: [{ type: "text", text: result }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
