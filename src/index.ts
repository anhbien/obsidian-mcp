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
import { handleGetVaultTree, handleGetRecentNotes, handleGetAllTags } from "./tools/structure.js";
import { handleFindOrphanNotes, handleFindBrokenLinks, handleRelatedNotes, handleSearchByTag, handleVaultStats } from "./tools/intelligence.js";
import { handlePatchNote, handleUpsertFrontmatter } from "./tools/automator.js";

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
    name: "get_vault_tree",
    description: "Get the full recursive folder structure of the vault with note counts per folder. Use this at the start of a session to orient to the vault layout without multiple list_folder calls.",
    inputSchema: {
      type: "object",
      properties: {
        depth: { type: "string", description: "Max folder depth to expand (default: 4)" },
      },
      required: [],
    },
  },
  {
    name: "get_recent_notes",
    description: "Get the N most recently modified notes with timestamps. Use this to see what's been actively worked on.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "string", description: "Number of notes to return (default: 10)" },
      },
      required: [],
    },
  },
  {
    name: "get_all_tags",
    description: "Get all tags used across the vault with occurrence counts, sorted by frequency.",
    inputSchema: { type: "object", properties: {}, required: [] },
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
  // ── Intelligence & Discovery ───────────────────────────────────────────────
  {
    name: "find_orphan_notes",
    description: "Find notes with no incoming wiki links — notes that nothing in the vault points to. Useful for surfacing forgotten knowledge. Optionally filter by folder prefix.",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Optional folder prefix to limit scope, e.g. 'Work'" },
      },
      required: [],
    },
  },
  {
    name: "find_broken_links",
    description: "Find all [[wiki links]] that point to notes that don't exist. Returns source note and the broken link target.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "related_notes",
    description: "Find notes related to a given note by shared tags, outgoing links, backlinks, or same folder. Results ranked by connection strength.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path or partial filename of the source note" },
        limit: { type: "string", description: "Max results to return (default: 15)" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_by_tag",
    description: "Find all notes that contain a specific tag (frontmatter or inline). Partial tag match supported.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Tag to search for, with or without the # prefix" },
      },
      required: ["tag"],
    },
  },
  {
    name: "vault_stats",
    description: "Vault health dashboard — total notes, notes by folder, orphan count, broken link count, most-linked notes, and notes modified in the last 7 days.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  // ── Automator ─────────────────────────────────────────────────────────────
  {
    name: "patch_note",
    description: "Surgical edits to a note without rewriting the whole file. Supports: replace (find & replace text), append_to_section (add content after a heading), prepend_to_section (insert right after a heading), replace_section (swap out a full section body).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path or partial filename" },
        operation: { type: "string", description: "replace | append_to_section | prepend_to_section | replace_section" },
        old_text: { type: "string", description: "Text to find (required for replace)" },
        new_text: { type: "string", description: "Replacement text (required for replace)" },
        replace_all: { type: "string", description: "Pass 'true' to replace every occurrence (replace only)" },
        section: { type: "string", description: "Heading text to target, e.g. '## Tasks' or just 'Tasks' (required for section ops)" },
        content: { type: "string", description: "Content to insert or use as section body (required for section ops)" },
      },
      required: ["path", "operation"],
    },
  },
  {
    name: "upsert_frontmatter",
    description: "Add, update, or delete YAML frontmatter fields without touching the note body. Pass updates as a JSON object. Set a value to null to delete that key.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path or partial filename" },
        updates: { type: "string", description: 'JSON object of key→value pairs, e.g. {"status":"Active","tags":["work"]}. Set value to null to delete.' },
      },
      required: ["path", "updates"],
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
    case "get_vault_tree":  result = handleGetVaultTree(a); break;
    case "get_recent_notes": result = handleGetRecentNotes(a); break;
    case "get_all_tags":    result = handleGetAllTags(a); break;
    case "git_sync":            result = handleGitSync(a); break;
    case "find_orphan_notes":   result = handleFindOrphanNotes(a); break;
    case "find_broken_links":   result = handleFindBrokenLinks(a); break;
    case "related_notes":       result = handleRelatedNotes(a); break;
    case "search_by_tag":       result = handleSearchByTag(a); break;
    case "vault_stats":         result = handleVaultStats(a); break;
    case "patch_note":          result = handlePatchNote(a); break;
    case "upsert_frontmatter":  result = handleUpsertFrontmatter(a); break;
    default:                    result = `Error: unknown tool "${name}"`;
  }

  return { content: [{ type: "text", text: result }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
