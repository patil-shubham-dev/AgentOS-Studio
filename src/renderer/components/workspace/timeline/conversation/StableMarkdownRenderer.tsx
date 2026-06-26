import { memo, useRef, useEffect, useState } from "react"
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

const COMPLETED_SPRING = {
  type: "spring" as const,
  stiffness: 260,
  damping: 22,
  mass: 1.0,
  delay: 0.05,
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    const el = containerRef.current
    if (!el || measuredHeight !== null) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setMeasuredHeight(entry.contentRect.height)
        ro.disconnect()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => setShowCompleted(true), 200)
      return () => clearTimeout(t)
    }
    setShowCompleted(false)
  }, [isStreaming])

  if (!text && !isStreaming) return null

  const metricsTip = formatMetrics(tokensPerSecond, latency)

  return (
    <div
      ref={containerRef}
      className="prose-claude relative"
      style={measuredHeight !== null ? { minHeight: measuredHeight } : undefined}
    >
      {isStreaming && metricsTip && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-2 px-2 py-0.5 rounded-bl-lg bg-white/[0.03] border-l border-b border-white/[0.06]">
          <span className="text-[10px] font-mono text-white/40">{metricsTip}</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>
      )}
      <AnimatePresence mode="wait">
        {isStreaming || !showCompleted ? (
          <motion.div
            key="streaming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="streaming-text"
          >
            <span className="streaming-content" style={{ whiteSpace: "pre-wrap" }}>
              {text}
              <span className="streaming-cursor" />
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={COMPLETED_SPRING}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={codeComponents}
            >
              {text}
            </ReactMarkdown>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
