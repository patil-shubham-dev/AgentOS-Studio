import { useState, useEffect, memo, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Sparkles, Bug, FileCode, Search, Palette, RefreshCw,
  Terminal, Shield, Zap, type LucideIcon,
} from "lucide-react"

interface QuickAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
  color: string
  bgColor: string
  prompt: string
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    id: "fix-code",
    label: "Fix & Repair",
    description: "Find and fix bugs, errors, or lint issues in the current codebase",
    icon: Bug,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    prompt: "Find and fix any bugs, errors, or lint issues in the codebase",
  },
  {
    id: "explain",
    label: "Explain Code",
    description: "Get a detailed explanation of how the code works",
    icon: Search,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    prompt: "Explain how the codebase works and its architecture",
  },
  {
    id: "generate",
    label: "Generate Code",
    description: "Create new components, functions, or files",
    icon: FileCode,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    prompt: "Generate new code or components for the project",
  },
  {
    id: "refactor",
    label: "Refactor",
    description: "Improve code structure, readability, and maintainability",
    icon: RefreshCw,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    prompt: "Refactor the codebase to improve structure and readability",
  },
  {
    id: "test",
    label: "Write Tests",
    description: "Generate unit tests, integration tests, or test suites",
    icon: Shield,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    prompt: "Write comprehensive tests for the project",
  },
  {
    id: "optimize",
    label: "Optimize",
    description: "Improve performance, reduce bundle size, speed up queries",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    prompt: "Optimize the codebase for performance and efficiency",
  },
  {
    id: "terminal",
    label: "Run Terminal",
    description: "Execute terminal commands and scripts",
    icon: Terminal,
    color: "text-white/70",
    bgColor: "bg-white/5",
    prompt: "Run terminal commands for build, test, or setup",
  },
  {
    id: "design",
    label: "Design UI",
    description: "Generate UI components, layouts, and visual designs",
    icon: Palette,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    prompt: "Design and generate UI components for the project",
  },
]

interface QuickActionsProps {
  onActionClick: (prompt: string) => void
  workspaceName?: string | null
  className?: string
  /** Recent files or context to personalize suggestions */
  recentFiles?: string[]
}

export const QuickActions = memo(function QuickActions({
  onActionClick,
  workspaceName,
  className,
  recentFiles,
}: QuickActionsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showKeyboardHint, setShowKeyboardHint] = useState(false)

  // Show keyboard shortcut hint briefly on mount
  useEffect(() => {
    const timer = setTimeout(() => setShowKeyboardHint(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Context-aware actions based on workspace state
  const contextActions = useMemo(() => {
    const actions = [...DEFAULT_ACTIONS]
    if (recentFiles && recentFiles.length > 0) {
      actions.unshift({
        id: "recent-context",
        label: `Analyze ${recentFiles[0].split("/").pop()}`,
        description: `Deep-dive analysis of ${recentFiles[0]} with suggestions`,
        icon: Search,
        color: "text-indigo-400",
        bgColor: "bg-indigo-500/10",
        prompt: `Analyze ${recentFiles[0]} and suggest improvements`,
      })
    }
    return actions
  }, [recentFiles])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("flex flex-col items-center", className)}
    >
      {/* Icon with glow */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-indigo-500/10 border border-white/[0.06] backdrop-blur-xl mb-4"
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-indigo-500/10 blur-xl opacity-20" />
        <Sparkles className="h-6 w-6 text-blue-400/60 relative z-10" />
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-base font-semibold text-foreground/80 mb-1"
      >
        {workspaceName ? `Working in ${workspaceName}` : "What would you like to do?"}
      </motion.h3>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-xs text-foreground/35 mb-6 text-center max-w-sm leading-relaxed"
      >
        {workspaceName
          ? `Ask me to fix bugs, generate code, refactor, write tests, or explore the codebase.`
          : "Open a workspace or describe what you want to build — I'll help you get started."}
      </motion.p>

      {/* Quick action grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-2 gap-2 w-full max-w-sm px-4"
      >
        {contextActions.map((action, i) => {
          const Icon = action.icon
          const isHovered = hoveredId === action.id
          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.03 }}
              onClick={() => onActionClick(action.prompt)}
              onMouseEnter={() => setHoveredId(action.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all group",
                isHovered
                  ? "border-white/[0.12] bg-white/[0.04] shadow-sm shadow-white/5"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.03]",
              )}
            >
              <div className={cn(
                "flex items-center justify-center h-7 w-7 rounded-lg shrink-0 border transition-all",
                action.bgColor,
                isHovered ? "border-white/[0.1] scale-105" : "border-white/[0.04]",
              )}>
                <Icon className={cn("h-3.5 w-3.5", action.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "text-[11px] font-semibold leading-tight transition-colors",
                  isHovered ? "text-white/80" : "text-white/60",
                )}>
                  {action.label}
                </div>
                <p className="text-[8px] text-white/25 mt-0.5 leading-relaxed line-clamp-2">
                  {action.description}
                </p>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Keyboard shortcut hints with fade-in */}
      <AnimatePresence>
        {showKeyboardHint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-4 mt-6 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
          >
            <div className="flex items-center gap-1.5">
              <kbd className="h-5 min-w-[20px] px-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-[8px] text-white/30 font-mono flex items-center justify-center">/</kbd>
              <span className="text-[8px] text-white/20">Commands</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="h-5 min-w-[20px] px-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-[8px] text-white/30 font-mono flex items-center justify-center">@</kbd>
              <span className="text-[8px] text-white/20">Agents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="h-5 min-w-[20px] px-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-[8px] text-white/30 font-mono flex items-center justify-center">⌘↵</kbd>
              <span className="text-[8px] text-white/20">Send</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="h-5 min-w-[20px] px-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-[8px] text-white/30 font-mono flex items-center justify-center">⌘K</kbd>
              <span className="text-[8px] text-white/20">Commands</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
