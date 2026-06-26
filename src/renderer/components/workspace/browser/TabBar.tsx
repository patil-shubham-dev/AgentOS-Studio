import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Globe, X, Plus, Loader2 } from 'lucide-react'
import { getTransition, getSpringConfig } from '@/lib/motion'
import { useReducedMotion } from '@/lib/reduced-motion'
import type { BrowserTab } from '@/stores/browser-store'

interface TabBarProps {
  tabs: BrowserTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
}

interface ContextMenuState {
  tabId: string
  x: number
  y: number
}

const FAVICON_CACHE = new Map<string, string>()

function getFavicon(url: string): string | null {
  if (url === 'about:blank') return null
  try {
    const u = new URL(url)
    const cached = FAVICON_CACHE.get(u.hostname)
    if (cached) return cached
    const fav = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=16`
    FAVICON_CACHE.set(u.hostname, fav)
    return fav
  } catch {
    return null
  }
}

function useKeyboardShortcuts(
  tabs: BrowserTab[],
  activeTabId: string | null,
  onCloseTab: (id: string) => void,
  onSelectTab: (id: string) => void,
  onNewTab: () => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey
      if (isMod && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) onCloseTab(activeTabId)
      }
      if (isMod && e.key === 't') {
        e.preventDefault()
        onNewTab()
      }
      if (isMod && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        if (idx > 0) onSelectTab(tabs[idx - 1].id)
      }
      if (isMod && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        if (idx < tabs.length - 1) onSelectTab(tabs[idx + 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tabs, activeTabId, onCloseTab, onSelectTab, onNewTab])
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: TabBarProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { reducedMotion: reduced } = useReducedMotion()

  useKeyboardShortcuts(tabs, activeTabId, onCloseTab, onSelectTab, onNewTab)

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === 'left' ? -100 : 100, behavior: 'smooth' })
    }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ tabId, x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleCloseOther = useCallback(() => {
    if (!contextMenu) return
    tabs.forEach((t) => {
      if (t.id !== contextMenu.tabId) onCloseTab(t.id)
    })
    setContextMenu(null)
  }, [contextMenu, tabs, onCloseTab])

  const handleCloseRight = useCallback(() => {
    if (!contextMenu) return
    const idx = tabs.findIndex((t) => t.id === contextMenu.tabId)
    tabs.slice(idx + 1).forEach((t) => onCloseTab(t.id))
    setContextMenu(null)
  }, [contextMenu, tabs, onCloseTab])

  useEffect(() => {
    if (contextMenu) {
      const handler = () => setContextMenu(null)
      window.addEventListener('click', handler)
      return () => window.removeEventListener('click', handler)
    }
  }, [contextMenu])

  const hasScroll = scrollRef.current && scrollRef.current.scrollWidth > scrollRef.current.clientWidth

  return (
    <div className="flex items-center border-b border-white/[0.06] bg-[#0c0c0d]/30">
      {hasScroll && (
        <button
          onClick={() => scrollTabs('left')}
          className="shrink-0 px-1 text-white/20 hover:text-white/50 hover:bg-white/[0.03] transition-colors"
          aria-label="Scroll tabs left"
        >
          <span className="text-[9px]">‹</span>
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Browser tabs"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <motion.div
              key={tab.id}
              layout
              initial={reduced ? undefined : { opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={reduced ? undefined : { opacity: 0, width: 0, overflow: 'hidden' }}
              transition={reduced ? { duration: 0 } : getTransition('quick')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] border-r border-white/[0.04] cursor-pointer shrink-0 group relative',
                'max-w-44 min-w-[60px]',
                activeTabId === tab.id
                  ? 'bg-white/[0.04] text-white/80'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]',
                dragOverId === tab.id ? 'opacity-50' : '',
              )}
              role="tab"
              aria-selected={activeTabId === tab.id}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onDragOver={e => { e.preventDefault(); setDragOverId(tab.id) }}
              onDragLeave={() => setDragOverId(null)}
            >
              {/* Active tab indicator bar */}
              <motion.div
                layoutId="activeTabIndicator"
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-[2px] rounded-full",
                  activeTabId === tab.id ? "bg-gradient-to-r from-blue-400 to-cyan-400" : "hidden",
                )}
                transition={getSpringConfig('snappy')}
              />
              {tab.url === 'about:blank' ? (
                <Globe className="h-3 w-3 shrink-0 opacity-40" />
              ) : (
                <img
                  src={getFavicon(tab.url) ?? undefined}
                  alt=""
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <span className="truncate text-[10px] font-medium">{tab.title || tab.url || 'New Tab'}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                className={cn(
                  "rounded p-0.5 transition-all shrink-0 ml-0.5",
                  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                  "hover:bg-white/[0.08] hover:text-white/80",
                  activeTabId === tab.id && "opacity-40 group-hover:opacity-100",
                )}
                aria-label={`Close ${tab.title || tab.url || 'tab'}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {hasScroll && (
        <button
          onClick={() => scrollTabs('right')}
          className="shrink-0 px-1 text-white/20 hover:text-white/50 hover:bg-white/[0.03] transition-colors"
          aria-label="Scroll tabs right"
        >
          <span className="text-[9px]">›</span>
        </button>
      )}
      <motion.button
        onClick={onNewTab}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="flex items-center justify-center h-full px-2.5 text-white/20 hover:text-white/50 hover:bg-white/[0.03] transition-colors shrink-0"
        aria-label="New tab"
      >
        <Plus className="h-3 w-3" />
      </motion.button>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[100] min-w-[160px] rounded-lg border border-white/[0.08] bg-[#0d0d0e] shadow-2xl shadow-black/40 overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="py-1">
              <button
                onClick={() => { onCloseTab(contextMenu.tabId); setContextMenu(null) }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors text-left"
              >
                <X className="h-3 w-3" />
                Close Tab
              </button>
              <button
                onClick={handleCloseOther}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors text-left"
              >
                <X className="h-3 w-3" />
                Close Other Tabs
              </button>
              <button
                onClick={handleCloseRight}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors text-left"
              >
                <X className="h-3 w-3" />
                Close Tabs to the Right
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
