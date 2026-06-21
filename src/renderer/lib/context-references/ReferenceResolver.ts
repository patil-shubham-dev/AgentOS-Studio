/**
 * ReferenceResolver — resolves @-symbol references to actual content.
 *
 * Each reference type has a dedicated resolver method that reads from
 * the filesystem, workspace index, or external web sources.
 */

import type { ContextReference } from "./ReferenceParser"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { workspaceIndex } from "@/lib/search-index"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import { readFile } from "@/lib/filesystem"

export interface ResolvedReference {
  reference: ContextReference
  content: string
  error?: string
  durationMs: number
}

const MAX_LINE_LENGTH = 5000
const MAX_FILE_SIZE = 100_000 // 100KB max for @file injection
const MAX_FOLDER_ENTRIES = 200
const MAX_CODE_SEARCH_RESULTS = 30
const MAX_WEB_CONTENT = 20_000 // 20KB max for @web injection

export class ReferenceResolver {
  private static instance: ReferenceResolver

  static getInstance(): ReferenceResolver {
    if (!ReferenceResolver.instance) {
      ReferenceResolver.instance = new ReferenceResolver()
    }
    return ReferenceResolver.instance
  }

  async resolve(ref: ContextReference): Promise<ResolvedReference> {
    const t0 = performance.now()

    try {
      switch (ref.type) {
        case "file":
          return await this.resolveFile(ref, t0)
        case "folder":
          return await this.resolveFolder(ref, t0)
        case "web":
          return await this.resolveWeb(ref, t0)
        case "code":
          return await this.resolveCode(ref, t0)
        case "lines":
          return await this.resolveLines(ref, t0)
        case "problems":
          return await this.resolveProblems(ref, t0)
        case "git":
          return await this.resolveGit(ref, t0)
        case "symbol":
          return await this.resolveSymbol(ref, t0)
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0)
      return {
        reference: ref,
        content: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      }
    }
  }

  /**
   * Resolve all references in parallel and return their content.
   */
  async resolveAll(references: ContextReference[]): Promise<ResolvedReference[]> {
    return Promise.all(references.map((ref) => this.resolve(ref)))
  }

  /**
   * Format resolved references as injectable context blocks.
   */
  formatForInjection(resolved: ResolvedReference[]): string {
    if (resolved.length === 0) return ""

    return resolved
      .map((r) => {
        if (r.error) {
          return `[${r.reference.type} "${r.reference.target}"] Error: ${r.error}`
        }
        if (!r.content) return ""

        const header = this.makeHeader(r)
        return `${header}\n\`\`\`\n${r.content}\n\`\`\``
      })
      .filter(Boolean)
      .join("\n\n")
  }

  private makeHeader(r: ResolvedReference): string {
    const type = r.reference.type
    const target = r.reference.target
    const qualifier = r.reference.qualifier

    switch (type) {
      case "file":
        return `📄 [File: ${target}]`
      case "folder":
        return `📁 [Folder: ${target}]`
      case "web":
        return `🌐 [Web: ${target}]`
      case "code":
        return `🔍 [Code search: "${target}"${qualifier ? ` in ${qualifier}` : ""}]`
      case "lines":
        return `📄 [Lines ${qualifier} in ${target}]`
      case "problems":
        return `⚠️ [Workspace problems]`
      case "git":
        return `🔀 [Git status]`
      case "symbol":
        return `🏷️ [Symbol: ${target}]`
    }
  }

  // ── Resolver implementations ──

  private async resolveFile(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) throw new Error("No workspace open")

    const fullPath = this.resolvePath(ref.target, rootPath)

    const content = await readFile(fullPath)
    if (content.length > MAX_FILE_SIZE) {
      return {
        reference: ref,
        content: content.slice(0, MAX_FILE_SIZE) + `\n\n[...truncated, file is ${content.length} bytes]`,
        durationMs: Math.round(performance.now() - t0),
      }
    }

    return {
      reference: ref,
      content,
      durationMs: Math.round(performance.now() - t0),
    }
  }

  private async resolveFolder(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) throw new Error("No workspace open")

    const dirPath = this.resolvePath(ref.target, rootPath)
    const fs = await import("@/lib/electron-api")

    let entries: { name: string; isDir: boolean }[]
    try {
      entries = await fs.listDirectory(dirPath)
    } catch {
      // Fall back to workspace index for virtual listing
      const files = workspaceIndex["files"] as Array<{ path: string; name: string }> | undefined
      if (!files) throw new Error(`Cannot list directory: ${ref.target}`)

      const prefix = ref.target.replace(/\\/g, "/")
      entries = files
        .filter((f) => f.path.startsWith(prefix))
        .slice(0, MAX_FOLDER_ENTRIES)
        .map((f) => ({
          name: f.path.slice(prefix.length).split("/")[0] || f.name,
          isDir: f.path.length > prefix.length + (f.path.slice(prefix.length).split("/")[0]?.length ?? 0),
        }))
        .filter((e, i, a) => a.findIndex((x) => x.name === e.name) === i)
    }

    const maxEntries = MAX_FOLDER_ENTRIES
    const truncated = entries.length > maxEntries
    const displayEntries = truncated ? entries.slice(0, maxEntries) : entries

    const listing = displayEntries
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      .map((e) => `${e.isDir ? "📁" : "📄"} ${e.name}`)
      .join("\n")

    const content = truncated
      ? `Directory: ${ref.target}\n\n${listing}\n\n... and ${entries.length - maxEntries} more entries`
      : `Directory: ${ref.target}\n\n${listing}`

    return {
      reference: ref,
      content,
      durationMs: Math.round(performance.now() - t0),
    }
  }

  private async resolveWeb(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const url = ref.target

    try {
      const fetch = await import("@/lib/electron-api")
      const response = await fetch.fetchUrl(url)
      const text = typeof response === "string" ? response : JSON.stringify(response)

      const maxLen = MAX_WEB_CONTENT
      const content = text.length > maxLen
        ? text.slice(0, maxLen) + `\n\n[...truncated, full content is ${text.length} chars]`
        : text

      return {
        reference: ref,
        content,
        durationMs: Math.round(performance.now() - t0),
      }
    } catch {
      // Fall back to node fetch
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "AgenticOS/1.0" },
          signal: AbortSignal.timeout(10_000),
        })
        const text = await response.text()
        const stripped = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_WEB_CONTENT)

        return {
          reference: ref,
          content: stripped,
          durationMs: Math.round(performance.now() - t0),
        }
      } catch (err) {
        throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  private async resolveCode(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const query = ref.target
    const scopePath = ref.qualifier

    // Search using workspace index
    const results = await workspaceIndex.search({
      query,
      mode: "content",
      caseSensitive: false,
      maxResults: MAX_CODE_SEARCH_RESULTS,
    })

    // Filter by scope if specified
    const filtered = scopePath
      ? results.filter((r) => r.filePath.startsWith(scopePath.replace(/\\/g, "/")))
      : results

    if (filtered.length === 0) {
      // Also try filename search
      const nameResults = await workspaceIndex.search({
        query,
        mode: "filename",
        caseSensitive: false,
        maxResults: 10,
      })
      if (nameResults.length > 0) {
        return {
          reference: ref,
          content: `No content matches for "${query}"${scopePath ? ` in ${scopePath}` : ""}.\n\nMatching files by name:\n${nameResults.map((r) => `  ${r.filePath}`).join("\n")}`,
          durationMs: Math.round(performance.now() - t0),
        }
      }
      throw new Error(`No matches found for "${query}"${scopePath ? ` in ${scopePath}` : ""}`)
    }

    const contentLines: string[] = [
      `Code search results for "${query}"${scopePath ? ` in ${scopePath}` : ""}:`,
      `${filtered.length} file(s) matched\n`,
    ]

    for (const result of filtered.slice(0, 10)) {
      contentLines.push(`\n── ${result.filePath} (${result.matchCount} matches) ──`)
      for (const match of result.matches.slice(0, 5)) {
        const lineNum = String(match.line).padStart(4, " ")
        contentLines.push(`  ${lineNum}: ${match.lineContent.replace(/\t/g, "  ").slice(0, MAX_LINE_LENGTH)}`)
      }
      if (result.matches.length > 5) {
        contentLines.push(`  ... and ${result.matches.length - 5} more matches`)
      }
    }

    if (filtered.length > 10) {
      contentLines.push(`\n... and ${filtered.length - 10} more files with matches`)
    }

    return {
      reference: ref,
      content: contentLines.join("\n"),
      durationMs: Math.round(performance.now() - t0),
    }
  }

  private async resolveLines(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) throw new Error("No workspace open")

    const [startStr, endStr] = (ref.qualifier ?? "0-0").split("-")
    const startLine = parseInt(startStr, 10)
    const endLine = parseInt(endStr, 10)

    if (isNaN(startLine) || isNaN(endLine)) throw new Error("Invalid line range")

    const fullPath = this.resolvePath(ref.target, rootPath)
    const content = await readFile(fullPath)
    const lines = content.split("\n")

    const selectedLines = lines.slice(startLine - 1, endLine)
    const lang = ref.target.split(".").pop() ?? ""

    const result = selectedLines
      .map((line, i) => `  ${String(startLine + i).padStart(4, " ")} | ${line}`)
      .join("\n")

    const header = `Lines ${startLine}-${Math.min(endLine, lines.length)} of ${ref.target}`
    const truncated = endLine > lines.length ? `\n\n[Note: file has only ${lines.length} lines]` : ""

    return {
      reference: ref,
      content: `${header}\n${result}${truncated}`,
      durationMs: Math.round(performance.now() - t0),
    }
  }

  private async resolveProblems(_ref: ContextReference, t0: number): Promise<ResolvedReference> {
    // Read diagnostics from workspace store
    const diagnostics = useWorkspaceStore.getState().problems ?? []
    const activeFile = useWorkspaceStore.getState().activeFilePath

    const contentLines: string[] = ["Workspace Problems / Diagnostics:\n"]

    if (diagnostics.length === 0) {
      contentLines.push("No problems detected.")
    } else {
      const errors = diagnostics.filter((d: any) => d.severity === "error")
      const warnings = diagnostics.filter((d: any) => d.severity === "warning")
      const info = diagnostics.filter((d: any) => d.severity === "info" || !d.severity)

      if (errors.length > 0) {
        contentLines.push(`\n🔴 Errors (${errors.length}):`)
        for (const e of errors.slice(0, 20)) {
          contentLines.push(`  ${e.file ?? activeFile ?? "?"}:${e.line ?? "?"}  ${e.message}`)
        }
      }
      if (warnings.length > 0) {
        contentLines.push(`\n🟡 Warnings (${warnings.length}):`)
        for (const w of warnings.slice(0, 20)) {
          contentLines.push(`  ${w.file ?? activeFile ?? "?"}:${w.line ?? "?"}  ${w.message}`)
        }
      }
      if (info.length > 0) {
        contentLines.push(`\nℹ️ Info (${info.length}):`)
        for (const i of info.slice(0, 10)) {
          contentLines.push(`  ${i.file ?? activeFile ?? "?"}:${i.line ?? "?"}  ${i.message}`)
        }
      }
    }

    return {
      reference: _ref,
      content: contentLines.join("\n"),
      durationMs: Math.round(performance.now() - t0),
    }
  }

  private async resolveGit(_ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) throw new Error("No workspace open")

    try {
      const fs = await import("@/lib/electron-api")
      const status = await fs.invoke("git_status", { path: rootPath })
      const branch = await fs.invoke("git_branch", { path: rootPath }).catch(() => "unknown")

      const contentLines: string[] = [
        `Git Status (branch: ${branch}):\n`,
      ]

      if (!status || (Array.isArray(status) && status.length === 0)) {
        contentLines.push("Working tree clean.")
      } else {
        const staged: string[] = []
        const unstaged: string[] = []
        const untracked: string[] = []

        if (Array.isArray(status)) {
          for (const s of status) {
            if (s.startsWith("??")) untracked.push(s.slice(2).trim())
            else if (s[0] !== " ") staged.push(s)
            else unstaged.push(s)
          }
        }

        if (staged.length > 0) {
          contentLines.push(`\n✅ Staged (${staged.length}):`)
          staged.slice(0, 20).forEach((s) => contentLines.push(`  ${s}`))
        }
        if (unstaged.length > 0) {
          contentLines.push(`\n📝 Unstaged (${unstaged.length}):`)
          unstaged.slice(0, 20).forEach((s) => contentLines.push(`  ${s}`))
        }
        if (untracked.length > 0) {
          contentLines.push(`\n❓ Untracked (${untracked.length}):`)
          untracked.slice(0, 20).forEach((s) => contentLines.push(`  ${s}`))
        }
      }

      return {
        reference: _ref,
        content: contentLines.join("\n"),
        durationMs: Math.round(performance.now() - t0),
      }
    } catch (err) {
      throw new Error(`Failed to get git status: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async resolveSymbol(ref: ContextReference, t0: number): Promise<ResolvedReference> {
    const name = ref.target

    // Search symbol index
    const symbols = workspaceSymbolIndex.findSymbol(name)
    if (symbols.length === 0) {
      // Try fuzzy search
      const fuzzy = workspaceSymbolIndex.fuzzySearchSymbols(name)
      if (fuzzy.length > 0) {
        const suggestions = fuzzy
          .slice(0, 10)
          .map((s) => `  ${s.kind} ${s.name} (${s.file}:${s.line})`)
          .join("\n")
        return {
          reference: ref,
          content: `No exact match for "${name}".\n\nSimilar symbols:\n${suggestions}`,
          durationMs: Math.round(performance.now() - t0),
        }
      }
      throw new Error(`Symbol "${name}" not found`)
    }

    const contentLines: string[] = []
    for (const sym of symbols.slice(0, 5)) {
      contentLines.push(`\n── ${sym.kind.toUpperCase()} ${sym.name} ──`)
      contentLines.push(`  File: ${sym.file}:${sym.line}`)
      contentLines.push(`  Export: ${sym.export ? "yes" : "no"}`)
      contentLines.push(`  Default: ${sym.default ? "yes" : "no"}`)
      if (sym.parent) contentLines.push(`  Parent: ${sym.parent}`)

      // Try to read the actual code around this symbol
      try {
        const rootPath = useWorkspaceStore.getState().rootPath
        if (rootPath) {
          const fullPath = this.resolvePath(sym.file, rootPath)
          const content = await readFile(fullPath)
          const lines = content.split("\n")
          const start = Math.max(0, sym.line - 2)
          const end = Math.min(lines.length, sym.line + 20)
          const snippet = lines
            .slice(start, end)
            .map((line, i) => `  ${String(start + i + 1).padStart(4, " ")} | ${line}`)
            .join("\n")
          contentLines.push(`  Snippet:`)
          contentLines.push(snippet)
        }
      } catch {
        // Can't read file
      }
    }

    return {
      reference: ref,
      content: contentLines.join("\n"),
      durationMs: Math.round(performance.now() - t0),
    }
  }

  /**
   * Resolve a relative path against the workspace root.
   * Accepts both relative paths and absolute paths within the workspace.
   */
  private resolvePath(target: string, rootPath: string): string {
    const normalized = target.replace(/\\/g, "/")
    const root = rootPath.replace(/\\/g, "/")

    if (normalized.startsWith("/")) {
      return normalized.slice(1) // Treat as relative to root
    }

    if (normalized.startsWith(root)) {
      return normalized
    }

    return `${root}/${normalized}`
  }
}

/** Convenience export */
export const referenceResolver = ReferenceResolver.getInstance()
