import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { InteractiveTerminalRuntime, getPlatformShell } from "@/runtime/terminal/InteractiveTerminalRuntime"
import type { InteractiveTerminalSession } from "@/runtime/terminal/InteractiveTerminalRuntime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { XtermTerminal, type XtermTerminalHandle } from "./xterm-terminal"
import {
  Terminal, Plus, X, Trash2, Copy, Check,
  SplitSquareVertical, Combine, RotateCcw,
} from "lucide-react"

interface TerminalTab {
  id: string
  cwd: string
  createdAt: number
}

interface TerminalPane {
  paneId: string
  tabId: string
}

type SplitMode = "none" | "horizontal" | "vertical"

let tabCounter = 0

export function TerminalWorkspace() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState<SplitMode>("none")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const sessionsRef = useRef<Map<string, InteractiveTerminalSession>>(new Map())
  const terminalHandlesRef = useRef<Map<string, XtermTerminalHandle>>(new Map())
  const dataBufferRef = useRef<Map<string, string[]>>(new Map())

  const spawnSession = useCallback(async (tabId: string) => {
    try {
      const runtime = InteractiveTerminalRuntime.getInstance()
      const shell = getPlatformShell()
      const session = await runtime.spawn(shell, rootPath)
      sessionsRef.current.set(tabId, session)

      session.onData((data) => {
        const paneKeys = [tabId, `${tabId}--secondary`]
        for (const key of paneKeys) {
          const handle = terminalHandlesRef.current.get(key)
          if (handle) {
            handle.write(data)
          } else {
            const buf = dataBufferRef.current
            const existing = buf.get(key) ?? []
            existing.push(data)
            buf.set(key, existing)
          }
        }
      })

      session.onExit((code) => {
        const msg = `\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`
        const paneKeys = [tabId, `${tabId}--secondary`]
        for (const key of paneKeys) {
          const handle = terminalHandlesRef.current.get(key)
          if (handle) {
            handle.write(msg)
          }
        }
      })
    } catch {
      // session spawn failed
    }
  }, [rootPath])

  const createTab = useCallback(async () => {
    const id = `tab-${++tabCounter}`
    const tab: TerminalTab = {
      id,
      cwd: rootPath ?? "",
      createdAt: Date.now(),
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(id)
    await spawnSession(id)
  }, [rootPath, spawnSession])

  const closeTab = useCallback((tabId: string) => {
    const session = sessionsRef.current.get(tabId)
    if (session) {
      session.kill()
      sessionsRef.current.delete(tabId)
    }
    terminalHandlesRef.current.delete(tabId)
    terminalHandlesRef.current.delete(`${tabId}--secondary`)
    dataBufferRef.current.delete(tabId)
    dataBufferRef.current.delete(`${tabId}--secondary`)

    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId)
      if (filtered.length === 0) {
        setActiveTabId(null)
      } else if (activeTabId === tabId) {
        setActiveTabId(filtered[filtered.length - 1].id)
      }
      return filtered
    })
  }, [activeTabId])

  const clearTerminal = useCallback(() => {
    if (!activeTabId) return
    const handle = terminalHandlesRef.current.get(activeTabId)
    handle?.clear()
  }, [activeTabId])

  const copyOutput = useCallback(() => {
    if (!activeTabId) return
    setCopiedId(activeTabId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [activeTabId])

  const handleTerminalData = useCallback((tabId: string, data: string) => {
    const session = sessionsRef.current.get(tabId)
    if (session) {
      session.write(data)
    }
  }, [])

  const registerPaneRef = useCallback((paneId: string, handle: XtermTerminalHandle | null) => {
    if (handle) {
      terminalHandlesRef.current.set(paneId, handle)
      const buf = dataBufferRef.current.get(paneId)
      if (buf) {
        for (const chunk of buf) {
          handle.write(chunk)
        }
        dataBufferRef.current.delete(paneId)
      }
    } else {
      terminalHandlesRef.current.delete(paneId)
    }
  }, [])

  const restartSession = useCallback(async () => {
    if (!activeTabId) return
    const old = sessionsRef.current.get(activeTabId)
    if (old) {
      old.kill()
      sessionsRef.current.delete(activeTabId)
    }
    await spawnSession(activeTabId)
  }, [activeTabId, spawnSession])

  const initialCreatedRef = useRef(false)

  useEffect(() => {
    if (!initialCreatedRef.current && tabs.length === 0) {
      initialCreatedRef.current = true
      createTab()
    }
  }, [])

  useEffect(() => {
    const sessions = sessionsRef.current
    const handles = terminalHandlesRef.current
    const buffer = dataBufferRef.current

    return () => {
      for (const [, session] of sessions) {
        session.kill()
      }
      sessions.clear()
      handles.clear()
      buffer.clear()
    }
  }, [])

  const toggleSplit = useCallback(() => {
    setSplitMode((prev) => {
      if (prev === "none") return "horizontal"
      if (prev === "horizontal") return "vertical"
      return "none"
    })
  }, [])

  const panes: TerminalPane[] = useMemo(() => {
    if (!activeTabId) return []
    if (splitMode === "none") return [{ paneId: activeTabId, tabId: activeTabId }]
    return [
      { paneId: activeTabId, tabId: activeTabId },
      { paneId: `${activeTabId}--secondary`, tabId: activeTabId },
    ]
  }, [activeTabId, splitMode])

  const handleResize = useCallback((tabId: string, cols: number, rows: number) => {
    const session = sessionsRef.current.get(tabId)
    if (session) {
      session.resize(cols, rows)
    }
  }, [])

  const renderPane = (pane: TerminalPane) => (
    <XtermTerminal
      ref={(handle) => registerPaneRef(pane.paneId, handle)}
      key={pane.paneId}
      sessionId={pane.paneId}
      onData={(data) => handleTerminalData(pane.tabId, data)}
      onResize={(cols, rows) => handleResize(pane.tabId, cols, rows)}
      className="h-full w-full"
    />
  )

  return (
    <div className="flex h-full flex-col bg-[#0a0a0b] min-h-0">
      {/* Terminal tabs bar */}
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-black/20 px-2 py-1 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.length === 0 && (
            <span className="text-[10px] text-white/30 px-2">No terminals</span>
          )}
          <AnimatePresence mode="popLayout">
            {tabs.map((t) => (
              <motion.button
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, width: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={() => setActiveTabId(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 text-[10px] rounded transition-all group",
                  activeTabId === t.id
                    ? "bg-white/[0.06] text-white"
                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]",
                )}
              >
                <Terminal className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate max-w-24">Terminal {t.id.replace("tab-", "")}</span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
                  className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] transition-all text-white/30 hover:text-white/70"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={createTab}
            className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all shrink-0"
            title="New terminal"
          >
            <Plus className="h-3 w-3" />
          </motion.button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={restartSession}
            className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title="Restart"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={toggleSplit}
            className={cn(
              "rounded p-1 transition-all",
              splitMode !== "none"
                ? "text-green-400 bg-white/[0.06]"
                : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]",
            )}
            title={splitMode === "none" ? "Split terminal" : splitMode === "horizontal" ? "Split vertical" : "No split"}
          >
            {splitMode === "none" ? (
              <SplitSquareVertical className="h-3 w-3" />
            ) : (
              <Combine className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={clearTerminal}
            className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={copyOutput}
            className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title="Copy"
          >
            {copiedId === activeTabId ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 bg-black/40">
        {panes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Terminal className="h-8 w-8 text-white/10 mb-3" />
            <p className="text-xs text-white/30">Open a terminal</p>
            <p className="text-[9px] text-white/15 mt-1">Click + to create a new terminal session</p>
          </div>
        ) : splitMode === "none" ? (
          <div className="h-full">
            {renderPane(panes[0])}
          </div>
        ) : (
          <div
            className={cn(
              "flex h-full",
              splitMode === "horizontal" ? "flex-row" : "flex-col",
            )}
          >
            <div className={cn(
              "relative",
              splitMode === "horizontal" ? "w-1/2" : "h-1/2",
            )}>
              {renderPane(panes[0])}
            </div>
            <div
              className={cn(
                "shrink-0",
                splitMode === "horizontal"
                  ? "w-px cursor-col-resize bg-white/[0.06]"
                  : "h-px cursor-row-resize bg-white/[0.06]",
              )}
            />
            <div className={cn(
              "relative",
              splitMode === "horizontal" ? "w-1/2" : "h-1/2",
            )}>
              {renderPane(panes[1])}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
