import { useRef, useState, useCallback, useEffect, memo } from "react"
import hljs from "highlight.js"
import { cn } from "@/lib/utils"
import {
  Copy, Check, FileDown, ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react"

// Register common languages
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import css from "highlight.js/lib/languages/css"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import xml from "highlight.js/lib/languages/xml"
import rust from "highlight.js/lib/languages/rust"
import go from "highlight.js/lib/languages/go"

hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("js", javascript)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("ts", typescript)
hljs.registerLanguage("tsx", typescript)
hljs.registerLanguage("jsx", javascript)
hljs.registerLanguage("python", python)
hljs.registerLanguage("py", python)
hljs.registerLanguage("css", css)
hljs.registerLanguage("json", json)
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("sh", bash)
hljs.registerLanguage("shell", bash)
hljs.registerLanguage("html", xml)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("rs", rust)
hljs.registerLanguage("go", go)

export interface CodeBlockData {
  language: string
  code: string
  filePath?: string
}

interface CodeBlockWithActionsProps {
  block: CodeBlockData
  onApply?: (block: CodeBlockData) => void
  onOpenInEditor?: (block: CodeBlockData) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

function detectLanguage(raw: string): string {
  const shebangMatch = raw.match(/^#!.*\/(\w+)/)
  if (shebangMatch) return shebangMatch[1]

  const result = hljs.highlightAuto(raw, [
    "javascript", "typescript", "python", "css", "json",
    "bash", "html", "rust", "go", "sql", "yaml", "markdown",
  ])
  return result.language || "plaintext"
}

function getLanguageLabel(lang: string): string {
  const labels: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", rs: "Rust", go: "Go", sh: "Shell", bash: "Shell",
    css: "CSS", html: "HTML", json: "JSON", yaml: "YAML", md: "Markdown",
    sql: "SQL", rust: "Rust", typescript: "TypeScript", javascript: "JavaScript",
    python: "Python", shell: "Shell", xml: "XML", plaintext: "Text",
  }
  return labels[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
}

function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400", typescript: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400", javascript: "text-yellow-400",
    py: "text-green-400", python: "text-green-400",
    rs: "text-orange-400", rust: "text-orange-400",
    go: "text-cyan-400",
    sh: "text-white/50", bash: "text-white/50", shell: "text-white/50",
    css: "text-pink-400", html: "text-orange-400",
    json: "text-emerald-400", yaml: "text-cyan-300",
    sql: "text-blue-300",
    plaintext: "text-white/30",
  }
  return colors[lang] || "text-purple-400"
}

export const CodeBlockWithActions = memo(function CodeBlockWithActions({
  block,
  onApply,
  onOpenInEditor,
  isCollapsed,
  onToggleCollapse,
}: CodeBlockWithActionsProps) {
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  const lang = block.language || detectLanguage(block.code)
  const label = getLanguageLabel(lang)
  const color = getLanguageColor(lang)

  // Debounced syntax highlighting — prevents main-thread blocking during streaming
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (lang === "plaintext") {
      if (codeRef.current) codeRef.current.textContent = block.code
      return
    }

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
    }

    highlightTimerRef.current = setTimeout(() => {
      if (codeRef.current) {
        try {
          const result = hljs.highlight(block.code, { language: lang, ignoreIllegals: true })
          codeRef.current.innerHTML = result.value
        } catch {
          try {
            const result = hljs.highlightAuto(block.code)
            codeRef.current.innerHTML = result.value
          } catch {
            codeRef.current.textContent = block.code
          }
        }
      }
    }, 300)

    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
    }
  }, [block.code, lang])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(block.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [block.code])

  const lineCount = block.code.split("\n").length

  return (
    <div className="group relative my-2 rounded-lg border border-white/[0.08] bg-[#0d0d0e] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="text-white/20 hover:text-white/50 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}
          <span className={cn("text-[10px] font-semibold font-mono", color)}>
            {label}
          </span>
          {block.filePath && (
            <span className="text-[9px] text-white/25 font-mono truncate max-w-[200px]">
              {block.filePath}
            </span>
          )}
          <span className="text-[8px] text-white/15 font-mono">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onOpenInEditor && (
            <button
              onClick={() => onOpenInEditor(block)}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              title="Open in editor"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Open</span>
            </button>
          )}
          {onApply && (
            <button
              onClick={() => onApply(block)}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
              title="Apply to file"
            >
              <FileDown className="h-3 w-3" />
              <span>Apply</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] transition-all",
              copied
                ? "text-emerald-400/70 bg-emerald-500/10"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]",
            )}
            title={copied ? "Copied!" : "Copy code"}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      {!isCollapsed && (
        <div className="relative overflow-x-auto">
          <pre className="px-3 py-3 text-[11px] leading-relaxed font-mono">
            <code
              ref={codeRef}
              className={cn(
                "hljs",
                lang === "plaintext" && "text-white/60",
              )}
            >
              {/* Fallback text content while highlighting runs */}
              {block.code}
            </code>
          </pre>
          {/* Copy-anywhere overlay (larger hit area) */}
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08]"
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/40" />
            )}
          </button>
        </div>
      )}
    </div>
  )
})

/**
 * Parse code blocks from streaming/markdown text and render them with CodeBlockWithActions.
 * Detects triple-backtick fenced code blocks and renders inline code.
 */
export function renderCodeBlocks(
  text: string,
  options?: {
    onApply?: (block: CodeBlockData) => void
    onOpenInEditor?: (block: CodeBlockData) => void
  },
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const parts = text.split(/(```[\s\S]*?```)/g)

  let key = 0
  for (const part of parts) {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3).trim()
      const firstLineBreak = inner.indexOf("\n")
      let language = ""
      let code = inner

      if (firstLineBreak === -1) {
        // Single line code block
        code = inner
      } else {
        language = inner.slice(0, firstLineBreak).trim()
        code = inner.slice(firstLineBreak + 1)
      }

      nodes.push(
        <CodeBlockWithActions
          key={`code-${key++}`}
          block={{ language, code }}
          onApply={options?.onApply}
          onOpenInEditor={options?.onOpenInEditor}
        />,
      )
    } else {
      // Split by inline code
      const inlineParts = part.split(/(`[^`]+`)/g)
      for (const inline of inlineParts) {
        if (inline.startsWith("`") && inline.endsWith("`")) {
          nodes.push(
            <code
              key={`inline-${key++}`}
              className="px-1 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-blue-300/80 border border-white/[0.06]"
            >
              {inline.slice(1, -1)}
            </code>,
          )
        } else {
          nodes.push(inline)
        }
      }
    }
  }

  return nodes
}
