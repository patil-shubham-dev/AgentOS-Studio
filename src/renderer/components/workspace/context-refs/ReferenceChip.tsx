/**
 * ReferenceChip — renders resolved @-context references as compact inline chips
 * in the conversation timeline. Shows the reference type and target with a
 * color-coded badge, and expands on click to show the resolved content.
 */

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText, FolderOpen, Globe, Search, Braces,
  AlertTriangle, GitBranch, Link, ChevronDown, ChevronRight,
} from "lucide-react"
import type { ContextReference } from "@/lib/context-references/ReferenceParser"
import { cn } from "@/lib/utils"

interface ReferenceChipProps {
  type: ContextReference["type"]
  target: string
  qualifier?: string
  content?: string
  error?: string
  durationMs?: number
  onOpen?: () => void
}

const REFERENCE_CONFIG: Record<
  ContextReference["type"],
  { icon: typeof FileText; label: string; color: string; bgColor: string }
> = {
  file: {
    icon: FileText,
    label: "File",
    color: "text-cyan-400 border-cyan-500/20",
    bgColor: "bg-cyan-500/8 hover:bg-cyan-500/12",
  },
  folder: {
    icon: FolderOpen,
    label: "Folder",
    color: "text-blue-400 border-blue-500/20",
    bgColor: "bg-blue-500/8 hover:bg-blue-500/12",
  },
  web: {
    icon: Globe,
    label: "Web",
    color: "text-violet-400 border-violet-500/20",
    bgColor: "bg-violet-500/8 hover:bg-violet-500/12",
  },
  code: {
    icon: Search,
    label: "Code",
    color: "text-emerald-400 border-emerald-500/20",
    bgColor: "bg-emerald-500/8 hover:bg-emerald-500/12",
  },
  lines: {
    icon: Braces,
    label: "Lines",
    color: "text-amber-400 border-amber-500/20",
    bgColor: "bg-amber-500/8 hover:bg-amber-500/12",
  },
  problems: {
    icon: AlertTriangle,
    label: "Problems",
    color: "text-red-400 border-red-500/20",
    bgColor: "bg-red-500/8 hover:bg-red-500/12",
  },
  git: {
    icon: GitBranch,
    label: "Git",
    color: "text-orange-400 border-orange-500/20",
    bgColor: "bg-orange-500/8 hover:bg-orange-500/12",
  },
  symbol: {
    icon: Link,
    label: "Symbol",
    color: "text-pink-400 border-pink-500/20",
    bgColor: "bg-pink-500/8 hover:bg-pink-500/12",
  },
}

export function ReferenceChip({
  type,
  target,
  qualifier,
  content,
  error,
  durationMs,
  onOpen,
}: ReferenceChipProps) {
  const [expanded, setExpanded] = useState(false)
  const config = REFERENCE_CONFIG[type]
  const Icon = config.icon
  const hasExpandableContent = !!content || !!error

  const toggleExpand = useCallback(() => {
    if (hasExpandableContent) {
      setExpanded((v) => !v)
    }
    onOpen?.()
  }, [hasExpandableContent, onOpen])

  const displayTarget = target.length > 50
    ? target.slice(0, 47) + "..."
    : target

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.7 }}
      className="inline-flex flex-col"
    >
      <button
        onClick={toggleExpand}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all",
          config.bgColor,
          error ? "text-red-400 border-red-500/20" : config.color,
          hasExpandableContent && !expanded && "cursor-pointer",
        )}
        title={error ? `Error: ${error}` : `${config.label}: ${target}${qualifier ? ` (${qualifier})` : ""}`}
      >
        <Icon className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate max-w-[120px]">{displayTarget}</span>
        {hasExpandableContent && (
          expanded
            ? <ChevronDown className="h-2 w-2 shrink-0 opacity-50" />
            : <ChevronRight className="h-2 w-2 shrink-0 opacity-50" />
        )}
        {durationMs !== undefined && durationMs > 100 && (
          <span className="text-[7px] opacity-40 ml-0.5">{durationMs}ms</span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {error ? (
              <div className="mt-1 ml-2 px-2 py-1 rounded-md bg-red-500/5 border border-red-500/10">
                <p className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap break-words">
                  {error}
                </p>
              </div>
            ) : content ? (
              <div className="mt-1 ml-2 px-2 py-1 rounded-md bg-black/20 border border-white/[0.04] max-h-[80px] overflow-y-auto">
                <pre className="text-[9px] font-mono text-white/35 whitespace-pre-wrap break-all leading-relaxed">
                  {content.length > 500 ? content.slice(0, 500) + "\n..." : content}
                </pre>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Renders a row of reference chips — used in the UserPill or conversation-timeline */
export function ReferenceChipRow({
  references,
}: {
  references: { type: ContextReference["type"]; target: string; qualifier?: string; content?: string; error?: string; durationMs?: number }[]
}) {
  if (references.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-1 px-1 mb-1"
    >
      {references.map((ref, idx) => (
        <ReferenceChip
          key={`${ref.type}-${ref.target}-${idx}`}
          type={ref.type}
          target={ref.target}
          qualifier={ref.qualifier}
          content={ref.content}
          error={ref.error}
          durationMs={ref.durationMs}
        />
      ))}
    </motion.div>
  )
}
