import { memo, useRef, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { CopyButton } from "@/components/ui/CopyButton"
import type { Components } from "react-markdown"

interface ResponseStreamProps {
  text: string
  isStreaming: boolean
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

/**
 * Lightweight streaming text node with professional transitions.
 * During streaming: append-only DOM (O(1) per token).
 * On completion: smooth crossfade to full ReactMarkdown render.
 */
export const ResponseStream = memo(function ResponseStream({ text, isStreaming }: ResponseStreamProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const appendedLenRef = useRef(0)
  const textRef = useRef(text)
  const [showCompleted, setShowCompleted] = useState(false)

  textRef.current = text

  useEffect(() => {
    if (!isStreaming) return
    const pre = preRef.current
    if (!pre) return
    let codeEl = pre.querySelector("code")
    if (!codeEl) {
      codeEl = document.createElement("code")
      pre.append(codeEl)
    }
    const currentDomLen = codeEl.textContent?.length ?? 0
    if (currentDomLen < appendedLenRef.current) {
      codeEl.textContent = ""
      codeEl.append(document.createTextNode(textRef.current))
      appendedLenRef.current = textRef.current.length
      return
    }
    const newText = text.slice(appendedLenRef.current)
    if (newText) {
      codeEl.append(document.createTextNode(newText))
      appendedLenRef.current = text.length
    }
  })

  useEffect(() => {
    if (!isStreaming) {
      appendedLenRef.current = 0
      // Longer settle to let streaming content finish before crossfade
      const t = setTimeout(() => setShowCompleted(true), 200)
      return () => clearTimeout(t)
    }
    setShowCompleted(false)
  }, [isStreaming])

  if (!text && !isStreaming) return null

  return (
    <div className="prose-claude relative">
      <AnimatePresence mode="wait">
        {isStreaming || !showCompleted ? (
          <motion.div
            key="streaming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="streaming-text"
          >
            <pre
              ref={preRef}
              className="streaming-pre"
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "inherit",
                fontSize: "inherit",
                lineHeight: "inherit",
              }}
            />
            <span className="streaming-cursor" />
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
