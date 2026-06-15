import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Globe, X, Plus } from 'lucide-react'
import { getTransition } from './motion-tokens'

function useReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduced
}
import type { BrowserTab } from '@/stores/browser-store'

interface TabBarProps {
  tabs: BrowserTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
}

function getFavicon(url: string): string | null {
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=16`
  } catch {
    return null
  }
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: TabBarProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === 'left' ? -100 : 100, behavior: 'smooth' })
    }
  }, [])

  return (
    <div className="flex items-center border-b border-white/[0.06] bg-[#0c0c0d]/30">
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Browser tabs"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab, i) => (
            <motion.div
              key={tab.id}
              layout
              initial={reduced ? undefined : { opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={reduced ? undefined : { opacity: 0, width: 0, overflow: 'hidden' }}
              transition={reduced ? { duration: 0 } : getTransition('quick')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] border-r border-white/[0.04] cursor-pointer shrink-0 transition-colors group',
                'max-w-40',
                activeTabId === tab.id
                  ? 'bg-white/[0.04] text-white/80 border-b-2 border-b-blue-400'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]',
                dragOverId === tab.id ? 'opacity-50' : '',
              )}
              role="tab"
              aria-selected={activeTabId === tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDragOver={e => { e.preventDefault(); setDragOverId(tab.id) }}
              onDragLeave={() => setDragOverId(null)}
            >
              {tab.url === 'about:blank' ? (
                <Globe className="h-3 w-3 shrink-0 opacity-50" />
              ) : (
                <img
                  src={getFavicon(tab.url) ?? undefined}
                  alt=""
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <span className="truncate">{tab.title || tab.url || 'New Tab'}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] hover:text-white/80 transition-all shrink-0 ml-0.5"
                aria-label={`Close ${tab.title || tab.url || 'tab'}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        onClick={onNewTab}
        className="flex items-center justify-center h-full px-2 text-white/20 hover:text-white/50 hover:bg-white/[0.03] transition-colors shrink-0"
        aria-label="New tab"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}
