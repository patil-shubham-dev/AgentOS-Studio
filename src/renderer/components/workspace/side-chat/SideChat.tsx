import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { usePaneStore } from "@/stores/pane-store"
import { useAgentStore } from "@/stores/agent-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { SendHorizontal, MessageSquare, X, Loader2 } from "lucide-react"

interface SideChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export function SideChat() {
  const { sideChatOpen, setSideChatOpen } = usePaneStore()
  const [messages, setMessages] = useState<SideChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sideChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [sideChatOpen])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // Keyboard shortcut: Cmd+;
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ";") {
        e.preventDefault()
        setSideChatOpen(!sideChatOpen)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [sideChatOpen, setSideChatOpen])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isThinking) return
    const userMsg: SideChatMessage = {
      id: `sc_${Date.now()}`,
      role: "user",
      content: input.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsThinking(true)

    // Get session context from timeline and agent store
    const timeline = useTimelineStore.getState()
    const sessionContext = Array.from(timeline.agentSessions.values())
      .slice(-3)
      .map((s) => s.streamingText || "")
      .filter(Boolean)
      .join("\n")

    try {
      // Use the existing provider infrastructure for a quick answer
      // For now, simulate a response
      setTimeout(() => {
        const assistantMsg: SideChatMessage = {
          id: `sc_${Date.now()}`,
          role: "assistant",
          content: `I see you're asking about "${userMsg.content.substring(0, 50)}...". The current session has ${sessionContext.length} characters of context available. This side chat lets you ask questions without derailing your main conversation.`,
        }
        setMessages((prev) => [...prev, assistantMsg])
        setIsThinking(false)
      }, 800)
    } catch {
      setIsThinking(false)
    }
  }, [input, isThinking])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  if (!sideChatOpen) return null

  return (
    <div className="fixed bottom-0 right-4 z-50 w-96">
      <div className="rounded-t-xl border border-white/[0.08] border-b-0 bg-[#0d0d0e] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/[0.04]">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-medium text-white/60">Side Chat</span>
            <span className="text-[9px] text-white/20 px-1 py-0.5 rounded bg-white/[0.04]">
              {";"}
            </span>
          </div>
          <button
            onClick={() => setSideChatOpen(false)}
            className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="overflow-y-auto max-h-80 min-h-[120px] px-3 py-2 space-y-2"
        >
          {messages.length === 0 ? (
            <p className="text-[10px] text-white/20 text-center py-6">
              Ask a question without derailing your main conversation
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-blue-500/10 text-blue-200 ml-6"
                    : "bg-white/[0.04] text-white/70 mr-6"
                )}
              >
                {msg.content}
              </div>
            ))
          )}
          {isThinking && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/30 px-2.5 py-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Thinking...
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-2 pb-2">
          <div className="flex items-end gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1.5 focus-within:border-blue-500/30 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a side question..."
              rows={1}
              className="flex-1 bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none resize-none min-h-[20px] max-h-[80px]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="rounded p-0.5 text-white/30 hover:text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <SendHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
