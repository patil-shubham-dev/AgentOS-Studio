import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { execTrace, execTraceId } from "@/runtime/execution-tracer"
import {
  Send, Square, Slash, AtSign, Code2, Palette,
  Globe, Bug, Search, RefreshCw, FileText,
  Terminal, Paperclip, Loader2, Sparkles,
  FolderOpen, GitBranch, AlertTriangle, Braces, Link, X,
  Rocket, HeartPulse, GitCommitHorizontal, MessagesSquare,
} from "lucide-react"
import { ModelPicker } from "./ModelPicker"
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
  { id: "/init", label: "Init", icon: Rocket, description: "Initialize project config (AGENTIC.md)" },
  { id: "/doctor", label: "Doctor", icon: HeartPulse, description: "Run project health diagnostics" },
  { id: "/commit", label: "Commit", icon: GitCommitHorizontal, description: "Generate commit message from git diff" },
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
  onSideChat?: () => void
  hideSideChat?: boolean
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
  onSideChat,
  hideSideChat,
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
  const [selectedProviderId, setSelectedProviderId] = useState("")
  const [selectedModel, setSelectedModel] = useState("")

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
    // Cmd+; (or Ctrl+;) — open side chat
    if ((e.metaKey || e.ctrlKey) && e.key === ";") {
      e.preventDefault()
      onSideChat?.()
      return
    }
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

  const showHintPills = !isProcessing && !input
  const charCount = input.length
  const showCharCount = charCount > 0
  const isNearLimit = charCount > 3000
  const isAtLimit = charCount > 3800

  return (
    <div className="relative">
      {/* Slash Commands Menu */}
      <AnimatePresence>
        {showCommands && filteredCommands.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={menuRef}
            role="listbox" aria-label="Slash commands"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/[0.08] overflow-hidden z-50 shadow-2xl shadow-black/50"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-widest border-b border-white/[0.04] flex items-center"
              style={{ color: "var(--text-quaternary)" }}
            >
              Commands
              <span className="ml-auto font-normal normal-case text-[7px]" style={{ color: "var(--text-quaternary)" }}>Tab to select</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
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

      {/* Reference Autocomplete */}
      <ReferenceAutocomplete
        isOpen={autocompleteState.isOpen}
        filter={autocompleteState.filter}
        mode={autocompleteState.mode}
        selectedIndex={autocompleteIndex}
        onSelectedIndexChange={setAutocompleteIndex}
        onSelect={handleAutocompleteSelect}
        onClose={() => setAutocompleteState({ isOpen: false, filter: "", mode: "all" })}
      />

      {/* Context References Menu */}
      <AnimatePresence>
        {!autocompleteState.isOpen && showMentions && filteredContextRefs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={menuRef}
            role="listbox" aria-label="Context references"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/[0.08] overflow-hidden z-50 shadow-2xl shadow-black/50"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-widest border-b border-white/[0.04]"
              style={{ color: "var(--text-quaternary)" }}
            >
              Context References
              <span className="ml-2 font-normal normal-case text-[7px]">Inject files, code, web, git</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
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

      {/* Main Input Container */}
      <motion.div
        animate={{
          borderColor: isFocused ? "var(--color-accent-brand-border)" : "rgba(255,255,255,0.06)",
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative rounded-xl border transition-shadow duration-200"
        style={{
          backgroundColor: "var(--surface-panel)",
          boxShadow: isFocused
            ? "0 0 0 1px var(--color-accent-brand-border), 0 4px 20px rgba(0,0,0,0.15)"
            : "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        {/* Textarea area */}
        <div className="relative px-3 pt-2.5 pb-1">
          {isProcessing && (
            <div className="absolute top-3 right-3">
              <div className="flex gap-1">
                <motion.span
                  className="h-1 w-1 rounded-full"
                  style={{ backgroundColor: "var(--text-quaternary)" }}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
                />
                <motion.span
                  className="h-1 w-1 rounded-full"
                  style={{ backgroundColor: "var(--text-quaternary)" }}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                />
                <motion.span
                  className="h-1 w-1 rounded-full"
                  style={{ backgroundColor: "var(--text-quaternary)" }}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
                />
              </div>
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
            className="w-full resize-none bg-transparent outline-none transition-colors text-[13px] font-normal leading-relaxed min-h-[22px] scrollbar-thin placeholder:text-white/[0.2]"
            style={{
              color: isProcessing ? "var(--text-tertiary)" : "var(--text-primary)",
            }}
            rows={1}
          />
        </div>

        {/* Pinned Files */}
        <AnimatePresence>
          {pinnedFiles.length > 0 && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex flex-wrap items-center gap-1 px-3 pb-1"
            >
              {pinnedFiles.map((filePath) => {
                const fileName = filePath.split(/[\\/]/).pop() ?? ""
                return (
                  <span key={filePath} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}
                  >
                    <FileText className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--text-quaternary)" }} />
                    <span className="truncate max-w-[120px]">{fileName}</span>
                    <button onClick={() => togglePinFile(filePath)} className="ml-0.5 rounded p-0.5 transition-colors hover:bg-white/[0.06]"
                      style={{ color: "var(--text-quaternary)" }}
                      aria-label={`Unpin ${fileName}`}
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </span>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
          <div className="flex items-center gap-1">
            {showHintPills && (
              <>
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-all duration-150 hover:bg-white/[0.03]"
                  style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <Slash className="h-2.5 w-2.5" style={{ color: "var(--text-quaternary)" }} />
                  <span className="text-[8px] font-medium" style={{ color: "var(--text-quaternary)" }}>commands</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-all duration-150 hover:bg-white/[0.03]"
                  style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <AtSign className="h-2.5 w-2.5" style={{ color: "var(--text-quaternary)" }} />
                  <span className="text-[8px] font-medium" style={{ color: "var(--text-quaternary)" }}>refs</span>
                </span>
                <ModelPicker
                  selectedProviderId={selectedProviderId}
                  selectedModel={selectedModel}
                  onSelect={(pId, mId) => { setSelectedProviderId(pId); setSelectedModel(mId) }}
                  compact
                />
                {!hideSideChat && (
                  <button
                    onClick={onSideChat}
                    className="rounded-md p-1 transition-all duration-150 hover:bg-white/[0.04]"
                    style={{ color: "var(--text-quaternary)" }}
                    aria-label="New side chat (Cmd+;)"
                    title="New side chat (Cmd+;)"
                  >
                    <MessagesSquare className="h-3 w-3" />
                  </button>
                )}
                <button className="rounded-md p-1 transition-all duration-150 hover:bg-white/[0.04]" aria-label="Attach file"
                  style={{ color: "var(--text-quaternary)" }}
                >
                  <Paperclip className="h-3 w-3" />
                </button>
              </>
            )}
            {isCancelling && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[9px] font-medium ml-0.5"
                style={{ color: "rgba(239, 68, 68, 0.7)" }}
                role="status" aria-live="polite"
              >
                Cancelling
              </motion.span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Character count - only shows when typing and subtle until near limit */}
            {showCharCount && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-[9px] font-mono transition-colors duration-200 ${
                  isAtLimit ? "text-red-400/80" : isNearLimit ? "text-amber-400/60" : "text-white/[0.15]"
                }`}
                aria-live="polite"
              >
                {charCount}
              </motion.span>
            )}

            {/* Keyboard hint */}
            {showCharCount && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 text-[8px] font-mono text-white/[0.12]" aria-hidden="true"
              >
                <kbd className="h-3.5 min-w-[14px] px-1 rounded flex items-center justify-center text-[7px]"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-quaternary)" }}
                >⌘</kbd>
                <kbd className="h-3.5 min-w-[14px] px-1 rounded flex items-center justify-center text-[7px]"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-quaternary)" }}
                >↵</kbd>
              </motion.span>
            )}

            {/* Send / Cancel Button */}
            <AnimatePresence mode="wait">
              <motion.button
                key={isCancelling ? "cancelling" : isProcessing ? "cancel" : "send"}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={handleSendClick}
                disabled={!isProcessing && !isCancelling && !input.trim()}
                aria-label={isCancelling ? "Cancelling" : isProcessing ? "Cancel" : "Send"}
                className="flex items-center justify-center h-7 min-w-[28px] rounded-lg transition-all duration-150 active:scale-[0.95]"
                style={{
                  backgroundColor: isProcessing || isCancelling
                    ? "rgba(239, 68, 68, 0.15)"
                    : input.trim()
                      ? "var(--color-accent-brand)"
                      : "rgba(255,255,255,0.04)",
                  color: isProcessing || isCancelling
                    ? "rgba(239, 68, 68, 0.8)"
                    : input.trim()
                      ? "#fff"
                      : "var(--text-quaternary)",
                  border: isProcessing || isCancelling || input.trim()
                    ? "none"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {isCancelling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isProcessing ? (
                  <Square className="h-3 w-3" />
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
