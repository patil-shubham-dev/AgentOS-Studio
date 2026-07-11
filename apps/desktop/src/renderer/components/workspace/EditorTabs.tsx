import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import type { OpenFile } from "@/types"
import { cn } from "@/lib/utils"

function getMonacoLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    css: "css", scss: "scss", html: "html", json: "json",
    md: "markdown", py: "python", rs: "rust", toml: "toml",
    yaml: "yaml", yml: "yaml", sh: "shell", bash: "shell",
    sql: "sql", go: "go", java: "java", rb: "ruby",
    svelte: "html", vue: "html", astro: "html",
  }
  return map[ext] ?? "plaintext"
}

export function EditorTabs({ openFiles, activeFilePath, liveEditingFile, onOpen, onClose }: {
  openFiles: OpenFile[]
  activeFilePath: string | null
  liveEditingFile: string | null
  onOpen: (f: OpenFile) => void
  onClose: (path: string) => void
}) {
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = tabsRef.current
    if (!container) return
    const activeTab = container.querySelector('[data-active="true"]') as HTMLDivElement | null
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    }
  }, [activeFilePath])

  function handleMiddleClick(e: React.MouseEvent, path: string) {
    if (e.button === 1) {
      e.preventDefault()
      onClose(path)
    }
  }

  return (
    <div ref={tabsRef} role="tablist" className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/30 overflow-x-auto shrink-0 scrollbar-thin">
      <style>{`
        @keyframes streaming-border-pulse {
          0%, 100% { border-left-color: transparent; }
          50% { border-left-color: var(--color-accent-green); }
        }
      `}</style>
      {openFiles.map((file) => {
        const lang = getMonacoLang(file.name)
        const isBeingStreamed = liveEditingFile === file.path
        return (
          <motion.div
            key={file.path}
            data-active={file.path === activeFilePath ? "true" : undefined}
            data-streaming={isBeingStreamed ? "true" : undefined}
            role="tab"
            aria-selected={file.path === activeFilePath}
            onMouseDown={(e) => handleMiddleClick(e, file.path)}
            layout
            layoutId={file.path}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-r border-[var(--border-subtle)] transition-all select-none whitespace-nowrap",
              file.path === activeFilePath
                ? "bg-[var(--border-subtle)] text-[var(--text-primary)] shadow-[inset_0_-1.5px_0_0] shadow-[var(--accent-code)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]/50",
              isBeingStreamed && "border-l-2 border-l-transparent animate-[streaming-border-pulse_1.5s_ease-in-out_infinite]"
            )}
            onClick={() => onOpen(file)}
          >
            <span className={cn(
              "text-[10px] font-medium uppercase",
              lang === "typescript" && "text-[var(--accent-code)]",
              lang === "javascript" && "text-[var(--color-accent-amber)]",
              lang === "css" && "text-pink-400",
              lang === "html" && "text-orange-400",
              lang === "json" && "text-[var(--color-accent-green)]",
              lang === "python" && "text-blue-300",
              lang === "rust" && "text-orange-400",
              lang === "markdown" && "text-[var(--text-tertiary)]",
            )}>
              {file.name.split(".").pop()}
            </span>
            <span className="truncate max-w-28">{file.name}</span>
            {file.isDirty && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
                className="h-1.5 w-1.5 rounded-full bg-[var(--accent-code)] shrink-0"
                title="Unsaved changes"
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(file.path) }}
              className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--border-default)] transition-all text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              aria-label={`Close ${file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
