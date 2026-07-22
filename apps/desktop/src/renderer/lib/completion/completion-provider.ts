import type { editor, languages, Position, Range, CancellationToken } from "monaco-editor"
type ITextModel = editor.ITextModel
import { workspaceIndex } from "@/lib/search-index"
import { useCompletionStore, type CompletionSource } from "./completion-store"
import { requestAiCompletion } from "./completion-ai"
import { globalCompletionProvider, getCompletionConfig, updateCompletionConfig } from "@/runtime/completion/CompletionProvider"

const MAX_SCAN_LINES = 3000

interface CachedCompletion {
  text: string
  timestamp: number
  lineHash: string
}

const completionCache = new Map<string, CachedCompletion>()
const CACHE_TTL = 10_000
const CACHE_MAX = 50

function cacheKey(modelId: string, lineNumber: number, column: number, prefix: string): string {
  return `${modelId}:${lineNumber}:${column}:${prefix}`
}

function getCached(key: string, lineHash: string): string | null {
  const entry = completionCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { completionCache.delete(key); return null }
  if (entry.lineHash !== lineHash) return null
  return entry.text
}

function setCache(key: string, text: string, lineHash: string): void {
  if (completionCache.size >= CACHE_MAX) {
    const oldest = completionCache.entries().next()
    if (oldest.value) completionCache.delete(oldest.value[0])
  }
  completionCache.set(key, { text, timestamp: Date.now(), lineHash })
}

function getLinePrefix(model: ITextModel, position: Position): string {
  const currentLine = model.getLineContent(position.lineNumber).substring(0, position.column - 1)
  const linesAbove: string[] = []
  const startLine = Math.max(1, position.lineNumber - 3)
  for (let i = startLine; i < position.lineNumber; i++) {
    linesAbove.push(model.getLineContent(i))
  }
  if (linesAbove.length > 0) {
    return linesAbove.join("\n") + "\n" + currentLine
  }
  return currentLine
}

function getSuffix(model: ITextModel, position: Position): string {
  const currentLineRest = model.getLineContent(position.lineNumber).substring(position.column - 1)
  const linesBelow: string[] = []
  const totalLines = model.getLineCount()
  const endLine = Math.min(totalLines, position.lineNumber + 3)
  for (let i = position.lineNumber + 1; i <= endLine; i++) {
    linesBelow.push(model.getLineContent(i))
  }
  if (linesBelow.length > 0) {
    return currentLineRest + "\n" + linesBelow.join("\n")
  }
  return currentLineRest
}

function computeLineHash(model: ITextModel, lineNumber: number): string {
  const start = Math.max(1, lineNumber - 3)
  const end = Math.min(model.getLineCount(), lineNumber + 1)
  let hash = 0
  for (let i = start; i <= end; i++) {
    const line = model.getLineContent(i)
    for (let j = 0; j < line.length; j++) { hash = ((hash << 5) - hash) + line.charCodeAt(j); hash |= 0 }
  }
  return String(hash)
}

function findSimilarPatterns(model: ITextModel, position: Position, maxResults = 3): string[] {
  const prefix = getLinePrefix(model, position)
  if (!prefix.trim()) return []

  const totalLines = model.getLineCount()
  if (totalLines > MAX_SCAN_LINES) return []

  const currentLine = model.getLineContent(position.lineNumber)
  const currentIndent = currentLine.match(/^(\s*)/)?.[1] ?? ""
  const candidates: Array<{ text: string; score: number }> = []

  for (let i = 1; i <= totalLines; i++) {
    if (i === position.lineNumber) continue
    const line = model.getLineContent(i)
    if (!line.trim()) continue
    if (!line.trim().startsWith(prefix.trim()) || line.trim().length <= prefix.trim().length) continue

    const indentLevel = (line.match(/^\s*/)?.[1] ?? "").length
    let score = line.trim().length
    if (Math.abs(indentLevel - currentIndent.length) <= 2) score += 10

    const nextLine = i < totalLines ? model.getLineContent(i + 1) : ""
    if (nextLine.trim()) {
      const nextIndent = (nextLine.match(/^\s*/)?.[1] ?? "").length
      if (nextIndent > indentLevel) score += 5
    }

    candidates.push({ text: line.trim().substring(prefix.trim().length), score })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, maxResults).map((c) => c.text)
}

function findMultiLinePattern(model: ITextModel, position: Position): string | null {
  const currentLinePrefix = model.getLineContent(position.lineNumber).substring(0, position.column - 1)
  if (!currentLinePrefix.trim()) return null

  const totalLines = model.getLineCount()
  if (totalLines > MAX_SCAN_LINES) return null

  const currentLine = model.getLineContent(position.lineNumber)
  const currentIndent = (currentLine.match(/^\s*/)?.[0] ?? "").length
  let bestMatch: string | null = null
  let bestScore = 0

  for (let i = 1; i <= totalLines; i++) {
    if (i === position.lineNumber) continue
    const line = model.getLineContent(i)
    if (!line.trim().startsWith(currentLinePrefix.trim()) || line.trim().length <= currentLinePrefix.trim().length) continue

    const followingLines: string[] = []
    let bodyDepth: number | null = null
    for (let j = i + 1; j <= Math.min(i + 19, totalLines); j++) {
      const nextLine = model.getLineContent(j)
      const nextIndent = (nextLine.match(/^\s*/)?.[0] ?? "").length
      if (bodyDepth === null) {
        if (nextIndent > currentIndent && nextLine.trim()) {
          bodyDepth = nextIndent
          followingLines.push(nextLine)
        } else {
          break
        }
      } else {
        if (nextLine.trim() && (nextLine.match(/^\s*/)?.[0] ?? "").length >= currentIndent + 2) {
          followingLines.push(nextLine)
        } else {
          break
        }
      }
    }
    if (followingLines.length > 0) {
      const score = followingLines.length
      if (score > bestScore) {
        bestScore = score
        const trailing = line.trim().substring(currentLinePrefix.trim().length)
        bestMatch = "\n" + [trailing, ...followingLines].join("\n")
      }
    }
  }
  return bestMatch
}

async function searchIndexCompletions(prefix: string, _language: string, maxResults = 2): Promise<string[]> {
  if (!prefix.trim() || prefix.trim().length < 2) return []
  const results = await workspaceIndex.search({ query: prefix.trim(), mode: "content", caseSensitive: false, maxResults })
  const completions: string[] = []
  for (const result of results) {
    for (const match of result.matches) {
      const idx = match.lineContent.toLowerCase().indexOf(prefix.trim().toLowerCase())
      const after = match.lineContent.substring(idx + prefix.trim().length)
      if (after && after.length < 120) completions.push(after)
    }
  }
  return completions
}

function getSyntaxCompletions(model: ITextModel, position: Position): string[] {
  const prefix = getLinePrefix(model, position)
  if (!prefix.trim()) return []

  const language = model.getLanguageId()
  const word = prefix.trim()

  const keywords: Record<string, string[]> = {
    typescript: ["const ", "let ", "var ", "function ", "async ", "await ", "return ", "if (", "for (", "while (", "import ", "export ", "class ", "interface ", "type ", "new ", "throw ", "try {", "catch (", "switch (", "case ", "default:", "break ", "continue ", "typeof ", "instanceof ", "void ", "delete ", "in ", "of "],
    javascript: ["const ", "let ", "var ", "function ", "async ", "await ", "return ", "if (", "for (", "while (", "import ", "export ", "class ", "new ", "throw ", "try {", "catch (", "switch (", "case ", "default:", "break ", "continue ", "typeof ", "delete "],
    python: ["def ", "class ", "return ", "if ", "elif ", "else:", "for ", "while ", "import ", "from ", "async ", "await ", "try:", "except ", "finally:", "with ", "as ", "pass", "break ", "continue ", "yield ", "raise ", "lambda ", "not ", "and ", "or ", "is ", "in "],
    rust: ["fn ", "let ", "mut ", "const ", "if ", "else ", "for ", "while ", "loop ", "match ", "return ", "pub ", "use ", "mod ", "struct ", "enum ", "impl ", "trait ", "async ", "await ", "move ", "ref ", "unsafe ", "where ", "type ", "self", "super::", "crate::"],
    java: ["public ", "private ", "protected ", "static ", "final ", "void ", "int ", "String ", "boolean ", "class ", "interface ", "extends ", "implements ", "return ", "if (", "else ", "for (", "while (", "try {", "catch (", "new ", "this.", "super(", "import ", "package "],
    go: ["func ", "var ", "const ", "type ", "struct ", "interface ", "map[", "[]", "return ", "if ", "else ", "for ", "range ", "switch ", "case ", "default:", "break ", "continue ", "defer ", "go ", "chan ", "select {", "import (", "package "],
  }

  const langKeywords = keywords[language] ?? []
  const matched = langKeywords.filter((k) => k.startsWith(word) && k.length > word.length)
  return matched.slice(0, 3)
}

interface InlineCompletionItem {
  insertText: string
  range: Range
  complete?: boolean
}

interface InlineCompletionsResult {
  items: InlineCompletionItem[]
}

function createInlineCompletion(
  monaco: typeof import("monaco-editor"),
  model: ITextModel,
  position: Position,
  insertText: string,
  multiLine = false,
): InlineCompletionItem {
  const word = model.getWordUntilPosition(position)
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column)
  return { insertText, range, complete: !multiLine }
}

let aiRequestTimer: ReturnType<typeof setTimeout> | null = null
let pendingAiCompletion: ((value: string | null) => void) | null = null
let currentAiCancelled = false

async function requestAiCompletionInternal(
  _monaco: typeof import("monaco-editor"),
  model: ITextModel,
  position: Position,
  prefix: string,
  filePath: string,
  language: string,
  signal: AbortSignal,
): Promise<string | null> {
  if (aiRequestTimer) clearTimeout(aiRequestTimer)
  currentAiCancelled = true
  if (pendingAiCompletion) { pendingAiCompletion(null); pendingAiCompletion = null }
  if (signal.aborted) return null

  await new Promise<void>((resolve) => { aiRequestTimer = setTimeout(resolve, 300) })
  if (signal.aborted) return null

  currentAiCancelled = false
  const suffix = model.getValue().length > 2000
    ? model.getLineContent(position.lineNumber).substring(position.column - 1)
    : getSuffix(model, position)

  const result = await requestAiCompletion({
    prefix,
    suffix,
    filePath,
    language,
    recentCompletions: Array.from(completionCache.values()).map((c) => c.text).slice(-5),
    openFiles: [],
  })

  if (result) {
    const store = useCompletionStore.getState()
    store.recordAiCost(result.length)
  }

  return result
}

export function registerInlineCompletionProvider(
  monaco: typeof import("monaco-editor"),
  editor: editor.IStandaloneCodeEditor,
): void {
  const disposable = monaco.languages.registerInlineCompletionsProvider("*", new InlineCompletionsProvider(monaco, editor))
  ;(editor as any).__inlineCompletionDisposable = disposable
}

export function unregisterInlineCompletionProvider(editor: editor.IStandaloneCodeEditor): void {
  const d = (editor as any).__inlineCompletionDisposable
  if (d) { d.dispose(); delete (editor as any).__inlineCompletionDisposable }
}

class InlineCompletionsProvider {
  private monaco: typeof import("monaco-editor")
  private editor: editor.IStandaloneCodeEditor

  constructor(monaco: typeof import("monaco-editor"), editor: editor.IStandaloneCodeEditor) {
    this.monaco = monaco
    this.editor = editor
  }

  async provideInlineCompletions(
    model: ITextModel,
    position: Position,
    _context: languages.InlineCompletionContext,
    cancellationToken: CancellationToken,
  ): Promise<InlineCompletionsResult> {
    const startTime = performance.now()
    const store = useCompletionStore.getState()
    const prefix = getLinePrefix(model, position)
    if (!prefix.trim() || cancellationToken.isCancellationRequested) return { items: [] }

    const filePath = model.uri.path.replace("/workspace/", "")
    const language = model.getLanguageId()
    const lineHash = computeLineHash(model, position.lineNumber)
    const key = cacheKey(model.id, position.lineNumber, position.column, prefix)

    const cached = getCached(key, lineHash)
    if (cached) {
      store.recordSuggestion("cache")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, cached)] }
    }

    // 0. Syntax-aware keywords (fastest)
    const syntaxCompletions = getSyntaxCompletions(model, position)
    if (syntaxCompletions.length > 0) {
      setCache(key, syntaxCompletions[0], lineHash)
      store.recordSuggestion("syntax")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, syntaxCompletions[0])] }
    }

    // 1. File-based pattern matching
    const patterns = findSimilarPatterns(model, position)
    if (patterns.length > 0) {
      setCache(key, patterns[0], lineHash)
      store.recordSuggestion("pattern")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, patterns[0])] }
    }

    // 2. Multi-line pattern
    const multiLine = findMultiLinePattern(model, position)
    if (multiLine) {
      setCache(key, multiLine, lineHash)
      store.recordSuggestion("pattern")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, multiLine, true)] }
    }

    // 3. Search index
    const indexResults = await searchIndexCompletions(prefix, language)
    if (indexResults.length > 0) {
      setCache(key, indexResults[0], lineHash)
      store.recordSuggestion("workspace")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, indexResults[0])] }
    }

    // 4. Dedicated FIM completion provider (fast, sub-300ms)
    const fimConfig = getCompletionConfig()
    if (fimConfig.enabled && fimConfig.providerType === "dedicated") {
      const fimResult = await globalCompletionProvider.complete({
        prefix: getLinePrefix(model, position),
        suffix: getSuffix(model, position),
        language,
        filePath,
        maxLines: fimConfig.maxLines,
        signal: cancellationToken,
      })
      if (fimResult && fimResult.text) {
        setCache(key, fimResult.text, lineHash)
        store.recordSuggestion("ai")
        store.recordLatency(performance.now() - startTime)
        return { items: [createInlineCompletion(this.monaco, model, position, fimResult.text)] }
      }
    }

    // 5. AI-powered (agent provider fallback)
    const aiResult = await requestAiCompletionInternal(this.monaco, model, position, prefix, filePath, language, new AbortController().signal)
    if (aiResult) {
      setCache(key, aiResult, lineHash)
      store.recordSuggestion("ai")
      store.recordLatency(performance.now() - startTime)
      return { items: [createInlineCompletion(this.monaco, model, position, aiResult)] }
    }

    return { items: [] }
  }

  freeInlineCompletions(_result: InlineCompletionsResult): void {}
  disposeInlineCompletions(): void {}
}

export function setupCompletionTracking(editor: editor.IStandaloneCodeEditor): void {
  const disposable = editor.onKeyDown((e) => {
    if (e.keyCode === 9) {
      const widget = (editor as any)._modelData?.view?.inlineCompletionsController
      if (widget?.active) useCompletionStore.getState().recordAccept()
    }
    if (e.keyCode === 27) {
      const widget = (editor as any)._modelData?.view?.inlineCompletionsController
      if (widget?.active) useCompletionStore.getState().recordReject()
    }
  })
  ;(editor as any).__completionTrackingDisposable = disposable
}

export function cleanupCompletionTracking(editor: editor.IStandaloneCodeEditor): void {
  const d = (editor as any).__completionTrackingDisposable
  if (d) { d.dispose(); delete (editor as any).__completionTrackingDisposable }
}
