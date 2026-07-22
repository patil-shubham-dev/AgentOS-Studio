import { memo, useEffect, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Keyboard } from "lucide-react"

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; desc: string }[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Chat",
    shortcuts: [
      { keys: "Enter", desc: "Send message" },
      { keys: "Shift+Enter", desc: "New line" },
      { keys: "Esc", desc: "Cancel / close menus" },
      { keys: "↑", desc: "Edit last message" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Ctrl+K", desc: "Command palette" },
      { keys: "Ctrl+Shift+P", desc: "Toggle plan mode" },
      { keys: "Ctrl+`", desc: "Toggle terminal" },
      { keys: "Alt+←/→", desc: "Navigate back/forward" },
    ],
  },
  {
    title: "Search & Context",
    shortcuts: [
      { keys: "Ctrl+Shift+F", desc: "Search across project" },
      { keys: "@file", desc: "Reference a file" },
      { keys: "@folder", desc: "Reference a folder" },
      { keys: "@web", desc: "Fetch a URL" },
      { keys: "@code", desc: "Code search" },
      { keys: "@git", desc: "Git context" },
    ],
  },
  {
    title: "Slash Commands",
    shortcuts: [
      { keys: "/fix", desc: "Fix bugs or errors" },
      { keys: "/generate", desc: "Generate code" },
      { keys: "/refactor", desc: "Refactor code" },
      { keys: "/explain", desc: "Explain code" },
      { keys: "/test", desc: "Write or run tests" },
      { keys: "/init", desc: "Initialize project config" },
      { keys: "/doctor", desc: "Health diagnostics" },
      { keys: "/commit", desc: "Generate commit message" },
    ],
  },
  {
    title: "View Modes",
    shortcuts: [
      { keys: "Verbose", desc: "Show reasoning + all details" },
      { keys: "Normal", desc: "Show tools + edits + response" },
      { keys: "Summary", desc: "Show only response text" },
    ],
  },
]

export const ShortcutCheatSheet = memo(function ShortcutCheatSheet() {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const toggleHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", toggleHandler)
    return () => window.removeEventListener("keydown", toggleHandler)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  return (
    <>
      <button
        onClick={toggle}
        className="flex items-center justify-center h-6 w-6 rounded-md transition-colors text-white/20 hover:text-white/50 hover:bg-white/[0.04]"
        title="Keyboard shortcuts (? or Ctrl+/)"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="h-3 w-3" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-[90%] max-w-md max-h-[80vh] rounded-xl border overflow-y-auto shadow-2xl"
              style={{
                backgroundColor: "var(--surface-panel)",
                borderColor: "var(--border-default)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 border-b sticky top-0 z-10 backdrop-blur-xl"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--surface-panel)",
                }}
              >
                <Keyboard className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Keyboard Shortcuts
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="ml-auto rounded p-1 transition-colors"
                  style={{ color: "var(--text-quaternary)" }}
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>

              <div className="p-3 space-y-4">
                {GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3
                      className="text-[9px] font-semibold uppercase tracking-wider mb-2 px-1"
                      style={{ color: "var(--text-quaternary)" }}
                    >
                      {group.title}
                    </h3>
                    <div className="space-y-0.5">
                      {group.shortcuts.map((s) => (
                        <div
                          key={s.keys}
                          className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <span className="text-[10px]">{s.desc}</span>
                          <kbd
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-2 shrink-0"
                            style={{
                              backgroundColor: "var(--border-subtle)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {s.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="px-4 py-2.5 border-t text-center"
                style={{ borderColor: "var(--border-default)" }}
              >
                <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
                  Press <kbd style={{ color: "var(--text-tertiary)" }}>Esc</kbd> to close
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
