import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { execTrace, execTraceId } from "@/runtime/execution-tracer"
import {
  Send, Square, Slash, AtSign, Code2, Palette,
  Globe, Bug, Search, RefreshCw, FileText,
  Terminal, Paperclip, Loader2, Sparkles,
  FolderOpen, GitBranch, AlertTriangle, Braces, Link, X,
} from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import {
  ReferenceAutocomplete,
  getAutocompleteState,
  getFilteredCount,
  insertAutocompleteItem,
  type AutocompleteItem,
} from "@/components/workspace/context-refs/ReferenceAutocomplete"
import { ANIM } from "./chat-animations"

const SLASH_COMMANDS = [
  { id: "/fix", label: "Fix", icon: Bug, description: "Fix bugs or errors in selected code" },
  { id: "/generate", label: "Generate", icon: Code2, description: "Generate new code or components" },
  { id: "/refactor", label: "Refactor", icon: RefreshCw, description: "Refactor existing code" },
  { id: "/explain", label: "Explain", icon: FileText, description: "Explain code or concepts" },
  { id: "/test", label: "Test", icon: Search, description: "Write or run tests" },
  { id: "/design", label: "Design", icon: Palette, description: "Generate UI designs" },
  { id: "/browse", label: "Browse", icon: Globe, description: "Browse or scrape a URL" },
  { id: "/terminal", label: "Terminal", icon: Terminal, description: "Run a terminal command" },
  { id: "/plan", label: "Plan", icon: Sparkles, description: "Plan approach before executing" },
]

const CONTEXT_REFERENCES = [
  { id: "@file", label: "File", icon: FileText, description: "Inject file content", example: "@file path/to/file.ts" },
  { id: "@folder", label: "Folder", icon: FolderOpen, description: "List directory contents", example: "@folder src/" },
  { id: "@web", label: "Web", icon: Globe, description: "Fetch web page", example: "@web https://..." },
  { id: "@code", label: "Code", icon: Search, description: "Search code in project", example: "@code query" },
  { id: "@lines", label: "Lines", icon: Braces, description: "Line range from file", example: "@lines 10-30 in file.ts" },
  { id: "@symbol", label: "Symbol", icon: Link, description: "Find symbol definition", example: "@symbol AuthService" },
  { id: "@git", label: "Git", icon: GitBranch, description: "Git status and changes", example: "@git" },
  { id: "@problems", label: "Problems", icon: AlertTriangle, description: "Workspace diagnostics", example: "@problems" },
]

interface ComposerProps {
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  isProcessing: boolean
  isCancelling?: boolean
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  placeholder?: string
}

export function Composer({
  input,
  onInputChange,
  onSend,
  onCancel,
  isProcessing,
  isCancelling,
  inputRef: externalRef,
  placeholder = "Ask anything...",
}: ComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef || internalRef
  const [showCommands, setShowCommands] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [commandFilter, setCommandFilter] = useState("")
  const [mentionFilter, setMentionFilter] = useState("")
  const [showContextRefs, setShowContextRefs] = useState(false)
  const [contextRefFilter, setContextRefFilter] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [autocompleteState, setAutocompleteState] = useState<{ isOpen: boolean; filter: string; mode: "context" | "agent" | "all" }>({ isOpen: false, filter: "", mode: "all" })
  const pinnedFiles = useWorkspaceStore((s) => s.pinnedFiles)
  const togglePinFile = useWorkspaceStore((s) => s.togglePinFile)
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const sendLockRef = useRef(0)
  const traceIdRef = useRef("")

  const guardedSend = useCallback((source: "enter" | "button") => {
    const traceId = execTraceId()
    traceIdRef.current = traceId
    execTrace("Composer.guardedSend", traceId, { source, inputLen: input.length, processing: isProcessing })
    const now = Date.now()
    if (now - sendLockRef.current < 200) {
      console.warn(`[Composer] Send lock triggered — ignoring duplicate send (traceId=${traceId})`)
      execTrace("Composer.guardedSend-blocked-by-lock", traceId, { source })
      return
    }
    sendLockRef.current = now
    if (isProcessing || isCancelling) onCancel()
    else onSend()
  }, [isProcessing, isCancelling, onCancel, onSend, input.length])

  const handleSendClick = useCallback(() => {
    guardedSend("button")
  }, [guardedSend])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
    return () => cancelAnimationFrame(raf)
  }, [input, textareaRef])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowCommands(false)
        setShowMentions(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => { setSelectedIndex(0) }, [commandFilter, mentionFilter])

  useEffect(() => {
    const state = getAutocompleteState(input)
    setAutocompleteState(state)
    if (!state.isOpen) setAutocompleteIndex(0)
  }, [input])

  function handleChange(value: string) {
    onInputChange(value)
    const lastWord = value.split(/\s/).pop() || ""
    if (lastWord.startsWith("/") && lastWord.length > 0) {
      setShowCommands(true); setCommandFilter(lastWord.slice(1).toLowerCase())
      setShowMentions(false); setShowContextRefs(false)
    } else if (lastWord.startsWith("@") && lastWord.length > 0) {
      const afterAt = lastWord.slice(1).toLowerCase()
      const isContextRef = CONTEXT_REFERENCES.some((r) => r.id.slice(1).startsWith(afterAt))
      const isAgentMention = false
      setShowContextRefs(isContextRef || !isAgentMention)
      setShowMentions(true); setContextRefFilter(afterAt); setMentionFilter(afterAt)
      setShowCommands(false)
    } else {
      setShowCommands(false); setShowMentions(false); setShowContextRefs(false)
    }
  }

  function insertCommand(command: string) {
    const words = input.split(/\s/); words[words.length - 1] = command + " "
    onInputChange(words.join(" ") + " "); setShowCommands(false)
    textareaRef.current?.focus()
  }

  function insertMention(mention: string) {
    const words = input.split(/\s/); words[words.length - 1] = mention + " "
    onInputChange(words.join(" ") + " "); setShowMentions(false); setShowContextRefs(false)
    setAutocompleteState({ isOpen: false, filter: "", mode: "all" })
    textareaRef.current?.focus()
  }

  function handleAutocompleteSelect(item: AutocompleteItem) {
    const newInput = insertAutocompleteItem(input, item)
    onInputChange(newInput); setShowMentions(false); setShowContextRefs(false)
    setAutocompleteState({ isOpen: false, filter: "", mode: "all" })
    textareaRef.current?.focus()
  }

  const filteredCommands = SLASH_COMMANDS.filter((cmd) => cmd.id.slice(1).startsWith(commandFilter))
  const filteredContextRefs = CONTEXT_REFERENCES.filter((r) => r.id.slice(1).startsWith(contextRefFilter))

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, filteredCommands.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)); return }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertCommand(filteredCommands[selectedIndex]?.id || ""); return }
      if (e.key === "Escape") { setShowCommands(false); return }
    }
    if (autocompleteState.isOpen) {
      const totalItems = getFilteredCount(autocompleteState.filter, autocompleteState.mode)
      if (totalItems > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setAutocompleteIndex((p) => Math.min(p + 1, totalItems - 1)); return }
        if (e.key === "ArrowUp") { e.preventDefault(); setAutocompleteIndex((p) => Math.max(p - 1, 0)); return }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); guardedSend("enter") }
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {showCommands && filteredCommands.length > 0 && (
          <motion.div {...ANIM.springUp}
            ref={menuRef}
            role="listbox" aria-label="Slash commands"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border overflow-hidden z-50"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-default)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
          >
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-wider border-b flex items-center"
              style={{ color: "var(--text-quaternary)", borderColor: "var(--border-subtle)" }}
            >
              Commands
              <span className="ml-auto font-normal normal-case" style={{ color: "var(--text-quaternary)" }}>Tab to select</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon
                return (
                  <button key={cmd.id} role="option" aria-selected={idx === selectedIndex}
                    onClick={() => insertCommand(cmd.id)} onMouseEnter={() => setSelectedIndex(idx)}
                    className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all duration-100"
                    style={{ backgroundColor: idx === selectedIndex ? "var(--color-accent-brand-muted)" : "transparent" }}
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-lg shrink-0"
                      style={{ backgroundColor: "var(--color-accent-brand-muted)" }}
                    >
                      <Icon className="h-3 w-3" style={{ color: "var(--color-accent-brand-text)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold font-mono" style={{ color: "var(--text-secondary)" }}>{cmd.id}</span>
                        <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>{cmd.label}</span>
                      </div>
                      <p className="text-[8px] mt-0.5 truncate" style={{ color: "var(--text-quaternary)" }}>{cmd.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReferenceAutocomplete
        isOpen={autocompleteState.isOpen}
        filter={autocompleteState.filter}
        mode={autocompleteState.mode}
        selectedIndex={autocompleteIndex}
        onSelectedIndexChange={setAutocompleteIndex}
        onSelect={handleAutocompleteSelect}
        onClose={() => setAutocompleteState({ isOpen: false, filter: "", mode: "all" })}
      />

      <AnimatePresence>
        {!autocompleteState.isOpen && showMentions && filteredContextRefs.length > 0 && (
          <motion.div {...ANIM.springUp}
            ref={menuRef}
            role="listbox" aria-label="Context references"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border overflow-hidden z-50"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-default)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
          >
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-wider border-b"
              style={{ color: "var(--text-quaternary)", borderColor: "var(--border-subtle)" }}
            >
              Context References
              <span className="ml-2 font-normal normal-case">Inject files, code, web, git</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredContextRefs.map((ref, idx) => {
                const Icon = ref.icon
                return (
                  <button key={ref.id} role="option" aria-selected={idx === selectedIndex}
                    onClick={() => insertMention(ref.id)} onMouseEnter={() => setSelectedIndex(idx)}
                    className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all duration-100"
                    style={{ backgroundColor: idx === selectedIndex ? "var(--color-accent-brand-muted)" : "transparent" }}
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-lg shrink-0"
                      style={{ backgroundColor: "var(--color-accent-brand-muted)" }}
                    >
                      <Icon className="h-3 w-3" style={{ color: "var(--color-accent-brand-text)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold font-mono" style={{ color: "var(--text-secondary)" }}>{ref.id}</span>
                        <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>{ref.label}</span>
                      </div>
                      <p className="text-[8px] mt-0.5 truncate" style={{ color: "var(--text-quaternary)" }}>{ref.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          borderColor: isFocused ? "var(--color-accent-brand-border)" : "var(--border-default)",
        }}
        className="relative rounded-2xl border transition-shadow duration-200"
        style={{
          backgroundColor: "var(--surface-panel)",
          boxShadow: isFocused ? "0 0 0 1px var(--color-accent-brand-border)" : "none",
        }}
      >
        <div className="relative px-3 pt-2 pb-1">
          {isProcessing && (
            <div className="absolute top-2.5 right-3">
              <div className="thinking-dots"><span /><span /><span /></div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isProcessing ? "" : placeholder}
            disabled={isProcessing}
            aria-label="Message input"
            className="w-full resize-none bg-transparent outline-none transition-colors text-[13px] font-normal leading-snug min-h-[22px] scrollbar-thin"
            style={{
              color: isProcessing ? "var(--text-tertiary)" : "var(--text-primary)",
            }}
            rows={1}
          />
        </div>

        {pinnedFiles.length > 0 && !isProcessing && (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-1">
            {pinnedFiles.map((filePath) => {
              const fileName = filePath.split(/[\\/]/).pop() ?? ""
              return (
                <span key={filePath} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}
                >
                  <FileText className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--text-quaternary)" }} />
                  <span className="truncate max-w-[120px]">{fileName}</span>
                  <button onClick={() => togglePinFile(filePath)} className="ml-0.5 rounded p-0.5 transition-colors"
                    style={{ color: "var(--text-quaternary)" }}
                    aria-label={`Unpin ${fileName}`}
                  >
                    <X className="h-2 w-2" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between px-3 pb-1.5">
          <div className="flex items-center gap-1.5">
            {!isProcessing && !input && (
              <>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                  style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  <Slash className="h-2 w-2" style={{ color: "var(--text-quaternary)" }} />
                  <span className="text-[8px] font-medium" style={{ color: "var(--text-quaternary)" }}>commands</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                  style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  <AtSign className="h-2 w-2" style={{ color: "var(--text-quaternary)" }} />
                  <span className="text-[8px] font-medium" style={{ color: "var(--text-quaternary)" }}>refs</span>
                </span>
              </>
            )}
            {!isProcessing && input.length === 0 && (
              <button className="rounded p-0.5 transition-colors" aria-label="Attach file"
                style={{ color: "var(--text-quaternary)" }}
              >
                <Paperclip className="h-3 w-3" />
              </button>
            )}
            {isCancelling && (
              <span className="text-[9px] font-medium animate-pulse mr-1" style={{ color: "var(--color-accent-red)" }} role="status" aria-live="polite">Cancelling...</span>
            )}
            {input.length > 0 && (
              <span className="text-[9px] font-mono transition-colors"
                style={{
                  color: input.length > 3800 ? "var(--color-accent-red)" : input.length > 3000 ? "var(--color-accent-amber)" : "var(--text-quaternary)"
                }}
                aria-live="polite"
              >
                {input.length}/4000
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {input.length > 0 && (
              <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: "var(--text-quaternary)" }} aria-hidden="true">
                <kbd className="h-4 min-w-[16px] px-1 rounded flex items-center justify-center text-[7px]"
                  style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-quaternary)" }}
                >⌘</kbd>
                <kbd className="h-4 min-w-[16px] px-1 rounded flex items-center justify-center text-[7px]"
                  style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-quaternary)" }}
                >↵</kbd>
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.button
                key={isCancelling ? "cancelling" : isProcessing ? "cancel" : "send"}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={handleSendClick}
                disabled={!isProcessing && !isCancelling && !input.trim()}
                aria-label={isCancelling ? "Cancelling" : isProcessing ? "Cancel" : "Send"}
                className="flex items-center justify-center h-7 w-7 rounded-xl transition-all duration-150"
                style={{
                  backgroundColor: isProcessing || isCancelling
                    ? "var(--color-accent-red)"
                    : input.trim()
                      ? "var(--color-accent-brand)"
                      : "var(--surface-elevated)",
                  color: isProcessing || isCancelling || input.trim() ? "#fff" : "var(--text-quaternary)",
                  border: isProcessing || isCancelling || input.trim() ? "none" : "1px solid var(--border-default)",
                  opacity: input.trim() && !isProcessing ? 1 : 0.6,
                }}
                onMouseEnter={(e) => { if (!isProcessing && !isCancelling && input.trim()) e.currentTarget.style.opacity = "0.85" }}
                onMouseLeave={(e) => { if (!isProcessing && !isCancelling) e.currentTarget.style.opacity = input.trim() ? "1" : "0.6" }}
              >
                {isCancelling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isProcessing ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </motion.button>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
