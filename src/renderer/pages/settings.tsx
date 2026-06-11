import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useNavigate, useLocation } from "react-router-dom"
import { InstallPanel } from "@/pages/install-panel"
import { UpdatePanel } from "@/pages/update-panel"
import { ResetPanel } from "@/pages/reset-panel"
import { ProvidersTab } from "@/components/settings/providers-tab"
import { ModelsTab } from "@/components/settings/models-tab"
import { ToolsTab } from "@/components/settings/tools-tab"
import { RuntimeTab } from "@/components/settings/runtime-tab"
import {
  Cpu, Box, Brain, Wrench, Terminal,
  Search, Command, ChevronLeft, Settings2, Package, ArrowUpCircle, Trash2,
} from "lucide-react"
import { WiringIndicator } from "@/components/settings/wiring-indicator"
import { useLeakTracker } from "@/performance/leak-detector"
import type { ElementType } from "react"

interface NavItem {
  id: string
  label: string
  icon: ElementType
  shortcut: string
  description: string
  path?: string
}

const navItems: NavItem[] = [
  { id: "providers", label: "Providers", icon: Cpu, shortcut: "1", description: "AI providers, API keys & endpoints" },
  { id: "models", label: "Models", icon: Box, shortcut: "2", description: "Model selection, config & benchmarks" },
  { id: "tools", label: "MCP Servers", icon: Wrench, shortcut: "3", description: "MCP server connections & tools" },
  { id: "runtime", label: "Runtime", icon: Terminal, shortcut: "4", description: "Execution environment & sandbox config" },
  { id: "install", label: "Installation", icon: Package, shortcut: "5", description: "Install info, storage & shell integration", path: "/settings/install" },
  { id: "update", label: "Updates", icon: ArrowUpCircle, shortcut: "6", description: "App updates & auto-update", path: "/settings/update" },
  { id: "reset", label: "Reset", icon: Trash2, shortcut: "7", description: "Clear data & factory reset", path: "/settings/reset" },
]

export function SettingsPage() {
  useLeakTracker("SettingsPage")
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState("providers")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const pathTab = location.pathname.split("/").pop()
    if (pathTab && ["install", "update", "reset"].includes(pathTab)) {
      setActiveTab(pathTab)
    }
  }, [location.pathname])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((p) => !p)
        setTimeout(() => searchRef.current?.focus(), 100)
      }
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9 && !(e.metaKey || e.ctrlKey)) {
        const item = navItems[num - 1]
        if (item) {
          setActiveTab(item.id)
          if (item.path) navigate(item.path)
        }
      }
      if (e.key === "0" && !(e.metaKey || e.ctrlKey)) {
        setActiveTab("reset")
        navigate("/settings/reset")
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [navigate])

  const handleTabClick = (item: NavItem) => {
    setActiveTab(item.id)
    if (item.path) {
      navigate(item.path)
    }
  }

  const filteredNav = navItems.filter((item) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
                <Search className="h-4 w-4 text-white/40" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search settings..."
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  autoFocus
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                  <Command className="h-2.5 w-2.5" />K
                </kbd>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
                {filteredNav.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => { handleTabClick(item); setSearchOpen(false); setSearchQuery("") }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all",
                        activeTab === item.id
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <div className="flex-1">
                        <span className="font-medium">{item.label}</span>
                        <span className="ml-2 text-xs text-white/40">{item.description}</span>
                      </div>
                      <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/30">
                        {item.shortcut}
                      </kbd>
                    </button>
                  )
                })}
                {filteredNav.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-white/30">
                    No results for "{searchQuery}"
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ width: sidebarCollapsed ? 64 : 240 }}
        className={cn(
          "flex-shrink-0 border-r border-white/5 bg-black/20 backdrop-blur-xl flex flex-col overflow-hidden transition-[width] duration-200"
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 animate-glow">
            <Settings2 className="h-4 w-4 text-blue-400" />
          </div>
          <motion.span
            animate={{ opacity: sidebarCollapsed ? 0 : 1 }}
            className="text-sm font-semibold text-white truncate"
          >
            Settings
          </motion.span>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="ml-auto rounded-lg p-1 text-white/30 hover:text-white hover:bg-white/5 transition-all"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          </button>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/30 hover:bg-white/10 hover:text-white/50 transition-all"
        >
          <Search className="h-3.5 w-3.5" />
          <motion.span animate={{ opacity: sidebarCollapsed ? 0 : 1 }} className="flex-1 text-left">
            Search settings...
          </motion.span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">⌘K</kbd>
        </button>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item)}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all",
                  isActive
                    ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 text-white shadow-sm"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-xl border border-white/10"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <motion.span
                  animate={{
                    opacity: sidebarCollapsed ? 0 : 1,
                    width: sidebarCollapsed ? 0 : "auto",
                  }}
                  className="relative z-10 flex-1 truncate font-medium"
                >
                  {item.label}
                </motion.span>
                {!sidebarCollapsed && (
                  <kbd className="relative z-10 rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/20 font-mono">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            )
          })}
        </nav>
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-black via-[#050508] to-[#0a0a14]">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-3 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <motion.h1
              key={activeTab}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-semibold text-white"
            >
              {navItems.find((n) => n.id === activeTab)?.label || "Settings"}
            </motion.h1>
            <span className="text-xs text-white/20">/</span>
            <span className="text-xs text-white/30 font-mono">
              {navItems.find((n) => n.id === activeTab)?.description}
            </span>
            {/* Live wiring status — visible on Providers, Runtime tabs */}
            {activeTab === "providers" || activeTab === "runtime" ? (
              <div className="ml-4 pl-4 border-l border-white/10">
                <WiringIndicator variant="bar" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {activeTab === "providers" && <div className="p-6 max-w-6xl mx-auto"><ProvidersTab /></div>}
              {activeTab === "models" && <div className="p-6 max-w-6xl mx-auto"><ModelsTab /></div>}
              {activeTab === "tools" && <div className="p-6 max-w-6xl mx-auto"><ToolsTab /></div>}
              {activeTab === "runtime" && <div className="p-6 max-w-6xl mx-auto"><RuntimeTab /></div>}
              {activeTab === "install" && <InstallPanel />}
              {activeTab === "update" && <UpdatePanel />}
              {activeTab === "reset" && <ResetPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
