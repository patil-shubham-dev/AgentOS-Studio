import { readFile as readFsFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { ContextManager } from "./ContextManager"
import { TokenEstimator } from "./TokenEstimator"
import type { ContextAssemblyInput, ScoredFile } from "./context-types"
import { useContextPackSlot } from "@/stores/context-pack-slot"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useDiagnosticsStore } from "@/stores/diagnostics-store"
import { gitDiff } from "@/lib/git"
import { extractOutline, buildContextSummary, formatContextSummary } from "@/core/context/AstOutlineExtractor"
import type { AstOutline, ContextSummary } from "@/core/context/AstOutlineExtractor"
import type { OpenFile } from "@/types"

export type ContextSourceType =
  | "explicit_file"
  | "open_file"
  | "pinned_file"
  | "recent_file"
  | "search_result"
  | "diagnostics"
  | "git_diff"
  | "workspace_summary"
  | "memory"
  | "execution_scratchpad"
  | "system_prompt"

export interface ContextSource {
  type: ContextSourceType
  path?: string
  content: string
  tokenCount: number
  relevance: number
  reason: string
}

export interface ContextPack {
  sources: ContextSource[]
  systemPrompt: string
  totalTokens: number
  tokenBudget: number
  remainingTokens: number
  createdAt: number
}

export interface ContextPackRequest {
  role: string
  userMessage: string
  activeFilePath?: string
  openFiles?: ContextAssemblyInput["openFiles"]
  relevantFiles?: ScoredFile[]
  pinnedFiles?: string[]
  customInstructions?: string
  memorySummary?: string
  environmentInfo?: Record<string, string>
  executionMode?: string
  selectedText?: string
  cursorLine?: number
  cursorColumn?: number
  /** If provided, only these source types are included in the pack. Empty = allow all. */
  allowedSourceTypes?: ContextSourceType[]
}

const MAX_FILE_CONTENT_TOKENS = 8_000
const MAX_DIFF_TOKENS = 4_000
const MAX_DIAGNOSTICS_TOKENS = 2_000

async function readFileContent(filePath: string, root: string): Promise<string | null> {
  try {
    const fullPath = filePath.startsWith("/") || filePath.match(/^[a-zA-Z]:/) ? filePath : join(root, filePath)
    if (!existsSync(fullPath)) return null
    const content = await readFsFile(fullPath, "utf-8")
    return content
  } catch {
    return null
  }
}

export class ContextPackBuilder {
  async build(request: ContextPackRequest): Promise<ContextPack> {
    const assemblyInput: ContextAssemblyInput = {
      role: request.role,
      userMessage: request.userMessage,
      activeFilePath: request.activeFilePath,
      openFiles: request.openFiles,
      relevantFiles: request.relevantFiles,
      customInstructions: request.customInstructions,
      memorySummary: request.memorySummary,
      environmentInfo: request.environmentInfo,
      executionMode: request.executionMode,
    }

    const result = await ContextManager.getInstance().assembleSystemPrompt(assemblyInput)
    if (!result) {
      return this.emptyPack()
    }

    const tokenBudget = result.contextWindowSize
    const sources: ContextSource[] = []
    let totalTokens = 0

    const allowed = request.allowedSourceTypes
    const pushSource = (type: ContextSourceType, content: string, path?: string, relevance = 0.5, reason = "") => {
      if (allowed && allowed.length > 0 && !allowed.includes(type)) return
      const tokenCount = TokenEstimator.rough(content)
      sources.push({ type, path, content, tokenCount, relevance, reason })
      totalTokens += tokenCount
    }

    for (const block of result.staticBlocks) {
      if (block.content) {
        pushSource("system_prompt", block.content, undefined, 1.0, `Static block: ${block.name}`)
      }
    }

    for (const block of result.dynamicBlocks) {
      if (block.content) {
        pushSource("system_prompt", block.content, undefined, 0.8, `Dynamic block: ${block.name}`)
      }
    }

    const rootPath = useWorkspaceStore.getState().rootPath

    const fileQueue: Array<{ type: ContextSourceType; path: string; relevance: number; reason: string; maxTokens: number }> = []

    if (request.activeFilePath) {
      fileQueue.push({ type: "explicit_file", path: request.activeFilePath, relevance: 1.0, reason: "Active file", maxTokens: MAX_FILE_CONTENT_TOKENS })
    }

    if (request.relevantFiles && request.relevantFiles.length > 0) {
      for (const file of request.relevantFiles) {
        if (file.path !== request.activeFilePath) {
          fileQueue.push({ type: "explicit_file", path: file.path, relevance: file.relevance, reason: file.reason, maxTokens: MAX_FILE_CONTENT_TOKENS })
        }
      }
    }

    if (request.openFiles && request.openFiles.length > 0) {
      for (const ofile of request.openFiles) {
        if (!fileQueue.some((f) => f.path === ofile.path)) {
          fileQueue.push({ type: "open_file", path: ofile.path, relevance: 0.7, reason: `Open file: ${ofile.name}`, maxTokens: MAX_FILE_CONTENT_TOKENS })
        }
      }
    }

    if (request.pinnedFiles && request.pinnedFiles.length > 0) {
      for (const pinnedPath of request.pinnedFiles) {
        if (!fileQueue.some((f) => f.path === pinnedPath)) {
          fileQueue.push({ type: "pinned_file", path: pinnedPath, relevance: 0.6, reason: "Pinned file", maxTokens: MAX_FILE_CONTENT_TOKENS })
        }
      }
    }

    fileQueue.sort((a, b) => b.relevance - a.relevance)

    const remainingBudget = () => tokenBudget - totalTokens

    for (const entry of fileQueue) {
      if (remainingBudget() <= 0) break
      const inMemory = this.findDirtyBuffer(entry.path)
      const isDirty = inMemory !== null
      const content = isDirty ? inMemory : (rootPath ? await readFileContent(entry.path, rootPath) : null)
      if (content === null) continue
      const truncated = TokenEstimator.rough(content) > entry.maxTokens
        ? content.slice(0, entry.maxTokens * 4)
        : content
      const sourceType = isDirty ? "open_file" : entry.type
      const sourceReason = isDirty ? `${entry.reason} (unsaved changes)` : entry.reason
      pushSource(sourceType, truncated, entry.path, entry.relevance, sourceReason)
    }

    const astSummaries: ContextSummary[] = []
    for (const entry of fileQueue) {
      if (remainingBudget() <= 0) break
      if (entry.relevance > 0.8) continue
      const inMemory = this.findDirtyBuffer(entry.path)
      if (inMemory) continue
      const filePath = rootPath ? (entry.path.startsWith("/") || entry.path.match(/^[a-zA-Z]:/) ? entry.path : join(rootPath, entry.path)) : null
      if (!filePath || !existsSync(filePath)) continue
      try {
        const content = await readFsFile(filePath, "utf-8")
        if (!content) continue
        const outline: AstOutline = extractOutline(content, entry.path)
        if (outline.entries.length > 0) {
          const summary = buildContextSummary(outline, 15)
          astSummaries.push(summary)
        }
      } catch {
        // best-effort AST enrichment
      }
    }
    if (astSummaries.length > 0 && remainingBudget() > 0) {
      const summaryText = formatContextSummary(astSummaries)
      if (summaryText && TokenEstimator.rough(summaryText) < remainingBudget()) {
        pushSource("workspace_summary", summaryText, undefined, 0.5, `AST summaries for ${astSummaries.length} file(s)`)
      }
    }

    const diagnostics = useDiagnosticsStore.getState().diagnostics
    if (diagnostics.length > 0 && remainingBudget() > 0) {
      const lines: string[] = diagnostics.slice(0, 50).map((d) =>
        `[${d.severity}] ${d.filePath}:${d.line}:${d.column} - ${d.message}${d.code ? ` (${d.code})` : ""}`
      )
      const diagText = `## Diagnostics (${diagnostics.length} total)\n\n${lines.join("\n")}`
      if (TokenEstimator.rough(diagText) < MAX_DIAGNOSTICS_TOKENS) {
        pushSource("diagnostics", diagText, undefined, 0.5, `${diagnostics.length} diagnostic(s)`)
      }
    }

    if (rootPath && remainingBudget() > 0) {
      try {
        const diff = await gitDiff(rootPath, "")
        if (diff && diff.trim().length > 0) {
          const truncated = TokenEstimator.rough(diff) > MAX_DIFF_TOKENS
            ? diff.slice(0, MAX_DIFF_TOKENS * 4) + "\n[truncated]"
            : diff
          pushSource("git_diff", truncated, undefined, 0.6, "Working tree changes")
        }
      } catch {
        // git diff is best-effort
      }
    }

    if (request.memorySummary) {
      pushSource("memory", request.memorySummary, undefined, 0.5, "Memory summary")
    }

    if (request.selectedText && request.selectedText.length > 0 && remainingBudget() > 0) {
      const selectionInfo = request.activeFilePath
        ? `Selected text in ${request.activeFilePath}${request.cursorLine ? ` at line ${request.cursorLine}` : ""}:\n`
        : "Selected text:\n"
      const selectionContent = selectionInfo + request.selectedText
      pushSource("explicit_file", selectionContent, request.activeFilePath, 0.9, "Active selection")
    }

    const pack: ContextPack = {
      sources,
      systemPrompt: result.systemPrompt,
      totalTokens,
      tokenBudget,
      remainingTokens: remainingBudget(),
      createdAt: Date.now(),
    }

    useContextPackSlot.getState().setCurrentPack(pack)

    return pack
  }

  private findDirtyBuffer(filePath: string): string | null {
    const openFiles = useWorkspaceStore.getState().openFiles
    const file = openFiles.find((f: OpenFile) => f.path === filePath && f.isDirty)
    return file?.content ?? null
  }

  private emptyPack(): ContextPack {
    return {
      sources: [],
      systemPrompt: "",
      totalTokens: 0,
      tokenBudget: 0,
      remainingTokens: 0,
      createdAt: Date.now(),
    }
  }
}
