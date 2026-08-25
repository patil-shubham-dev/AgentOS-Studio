import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import {
  Command, File, Settings, PanelLeft, PanelRight, X,
  Globe, Palette, RefreshCw, Search, GitBranch, LayoutDashboard,
  MessageSquare, Layers, HelpCircle, GitPullRequest,
} from "lucide-react"
import { ShortcutHint } from "@/components/ui/ShortcutHint"

interface CommandItem {
  id: string
  label: string
  description: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  category: string
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  context: {
    navigate: ReturnType<typeof useNavigate>
    toggleExplorer: () => void
    toggleTerminal: () => void
    toggleSearch: () => void
    closeTab: () => void
    refreshTree: () => void
    switchPanel: (panel: string) => void
  }
}

const SHORTCUT_ALIASES: Record<string, string> = {
  "⌘b": "ctrl+b",
  "⌘j": "ctrl+j",
  "⌘p": "ctrl+p",
  "⌘w": "ctrl+w",
  "⌘s": "ctrl+s",
  "⌘;": "ctrl+;",
  "⌘⇧p": "ctrl+shift+p",
  "⌘⇧f": "ctrl+shift+f",
  "⌘⇧e": "ctrl+shift+e",
  "⌘⇧b": "ctrl+shift+b",
  "⌘⇧m": "ctrl+shift+m",
  "⌘⇧s": "ctrl+shift+s",
  "⌘⇧z": "ctrl+shift+z",
  "⌘⇧n": "ctrl+shift+n",
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const haystack = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < haystack.length && qi < q.length; ti++) {
    if (q[qi] === haystack[ti]) qi++
  }
  return qi === q.length
}

function matchShortcut(query: string, shortcut?: string): boolean {
  if (!shortcut) return false
  const q = query.toLowerCase().replace(/ /g, "+")
  const s = shortcut.toLowerCase()
  if (s.includes(q)) return true
  const alias = SHORTCUT_ALIASES[q]
  if (alias && s.includes(alias)) return true
  if (q.includes(s.replace("ctrl+", ""))) return true
  return false
}

function HelpOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-3 py-3 space-y-2"
    >
      <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider">Keyboard Shortcuts</p>
      <div className="space-y-1.5">
        {[
          { keys: "⌘P", desc: "Quick open files" },
          { keys: "⌘⇧P", desc: "Command palette" },
          { keys: "⌘B", desc: "Toggle explorer" },
          { keys: "⌘J", desc: "Toggle panel" },
          { keys: "⌘;", desc: "Toggle side chat" },
          { keys: "⌘⇧S", desc: "Session sidebar" },
          { keys: "⌘⇧F", desc: "Search in files" },
          { keys: "⌘W", desc: "Close tab" },
          { keys: "⌘S", desc: "Save file" },
          { keys: "F5", desc: "Refresh file tree" },
        ].map(({ keys, desc }) => (
          <div key={keys} className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">{desc}</span>
            <ShortcutHint keys={keys} size="sm" />
          </div>
        ))}
      </div>
      <p className="text-[9px] text-white/20 mt-3 text-center">Press Esc to close</p>
    </motion.div>
  )
}

export function CommandPalette({ open, onClose, context }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const commands: CommandItem[] = useMemo(() => [
    {
      id: "search-files",
      label: "Search Across Files",
      description: "Search file contents and filenames",
      shortcut: "Ctrl+Shift+F",
      icon: <Search className="h-3.5 w-3.5" />,
      action: () => { context.toggleSearch(); onClose() },
      category: "Navigate",
    },
    {
      id: "toggle-explorer",
      label: "Toggle Explorer Sidebar",
      description: "Show or hide the file explorer panel",
      shortcut: "Ctrl+B",
      icon: <PanelLeft className="h-3.5 w-3.5" />,
      action: () => { context.toggleExplorer(); onClose() },
      category: "View",
    },
    {
      id: "toggle-workspace-panel",
      label: "Toggle Workspace Panel",
      description: "Show or hide the right side workspace panel",
      shortcut: "Ctrl+J",
      icon: <PanelRight className="h-3.5 w-3.5" />,
      action: () => { context.toggleTerminal(); onClose() },
      category: "View",
    },
    {
      id: "close-tab",
      label: "Close Current Tab",
      description: "Close the active editor tab",
      shortcut: "Ctrl+W",
      icon: <X className="h-3.5 w-3.5" />,
      action: () => { context.closeTab(); onClose() },
      category: "File",
    },
    {
      id: "switch-code",
      label: "Code Workspace",
      description: "Switch to code editor view",
      shortcut: "Ctrl+Shift+E",
      icon: <File className="h-3.5 w-3.5" />,
      action: () => { context.switchPanel("code"); onClose() },
      category: "View",
    },
    {
      id: "switch-browser",
      label: "Browser Workspace",
      description: "Switch to browser preview view",
      shortcut: "Ctrl+Shift+B",
      icon: <Globe className="h-3.5 w-3.5" />,
      action: () => { context.switchPanel("browser"); onClose() },
      category: "View",
    },
    {
      id: "switch-design",
      label: "Design Workspace",
      description: "Switch to design/UI view",
      shortcut: "Ctrl+Shift+M",
      icon: <Palette className="h-3.5 w-3.5" />,
      action: () => { context.switchPanel("design"); onClose() },
      category: "View",
    },
    {
      id: "open-settings",
      label: "Open Settings",
      description: "Configure providers, appearance, and preferences",
      icon: <Settings className="h-3.5 w-3.5" />,
      action: () => { context.navigate("/settings"); onClose() },
      category: "System",
    },
    {
      id: "open-dashboard",
      label: "Dashboard",
      description: "Go to the main control center dashboard",
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
      action: () => { context.navigate("/dashboard"); onClose() },
      category: "System",
    },
    {
      id: "view-git",
      label: "Git Integration",
      description: "View git status, commits, and branches",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      action: () => { context.navigate("/git"); onClose() },
      category: "System",
    },
    {
      id: "issue-to-pr",
      label: "Issue → Pull Request",
      description: "Create a pull request from a GitHub issue",
      icon: <GitPullRequest className="h-3.5 w-3.5" />,
      action: () => {
        import("@/stores/issue-pr-store").then(({ useIssuePRStore }) => {
          useIssuePRStore.getState().setOpen(true)
        })
        onClose()
      },
      category: "System",
    },
    {
      id: "refresh-tree",
      label: "Refresh File Tree",
      description: "Reload the workspace file tree",
      shortcut: "F5",
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      action: () => { context.refreshTree(); onClose() },
      category: "File",
    },
    {
      id: "open-side-chat",
      label: "Toggle Side Chat",
      description: "Open chat for contextual questions without derailing",
      shortcut: "Ctrl+;",
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      action: () => {
        import("@/stores/pane-store").then(({ usePaneStore }) => {
          usePaneStore.getState().toggleSideChat()
        })
        onClose()
      },
      category: "View",
    },
  ], [context, onClose])

  const filtered = useMemo(() => {
    if (!query.trim() || showHelp) return []
    return commands.filter((cmd) => {
      const textMatch = fuzzyMatch(query, cmd.label + " " + cmd.description + " " + cmd.category)
      const shortcutMatch = matchShortcut(query, cmd.shortcut)
      return textMatch || shortcutMatch
    })
  }, [query, commands, showHelp])

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const cmd of filtered) {
      const list = map.get(cmd.category) ?? []
      list.push(cmd)
      map.set(cmd.category, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      setShowHelp(false)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (el) el.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      if (showHelp) { setShowHelp(false); return }
      onClose()
      return
    }
    if (e.key === "?" && !query.trim()) {
      e.preventDefault()
      setShowHelp(!showHelp)
      return
    }
    if (showHelp) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].action()
    }
  }, [filtered, selectedIndex, onClose, showHelp])

  const totalResults = filtered.length

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="absolute inset-0 z-50 flex"
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative mx-auto mt-16 w-full max-w-lg bg-[#111114] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[60vh]"
      >
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2.5">
          <Command className="h-4 w-4 text-white/30 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={showHelp ? "" : "Type a command or shortcut..."}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white/80 placeholder:text-white/20 font-mono"
          />
          {!showHelp && !query.trim() && (
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-all shrink-0"
            >
              <HelpCircle className="h-3 w-3" />
              <span>?</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results / Help */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto min-h-0 py-1">
          {showHelp ? (
            <HelpOverlay />
          ) : groups.length === 0 && query.trim() ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Command className="h-6 w-6 text-white/10 mb-2" />
              <p className="text-xs text-white/30">No commands found</p>
              <p className="text-[10px] text-white/20 mt-1">Try a different term or type "<span className="font-mono">?</span>" for shortcuts</p>
            </div>
          ) : groups.length === 0 ? null : (
            groups.map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1 text-[9px] font-medium text-white/20 uppercase tracking-wider">
                  {category}
                </div>
                {items.map((cmd) => {
                  const globalIdx = filtered.indexOf(cmd)
                  return (
                    <button
                      key={cmd.id}
                      data-index={globalIdx}
                      onClick={() => cmd.action()}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-1.5 text-left transition-all",
                        selectedIndex === globalIdx ? "bg-blue-500/10" : "hover:bg-white/[0.03]",
                      )}
                    >
                      <span className="text-blue-400/50 shrink-0">{cmd.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-white/70">{cmd.label}</span>
                        {!query.trim() && (
                          <span className="text-[9px] text-white/30 ml-2">{cmd.description}</span>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <ShortcutHint
                          keys={cmd.shortcut
                            .replace("Ctrl+Shift+", "⌘⇧")
                            .replace("Ctrl+", "⌘")
                            .replace("Shift+", "⇧+")
                          }
                          size="sm"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-white/[0.04] bg-white/[0.02]">
          <span className="text-[9px] text-white/20 font-mono">
            {showHelp ? "Keyboard shortcuts" : `${totalResults} command${totalResults !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-2 ml-auto text-[9px] text-white/20 font-mono">
            <span className="flex items-center gap-0.5 bg-white/[0.04] px-1 py-0.5 rounded">
              ↑↓
            </span>
            <span className="hidden sm:inline">Navigate</span>
            <span className="flex items-center gap-0.5 bg-white/[0.04] px-1 py-0.5 rounded">
              ↵
            </span>
            <span className="hidden sm:inline">Execute</span>
            <span className="flex items-center gap-0.5 bg-white/[0.04] px-1 py-0.5 rounded">
              ⎋
            </span>
            <span className="hidden sm:inline">Close</span>
            <span className="flex items-center gap-0.5 bg-white/[0.04] px-1 py-0.5 rounded text-blue-400/50">
              ?
            </span>
            <span>Help</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
