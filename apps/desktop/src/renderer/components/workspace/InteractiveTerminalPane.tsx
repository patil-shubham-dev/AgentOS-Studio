import { useRef, useEffect, useCallback, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Terminal, Plus, X, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTerminalTabStore } from "@/stores/terminal-tab-store"
import { XtermTerminal, type XtermTerminalHandle } from "./xterm-terminal"
import { TerminalTabBar } from "./TerminalTabBar"
import { InteractiveTerminalRuntime, getPlatformShell } from "@/runtime/terminal/InteractiveTerminalRuntime"

export const InteractiveTerminalPane = memo(function InteractiveTerminalPane({
  className,
  onClose,
  showDragHandle,
}: {
  className?: string
  onClose?: () => void
  showDragHandle?: boolean
}) {
  const terminalTabs = useTerminalTabStore((s) => s.tabs)
  const activeTabId = useTerminalTabStore((s) => s.activeTabId)
  const setSession = useTerminalTabStore((s) => s.setSession)
  const addTab = useTerminalTabStore((s) => s.addTab)
  const removeTab = useTerminalTabStore((s) => s.removeTab)
  const terminalHandlesRef = useRef<Map<string, XtermTerminalHandle | null>>(new Map())
  const terminalSpawnedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const tab of terminalTabs) {
      if (tab.session || terminalSpawnedRef.current.has(tab.id)) continue
      terminalSpawnedRef.current.add(tab.id)
      const runtime = InteractiveTerminalRuntime.getInstance()
      const shell = getPlatformShell()
      runtime.spawn(shell).then((session) => {
        const handle = terminalHandlesRef.current.get(tab.id)
        session.onData((data) => handle?.write(data))
        session.onExit((code) => {
          handle?.write(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`)
        })
        setSession(tab.id, session)
      }).catch(() => {
        terminalSpawnedRef.current.delete(tab.id)
      })
    }
  }, [terminalTabs, setSession])

  const handleTerminalData = useCallback((data: string) => {
    const state = useTerminalTabStore.getState()
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
    activeTab?.session?.write(data)
  }, [])

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 26, mass: 0.8 }}
      className={cn("flex flex-col overflow-hidden border-t", className)}
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {/* Terminal header bar */}
      <div className="flex items-center gap-1 px-2 py-1 shrink-0" style={{ background: "var(--surface-panel)" }}>
        {showDragHandle && (
          <div className="cursor-grab active:cursor-grabbing p-0.5 text-white/20 hover:text-white/40">
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        <Terminal className="h-3 w-3" style={{ color: "var(--text-quaternary)" }} />
        <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>Terminal</span>
        <div className="flex-1" />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => addTab()}
          className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
          title="New terminal tab"
        >
          <Plus className="h-3 w-3" />
        </motion.button>
        {onClose && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all ml-0.5"
            title="Close terminal"
          >
            <X className="h-3 w-3" />
          </motion.button>
        )}
      </div>

      {/* Tab bar */}
      <TerminalTabBar />

      {/* Terminal instances */}
      <div className="flex-1 min-h-0">
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTabId === tab.id ? "h-full" : "hidden"}
          >
            <XtermTerminal
              sessionId={tab.id}
              onData={handleTerminalData}
              className="h-full"
              ref={(el) => {
                if (el) {
                  terminalHandlesRef.current.set(tab.id, el)
                } else {
                  terminalHandlesRef.current.delete(tab.id)
                }
              }}
            />
          </div>
        ))}
        {terminalTabs.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2 text-center">
              <Terminal className="h-5 w-5 text-white/10" />
              <p className="text-[10px] text-white/20">No terminal sessions</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addTab()}
                className="rounded-lg px-3 py-1 text-[10px] font-medium transition-all"
                style={{
                  color: "var(--color-accent-brand)",
                  background: "color-mix(in srgb, var(--color-accent-brand) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-accent-brand) 20%, transparent)",
                }}
              >
                <Plus className="h-2.5 w-2.5 inline mr-1" />
                Open a terminal
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
})
