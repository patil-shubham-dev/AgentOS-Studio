import { useMemo, useRef, useCallback } from "react"
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"
import type { OpenFile } from "@/types"

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontLigatures: true,
  fontSize: 13,
  lineHeight: 1.5,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  smoothScrolling: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  padding: { top: 12 },
  renderWhitespace: "selection",
  tabSize: 2,
  renderLineHighlight: "all",
  suggest: { showMethods: true, showFunctions: true, showClasses: true },
}

interface SplitEditorProps {
  activeFile: OpenFile | undefined
  language: string
  handleEditorMount: (editor: editor.IStandaloneCodeEditor, monaco: any) => void
  handleContentChange: OnChange
}

export function SplitEditor({ activeFile, language, handleEditorMount, handleContentChange }: SplitEditorProps) {
  const splitMode = useWorkspaceStore((s) => s.splitMode)
  const splitFilePath = useWorkspaceStore((s) => s.splitFilePath)
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const setSplitMode = useWorkspaceStore((s) => s.setSplitMode)

  const editorARef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editorBRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const splitFile = useMemo(() => {
    if (!splitFilePath) return undefined
    return openFiles.find((f) => f.path === splitFilePath)
  }, [splitFilePath, openFiles])

  const splitLanguage = useMemo(() => {
    if (!splitFile) return "plaintext"
    const ext = splitFile.name.split(".").pop()?.toLowerCase() ?? ""
    const EXT_LANG_MAP: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      css: "css", html: "html", json: "json", md: "markdown",
      py: "python", rs: "rust", go: "go", yaml: "yaml", yml: "yaml",
      toml: "toml", sh: "shell", bash: "shell", sql: "sql",
    }
    return EXT_LANG_MAP[ext] ?? "plaintext"
  }, [splitFile])

  const handleSplitMountA: OnMount = useCallback((ed, monaco) => {
    editorARef.current = ed
    handleEditorMount(ed, monaco)
  }, [handleEditorMount])

  const handleSplitMountB: OnMount = useCallback((ed) => {
    editorBRef.current = ed
  }, [])

  const handleSplitChangeB: OnChange = useCallback((value) => {
    if (splitFile && value !== undefined) {
      useWorkspaceStore.getState().updateFileContent(splitFile.path, value)
    }
  }, [splitFile])

  if (splitMode === "none" || !splitMode) return null

  const primaryOptions = useMemo(() => ({ ...EDITOR_OPTIONS }), [])
  const splitOptions = useMemo(() => ({ ...EDITOR_OPTIONS, readOnly: !splitFile }), [splitFile])

  return (
    <div className={cn(
      "flex-1 relative overflow-hidden min-h-0 flex",
      splitMode === "vertical" ? "flex-row" : "flex-col",
    )}>
      {/* Primary editor */}
      <div className={cn(
        "relative overflow-hidden",
        splitMode === "vertical" ? "w-1/2 border-r border-white/[0.06]" : "h-1/2 border-b border-white/[0.06]",
      )}>
        <Editor
          defaultLanguage={language}
          language={language}
          onChange={handleContentChange}
          onMount={handleSplitMountA}
          options={primaryOptions}
          theme="agentic-dark"
        />
      </div>

      {/* Split editor */}
      <div className={cn(
        "relative overflow-hidden",
        splitMode === "vertical" ? "w-1/2" : "h-1/2",
      )}>
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 bg-black/40 text-[9px] text-white/40">
          <span>{splitFile?.name ?? "Select a file"}</span>
          <button
            onClick={() => setSplitMode("none")}
            className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </div>
        <Editor
          defaultLanguage={splitLanguage}
          language={splitLanguage}
          value={splitFile?.content ?? ""}
          onChange={handleSplitChangeB}
          onMount={handleSplitMountB}
          options={splitOptions}
          theme="agentic-dark"
        />
      </div>
    </div>
  )
}
