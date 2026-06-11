import { useRef, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ChevronDown, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "../timeline-store"
import { AssistantResponse } from "./AssistantResponse"
import { UserPill } from "./UserPill"
import { TerminalPane } from "./TerminalPane"
import type { UserMessageEvent } from "../types"
import type { AgentSession } from "../timeline-store"
import { QuickActions } from "../QuickActions"

interface ConversationTimelineProps {
  onSendMessage?: (prompt: string) => void
}

interface ConversationTurn {
  userEvent: UserMessageEvent | null
  sessions: AgentSession[]
}

export function ConversationTimeline({ onSendMessage }: ConversationTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const events = useTimelineStore((s) => s.events)
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [terminalPaneOpen, setTerminalPaneOpen] = useState(false)

  const latestSessionWithTerminals = useMemo(() => {
    for (const [stepId, session] of agentSessions) {
      if (session.terminalOutputs.length > 0) return { stepId, session }
    }
    return null
  }, [agentSessions])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottom) return
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const threshold = 80
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      setIsAtBottom(atBottom)
      setShowScrollButton(!atBottom)
    }
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [])

  const hasItems = events.length > 0 || agentSessions.size > 0

  const conversationTurns: ConversationTurn[] = useMemo(() => {
    const turns: ConversationTurn[] = []
    const correlationMap = new Map<string, string[]>()
    for (const [stepId, session] of agentSessions) {
      if (session.correlationId) {
        const arr = correlationMap.get(session.correlationId) ?? []
        arr.push(stepId)
        correlationMap.set(session.correlationId, arr)
      }
    }

    for (const event of events) {
      if (event.type === "user-message") {
        const userEvent = event as UserMessageEvent
        const correlationKey = userEvent.correlationId ?? userEvent.id
        const sessionIds = correlationMap.get(correlationKey) ?? []
        const sessions = sessionIds.map((sid) => agentSessions.get(sid)).filter(Boolean) as AgentSession[]
        turns.push({ userEvent, sessions })
      }
    }

    return turns
  }, [events, agentSessions])

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className={cn(
          "h-full overflow-y-auto",
          "scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent",
        )}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        <div className="mx-auto max-w-[min(100%,44rem)]">
          {!hasItems ? (
            <QuickActions onActionClick={(prompt) => onSendMessage?.(prompt)} className="py-20" />
          ) : (
            <div className="py-3 space-y-3">
              {conversationTurns.map((turn, idx) => {
                const isLatestTurn = idx === conversationTurns.length - 1
                return (
                  <div
                    key={turn.userEvent?.id ?? `turn-${idx}`}
                    className="space-y-1.5"
                  >
                    {turn.userEvent && (
                      <UserPill
                        content={turn.userEvent.content}
                        timestamp={turn.userEvent.timestamp}
                      />
                    )}
                    {turn.sessions.map((session, sIdx) => (
                      <AssistantResponse
                        key={session.stepId}
                        stepId={session.stepId}
                        isLatest={sIdx === turn.sessions.length - 1 && isLatestTurn}
                        onRetry={onSendMessage}
                        originalInput={turn.userEvent?.content}
                      />
                    ))}
                    {idx < conversationTurns.length - 1 && (
                      <div className="flex items-center gap-2 mx-2 my-3 select-none">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
                        {turn.userEvent && (
                          <span className="text-[7px] text-white/10 font-mono tracking-wider uppercase whitespace-nowrap">
                            {new Date(turn.userEvent.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Terminal pane toggle */}
      {latestSessionWithTerminals && (
        <div className="border-t border-white/[0.04]">
          <button
            onClick={() => setTerminalPaneOpen((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
          >
            <Terminal className="h-3 w-3" />
            <span>Terminal</span>
            <span className="text-[10px] text-white/20 font-mono">{latestSessionWithTerminals.session.terminalOutputs.length} commands</span>
            <span className="ml-auto text-[10px] text-white/20">{terminalPaneOpen ? "Hide" : "Show"}</span>
          </button>
        </div>
      )}

      {/* Terminal pane */}
      {latestSessionWithTerminals && (
        <TerminalPane
          stepId={latestSessionWithTerminals.stepId}
          expanded={terminalPaneOpen}
          onClose={() => setTerminalPaneOpen(false)}
        />
      )}

      {/* Scroll anchor indicator - spring-animated */}
      {showScrollButton && hasItems && (
        <motion.button
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium bg-[#0c0c0d]/95 backdrop-blur-xl border border-white/[0.08] text-white/50 hover:text-white/80 hover:border-white/[0.12] shadow-lg shadow-black/40 transition-colors z-20"
        >
          <ChevronDown className="h-3 w-3" />
          <span>New content below</span>
        </motion.button>
      )}
    </div>
  )
}
