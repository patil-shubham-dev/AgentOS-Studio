import type { MemoryFile } from "./memory-types"
import { isTauri, getRuntimeEnvironment } from "@/runtime/environment"
import { withTimeoutFallback } from "@/runtime/with-timeout"

const DEFAULT_MEMORY_FILES = [
  { path: "~/.agentic-os/CLAUDE.md", source: "global" as const, priority: 0 },
  { path: "CLAUDE.md", source: "project" as const, priority: 1 },
  { path: "CLAUDE.local.md", source: "local" as const, priority: 2 },
]

export interface MemoryLoadResult {
  files: MemoryFile[]
  combined: string
  rules: MemoryFile[]
}

const MEMORY_TIMEOUT_MS = 3_000

export class MemoryLoader {
  private cachedFiles: Map<string, string> = new Map()
  private cacheDurationMs = 30_000
  private lastLoadTime = 0

  async load(projectPath: string): Promise<MemoryLoadResult> {
    const env = getRuntimeEnvironment()
    if (env === "browser") {
      console.log("[MemoryLoader] Browser environment — no filesystem access, returning empty memory")
      return { files: [], combined: "", rules: [] }
    }

    const now = Date.now()
    if (now - this.lastLoadTime < this.cacheDurationMs && this.cachedFiles.size > 0) {
      return this.buildResult()
    }

    this.cachedFiles.clear()
    const loaded: MemoryFile[] = []

    for (const def of DEFAULT_MEMORY_FILES) {
      const resolvedPath = resolvePath(def.path, projectPath)
      const content = await withTimeoutFallback(
        this.readFile(resolvedPath),
        `read memory file: ${def.path}`,
        null,
        MEMORY_TIMEOUT_MS,
      )
      if (content) {
        loaded.push({ ...def, content })
      }
    }

    const rulesDir = `${projectPath}/.agentic-os/memory/rules`
    const rules = await withTimeoutFallback(
      this.loadRules(rulesDir),
      `load memory rules: ${rulesDir}`,
      [],
      MEMORY_TIMEOUT_MS,
    )
    loaded.push(...rules)

    this.cachedFiles = new Map(loaded.map((f) => [f.path, f.content]))
    this.lastLoadTime = now

    return this.buildResult()
  }

  private buildResult(): MemoryLoadResult {
    const files = Array.from(this.cachedFiles.entries()).map(([path, content]) => {
      const def = DEFAULT_MEMORY_FILES.find((d) => resolvePath(d.path, "") === path)
      return {
        path,
        content,
        source: (def?.source ?? "rules") as MemoryFile["source"],
        priority: def?.priority ?? 3,
      } as MemoryFile
    })
    const combined = files
      .sort((a, b) => a.priority - b.priority)
      .map((f) => f.content)
      .join("\n\n")
    const rules = files.filter((f) => f.source === "rules")
    return { files, combined, rules }
  }

  private async readFile(path: string): Promise<string | null> {
    try {
      if (isTauri()) {
        const { readTextFile } = await import("@tauri-apps/plugin-fs")
        return await readTextFile(path)
      }
      return null
    } catch {
      return null
    }
  }

  private async loadRules(rulesDir: string): Promise<MemoryFile[]> {
    try {
      if (isTauri()) {
        const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs")
        const entries = await readDir(rulesDir)
        const files: MemoryFile[] = []
        for (const entry of entries) {
          if (!entry.name || !entry.name.endsWith(".md")) continue
          const filePath = `${rulesDir}/${entry.name}`
          const content = await readTextFile(filePath).catch(() => "")
          if (!content) continue
          const pathPattern = this.extractPathPattern(content)
          files.push({
            path: filePath,
            source: "rules",
            content,
            priority: 3,
            pathPattern,
          })
        }
        return files
      }
      return []
    } catch {
      console.warn(`[MemoryLoader] Failed to load rules from ${rulesDir} — continuing without rules`)
      return []
    }
  }

  private extractPathPattern(content: string): string | undefined {
    const match = content.match(/^---\npath_pattern: (.+)\n---/)
    return match?.[1]
  }

  invalidateCache(): void {
    this.cachedFiles.clear()
    this.lastLoadTime = 0
  }

  getRelevantRules(filePath: string, rules: MemoryFile[]): string {
    return rules
      .filter((r) => r.pathPattern && filePath.match(new RegExp(r.pathPattern.replace(/\*/g, ".*"))))
      .map((r) => r.content)
      .join("\n\n")
  }
}

function resolvePath(path: string, projectPath: string): string {
  if (path.startsWith("~")) {
    return `${projectPath}/.agentic-os/global/CLAUDE.md`
  }
  if (path.startsWith("/")) return path
  return `${projectPath}/${path}`
}

export const memoryLoader = new MemoryLoader()
