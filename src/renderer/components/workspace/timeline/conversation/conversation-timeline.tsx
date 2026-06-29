import { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { useShallow } from "zustand/shallow"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "../timeline-store"
import { AssistantResponse } from "./AssistantResponse"
import { UserPill } from "./UserPill"
import { TerminalPane } from "./TerminalPane"
import { ReferenceChipRow } from "@/components/workspace/context-refs/ReferenceChip"
import type { UserMessageEvent } from "../types"
import { QuickActions } from "../QuickActions"
import { PremiumEmptyState, getTimelineEmptyState } from "@/components/workspace/premium-empty-state"
import { getSpringConfig } from "@/lib/motion"
import { useReducedMotion } from "@/lib/reduced-motion"

interface ConversationTimelineProps {
  onSendMessage?: (prompt: string) => void
}

interface ConversationTurn {
  userEvent: UserMessageEvent | null
  sessionIds: string[]
}

export function ConversationTimeline({ onSendMessage }: ConversationTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const events = useTimelineStore((s) => s.events)
  const sessionOrder = useTimelineStore((s) => s.sessionOrder)
  const streamingTextsSize = useTimelineStore((s) => s.streamingTexts.size)
  const messageReferences = useTimelineStore((s) => s.messageReferences)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [terminalPaneOpen, setTerminalPaneOpen] = useState(false)
  const reduced = useReducedMotion()

  const latestTerminalInfo = useTimelineStore(
    useShallow((s) => {
      for (const stepId of s.sessionOrder) {
        const session = s.agentSessions.get(stepId)
        if (session && session.terminalOutputs.length > 0) {
          return { stepId, terminalCount: session.terminalOutputs.length }
        }
      }
      return null
    })
  )

  // Smart scroll anchoring: auto-scroll to bottom when new content arrives,
  // but only if user is already at or near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottom) return
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [isAtBottom, events.length, streamingTextsSize])

  // Scroll to bottom smoothly on new event or text
  useEffect(() => {
    if (!isAtBottom || !bottomRef.current) return
    bottomRef.current.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })
  }, [events.length, streamingTextsSize, isAtBottom, reduced])

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

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduced ? "auto" : "smooth",
    })
  }, [reduced])

  const hasItems = events.length > 0 || sessionOrder.length > 0

  const emptyStateConfig = useMemo(
    () => getTimelineEmptyState(onSendMessage ? (text) => onSendMessage(text) : undefined),
    [onSendMessage]
  )

  const conversationTurns: ConversationTurn[] = useMemo(() => {
    const sessions = useTimelineStore.getState().agentSessions
    const turns: ConversationTurn[] = []
    const correlationMap = new Map<string, string[]>()
    for (const stepId of sessionOrder) {
      const session = sessions.get(stepId)
      if (session?.correlationId) {
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
        turns.push({ userEvent, sessionIds })
      }
    }

    return turns
  }, [events, sessionOrder])

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
            <PremiumEmptyState
              config={emptyStateConfig}
              className="py-20"
            />
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
                      <>
                        {(() => {
                          const refs = messageReferences.get(turn.userEvent.correlationId ?? turn.userEvent.id)
                          return refs && refs.length > 0 ? (
                            <ReferenceChipRow references={refs} />
                          ) : null
                        })()}
                        <UserPill
                          content={turn.userEvent.content}
                          timestamp={turn.userEvent.timestamp}
                        />
                      </>
                    )}
                    {turn.sessionIds.map((sid, sIdx) => (
                      <AssistantResponse
                        key={sid}
                        stepId={sid}
                        isLatest={sIdx === turn.sessionIds.length - 1 && isLatestTurn}
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
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Terminal pane toggle */}
      {latestTerminalInfo && (
        <div className="border-t border-white/[0.04]">
          <button
            onClick={() => setTerminalPaneOpen((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
          >
            <Terminal className="h-3 w-3" />
            <span>Terminal</span>
            <span className="text-[10px] text-white/20 font-mono">{latestTerminalInfo.terminalCount} commands</span>
            <span className="ml-auto text-[10px] text-white/20">{terminalPaneOpen ? "Hide" : "Show"}</span>
          </button>
        </div>
      )}

      {/* Terminal pane */}
      {latestTerminalInfo && (
        <TerminalPane
          stepId={latestTerminalInfo.stepId}
          expanded={terminalPaneOpen}
          onClose={() => setTerminalPaneOpen(false)}
        />
      )}

      {/* Scroll anchor indicator - spring-animated */}
      <AnimatePresence>
        {showScrollButton && hasItems && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={getSpringConfig("stiff")}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium bg-[#0c0c0d]/95 backdrop-blur-xl border border-white/[0.08] text-white/50 hover:text-white/80 hover:border-white/[0.12] shadow-lg shadow-black/40 transition-colors z-20"
          >
            <ChevronDown className="h-3 w-3" />
            <span>New content below</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
