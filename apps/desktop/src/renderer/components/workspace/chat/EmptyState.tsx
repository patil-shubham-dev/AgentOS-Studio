import { motion } from "framer-motion"
import { Sparkles, Command, Search, FileEdit, Bug, RefreshCw, Palette, Globe, Terminal } from "lucide-react"
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
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-brand-muted)", border: "1px solid var(--color-accent-brand-border)" }}
          >
            <Sparkles className="h-7 w-7" style={{ color: "var(--color-accent-brand)" }} />
          </div>
          <motion.div
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full"
            style={{ backgroundColor: "var(--color-accent-green)" }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <h2 className="text-lg font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
          What can I help with?
        </h2>
        <p className="text-xs mb-6 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Ask me anything about your code, or pick a quick action below
        </p>

        <div className="grid grid-cols-4 gap-2 w-full max-w-xs mb-6">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => onSendMessage?.(action.prompt)}
                className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-150 group cursor-pointer"
                style={{
                  backgroundColor: "var(--color-accent-brand-muted)",
                  border: "1px solid transparent",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-accent-brand-border)"; e.currentTarget.style.backgroundColor = "var(--color-accent-brand-muted)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent-brand-muted)" }}
              >
                <Icon className="h-4 w-4" style={{ color: "var(--color-accent-brand)" }} />
                <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                  {action.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-quaternary)" }}>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded text-[8px] font-mono" style={{ backgroundColor: "var(--surface-panel)", border: "1px solid var(--border-default)" }}>⌘P</kbd>
            Quick open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded text-[8px] font-mono" style={{ backgroundColor: "var(--surface-panel)", border: "1px solid var(--border-default)" }}>⌘B</kbd>
            Toggle sidebar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded text-[8px] font-mono" style={{ backgroundColor: "var(--surface-panel)", border: "1px solid var(--border-default)" }}>⌘/</kbd>
            Commands
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
