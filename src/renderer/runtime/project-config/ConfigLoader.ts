/**
 * ConfigLoader
 *
 * Discovers and loads project configuration files (AGENTIC.md, AGENTIC.local.md)
 * following a scope hierarchy matching Claude Code's CLAUDE.md approach:
 *
 *   1. Managed Policy  — /etc/agentic-os/AGENTIC.md (global/org-wide)
 *   2. User            — ~/.agentic/AGENTIC.md (personal preferences)
 *   3. Project         — <root>/AGENTIC.md or <root>/.agentic/AGENTIC.md (team-shared, checked in)
 *   4. Local           — <root>/AGENTIC.local.md (personal, git-ignored)
 *   5. Path Rules      — <root>/.agentic/rules/*.md (path-scoped, loaded on-demand)
 *
 * Loaded files are concatenated in priority order (managed first, local last)
 * so more specific instructions override general ones.
 *
 * Integration:
 *   - memory-loader.ts → calls ConfigLoader.load() alongside existing memory loading
 *   - ContextManager → injects combined content into system prompt assembly
 *   - RuntimeOS → wires ConfigWatcher for hot-reload
 */

import { isTauri, getRuntimeEnvironment } from "@/runtime/environment"
import { withTimeoutFallback } from "@/runtime/with-timeout"

// ── Types ──

export interface ConfigFile {
  /** Human-friendly source label */
  source: "managed" | "user" | "project" | "local" | "path-rules"
  /** Absolute path to the file */
  path: string
  /** Raw text content */
  content: string
  /** Priority (lower = loaded first, overridden by higher) */
  priority: number
  /** Optional path pattern for path-scoped rules */
  pathPattern?: string
}

export interface ConfigLoadResult {
  /** All loaded config files in priority order */
  configs: ConfigFile[]
  /** Concatenated content of all files separated by double newlines */
  combined: string
  /** Hash of the combined content (for cache key invalidation) */
  hash: string
}

// ── Config file definitions ──

interface ConfigFileDef {
  source: ConfigFile["source"]
  /** Path resolution template. ${root} = project root, ~ = user home */
  pathTemplate: string
  priority: number
  optional: boolean
}

const CONFIG_FILE_DEFS: ConfigFileDef[] = [
  // Managed/org-wide policies (lowest priority — loaded first, overridden by later files)
  { source: "managed", pathTemplate: "${root}/.agentic-os/global/AGENTIC.md", priority: 0, optional: true },
  // User-level preferences
  { source: "user", pathTemplate: "${root}/.agentic-os/user/AGENTIC.md", priority: 1, optional: true },
  // Project-level (checked into git)
  { source: "project", pathTemplate: "${root}/AGENTIC.md", priority: 2, optional: true },
  { source: "project", pathTemplate: "${root}/.agentic/AGENTIC.md", priority: 2, optional: true },
  // Local (git-ignored personal overrides) — highest priority
  { source: "local", pathTemplate: "${root}/AGENTIC.local.md", priority: 3, optional: true },
  { source: "local", pathTemplate: "${root}/.agentic/AGENTIC.local.md", priority: 3, optional: true },
]

// ── Default AGENTIC.md template ──

export const DEFAULT_AGENTIC_TEMPLATE = `# AgenticOS Project Configuration

<!-- Auto-generated from project scan. Customize this file for your project. -->

## Build & Test
- Build: \`{{buildCommand}}\`
- Test: \`{{testCommand}}\`
- Lint: \`{{lintCommand}}\`

## Coding Standards
- Language: {{language}}
- Framework: {{framework}}
- Package Manager: {{packageManager}}

## Project Structure
{{projectStructure}}
`

// ── Path-scoped rules directory ──

const RULES_DIR = "${root}/.agentic/rules"

// ── Hash helper ──

function simpleHash(input: string): string {
  if (!input) return ""
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// ── ConfigLoader ──

export class ConfigLoader {
  private cached: ConfigLoadResult | null = null
  private cacheDurationMs = 30_000
  private lastLoadTime = 0
  private readTimeoutMs = 3_000

  /**
   * Load all AGENTIC.md files for the given project root.
   * Results are cached for cacheDurationMs to avoid repeated filesystem reads.
   */
  async load(rootPath: string): Promise<ConfigLoadResult> {
    const env = getRuntimeEnvironment()
    if (env === "browser") {
      return { configs: [], combined: "", hash: "" }
    }

    const now = Date.now()
    if (this.cached && now - this.lastLoadTime < this.cacheDurationMs) {
      return this.cached
    }

    const configs: ConfigFile[] = []

    // Load priority-based config files
    for (const def of CONFIG_FILE_DEFS) {
      const resolvedPath = this.resolvePath(def.pathTemplate, rootPath)
      const content = await withTimeoutFallback(
        this.readFile(resolvedPath),
        `read config: ${def.pathTemplate}`,
        def.optional ? null : "",
        this.readTimeoutMs,
      )
      if (content !== null && content !== undefined) {
        configs.push({
          source: def.source,
          path: resolvedPath,
          content,
          priority: def.priority,
        })
      }
    }

    // Sort by priority (ascending) so lower-priority files come first
    // Later files can override earlier ones
    configs.sort((a, b) => a.priority - b.priority)

    const combined = configs.map((c) => c.content).join("\n\n")
    const hash = simpleHash(combined)

    this.cached = { configs, combined, hash }
    this.lastLoadTime = now

    return this.cached
  }

  /**
   * Load path-scoped rules for a specific file path.
   * Only loads rules whose pathPattern matches the given filePath.
   */
  async loadPathScoped(rootPath: string, filePath: string): Promise<ConfigFile[]> {
    const env = getRuntimeEnvironment()
    if (env === "browser") return []

    const rulesDir = this.resolvePath(RULES_DIR, rootPath)
    const allRules = await this.loadRulesDir(rulesDir)
    const globToRegex = (pattern: string) =>
      new RegExp("^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$")

    return allRules.filter((rule) => {
      if (!rule.pathPattern) return false
      return globToRegex(rule.pathPattern).test(filePath)
    })
  }

  /**
   * Invalidate the cached result so the next load() call re-reads from disk.
   */
  invalidateCache(): void {
    this.cached = null
    this.lastLoadTime = 0
  }

  // ── Private helpers ──

  private resolvePath(template: string, rootPath: string): string {
    return template.replace("${root}", rootPath)
  }

  private async readFile(path: string): Promise<string | null> {
    try {
      if (isTauri()) {
        const { readTextFile } = await import("@/lib/electron-api")
        return await readTextFile(path)
      }
      return null
    } catch {
      return null
    }
  }

  private async loadRulesDir(rulesDir: string): Promise<ConfigFile[]> {
    try {
      if (isTauri()) {
        const { readDir, readTextFile } = await import("@/lib/electron-api")
        const entries = await readDir(rulesDir)
        const files: ConfigFile[] = []

        for (const entry of entries) {
          if (!entry.name || !entry.name.endsWith(".md")) continue
          const filePath = `${rulesDir}/${entry.name}`
          const content = await withTimeoutFallback(
            readTextFile(filePath),
            `read rule: ${filePath}`,
            null,
            this.readTimeoutMs,
          )
          if (!content) continue

          const pathPattern = this.extractPathPattern(content)
          files.push({
            source: "path-rules",
            path: filePath,
            content,
            priority: 4,
            pathPattern,
          })
        }

        return files
      }
      return []
    } catch {
      return []
    }
  }

  private extractPathPattern(content: string): string | undefined {
    const match = content.match(/^---\npaths:\s*\[([^\]]+)\]\n---/)
    if (match) {
      return match[1].split(",").map((s) => s.trim().replace(/"/g, "")).join("|")
    }
    const simpleMatch = content.match(/^---\npaths:\s*["']?([^"'\n]+)["']?\n---/)
    return simpleMatch?.[1]
  }

  /**
   * Get the combined config text for injection into system prompts.
   */
  getCombined(rootPath: string): string {
    if (!this.cached) return ""
    return this.cached.combined
  }

  /**
   * Get the hash of the combined config (for cache key composition).
   */
  getHash(rootPath: string): string {
    if (!this.cached) return ""
    return this.cached.hash
  }
}

/** Singleton instance */
export const configLoader = new ConfigLoader()
