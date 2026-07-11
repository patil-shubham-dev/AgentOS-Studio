import { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { useShallow } from "zustand/shallow"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "../timeline/timeline-store"
import { AssistantResponse } from "./AssistantResponse"
import { UserPill } from "./UserPill"
import { TerminalPane } from "./TerminalPane"
import { ReferenceChipRow } from "@/components/workspace/context-refs/ReferenceChip"
import type { UserMessageEvent } from "../timeline/types"
import { QuickActions } from "../timeline/QuickActions"
import { ContextBreakdown } from "./ContextBreakdown"
import { useContextPackSlot } from "@/stores/context-pack-slot"
import { EmptyState } from "./EmptyState"
import { ANIM } from "./chat-animations"
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
  const currentPack = useContextPackSlot((s) => s.currentPack)

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

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottom) return
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    return () => cancelAnimationFrame(raf)
  }, [isAtBottom, events.length, streamingTextsSize])

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
      <div ref={scrollRef}
        className="h-full overflow-y-auto scrollbar-thin"
        style={{ scrollbarColor: "var(--border-subtle) transparent" }}
        role="log" aria-label="Conversation" aria-live="polite"
      >
        <div className="mx-auto" style={{ maxWidth: "min(100%, 46rem)" }}>
          {!hasItems ? (
            <EmptyState onSendMessage={onSendMessage} className="py-16" />
          ) : (
            <div className="py-3 space-y-4">
              {conversationTurns.map((turn, idx) => {
                const isLatestTurn = idx === conversationTurns.length - 1
                return (
                  <motion.div key={turn.userEvent?.id ?? `turn-${idx}`} {...ANIM.fadeIn} className="space-y-2">
                    {turn.userEvent && (
                      <>
                        {(() => {
                          const refs = messageReferences.get(turn.userEvent.correlationId ?? turn.userEvent.id)
                          return refs && refs.length > 0 ? <ReferenceChipRow references={refs} /> : null
                        })()}
                        <UserPill content={turn.userEvent.content} timestamp={turn.userEvent.timestamp} />
                        {currentPack && <ContextBreakdown pack={currentPack} />}
                      </>
                    )}
                    <AssistantResponse key={turn.userEvent?.id ?? `turn-${idx}`}
                      stepIds={turn.sessionIds}
                      isLatest={isLatestTurn}
                      onRetry={onSendMessage}
                      originalInput={turn.userEvent?.content}
                    />
                    {idx < conversationTurns.length - 1 && (
                      <div className="flex items-center gap-3 mx-2 my-4 select-none">
                        <div className="flex-1 h-px" style={{
                          background: "linear-gradient(to right, transparent, var(--border-subtle), transparent)"
                        }} />
                        {turn.userEvent && (
                          <span className="text-[7px] font-mono tracking-wider uppercase whitespace-nowrap"
                            style={{ color: "var(--text-quaternary)" }}
                          >
                            {new Date(turn.userEvent.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {latestTerminalInfo && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setTerminalPaneOpen((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-all"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Terminal className="h-3 w-3" />
            <span>Terminal</span>
            <span className="text-[10px] font-mono" style={{ color: "var(--text-quaternary)" }}>{latestTerminalInfo.terminalCount} commands</span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--text-quaternary)" }}>{terminalPaneOpen ? "Hide" : "Show"}</span>
          </button>
        </div>
      )}

      {latestTerminalInfo && (
        <TerminalPane stepId={latestTerminalInfo.stepId} expanded={terminalPaneOpen} onClose={() => setTerminalPaneOpen(false)} />
      )}

      <AnimatePresence>
        {showScrollButton && hasItems && (
          <motion.button
            {...ANIM.springUp}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-medium shadow-lg backdrop-blur-xl border z-20 transition-colors"
            style={{
              backgroundColor: "var(--surface-elevated)",
              borderColor: "var(--border-default)",
              color: "var(--text-tertiary)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <ChevronDown className="h-3 w-3" />
            <span>New content below</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
