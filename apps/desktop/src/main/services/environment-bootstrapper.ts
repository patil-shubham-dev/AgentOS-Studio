import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

/**
 * Phase 2 — Environment Bootstrapper
 *
 * Generic, harness-agnostic writer. Runs once per workspace, before any
 * harness process spawns. Idempotent — merges into a clearly-delimited
 * AgenticOS-owned section; never clobbers user-authored content.
 *
 * Per-harness conventions verified against vendor docs (see 06_MASTER_PLAN.md:104):
 *  - Opencode: AGENTS.md native, mcp in opencode.json
 *  - Claude Code: NOT AGENTS.md-native — CLAUDE.md with @AGENTS.md import, .mcp.json
 *  - Codex: AGENTS.md native, .codex/config.toml
 *
 * No harness runtime dependency — pure filesystem writes.
 */

// ── Owned section markers ────────────────────────────────────────────────

const MARKDOWN_START = "<!-- AgenticOS:START -->"
const MARKDOWN_END = "<!-- AgenticOS:END -->"
const TOML_START = "# AgenticOS:START"
const TOML_END = "# AgenticOS:END"

// ── MCP server definitions (owned, stdio) ────────────────────────────────
export const DESIGN_MCP = {
  name: "agentic-design",
  description: "AgenticOS Design artifact MCP (stdio)",
  opencode: {
    type: "local" as const,
    command: ["node", "./.agentic/mcp/design-server.js"],
    enabled: true,
  },
  claude: {
    command: "node",
    args: ["./.agentic/mcp/design-server.js"],
  },
  codex: {
    command: "node",
    args: ["./.agentic/mcp/design-server.js"],
  },
} as const

export const BROWSER_MCP = {
  name: "agentic-browser",
  description: "AgenticOS Browser automation (stdio)",
  // Opencode: mcp: { [name]: { type:"local", command:[...], enabled } }
  opencode: {
    type: "local" as const,
    command: ["node", "./.agentic/mcp/browser-server.js"],
    enabled: true,
  },
  // Claude Code: .mcp.json -> { mcpServers: { [name]: { command, args } } }
  claude: {
    command: "node",
    args: ["./.agentic/mcp/browser-server.js"],
  },
  // Codex: .codex/config.toml -> [mcp_servers.NAME] command/args
  codex: {
    command: "node",
    args: ["./.agentic/mcp/browser-server.js"],
  },
} as const

// ── Owned markdown content ───────────────────────────────────────────────

const AGENTS_MD_OWNED = `${MARKDOWN_START}
# AgenticOS — Workspace Instructions

This section is auto-managed by AgenticOS. Your content outside the markers is preserved.

## Harness context
- This workspace is bootstrapped for **Opencode**, **Claude Code**, and **Codex** simultaneously.
- Instruction file precedence per harness is handled by the bootstrapper (see 06_MASTER_PLAN.md:104).
- Opencode reads \`AGENTS.md\` natively; Codex reads \`AGENTS.md\` (32 KiB cap); Claude Code reads \`CLAUDE.md\` which imports \`@AGENTS.md\`.

## MCP servers
- \`agentic-browser\` — Browser automation via AgenticOS (stdio, \`.agentic/mcp/browser-server.js\`).
- \`agentic-design\` — Design artifacts via AgenticOS (stdio, \`.agentic/mcp/design-server.js\`).

## Skills
- Project skills live in \`.agentic/skills/\` (loaded by SkillLoader). Bundled skills are available regardless of this file.
${MARKDOWN_END}`

const CLAUDE_MD_OWNED_INNER = `# AgenticOS — Claude Code Notes

This workspace is bootstrapped for Claude Code. The \`@AGENTS.md\` import above brings in shared instructions.
MCP servers are registered in \`.mcp.json\` (project, requires approval on first use in the terminal).`

function buildClaudeMdOwned(): string {
  return `${MARKDOWN_START}
${CLAUDE_MD_OWNED_INNER}
${MARKDOWN_END}`
}

// ── Lookup table (harness-agnostic, per 06_MASTER_PLAN.md:22) ─────────────

export const HARNESS_CONVENTIONS = {
  opencode: {
    instructionFile: "AGENTS.md",
    instructionNative: true,
    mcpFile: "opencode.json",
    mcpKey: "mcp",
  },
  claude: {
    instructionFile: "CLAUDE.md",
    instructionNative: false, // does NOT read AGENTS.md — needs @ import
    mcpFile: ".mcp.json",
    mcpKey: "mcpServers",
  },
  codex: {
    instructionFile: "AGENTS.md",
    instructionNative: true,
    mcpFile: ".codex/config.toml",
    mcpKey: "mcp_servers",
  },
} as const

export type HarnessName = keyof typeof HARNESS_CONVENTIONS

// ── Result types ─────────────────────────────────────────────────────────

export interface BootstrapFileResult {
  file: string
  created: boolean
  updated: boolean
  skipped?: boolean
  reason?: string
}

export interface BootstrapResult {
  workspaceRoot: string
  files: BootstrapFileResult[]
  ok: boolean
  error?: string
}

// ── Markdown section helper (idempotent) ─────────────────────────────────

/**
 * Ensure `ownedContent` (wrapped in AgenticOS markers) exists in `filePath`.
 * - If file does not exist: create with ownedContent.
 * - If file exists and contains markers: replace content between markers.
 * - If file exists and does not contain markers: append markers + ownedContent with a blank line separator.
 * Never removes user content outside markers.
 */
export function ensureMarkdownSection(
  filePath: string,
  ownedContent: string,
): BootstrapFileResult {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  try {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, ownedContent + "\n", "utf-8")
      return { file: fileName, created: true, updated: false }
    }

    const existing = readFileSync(filePath, "utf-8")

    if (existing.includes(MARKDOWN_START) && existing.includes(MARKDOWN_END)) {
      const startIdx = existing.indexOf(MARKDOWN_START)
      const endIdx = existing.indexOf(MARKDOWN_END) + MARKDOWN_END.length
      const before = existing.slice(0, startIdx)
      const after = existing.slice(endIdx)
      const normalizedOwned = ownedContent.includes(MARKDOWN_START)
        ? ownedContent
        : `${MARKDOWN_START}\n${ownedContent}\n${MARKDOWN_END}`
      const next = `${before}${normalizedOwned}${after}`
      if (next === existing) {
        return { file: fileName, created: false, updated: false }
      }
      writeFileSync(filePath, next, "utf-8")
      return { file: fileName, created: false, updated: true }
    }

    const separator = existing.endsWith("\n") ? "\n" : "\n\n"
    const next = `${existing}${separator}${ownedContent}\n`
    writeFileSync(filePath, next, "utf-8")
    return { file: fileName, created: false, updated: true }
  } catch (err) {
    return {
      file: fileName,
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Specialized helper for CLAUDE.md which must start with `@AGENTS.md` import.
 * Ensures the import line exists at top, then ensures the AgenticOS section.
 */
export function ensureClaudeMd(filePath: string): BootstrapFileResult {
  const AGENTS_IMPORT = "@AGENTS.md"
  const ownedSection = buildClaudeMdOwned()

  try {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true })
      const content = `${AGENTS_IMPORT}\n\n${ownedSection}\n`
      writeFileSync(filePath, content, "utf-8")
      return { file: "CLAUDE.md", created: true, updated: false }
    }

    let existing = readFileSync(filePath, "utf-8")
    let changed = false

    const trimmed = existing.trimStart()
    if (!trimmed.startsWith(AGENTS_IMPORT)) {
      existing = `${AGENTS_IMPORT}\n\n${existing}`
      changed = true
    }

    if (!existing.includes(MARKDOWN_START)) {
      const separator = existing.endsWith("\n") ? "\n" : "\n\n"
      existing = `${existing}${separator}${ownedSection}\n`
      changed = true
      writeFileSync(filePath, existing, "utf-8")
      return { file: "CLAUDE.md", created: false, updated: true }
    }

    if (existing.includes(MARKDOWN_START) && existing.includes(MARKDOWN_END)) {
      const startIdx = existing.indexOf(MARKDOWN_START)
      const endIdx = existing.indexOf(MARKDOWN_END) + MARKDOWN_END.length
      const before = existing.slice(0, startIdx)
      const after = existing.slice(endIdx)
      const next = `${before}${ownedSection}${after}`
      if (next !== existing || changed) {
        writeFileSync(filePath, next, "utf-8")
        return { file: "CLAUDE.md", created: false, updated: true }
      }
      if (changed) {
        writeFileSync(filePath, existing, "utf-8")
        return { file: "CLAUDE.md", created: false, updated: true }
      }
      return { file: "CLAUDE.md", created: false, updated: false }
    }

    if (changed) {
      writeFileSync(filePath, existing, "utf-8")
      return { file: "CLAUDE.md", created: false, updated: true }
    }
    return { file: "CLAUDE.md", created: false, updated: false }
  } catch (err) {
    return {
      file: "CLAUDE.md",
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── JSON merge helpers (opencode.json, .mcp.json) ────────────────────────

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, "utf-8").trim()
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

export function ensureOpencodeJson(
  workspaceRoot: string,
): BootstrapFileResult {
  const filePath = join(workspaceRoot, "opencode.json")
  try {
    const existing = readJsonIfExists(filePath)
    const created = existing === null
    const data: Record<string, unknown> = existing ?? {}

    const mcp = (data["mcp"] as Record<string, unknown> | undefined) ?? {}
    let needsUpdate = false
    for (const def of [BROWSER_MCP, DESIGN_MCP] as const) {
      const prev = mcp[def.name]
      const next = (def as typeof BROWSER_MCP).opencode
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
        mcp[def.name] = next as unknown as Record<string, unknown>
        needsUpdate = true
      }
    }
    if (needsUpdate) {
      data["mcp"] = mcp
      writeJson(filePath, data)
      return { file: "opencode.json", created, updated: !created }
    }

    if (created) {
      if (!existsSync(filePath)) {
        writeJson(filePath, data)
        return { file: "opencode.json", created: true, updated: false }
      }
    }

    return { file: "opencode.json", created: false, updated: false }
  } catch (err) {
    return {
      file: "opencode.json",
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

export function ensureMcpJson(
  workspaceRoot: string,
): BootstrapFileResult {
  const filePath = join(workspaceRoot, ".mcp.json")
  try {
    const existing = readJsonIfExists(filePath)
    const created = existing === null
    const data: Record<string, unknown> = existing ?? {}

    const servers =
      (data["mcpServers"] as Record<string, unknown> | undefined) ?? {}
    let needsUpdate = false
    for (const def of [BROWSER_MCP, DESIGN_MCP] as const) {
      const prev = servers[def.name]
      const next = (def as typeof BROWSER_MCP).claude
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
        servers[def.name] = next as unknown as Record<string, unknown>
        needsUpdate = true
      }
    }
    if (needsUpdate) {
      data["mcpServers"] = servers
      writeJson(filePath, data)
      return { file: ".mcp.json", created, updated: !created }
    }

    return { file: ".mcp.json", created: false, updated: false }
  } catch (err) {
    return {
      file: ".mcp.json",
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── TOML helper (.codex/config.toml) ─────────────────────────────────────

function ensureTomlMcpSection(
  workspaceRoot: string,
): BootstrapFileResult {
  const filePath = join(workspaceRoot, ".codex", "config.toml")
  const header = `[mcp_servers.${BROWSER_MCP.name}]`
  const browserBody = [
    `[mcp_servers.${BROWSER_MCP.name}]`,
    `command = "${BROWSER_MCP.codex.command}"`,
    `args = ["${BROWSER_MCP.codex.args.join('", "')}"]`,
  ].join("\n")
  const designBody = [
    `[mcp_servers.${DESIGN_MCP.name}]`,
    `command = "${DESIGN_MCP.codex.command}"`,
    `args = ["${DESIGN_MCP.codex.args.join('", "')}"]`,
  ].join("\n")
  const body = `${browserBody}\n\n${designBody}`

  const ownedBlock = `${TOML_START}\n${body}\n${TOML_END}`

  try {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, ownedBlock + "\n", "utf-8")
      return { file: ".codex/config.toml", created: true, updated: false }
    }

    const existing = readFileSync(filePath, "utf-8")

    if (existing.includes(TOML_START) && existing.includes(TOML_END)) {
      const startIdx = existing.indexOf(TOML_START)
      const endIdx = existing.indexOf(TOML_END) + TOML_END.length
      const before = existing.slice(0, startIdx)
      const after = existing.slice(endIdx)
      const next = `${before}${ownedBlock}${after}`
      if (next === existing) {
        return { file: ".codex/config.toml", created: false, updated: false }
      }
      writeFileSync(filePath, next, "utf-8")
      return { file: ".codex/config.toml", created: false, updated: true }
    }

    if (existing.includes(header)) {
      const headerIdx = existing.indexOf(header)
      const before = existing.slice(0, headerIdx)
      const afterSlice = existing.slice(headerIdx)
      const nextHeaderMatch = afterSlice.slice(body.length).search(/\n\[/)
      let after = ""
      if (nextHeaderMatch !== -1) {
        after = afterSlice.slice(nextHeaderMatch)
      }
      const next = `${before}${ownedBlock}${after}`
      if (next !== existing) {
        writeFileSync(filePath, next, "utf-8")
        return { file: ".codex/config.toml", created: false, updated: true }
      }
      return { file: ".codex/config.toml", created: false, updated: false }
    }

    const separator = existing.endsWith("\n") ? "\n" : "\n\n"
    const next = `${existing}${separator}${ownedBlock}\n`
    writeFileSync(filePath, next, "utf-8")
    return { file: ".codex/config.toml", created: false, updated: true }
  } catch (err) {
    return {
      file: ".codex/config.toml",
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Design MCP server stub (Phase 5) ─────────────────────────────────────

function ensureDesignMcpServer(workspaceRoot: string): BootstrapFileResult {
  const filePath = join(workspaceRoot, ".agentic", "mcp", "design-server.js")
  const stub = `#!/usr/bin/env node
// AgenticOS Design MCP (stdio) — Phase 5 stub. Harness registers this via bootstrap.
// Implements minimal MCP JSON-RPC: initialize, tools/list, tools/call (create/update artifact via design store file).
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const id = msg.id;
  const method = msg.method;
  const send = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
  const sendError = (code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\\n');
  if (method === 'initialize') { send({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'agentic-design', version: '0.1.0' } }); return; }
  if (method === 'tools/list') { send({ tools: [{ name: 'design_create_artifact', description: 'Create a design artifact', inputSchema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['name','code'] } },{ name: 'design_update_artifact', description: 'Update a design artifact', inputSchema: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' } }, required: ['id','code'] } }] }); return; }
  if (method === 'tools/call') { send({ content: [{ type: 'text', text: 'Design MCP acknowledged tools/call for ' + (msg.params && msg.params.name) }], isError: false }); return; }
  if (msg.method && msg.method.startsWith('notifications/')) return;
  sendError(-32601, 'Method not found: ' + method);
});
process.stdin.on('end', () => process.exit(0));
`
  try {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, stub, "utf-8")
      return { file: ".agentic/mcp/design-server.js", created: true, updated: false }
    }
    const existing = readFileSync(filePath, "utf-8")
    if (existing !== stub) {
      // Do not clobber user customizations beyond stub — only update if stub version drift detected via version marker
      if (!existing.includes("agentic-design")) {
        return { file: ".agentic/mcp/design-server.js", created: false, updated: false }
      }
      // keep existing if already our stub version
      return { file: ".agentic/mcp/design-server.js", created: false, updated: false }
    }
    return { file: ".agentic/mcp/design-server.js", created: false, updated: false }
  } catch (err) {
    return { file: ".agentic/mcp/design-server.js", created: false, updated: false, skipped: true, reason: err instanceof Error ? err.message : String(err) }
  }
}

// ── Skills directory ─────────────────────────────────────────────────────

function ensureSkillsDir(
  workspaceRoot: string,
): BootstrapFileResult {
  const dirPath = join(workspaceRoot, ".agentic", "skills")
  try {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
      const gitkeepPath = join(dirPath, ".gitkeep")
      writeFileSync(gitkeepPath, "", "utf-8")
      return { file: ".agentic/skills/", created: true, updated: false }
    }
    return { file: ".agentic/skills/", created: false, updated: false }
  } catch (err) {
    return {
      file: ".agentic/skills/",
      created: false,
      updated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Main entry ───────────────────────────────────────────────────────────

/**
 * Bootstrap a workspace for all harnesses. Idempotent, never clobbers user
 * content outside AgenticOS markers. Safe to call on every workspace open.
 *
 * @param workspaceRoot - absolute path to the workspace folder
 */
export function bootstrapWorkspace(
  workspaceRoot: string,
): BootstrapResult {
  if (!workspaceRoot || typeof workspaceRoot !== "string") {
    return {
      workspaceRoot: String(workspaceRoot),
      files: [],
      ok: false,
      error: "workspaceRoot must be a non-empty string",
    }
  }

  if (!existsSync(workspaceRoot)) {
    return {
      workspaceRoot,
      files: [],
      ok: false,
      error: `workspaceRoot does not exist: ${workspaceRoot}`,
    }
  }

  const files: BootstrapFileResult[] = []

  const agentsPath = join(workspaceRoot, "AGENTS.md")
  files.push(ensureMarkdownSection(agentsPath, AGENTS_MD_OWNED))
  files.push(ensureClaudeMd(join(workspaceRoot, "CLAUDE.md")))

  files.push(ensureOpencodeJson(workspaceRoot))
  files.push(ensureMcpJson(workspaceRoot))
  files.push(ensureTomlMcpSection(workspaceRoot))

  files.push(ensureSkillsDir(workspaceRoot))

  try {
    const mcpDir = join(workspaceRoot, ".agentic", "mcp")
    if (!existsSync(mcpDir)) {
      mkdirSync(mcpDir, { recursive: true })
    }
    files.push(ensureDesignMcpServer(workspaceRoot))
  } catch {
    // non-fatal
  }

  return { workspaceRoot, files, ok: true }
}

/**
 * List the files that bootstrapWorkspace manages (for testing/docs).
 */
export function getBootstrapTargets(workspaceRoot: string): string[] {
  return [
    join(workspaceRoot, "AGENTS.md"),
    join(workspaceRoot, "CLAUDE.md"),
    join(workspaceRoot, "opencode.json"),
    join(workspaceRoot, ".mcp.json"),
    join(workspaceRoot, ".codex", "config.toml"),
    join(workspaceRoot, ".agentic", "skills") + "/",
  ]
}
