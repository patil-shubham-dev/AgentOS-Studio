import { memo, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { CopyButton } from "@/components/ui/CopyButton"
import type { Components } from "react-markdown"

interface StableMarkdownRendererProps {
  text: string
  isStreaming: boolean
  tokensPerSecond?: number
  latency?: number
}

const codeComponents: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.includes("hljs") || className?.includes("language-")
    const codeText = String(children).replace(/\n$/, "")
    if (isBlock) {
      return (
        <div className="relative group">
          <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={codeText} className="px-1 py-0.5 rounded bg-black/60 border border-white/[0.06]" />
          </div>
          <code className={className} {...props}>{children}</code>
        </div>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  pre({ children }) {
    return <pre className="relative group">{children}</pre>
  },
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

function formatMetrics(tps: number, latency: number): string {
  if (latency <= 0 && tps <= 0) return ""
  const items: string[] = []
  if (tps > 0) items.push(`${tps.toFixed(1)} tok/s`)
  if (latency > 0) items.push(`${(latency / 1000).toFixed(1)}s`)
  return items.join(" · ")
}

export const StableMarkdownRenderer = memo(function StableMarkdownRenderer({
  text,
  isStreaming,
  tokensPerSecond = 0,
  latency = 0,
}: StableMarkdownRendererProps) {
  const streamingComponents = useMemo<Components>(() => ({
    ...codeComponents,
    text({ children }) {
      if (!isStreaming || !children) return <>{children}</>
      return (
        <>
          {children}
          <span className="inline-block w-[2px] h-[1em] bg-blue-400/60 align-text-bottom ml-[1px] animate-pulse" />
        </>
      )
    },
  }), [isStreaming])

  if (!text && !isStreaming) return null

  const metricsTip = formatMetrics(tokensPerSecond, latency)

  return (
    <div className="prose-claude relative">
      {/* Subtle streaming indicator — just a tiny dot + metrics inline */}
      <AnimatePresence>
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 mb-1"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            {metricsTip && (
              <span className="text-[9px] font-mono text-white/20">{metricsTip}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single renderer — ReactMarkdown during streaming AND after, no flicker */}
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={streamingComponents}
      >
        {text || (isStreaming ? " " : "")}
      </ReactMarkdown>

      {/* Streaming-only: ensure visible cursor even when markdown renders no text */}
      {isStreaming && !text && (
        <span className="inline-block w-[2px] h-[1em] bg-blue-400/60 animate-pulse" />
      )}
    </div>
  )
})
