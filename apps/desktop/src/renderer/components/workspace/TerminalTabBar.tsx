import { useCallback, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, X, Terminal } from "lucide-react"
import { useTerminalTabStore } from "@/stores/terminal-tab-store"

export function TerminalTabBar() {
  const tabs = useTerminalTabStore((s) => s.tabs)
  const activeTabId = useTerminalTabStore((s) => s.activeTabId)
  const setActiveTab = useTerminalTabStore((s) => s.setActiveTab)
  const removeTab = useTerminalTabStore((s) => s.removeTab)
  const addTab = useTerminalTabStore((s) => s.addTab)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [tabs.length])

  const handleAddTab = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    addTab()
  }, [addTab])

  const handleRemoveTab = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    removeTab(id)
  }, [removeTab])

  if (tabs.length === 0) return null

  return (
    <div className="flex items-center border-b border-white/[0.04] bg-[#0c0c0d]">
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none gap-px"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap transition-all group
              ${activeTabId === tab.id
                ? "text-white/80 bg-white/[0.04]"
                : "text-white/30 hover:text-white/50 hover:bg-white/[0.02]"
              }`}
          >
            {activeTabId === tab.id && (
              <motion.div
                layoutId="terminal-tab-active"
                className="absolute inset-0 bg-white/[0.04]"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <Terminal className="h-3 w-3 shrink-0 relative" />
            <span className="relative truncate max-w-28">{tab.label}</span>
            <motion.span
              role="button"
              onClick={(e) => handleRemoveTab(e, tab.id)}
              className="relative ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.15 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <X className="h-2.5 w-2.5" />
            </motion.span>
          </button>
        ))}
      </div>
      <button
        onClick={handleAddTab}
        className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
        title="New terminal"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}
