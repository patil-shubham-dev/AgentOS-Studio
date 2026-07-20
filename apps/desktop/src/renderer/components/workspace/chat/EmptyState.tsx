import { motion } from "framer-motion"
import { Sparkles, Search, FileEdit, Bug, RefreshCw, Palette, Globe, Terminal } from "lucide-react"
import { ANIM } from "./chat-animations"

const quickActions = [
  { label: "Fix", icon: Bug, prompt: "/fix " },
  { label: "Explain", icon: FileEdit, prompt: "/explain " },
  { label: "Generate", icon: Sparkles, prompt: "/generate " },
  { label: "Search", icon: Search, prompt: "@code " },
  { label: "Refactor", icon: RefreshCw, prompt: "/refactor " },
  { label: "Design", icon: Palette, prompt: "/design " },
  { label: "Browse", icon: Globe, prompt: "/browse " },
  { label: "Terminal", icon: Terminal, prompt: "/terminal " },
]

interface EmptyStateProps {
  onSendMessage?: (text: string) => void
  className?: string
}

export function EmptyState({ onSendMessage, className = "" }: EmptyStateProps) {
  return (
    <motion.div {...ANIM.fadeIn} className={`flex flex-col items-center justify-center h-full px-6 select-none ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center max-w-sm"
      >
        <div className="relative mb-6">
          <div className="empty-state-icon">
            <Sparkles className="h-7 w-7 text-accent-brand" />
          </div>
          <motion.div
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent-green"
            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <h2 className="text-lg font-semibold mb-1.5 text-primary">
          What can I help with?
        </h2>
        <p className="text-xs mb-6 leading-relaxed text-tertiary">
          Ask me anything about your code, or pick a quick action below
        </p>

        <div className="grid grid-cols-4 gap-2 w-full max-w-xs mb-6">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => onSendMessage?.(action.prompt)}
                className="empty-state-action"
              >
                <Icon className="h-4 w-4" style={{ color: "var(--color-accent-brand)" }} />
                <span className="text-[10px] font-medium text-tertiary">
                  {action.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-quaternary">
          <span className="flex items-center gap-1">
            <kbd className="shortcut-kbd">⌘P</kbd>
            Quick open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="shortcut-kbd">⌘B</kbd>
            Toggle sidebar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="shortcut-kbd">⌘/</kbd>
            Commands
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
