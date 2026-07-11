import { useMemo, useRef, useCallback, useState } from "react"
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

function clamp(v: number): number {
  return Math.max(0.2, Math.min(0.8, v))
}

export function SplitEditor({ activeFile, language, handleEditorMount, handleContentChange }: SplitEditorProps) {
  const splitMode = useWorkspaceStore((s) => s.splitMode)
  const splitFilePath = useWorkspaceStore((s) => s.splitFilePath)
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const setSplitMode = useWorkspaceStore((s) => s.setSplitMode)

  const editorARef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editorBRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const dragging = useRef(false)

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

  const handleMouseDown = useCallback(() => {
    dragging.current = true
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = splitMode === "vertical"
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height
      setSplitRatio(clamp(ratio))
    }
    const handleMouseUp = () => {
      dragging.current = false
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = splitMode === "vertical" ? "col-resize" : "row-resize"
    document.body.style.userSelect = "none"
  }, [splitMode])

  const primaryOptions = useMemo(() => ({ ...EDITOR_OPTIONS }), [])
  const splitOptions = useMemo(() => ({ ...EDITOR_OPTIONS, readOnly: !splitFile }), [splitFile])

  if (splitMode === "none" || !splitMode) return null

  const isVertical = splitMode === "vertical"
  const primaryRatio = splitRatio
  const secondaryRatio = 1 - splitRatio

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 relative overflow-hidden min-h-0 flex",
        isVertical ? "flex-row" : "flex-col",
      )}
    >
      <div
        className="relative overflow-hidden"
        style={isVertical ? { width: `${primaryRatio * 100}%` } : { height: `${primaryRatio * 100}%` }}
      >
        <Editor
          defaultLanguage={language}
          language={language}
          onChange={handleContentChange}
          onMount={handleSplitMountA}
          options={primaryOptions}
          theme="agentic-dark"
        />
      </div>

      {/* Draggable resize handle */}
      <div
        role="separator"
        aria-orientation={isVertical ? "vertical" : "horizontal"}
        aria-label="Resize editor split"
        className={cn(
          "shrink-0 relative z-20 bg-transparent hover:bg-blue-500/20 hover:shadow-[0_0_14px_-4px_rgba(59,130,246,0.4)] transition-all duration-200 group",
          isVertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
          dragging.current && "bg-blue-500/30",
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            "absolute rounded-full bg-white/0 group-hover:bg-white/40 transition-all duration-200",
            isVertical
              ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 group-hover:h-12 group-hover:w-1"
              : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 group-hover:w-12 group-hover:h-1",
          )}
        />
      </div>

      {/* Split editor */}
      <div
        className="relative overflow-hidden"
        style={isVertical ? { width: `${secondaryRatio * 100}%` } : { height: `${secondaryRatio * 100}%` }}
      >
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
