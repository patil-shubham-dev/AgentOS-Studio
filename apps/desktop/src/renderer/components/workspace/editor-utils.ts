import type { editor } from "monaco-editor"

export const EXT_LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  css: "css", scss: "scss", html: "html", json: "json",
  md: "markdown", py: "python", rs: "rust", toml: "toml",
  yaml: "yaml", yml: "yaml", sh: "shell", bash: "shell",
  sql: "sql", go: "go", java: "java", rb: "ruby",
  svelte: "html", vue: "html", astro: "html",
}

export function getMonacoLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  return EXT_LANG_MAP[ext] ?? "plaintext"
}

export const DEFAULT_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures: true,
  minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
  scrollBeyondLastLine: false,
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  foldingHighlight: true,
  renderLineHighlight: "all",
  renderWhitespace: "selection",
  bracketPairColorization: { enabled: true },
  autoClosingBrackets: "always",
  autoClosingQuotes: "always",
  formatOnPaste: true,
  smoothScrolling: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  stickyScroll: { enabled: true },
  codeLens: true,
  wordWrap: "off",
  tabSize: 2,
  insertSpaces: true,
  renderControlCharacters: false,
  padding: { top: 12 },
  suggest: {
    showMethods: true, showFunctions: true, showConstructors: true,
    showDeprecated: false, showFields: true, showVariables: true,
    showClasses: true, showStructs: true, showInterfaces: true,
    showModules: true, showProperties: true, showEvents: true,
    showOperators: true, showUnits: true, showValues: true,
    showConstants: true, showEnums: true, showEnumMembers: true,
    showKeywords: true, showWords: true, showColors: true,
    showFiles: true, showReferences: true, showSnippets: true,
    showTypeParameters: true,
  },
  "semanticHighlighting.enabled": true,
}

const CACHE_MAX = 100

class LRUCache<T> {
  private max: number
  private map = new Map<string, T>()

  constructor(max: number) {
    this.max = max
  }

  get(key: string): T | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      this.map.delete(key)
      this.map.set(key, val)
    }
    return val
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, value)
  }

  delete(key: string): void {
    this.map.delete(key)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

export async function saveFile(
  filePath: string,
  fileName: string,
  content: string,
  rootPath?: string,
): Promise<{ success: boolean; method: "tauri" | "download" | "error"; error?: string }> {
  try {
    const { invoke } = await import("@/lib/electron-api")
    const normalizedPath = filePath.replace(/\//g, "\\")
    const absolutePath = rootPath ? `${rootPath}\\${normalizedPath}` : filePath
    await invoke("write_text_file", { path: absolutePath, content })
    try {
      await invoke("save_snapshot", {
        path: absolutePath,
        content,
        description: `Saved ${fileName}`,
      })
    } catch { /* snapshot is optional */ }
    return { success: true, method: "tauri" }
  } catch {
    // Tauri not available — fall back to download
  }

  try {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    return { success: true, method: "download" }
  } catch (e) {
    return { success: false, method: "error", error: String(e) }
  }
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export const modelCache = new LRUCache<{ uri: string; content: string }>(CACHE_MAX)
export let monacoInstance: any = null
export function setMonacoInstance(m: any): void { monacoInstance = m }

export interface EditorViewState {
  cursor: { lineNumber: number; column: number }
  scrollTop: number
  scrollLeft: number
}
export const editorViewStateCache = new LRUCache<EditorViewState>(CACHE_MAX)

export function removeFromCaches(filePath: string) {
  modelCache.delete(filePath)
  editorViewStateCache.delete(filePath)
  if (monacoInstance) {
    const uri = monacoInstance.Uri.parse(`file:///workspace/${filePath}`)
    const model = monacoInstance.editor.getModel(uri)
    if (model) {
      model.dispose()
    }
  }
}

const LARGE_FILE_THRESHOLD = 1_000_000 // 1MB — Monaco performance degrades beyond this

export function isLargeFile(content: string): boolean {
  return content.length > LARGE_FILE_THRESHOLD
}

export function getOrCreateModel(monaco: any, filePath: string, content: string, language: string): any {
  const uri = monaco.Uri.parse(`file:///workspace/${filePath}`)
  let model = monaco.editor.getModel(uri)
  if (model) {
    if (model.getValue() !== content) {
      model.setValue(content)
    }
    modelCache.set(filePath, { uri: uri.toString(), content })
    return model
  }
  model = monaco.editor.createModel(content, language, uri)
  modelCache.set(filePath, { uri: uri.toString(), content })
  return model
}
