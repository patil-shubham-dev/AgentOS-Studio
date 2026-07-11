import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { usePaneStore } from "@/stores/pane-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { SendHorizontal, MessageSquare, X, Loader2, Trash2, AlertCircle, WifiOff } from "lucide-react"

interface SideChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const STORAGE_KEY_PREFIX = "aos-sidechat-msgs"

function loadMessages(): SideChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}-global`)
    if (!raw) return []
    return JSON.parse(raw) as SideChatMessage[]
  } catch {
    return []
  }
}

function persistMessages(messages: SideChatMessage[]): void {
  try {
    if (messages.length === 0) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}-global`)
    } else {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}-global`, JSON.stringify(messages.slice(-50)))
    }
  } catch { /* quota exceeded — ignore */ }
}

export function SideChat() {
  const sideChatOpen = usePaneStore((s) => s.sideChatOpen)
  const setSideChatOpen = usePaneStore((s) => s.setSideChatOpen)
  const [messages, setMessages] = useState<SideChatMessage[]>(() =>
    sideChatOpen ? loadMessages() : []
  )
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isConfigured = providerGateway.isConfigured()

  useEffect(() => {
    if (sideChatOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [sideChatOpen])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    persistMessages(messages)
  }, [messages])

  useEffect(() => {
    if (sideChatOpen && messages.length === 0) {
      const restored = loadMessages()
      if (restored.length > 0) {
        setMessages(restored)
      }
    }
  }, [sideChatOpen])

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
    setError(null)

    // Gather context from current session
    const timeline = useTimelineStore.getState()
    const recentContext = Array.from(timeline.agentSessions.values())
      .slice(-2)
      .map((s) => s.streamingText || "")
      .filter(Boolean)
      .join("\n")

    const contextMsg = recentContext
      ? `Current session context (for reference):\n${recentContext.slice(0, 2000)}`
      : ""

    try {
      abortRef.current = new AbortController()

      const result = await providerGateway.chat({
        messages: [
          ...(contextMsg
            ? [{ role: "system" as const, content: `You are a helpful side-chat assistant in an AI coding tool. Answer the user's question concisely based on their current work context.\n\n${contextMsg}` }]
            : [{ role: "system" as const, content: "You are a helpful side-chat assistant in an AI coding tool. Answer the user's question concisely." }]
          ),
          ...messages.slice(-10).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content: userMsg.content },
        ],
        signal: abortRef.current.signal,
        maxTokens: 1024,
        temperature: 0.3,
      })

      if (result.error) {
        setError(result.error.userMessage || result.error.message)
        return
      }

      if (result.content) {
        const assistantMsg: SideChatMessage = {
          id: `sc_${Date.now()}`,
          role: "assistant",
          content: result.content,
        }
        setMessages((prev) => [...prev, assistantMsg])
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Failed to get response")
    } finally {
      setIsThinking(false)
      abortRef.current = null
    }
  }, [input, isThinking, messages])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setIsThinking(false)
  }, [])

  const handleClear = useCallback(() => {
    setMessages([])
    persistMessages([])
    setError(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === "Escape" && isThinking) {
        handleCancel()
      }
    },
    [handleSend, handleCancel, isThinking]
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
            <span className="text-[9px] text-white/20 px-1 py-0.5 rounded bg-white/[0.04] font-mono">
              {";"}
            </span>
            {!isConfigured && (
              <span className="text-[9px] text-amber-400/60 flex items-center gap-0.5">
                <WifiOff className="h-2.5 w-2.5" />
                no provider
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
                title="Clear conversation"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setSideChatOpen(false)}
              className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="overflow-y-auto max-h-80 min-h-[120px] px-3 py-2 space-y-2"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-5 w-5 text-white/10 mb-2" />
              <p className="text-[10px] text-white/20 max-w-[180px] leading-relaxed">
                Ask a question without derailing your main conversation
              </p>
            </div>
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
              <button
                onClick={handleCancel}
                className="ml-auto text-[9px] text-white/20 hover:text-white/50 transition-all"
              >
                Cancel
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] text-red-400/80 bg-red-500/5 mr-6">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{error}</span>
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
              placeholder={isConfigured ? "Ask a side question..." : "No provider configured"}
              rows={1}
              disabled={!isConfigured}
              className="flex-1 bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none resize-none min-h-[20px] max-h-[80px] disabled:opacity-30"
            />
            <button
              onClick={isThinking ? handleCancel : handleSend}
              disabled={(!input.trim() || !isConfigured) && !isThinking}
              className={cn(
                "rounded p-0.5 transition-all",
                isThinking
                  ? "text-red-400/50 hover:text-red-400 hover:bg-red-500/10"
                  : "text-white/30 hover:text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isThinking ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <SendHorizontal className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {!isConfigured && (
            <p className="text-[8px] text-amber-400/40 mt-1 px-1">
              Add a provider in Settings to use side chat
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
