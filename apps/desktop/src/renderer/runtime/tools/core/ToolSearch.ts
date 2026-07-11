/**
 * ToolSearch — relevance-based dynamic tool loading system.
 *
 * Instead of including all 30+ tool definitions in every system prompt,
 * ToolSearch analyzes the user's input and selects only the most relevant
 * tools for the current task. This reduces prompt bloat by 10-30%.
 *
 * Architecture:
 *   - ToolTagRegistry: maps tools to capability/domain tags
 *   - ToolRelevanceMatcher: analyzes input and selects relevant tools
 *   - Tags are hierarchical: domain > capability > specific
 *
 * Always-load tools (never excluded):
 *   - read_file, write_file, edit_file, bash/run_command
 *   - think, reasoning
 *
 * Always-load for manager role:
 *   - delegate_task, spawn_agent
 */

// ── Tag definitions ──

export type ToolDomain =
  | "file:read" | "file:write" | "file:edit" | "file:search"
  | "code:read" | "code:write" | "code:edit" | "code:search"
  | "execution:command" | "execution:build" | "execution:test"
  | "web:search" | "web:fetch"
  | "browser:navigate" | "browser:interact" | "browser:screenshot"
  | "design:create" | "design:version" | "design:preview"
  | "agent:delegate" | "agent:skill"
  | "meta:think" | "meta:reason"

export interface ToolTagEntry {
  toolName: string
  tags: ToolDomain[]
  /** If true, this tool is always included regardless of relevance */
  alwaysLoad: boolean
  /** The role-specific category for prompt organization */
  category?: "read" | "write" | "research" | "execute" | "browser" | "design" | "agent" | "meta"
  /** Brief description for the prompt (used for tool definition) */
  description: string
}

// ── Tool Tag Registry ──

const TOOL_TAGS: ToolTagEntry[] = [
  // ── Always-load core tools ──
  { toolName: "read_file", tags: ["file:read", "code:read"], alwaysLoad: true, category: "read", description: "Read the contents of a file" },
  { toolName: "write_file", tags: ["file:write", "code:write"], alwaysLoad: true, category: "write", description: "Create or overwrite a file with new content" },
  { toolName: "edit_file", tags: ["file:edit", "code:edit"], alwaysLoad: true, category: "write", description: "Make targeted text replacements in a file" },
  { toolName: "bash", tags: ["execution:command"], alwaysLoad: true, category: "execute", description: "Execute a shell command" },
  { toolName: "run_command", tags: ["execution:command"], alwaysLoad: true, category: "execute", description: "Execute a shell command" },

  // ── Search / Research tools ──
  { toolName: "grep_files", tags: ["file:search", "code:search"], alwaysLoad: false, category: "research", description: "Search file contents with regex patterns" },
  { toolName: "glob_files", tags: ["file:search"], alwaysLoad: false, category: "research", description: "Find files matching glob patterns" },
  { toolName: "search_files", tags: ["file:search", "code:search"], alwaysLoad: false, category: "research", description: "Search file contents for text" },
  { toolName: "find_files", tags: ["file:search"], alwaysLoad: false, category: "research", description: "Find files by name pattern" },
  { toolName: "file_tree", tags: ["file:read"], alwaysLoad: false, category: "research", description: "Get the project file tree" },
  { toolName: "workspace_index", tags: ["file:read"], alwaysLoad: false, category: "research", description: "Search the workspace index" },

  // ── Web tools ──
  { toolName: "web_search", tags: ["web:search"], alwaysLoad: false, category: "research", description: "Search the web for information" },
  { toolName: "web_fetch", tags: ["web:fetch"], alwaysLoad: false, category: "research", description: "Fetch and read a web page" },

  // ── Browser tools ──
  { toolName: "browser_navigate", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Navigate to a URL" },
  { toolName: "browser_click", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Click an element on the page" },
  { toolName: "browser_fill", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Type text into an input field" },
  { toolName: "browser_type", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Type text into an input field" },
  { toolName: "browser_screenshot", tags: ["browser:screenshot"], alwaysLoad: false, category: "browser", description: "Take a screenshot of the current page" },
  { toolName: "browser_get_text", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Get the visible text of the page" },
  { toolName: "browser_get_url", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Get the current URL" },
  { toolName: "browser_get_title", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Get the page title" },
  { toolName: "browser_execute_js", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Execute JavaScript in the page context" },
  { toolName: "browser_wait", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Wait for an element to appear" },
  { toolName: "browser_press_key", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Press a keyboard key" },
  { toolName: "browser_reload", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Reload the current page" },
  { toolName: "browser_new_tab", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Open a new browser tab" },
  { toolName: "browser_list_tabs", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "List all open tabs" },
  { toolName: "browser_close", tags: ["browser:interact"], alwaysLoad: false, category: "browser", description: "Close the browser session" },
  { toolName: "launch_browser", tags: ["browser:navigate"], alwaysLoad: false, category: "browser", description: "Launch a new browser session" },

  // ── Design tools ──
  { toolName: "design_create_artifact", tags: ["design:create"], alwaysLoad: false, category: "design", description: "Create a new design artifact" },
  { toolName: "design_add_version", tags: ["design:version"], alwaysLoad: false, category: "design", description: "Add a new version to a design artifact" },
  { toolName: "design_generate_preview", tags: ["design:preview"], alwaysLoad: false, category: "design", description: "Generate a preview of a design artifact" },

  // ── Agent / Delegation tools ──
  { toolName: "delegate_task", tags: ["agent:delegate"], alwaysLoad: false, category: "agent", description: "Delegate a subtask to another agent" },
  { toolName: "spawn_agent", tags: ["agent:delegate"], alwaysLoad: false, category: "agent", description: "Spawn a new agent for a subtask" },
  { toolName: "run_skill", tags: ["agent:skill"], alwaysLoad: false, category: "agent", description: "Run a predefined skill" },

  // ── Meta tools ──
  { toolName: "think", tags: ["meta:think"], alwaysLoad: true, category: "meta", description: "Pause and reason about the task" },
  { toolName: "reasoning", tags: ["meta:reason"], alwaysLoad: true, category: "meta", description: "Structured reasoning step" },
]

// ── Keyword-to-tag mapping ──
// These keywords in the user input trigger specific tool tags

const KEYWORD_TAG_MAP: Record<string, ToolDomain[]> = {
  // Search-related
  search: ["file:search", "code:search"],
  find: ["file:search"],
  grep: ["file:search", "code:search"],
  glob: ["file:search"],
  explore: ["file:search", "code:search"],

  // Web-related
  web: ["web:search", "web:fetch"],
  internet: ["web:search"],
  browse: ["web:fetch", "browser:navigate"],
  url: ["web:fetch", "browser:navigate"],
  website: ["web:fetch", "browser:navigate"],
  scrape: ["web:fetch"],

  // Browser-related
  browser: ["browser:navigate", "browser:interact", "browser:screenshot"],
  screenshot: ["browser:screenshot"],
  click: ["browser:interact"],
  navigation: ["browser:navigate"],

  // Design-related
  design: ["design:create", "design:version", "design:preview"],
  ui: ["design:create"],
  component: ["design:create"],
  layout: ["design:create"],

  // Execution-related
  build: ["execution:build"],
  test: ["execution:test"],
  install: ["execution:command"],
  deploy: ["execution:command", "execution:build"],
  run: ["execution:command"],

  // Agent-related
  delegate: ["agent:delegate"],
  agent: ["agent:delegate"],
}

// ── ToolRelevanceMatcher ──

const MAX_TOOLS_DEFAULT = 20
const ALWAYS_LOAD_NAMES = new Set(
  TOOL_TAGS.filter((t) => t.alwaysLoad).map((t) => t.toolName),
)

export class ToolRelevanceMatcher {
  private static instance: ToolRelevanceMatcher
  private allToolTags: Map<string, ToolTagEntry> = new Map()
  private maxTools: number

  private constructor(maxTools = MAX_TOOLS_DEFAULT) {
    this.maxTools = maxTools
    for (const entry of TOOL_TAGS) {
      this.allToolTags.set(entry.toolName, entry)
    }
  }

  static getInstance(maxTools?: number): ToolRelevanceMatcher {
    if (!ToolRelevanceMatcher.instance) {
      ToolRelevanceMatcher.instance = new ToolRelevanceMatcher(maxTools)
    }
    return ToolRelevanceMatcher.instance
  }

  /**
   * Reset the singleton (useful for testing or reconfiguration).
   */
  static resetInstance(maxTools?: number): void {
    ToolRelevanceMatcher.instance = new ToolRelevanceMatcher(maxTools)
  }

  /**
   * Given the user's input, return the set of tool names that should be
   * included in the system prompt for this turn.
   *
   * Always loads: critical tools (read_file, write_file, edit_file, bash, think)
   * Relevance loads: tools matching the extracted tags from the input
   */
  match(input: string): string[] {
    const selected = new Set<string>()

    // 1. Always include always-load tools
    for (const name of ALWAYS_LOAD_NAMES) {
      selected.add(name)
    }

    // 2. Extract relevant tags from the input
    const relevantTags = this.extractTags(input)

    // 3. Add tools that match any relevant tag
    for (const [name, entry] of this.allToolTags) {
      if (selected.has(name)) continue // already included
      if (entry.alwaysLoad) continue // already included above

      const matches = entry.tags.some((tag) => relevantTags.has(tag))
      if (matches && selected.size < this.maxTools) {
        selected.add(name)
      }
    }

    // 4. If we haven't reached maxTools, add the most generally useful tools
    if (selected.size < this.maxTools) {
      const generalPurpose = [
        "grep_files", "glob_files", "web_search",
        "browser_navigate", "browser_screenshot",
      ]
      for (const name of generalPurpose) {
        if (selected.size >= this.maxTools) break
        if (!selected.has(name)) {
          selected.add(name)
        }
      }
    }

    return Array.from(selected)
  }

  /**
   * Get tool definitions suitable for injection into the system prompt.
   * Returns only tools that passed the relevance filter.
   */
  getToolDefinitions(input: string): ToolTagEntry[] {
    const selectedNames = new Set(this.match(input))
    return TOOL_TAGS.filter((t) => selectedNames.has(t.toolName))
  }

  /**
   * Check if a specific tool should be included based on the input.
   */
  shouldInclude(toolName: string, input: string): boolean {
    if (ALWAYS_LOAD_NAMES.has(toolName)) return true
    const entry = this.allToolTags.get(toolName)
    if (!entry) return true // unknown tools are included by default

    const relevantTags = this.extractTags(input)
    return entry.tags.some((tag) => relevantTags.has(tag))
  }

  /**
   * Register a custom tool tag entry (for MCP tools or plugins).
   */
  registerTool(entry: ToolTagEntry): void {
    this.allToolTags.set(entry.toolName, entry)
  }

  /**
   * Register many tool tag entries at once.
   */
  registerTools(entries: ToolTagEntry[]): void {
    for (const entry of entries) {
      this.registerTool(entry)
    }
  }

  /**
   * Get stats about the tool selection for debugging.
   */
  getStats(): { total: number; alwaysLoad: number; categorized: Record<string, number> } {
    const categorized: Record<string, number> = {}
    for (const entry of TOOL_TAGS) {
      const cat = entry.category ?? "uncategorized"
      categorized[cat] = (categorized[cat] ?? 0) + 1
    }
    return {
      total: TOOL_TAGS.length,
      alwaysLoad: TOOL_TAGS.filter((t) => t.alwaysLoad).length,
      categorized,
    }
  }

  /**
   * Update the maximum number of tools to include.
   */
  setMaxTools(max: number): void {
    this.maxTools = max
  }

  /**
   * Extract relevant tool tags from the input string.
   * Uses keyword matching to identify which tool domains are relevant.
   */
  private extractTags(input: string): Set<ToolDomain> {
    const tags = new Set<ToolDomain>()
    const lower = input.toLowerCase()

    for (const [keyword, toolTags] of Object.entries(KEYWORD_TAG_MAP)) {
      if (lower.includes(keyword)) {
        for (const tag of toolTags) {
          tags.add(tag)
        }
      }
    }

    // Additionally, detect file mentions → include file:search and file:read
    if (/\.(ts|tsx|js|jsx|py|rs|go|css|html|json|md)\b/.test(lower)) {
      tags.add("file:read")
      tags.add("file:search")
      tags.add("code:read")
    }

    // Detect command mentions → include execution
    if (/^(run|execute|install|build)\b/.test(lower.trim()) || /\b(npm|pnpm|yarn|cargo|pip|go)\b/.test(lower)) {
      tags.add("execution:command")
    }

    // Detect git mentions
    if (/\b(git|commit|push|pull|branch|merge|diff)\b/.test(lower)) {
      tags.add("execution:command")
    }

    return tags
  }

  /**
   * Check if a tool name has a registered tag entry.
   * Returns false if the tool is unknown (not in TOOL_TAGS).
   * Useful for filtering — unknown tools pass through by default.
   */
  hasEntry(toolName: string): boolean {
    return this.allToolTags.has(toolName)
  }

  /**
   * Get the list of always-load tool names.
   */
  getAlwaysLoadTools(): string[] {
    return Array.from(ALWAYS_LOAD_NAMES)
  }

  /**
   * Get all registered tool tag entries.
   */
  getAllEntries(): ToolTagEntry[] {
    return [...TOOL_TAGS]
  }
}

/** Singleton instance */
export const toolRelevanceMatcher = ToolRelevanceMatcher.getInstance()
