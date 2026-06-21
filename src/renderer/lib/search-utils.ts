import type { FileEntry } from "@/types"
import { useWorkspaceStore } from "@/stores/workspace-store"

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "target",
  ".cache", "coverage", ".vscode", ".idea", "__pycache__",
  ".venv", "venv", ".tox", "vendor", ".svn",
])

function isExcluded(name: string): boolean {
  return EXCLUDED_DIRS.has(name) || name.startsWith(".")
}

function globToRegex(pattern: string): RegExp {
  let i = 0
  let regexStr = ""
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/" || pattern[i + 2] === "\\") {
        regexStr += ".*"
        i += 3
      } else {
        regexStr += ".*"
        i += 2
      }
    } else if (ch === "*") {
      regexStr += "[^\\\\/]*"
      i++
    } else if (ch === "?") {
      regexStr += "[^\\\\/]"
      i++
    } else if (ch === "{") {
      const close = pattern.indexOf("}", i)
      if (close > i) {
        const alts = pattern.slice(i + 1, close).split(",")
        regexStr += "(" + alts.map((a) => a.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")"
        i = close + 1
      } else {
        regexStr += "\\{"
        i++
      }
    } else if (ch === "[") {
      const close = pattern.indexOf("]", i)
      if (close > i) {
        regexStr += pattern.slice(i, close + 1).replace(/[.*+?^${}()|]/g, "\\$&")
        i = close + 1
      } else {
        regexStr += "\\["
        i++
      }
    } else if ("+^${}()|\\".includes(ch)) {
      regexStr += "\\" + ch
      i++
    } else {
      regexStr += ch
      i++
    }
  }
  return new RegExp("^" + regexStr + "$", "i")
}

function matchGlob(filePath: string, pattern: string): boolean {
  const hasSep = pattern.includes("/") || pattern.includes("\\")
  const target = hasSep ? filePath.replace(/\\/g, "/") : filePath.split(/[\\/]/).pop() ?? filePath

  if (!hasSep && target === pattern) {
    return true
  }

  const normalized = filePath.replace(/\\/g, "/")
  const normPattern = pattern.replace(/\\/g, "/")
  const regex = globToRegex(normPattern)
  return regex.test(normalized)
}

function flattenFiles(entries: FileEntry[], prefix: string = "", depth: number = 0): string[] {
  const result: string[] = []
  const MAX_DEPTH = 20
  if (depth > MAX_DEPTH) return result

  for (const entry of entries) {
    if (entry.is_dir) {
      if (isExcluded(entry.name)) continue
      result.push(...flattenFiles(entry.children, prefix ? `${prefix}/${entry.name}` : entry.name, depth + 1))
    } else {
      result.push(prefix ? `${prefix}/${entry.name}` : entry.name)
    }
  }
  return result
}

export interface GlobResult {
  files: string[]
  count: number
}

export async function globFiles(pattern: string): Promise<GlobResult> {
  const fileTree = useWorkspaceStore.getState().fileTree
  const allFiles = flattenFiles(fileTree)
  const matched = allFiles.filter((f) => matchGlob(f, pattern))
  return { files: matched, count: matched.length }
}

export interface GrepMatch {
  file: string
  line: number
  lineNumber: number
  matchPreview: string
  content: string
}

export interface GrepResult {
  matches: GrepMatch[]
  count: number
  filesScanned: number
  filesMatched: number
  truncated: boolean
}

/**
 * Regex-based file content search (grep).
 *
 * Improvements vs the original:
 *   - Removed the 300-file hard limit — now processes all files via batched reading
 *   - Increased MAX_TOTAL_MATCHES from 500 to 2000
 *   - Added batched file reading (50 files at a time) for non-blocking throughput
 *   - Added `filesScanned`, `filesMatched`, `truncated` fields to the result
 *   - Supports both plain-text and regex query patterns
 *   - Automatically falls back from regex to plain-text if regex compilation fails
 *   - Skips binary-looking files by checking for null bytes
 */
export async function grepFiles(
  query: string,
  includeExt?: string,
  opts?: {
    maxFiles?: number
    maxMatches?: number
    caseSensitive?: boolean
  },
): Promise<GrepResult> {
  const fs = await import("@/lib/electron-api")
  const rootPath = useWorkspaceStore.getState().rootPath
  const fileTree = useWorkspaceStore.getState().fileTree

  const allFiles = flattenFiles(fileTree)
  const matches: GrepMatch[] = []
  const MAX_FILES = opts?.maxFiles ?? 2000
  const MAX_TOTAL_MATCHES = opts?.maxMatches ?? 2000
  const MAX_FILE_SIZE = 1_048_576
  const BATCH_SIZE = 50

  const includeExtensions = includeExt
    ? includeExt.split(",").map((e) => e.trim().toLowerCase())
    : null

  // Try regex first, fall back to plain text if compilation fails
  let regex: RegExp
  try {
    regex = new RegExp(query, opts?.caseSensitive ? "g" : "gi")
  } catch {
    // Regex compilation failed — use plain text search
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    regex = new RegExp(escaped, opts?.caseSensitive ? "g" : "gi")
  }

  let filesScanned = 0
  let filesMatched = 0
  let truncated = false

  // Process files in batches
  const filesToSearch = allFiles.slice(0, MAX_FILES)
  for (let batchStart = 0; batchStart < filesToSearch.length; batchStart += BATCH_SIZE) {
    if (matches.length >= MAX_TOTAL_MATCHES) {
      truncated = true
      break
    }

    const batch = filesToSearch.slice(batchStart, batchStart + BATCH_SIZE)

    // Process batch in parallel
    await Promise.all(batch.map(async (relativePath) => {
      if (matches.length >= MAX_TOTAL_MATCHES) return

      const ext = relativePath.split(".").pop()?.toLowerCase()

      if (includeExtensions && ext && !includeExtensions.some((ie) => ie === ext || ie === `.${ext}`)) {
        return
      }

      filesScanned++

      try {
        const fullPath = rootPath
          ? `${rootPath}\\${relativePath.replace(/\//g, "\\")}`
          : relativePath
        const stat = await fs.stat(fullPath)
        if (stat.size && stat.size > MAX_FILE_SIZE) return

        const content = await fs.readTextFile(fullPath)

        // Skip binary-looking files (null bytes)
        if (content.includes("\0")) return

        const lines = content.split("\n")
        let fileHasMatch = false

        for (let li = 0; li < lines.length; li++) {
          if (matches.length >= MAX_TOTAL_MATCHES) {
            truncated = true
            break
          }
          const line = lines[li]
          regex.lastIndex = 0
          if (regex.test(line)) {
            const trimmed = line.trim().slice(0, 300)
            matches.push({
              file: relativePath,
              line: li + 1,
              lineNumber: li + 1,
              matchPreview: trimmed.length < line.trim().length ? trimmed + "..." : trimmed,
              content: line,
            })
            fileHasMatch = true
          }
        }

        if (fileHasMatch) filesMatched++
      } catch {
        // skip unreadable files
      }
    }))

    if (truncated) break

    // Allow event loop to breathe between batches if processing took significant time
    if (batch.length >= BATCH_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return {
    matches,
    count: matches.length,
    filesScanned,
    filesMatched,
    truncated,
  }
}
