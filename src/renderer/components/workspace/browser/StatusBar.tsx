import { cn } from '@/lib/utils'
import { Globe, Loader2 } from 'lucide-react'
import type { BrowserSession, BrowserTab } from '@/stores/browser-store'

type ConnectionStatus = 'connected' | 'disconnected' | 'busy' | 'idle' | 'error'

interface StatusBarProps {
  activeSession: BrowserSession | null | undefined
  activeTab: BrowserTab | null | undefined
  actionCount: number
  isRunning: boolean
  connectionStatus: ConnectionStatus
}

const STATUS_CONFIG: Record<ConnectionStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-green-400', label: 'Connected' },
  disconnected: { dot: 'bg-red-400', label: 'Disconnected' },
  busy: { dot: 'bg-blue-400 animate-pulse', label: 'Running' },
  idle: { dot: 'bg-white/20', label: 'Idle' },
  error: { dot: 'bg-red-400', label: 'Error' },
}

export function StatusBar({ activeSession, activeTab, isRunning, connectionStatus }: StatusBarProps) {
  const st = STATUS_CONFIG[connectionStatus]

  if (!activeSession) return null

  return (
    <div className="flex items-center gap-3 border-t border-white/[0.06] bg-[#0c0c0d]/80 px-3 py-1 text-[9px] text-white/30" role="status" aria-label="Browser status">
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', st.dot)} />
        <span className="text-white/50 text-[10px]">{activeTab?.title || activeTab?.url ? (activeTab.url !== 'about:blank' ? activeTab.url.split('/')[2] || '' : '') || 'Page' : 'Browser'}</span>
      </div>

      <span className="text-white/[0.08]" aria-hidden="true">|</span>

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Globe className="h-2.5 w-2.5 shrink-0 text-white/20" />
        <span className="truncate font-mono text-white/25">
          {activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : 'Ready'}
        </span>
      </div>

      {isRunning && (
        <>
          <span className="text-white/[0.08]" aria-hidden="true">|</span>
          <div className="flex items-center gap-1 text-blue-400/60 shrink-0">
            <Loader2 className="h-2 w-2 animate-spin" />
            <span>Running</span>
          </div>
        </>
      )}
    </div>
  )
}
