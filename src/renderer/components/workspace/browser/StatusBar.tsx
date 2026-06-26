import { motion, AnimatePresence } from "framer-motion"
import { cn } from '@/lib/utils'
import { Globe, Loader2, Zap } from 'lucide-react'
import type { BrowserSession, BrowserTab } from '@/stores/browser-store'

type ConnectionStatus = 'connected' | 'disconnected' | 'busy' | 'idle' | 'error'

interface StatusBarProps {
  activeSession: BrowserSession | null | undefined
  activeTab: BrowserTab | null | undefined
  actionCount: number
  isRunning: boolean
  connectionStatus: ConnectionStatus
}

const STATUS_CONFIG: Record<ConnectionStatus, { dot: string; dotAnim: string; label: string }> = {
  connected: { dot: 'bg-green-400', dotAnim: 'shadow-[0_0_6px_2px] shadow-green-400/30', label: 'Connected' },
  disconnected: { dot: 'bg-red-400', dotAnim: '', label: 'Disconnected' },
  busy: { dot: 'bg-blue-400', dotAnim: 'animate-pulse shadow-[0_0_8px_2px] shadow-blue-400/20', label: 'Running' },
  idle: { dot: 'bg-white/20', dotAnim: '', label: 'Idle' },
  error: { dot: 'bg-red-400', dotAnim: 'animate-pulse shadow-[0_0_6px_2px] shadow-red-400/20', label: 'Error' },
}

export function StatusBar({ activeSession, activeTab, actionCount, isRunning, connectionStatus }: StatusBarProps) {
  const st = STATUS_CONFIG[connectionStatus]

  if (!activeSession) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-center gap-3 border-t border-white/[0.06] bg-[#0c0c0d]/80 px-3 py-1 text-[9px] text-white/30"
      role="status"
      aria-label="Browser status"
    >
      <div className="flex items-center gap-1.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={connectionStatus}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn('inline-block h-1.5 w-1.5 rounded-full transition-shadow', st.dot, st.dotAnim)}
          />
        </AnimatePresence>
        <span className="text-white/50 text-[10px]">
          {activeTab?.title || activeTab?.url
            ? (activeTab.url !== 'about:blank' ? activeTab.url.split('/')[2] || '' : '') || 'Page'
            : 'Browser'}
        </span>
      </div>

      <span className="text-white/[0.08]" aria-hidden="true">|</span>

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Globe className="h-2.5 w-2.5 shrink-0 text-white/20" />
        <span className="truncate font-mono text-white/25">
          {activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : 'Ready'}
        </span>
      </div>

      <AnimatePresence>
        {isRunning && (
          <motion.div
            key="running-indicator"
            initial={{ opacity: 0, x: 8, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 'auto' }}
            exit={{ opacity: 0, x: 8, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1 text-blue-400/60 shrink-0 overflow-hidden whitespace-nowrap"
          >
            <span className="text-white/[0.08]" aria-hidden="true">|</span>
            <Loader2 className="h-2 w-2 animate-spin shrink-0 ml-1" />
            <span className="text-[9px]">Running</span>
          </motion.div>
        )}
      </AnimatePresence>

      {actionCount > 0 && (
        <div className="flex items-center gap-1 text-white/20 shrink-0 ml-auto">
          <Zap className="h-2 w-2" />
          <span className="text-[8px] font-mono">{actionCount}</span>
        </div>
      )}
    </motion.div>
  )
}
