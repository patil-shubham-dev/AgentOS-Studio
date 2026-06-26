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
    <div ref={tabsRef} className="flex items-center border-b border-white/[0.04] bg-black/20 overflow-x-auto shrink-0 scrollbar-thin">
      <style>{`
        @keyframes streaming-border-pulse {
          0%, 100% { border-left-color: rgba(34, 197, 94, 0); }
          50% { border-left-color: rgba(34, 197, 94, 0.6); }
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
            onMouseDown={(e) => handleMiddleClick(e, file.path)}
            layout
            layoutId={file.path}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-r border-white/[0.03] transition-all select-none whitespace-nowrap",
              file.path === activeFilePath
                ? "bg-white/[0.04] text-white shadow-[inset_0_-1.5px_0_0] shadow-blue-500"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.02]",
              isBeingStreamed && "border-l-2 border-l-transparent animate-[streaming-border-pulse_1.5s_ease-in-out_infinite]"
            )}
            onClick={() => onOpen(file)}
          >
            <span className={cn(
              "text-[10px] font-medium uppercase",
              lang === "typescript" && "text-blue-400",
              lang === "javascript" && "text-yellow-400",
              lang === "css" && "text-pink-400",
              lang === "html" && "text-orange-400",
              lang === "json" && "text-green-400",
              lang === "python" && "text-blue-300",
              lang === "rust" && "text-orange-400",
              lang === "markdown" && "text-white/40",
            )}>
              {file.name.split(".").pop()}
            </span>
            <span className="truncate max-w-28">{file.name}</span>
            {file.isDirty && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0"
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(file.path) }}
              className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-white/30 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
