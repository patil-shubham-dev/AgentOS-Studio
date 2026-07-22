import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useSideChatStore, type SideChatSession } from "@/stores/side-chat-store"
import { cn } from "@/lib/utils"
import {
  X, Send, Maximize2, MessagesSquare, Loader2,
} from "lucide-react"

interface SideChatPanelProps {
  onPromoteToMain?: (sessionId: string) => void
  onSendMessage?: (sessionId: string, input: string) => void
}

function SideChatSessionView({
  session,
  onClose,
  onPromoteToMain,
  onSendMessage,
}: {
  session: SideChatSession
  onClose: () => void
  onPromoteToMain?: (sessionId: string) => void
  onSendMessage?: (sessionId: string, input: string) => void
}) {
  const [input, setInput] = useState("")
  const addMessage = useSideChatStore((s) => s.addMessage)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [session.messages.length])

  const handleSend = useCallback(() => {
    if (!input.trim() || session.isProcessing) return
    const msg = {
      id: `side_msg_${Date.now()}`,
      role: "user" as const,
      content: input.trim(),
      timestamp: Date.now(),
    }
    addMessage(session.id, msg)
    setInput("")
    onSendMessage?.(session.id, msg.content)
  }, [input, session.id, session.isProcessing, addMessage, onSendMessage])

  return (
    <div className="flex flex-col h-full">
      {/* Session header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] shrink-0">
        <MessagesSquare className="h-3 w-3 text-blue-400" />
        <span className="text-[10px] font-medium text-white/60 truncate flex-1">
          {session.title}
        </span>
        {onPromoteToMain && (
          <button
            onClick={() => onPromoteToMain(session.id)}
            className="flex items-center justify-center h-5 w-5 rounded hover:bg-white/[0.06] text-white/20 hover:text-white/50 transition-all"
            title="Promote to main chat"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={onClose}
          className="flex items-center justify-center h-5 w-5 rounded hover:bg-white/[0.06] text-white/20 hover:text-white/50 transition-all"
          title="Close side chat"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "text-[11px] leading-relaxed px-2.5 py-2 rounded-lg",
              msg.role === "user"
                ? "bg-blue-500/10 border border-blue-500/15 text-white/80 ml-4"
                : "bg-white/[0.03] border border-white/[0.06] text-white/60 mr-4",
            )}
          >
            {msg.content}
          </div>
        ))}
        {session.isProcessing && (
          <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-white/40">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="px-3 py-2 border-t border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask a question..."
            disabled={session.isProcessing}
            className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/15 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || session.isProcessing}
            className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SideChatPanel({ onPromoteToMain, onSendMessage }: SideChatPanelProps) {
  const sessions = useSideChatStore((s) => s.sessions)
  const activeSessionId = useSideChatStore((s) => s.activeSessionId)
  const setActiveSession = useSideChatStore((s) => s.setActiveSession)
  const closeSideChat = useSideChatStore((s) => s.closeSideChat)

  if (sessions.length === 0) return null

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[sessions.length - 1]

  return (
    <AnimatePresence>
      {sessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute right-3 bottom-full mb-2 w-[380px] h-[420px] rounded-xl border border-white/[0.08] bg-[#0c0c0d] shadow-2xl shadow-black/60 overflow-hidden z-40 flex flex-col"
        >
          {/* Multi-session tabs */}
          {sessions.length > 1 && (
            <div className="flex items-center gap-1 px-2 pt-2 pb-1 border-b border-white/[0.04] shrink-0">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={cn(
                    "px-2 py-1 rounded text-[9px] font-medium transition-all",
                    s.id === activeSession.id
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-white/30 hover:text-white/50 hover:bg-white/[0.03]",
                  )}
                >
                  {s.title} {s.messages.length > 0 && `(${s.messages.length})`}
                </button>
              ))}
            </div>
          )}

          <SideChatSessionView
            session={activeSession}
            onClose={() => closeSideChat(activeSession.id)}
            onPromoteToMain={onPromoteToMain}
            onSendMessage={onSendMessage}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
