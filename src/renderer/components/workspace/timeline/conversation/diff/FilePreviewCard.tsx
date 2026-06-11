import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { detectLanguage } from "./diff-utils"
import hljs from "highlight.js"
import type { FileOpRecord } from "../../step-card"

interface FilePreviewCardProps {
  filePath?: string
  content?: string
  language?: string
  op?: FileOpRecord
  onOpenInEditor?: (path: string) => void
  expanded?: boolean
}

export const FilePreviewCard = memo(function FilePreviewCard({
  filePath,
  content: propContent,
  language: propLanguage,
  op,
  onOpenInEditor,
  expanded: defaultExpanded = false,
}: FilePreviewCardProps) {
  const [isExpanded, setExpanded] = useState(defaultExpanded)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  const resolved = useMemo(() => {
    if (op) {
      return {
        path: op.path,
        content: op.content || "",
      }
    }
    return {
      path: filePath,
      content: propContent || "",
    }
  }, [op, filePath, propContent])

  const { path, content: displayContent } = resolved
  if (!path) return null

  const fileName = path.split("/").pop() || path
  const lang = propLanguage || detectLanguage(path)
  const lineCount = displayContent ? displayContent.split("\n").length : 0

  const toggleExpand = useCallback(() => setExpanded((e) => !e), [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [displayContent])

  useEffect(() => {
    if (!isExpanded || !codeRef.current || !displayContent) return
    if (lang === "plaintext") {
      codeRef.current.textContent = displayContent
      return
    }
    try {
      const result = hljs.highlight(displayContent, {
        language: lang,
        ignoreIllegals: true,
      })
      codeRef.current.innerHTML = result.value
    } catch {
      codeRef.current.textContent = displayContent
    }
  }, [isExpanded, displayContent, lang])

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className="group py-1"
    >
      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
          <button
            onClick={toggleExpand}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-white/30 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-white/30 flex-shrink-0" />
            )}
            <FileText className="h-3.5 w-3.5 text-blue-400/50 flex-shrink-0" />
            <span className="text-xs font-mono text-white/70 truncate">
              {fileName}
            </span>
            <span className="text-[10px] text-white/30 font-mono hidden sm:inline truncate max-w-[200px]">
              {path}
            </span>
            {lineCount > 0 && (
              <span className="text-[9px] text-white/20 font-mono hidden sm:inline flex-shrink-0">
                {lineCount} {lineCount === 1 ? "line" : "lines"}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button
              onClick={handleCopy}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded transition-all",
                copied
                  ? "text-emerald-400/70 bg-emerald-500/10"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]",
              )}
              title={copied ? "Copied!" : "Copy content"}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {onOpenInEditor && (
              <button
                onClick={() => onOpenInEditor(path)}
                className="text-[9px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition-all"
                title="Open in editor"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && displayContent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="overflow-hidden"
            >
              <div className="overflow-x-auto">
                <pre className="px-3 py-2 text-[11px] leading-relaxed font-mono overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent">
                  <code
                    ref={codeRef}
                    className={cn(
                      "hljs",
                      lang === "plaintext" && "text-white/60",
                    )}
                  >
                    {displayContent}
                  </code>
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!displayContent && (
          <div className="px-4 py-2 text-[10px] text-white/30 italic">
            No content preview available
          </div>
        )}
      </div>
    </motion.div>
  )
})
