import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
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

const AGENT_MENTIONS = [
  { id: "@coder", label: "Coder", icon: Code2, description: "Senior software engineer" },
  { id: "@designer", label: "Designer", icon: Palette, description: "UI/UX designer" },
  { id: "@browser", label: "Browser", icon: Globe, description: "Browser automation" },
  { id: "@debugger", label: "Debugger", icon: Bug, description: "Debug expert" },
  { id: "@qa", label: "QA", icon: Search, description: "Testing & verification" },
  { id: "@runtime", label: "Runtime", icon: Terminal, description: "Command execution" },
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

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.style.height = "auto"
      const newHeight = Math.min(el.scrollHeight, 200)
      el.style.height = `${newHeight}px`
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

  useEffect(() => {
    setSelectedIndex(0)
  }, [commandFilter, mentionFilter])

  // Sync @-autocomplete state when input changes
  useEffect(() => {
    const state = getAutocompleteState(input)
    setAutocompleteState(state)
    if (!state.isOpen) {
      setAutocompleteIndex(0)
    }
  }, [input])

  function handleChange(value: string) {
    onInputChange(value)
    const lastWord = value.split(/\s/).pop() || ""
    if (lastWord.startsWith("/") && lastWord.length > 0) {
      setShowCommands(true)
      setCommandFilter(lastWord.slice(1).toLowerCase())
      setShowMentions(false)
      setShowContextRefs(false)
    } else if (lastWord.startsWith("@") && lastWord.length > 0) {
      const afterAt = lastWord.slice(1).toLowerCase()
      const isContextRef = CONTEXT_REFERENCES.some((r) => r.id.slice(1).startsWith(afterAt))
      const isAgentMention = AGENT_MENTIONS.some((m) => m.id.slice(1).startsWith(afterAt))

      // Show both context refs and agent mentions
      setShowContextRefs(isContextRef || !isAgentMention)
      setShowMentions(true)
      setContextRefFilter(afterAt)
      setMentionFilter(afterAt)
      setShowCommands(false)
    } else {
      setShowCommands(false)
      setShowMentions(false)
      setShowContextRefs(false)
    }
  }

  function insertCommand(command: string) {
    const words = input.split(/\s/)
    words[words.length - 1] = command + " "
    onInputChange(words.join(" ") + " ")
    setShowCommands(false)
    textareaRef.current?.focus()
  }

  function insertMention(mention: string) {
    const words = input.split(/\s/)
    words[words.length - 1] = mention + " "
    onInputChange(words.join(" ") + " ")
    setShowMentions(false)
    setShowContextRefs(false)
    setAutocompleteState({ isOpen: false, filter: "", mode: "all" })
    textareaRef.current?.focus()
  }

  function handleAutocompleteSelect(item: AutocompleteItem) {
    const newInput = insertAutocompleteItem(input, item)
    onInputChange(newInput)
    setShowMentions(false)
    setShowContextRefs(false)
    setAutocompleteState({ isOpen: false, filter: "", mode: "all" })
    textareaRef.current?.focus()
  }

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.id.slice(1).startsWith(commandFilter)
  )
  const filteredMentions = AGENT_MENTIONS.filter((m) =>
    m.id.slice(1).startsWith(mentionFilter)
  )
  const filteredContextRefs = CONTEXT_REFERENCES.filter((r) =>
    r.id.slice(1).startsWith(contextRefFilter)
  )

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, filteredCommands.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)); return }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertCommand(filteredCommands[selectedIndex]?.id || ""); return }
      if (e.key === "Escape") { setShowCommands(false); return }
    }
    if (showMentions && (filteredMentions.length > 0 || filteredContextRefs.length > 0)) {
      const allItems = [...filteredContextRefs, ...filteredMentions]
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, allItems.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)); return }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault()
        const item = allItems[selectedIndex]
        if (item) insertMention(item.id)
        return
      }
      if (e.key === "Escape") { setShowMentions(false); setShowContextRefs(false); setAutocompleteState({ isOpen: false, filter: "", mode: "all" }); return }
    }
    // @-autocomplete keyboard navigation
    if (autocompleteState.isOpen) {
      const totalItems = getFilteredCount(autocompleteState.filter, autocompleteState.mode)
      if (totalItems > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setAutocompleteIndex((p) => Math.min(p + 1, totalItems - 1)); return }
        if (e.key === "ArrowUp") { e.preventDefault(); setAutocompleteIndex((p) => Math.max(p - 1, 0)); return }
        if (e.key === "Tab" || e.key === "Enter") {
          // Let the existing mention/context ref handler deal with it
          // Don't intercept
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="relative">
      {/* Commands dropup */}
      <AnimatePresence>
        {showCommands && filteredCommands.length > 0 && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            role="listbox"
            aria-label="Slash commands"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/[0.06] bg-[#0c0c0d]/98 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 text-[8px] text-white/15 font-medium uppercase tracking-wider border-b border-white/[0.03]">
              Commands
              <span className="ml-2 text-white/10 font-normal normal-case">Tab to select, Esc to close</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1" role="presentation">
              {filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.id}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onClick={() => insertCommand(cmd.id)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all",
                      idx === selectedIndex ? "bg-blue-500/10" : "hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/10 shrink-0">
                      <Icon className="h-3 w-3 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-white/70 font-mono">{cmd.id}</span>
                        <span className="text-[9px] text-white/25">{cmd.label}</span>
                      </div>
                      <p className="text-[8px] text-white/20 truncate mt-0.5">{cmd.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* @-Autocomplete from ReferenceAutocomplete component */}
      <ReferenceAutocomplete
        isOpen={autocompleteState.isOpen}
        filter={autocompleteState.filter}
        mode={autocompleteState.mode}
        selectedIndex={autocompleteIndex}
        onSelectedIndexChange={setAutocompleteIndex}
        onSelect={handleAutocompleteSelect}
        onClose={() => setAutocompleteState({ isOpen: false, filter: "", mode: "all" })}
      />

      {/* Mentions dropup — only shown when ReferenceAutocomplete is not active */}
      <AnimatePresence>
        {!autocompleteState.isOpen && showMentions && (filteredContextRefs.length > 0 || filteredMentions.length > 0) && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            role="listbox"
            aria-label="Context references and agent mentions"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/[0.06] bg-[#0c0c0d]/98 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
          >
            {/* Context references section */}
            {filteredContextRefs.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[8px] text-white/15 font-medium uppercase tracking-wider border-b border-white/[0.03]">
                  Context References
                  <span className="ml-2 text-white/10 font-normal normal-case">Inject files, code, web, git</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1" role="presentation">
                  {filteredContextRefs.map((ref, idx) => {
                    const Icon = ref.icon
                    return (
                      <button
                        key={ref.id}
                        role="option"
                        aria-selected={idx === selectedIndex}
                        onClick={() => insertMention(ref.id)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all",
                          idx === selectedIndex ? "bg-cyan-500/10" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-cyan-500/10 shrink-0">
                          <Icon className="h-3 w-3 text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-white/70 font-mono">{ref.id}</span>
                            <span className="text-[9px] text-white/25">{ref.label}</span>
                          </div>
                          <p className="text-[8px] text-white/20 truncate mt-0.5">{ref.description} — {ref.example}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Agent mentions section */}
            {filteredMentions.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[8px] text-white/15 font-medium uppercase tracking-wider border-b border-white/[0.03]">
                  Agents
                  <span className="ml-2 text-white/10 font-normal normal-case">@mention an agent</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1" role="presentation">
                  {filteredMentions.map((agent, idx) => {
                    const Icon = agent.icon
                    return (
                      <button
                        key={agent.id}
                        role="option"
                        aria-selected={(idx + filteredContextRefs.length) === selectedIndex}
                        onClick={() => insertMention(agent.id)}
                        onMouseEnter={() => setSelectedIndex(idx + filteredContextRefs.length)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all",
                          (idx + filteredContextRefs.length) === selectedIndex ? "bg-purple-500/10" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-purple-500/10 shrink-0">
                          <Icon className="h-3 w-3 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-white/70 font-mono">{agent.id}</span>
                            <span className="text-[9px] text-white/25">{agent.label}</span>
                          </div>
                          <p className="text-[8px] text-white/20 truncate mt-0.5">{agent.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main composer */}
      <motion.div
        animate={{
          borderColor: isProcessing
            ? "rgba(59, 130, 246, 0.2)"
            : isFocused
              ? "rgba(59, 130, 246, 0.12)"
              : "rgba(255, 255, 255, 0.04)",
          boxShadow: isFocused
            ? "0 0 20px -8px rgba(59, 130, 246, 0.08)"
            : "0 0 0 0 transparent",
        }}
        className="relative rounded-2xl border transition-colors duration-200 bg-chat-bg/80 backdrop-blur-xl"
      >
        <div className={cn(
          "absolute inset-0 rounded-2xl transition-opacity duration-500 pointer-events-none",
          isFocused ? "opacity-[0.03]" : "opacity-0"
        )}>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500" />
        </div>

        <div className="relative px-3 pt-2 pb-1">
          {/* Processing indicator - subtle inline, no blocking overlay */}
          {isProcessing && (
            <div className="absolute top-2 right-3">
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
            aria-describedby={showCommands ? "composer-commands" : showMentions ? "composer-mentions" : undefined}
            className={cn(
              "w-full resize-none bg-transparent outline-none transition-colors",
              "text-[13.5px] text-foreground/85 placeholder:text-foreground/10",
              "font-normal leading-snug",
              "scrollbar-thin scrollbar-thumb-foreground/10 scrollbar-track-transparent",
              "min-h-[22px]",
              isProcessing ? "text-foreground/40" : "",
            )}
            rows={1}
          />
        </div>

        {/* Context chips */}
        {pinnedFiles.length > 0 && !isProcessing && (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-1">
            {pinnedFiles.map((filePath) => {
              const fileName = filePath.split(/[\\/]/).pop() ?? ""
              return (
                <span
                  key={filePath}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40 font-medium"
                >
                  <FileText className="h-2.5 w-2.5 text-white/20 shrink-0" />
                  <span className="truncate max-w-[120px]">{fileName}</span>
                  <button
                    onClick={() => togglePinFile(filePath)}
                    className="ml-0.5 rounded p-0.5 text-white/15 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
                    aria-label={`Unpin ${fileName}`}
                  >
                    <X className="h-2 w-2" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-1.5">
          <div className="flex items-center gap-1">
            {!isProcessing && !input && (
              <>
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.02] border border-white/[0.03] px-1 py-0.5">
                  <Slash className="h-2 w-2 text-white/12" />
                  <span className="text-[8px] text-white/12 font-medium">commands</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.02] border border-white/[0.03] px-1 py-0.5">
                  <AtSign className="h-2 w-2 text-white/12" />
                  <span className="text-[8px] text-white/12 font-medium">refs + agents</span>
                </span>
              </>
            )}
            {!isProcessing && input.length === 0 && (
              <button className="rounded p-0.5 text-white/10 hover:text-white/25 transition-colors" aria-label="Attach file">
                <Paperclip className="h-3 w-3" />
              </button>
            )}
            {isCancelling && (
              <span className="text-[9px] text-red-400/60 font-medium animate-pulse mr-1" role="status" aria-live="polite">Cancelling...</span>
            )}
            {input.length > 0 && (
              <span
                className={cn(
                  "text-[9px] font-mono transition-colors",
                  input.length > 3800 ? "text-red-400/50" : input.length > 3000 ? "text-amber-400/40" : "text-white/12"
                )}
                aria-live="polite"
              >
                {input.length}/4000
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {input.length > 0 && (
              <span className="flex items-center gap-1 text-[8px] text-white/12 font-mono" aria-hidden="true">
                <kbd className="h-4 min-w-[16px] px-1 rounded bg-white/[0.06] border border-white/[0.08] text-white/20 flex items-center justify-center text-[7px]">\u2318</kbd>
                <kbd className="h-4 min-w-[16px] px-1 rounded bg-white/[0.06] border border-white/[0.08] text-white/20 flex items-center justify-center text-[7px]">\u21B5</kbd>
                <span className="text-white/8">send</span>
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.button
                key={isCancelling ? "cancelling" : isProcessing ? "cancel" : "send"}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.1 }}
                onClick={isProcessing || isCancelling ? onCancel : onSend}
                disabled={!isProcessing && !isCancelling && !input.trim()}
                aria-label={isCancelling ? "Cancelling" : isProcessing ? "Cancel" : "Send"}
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-lg transition-all duration-200",
                  isProcessing || isCancelling
                    ? "bg-red-500/10 text-red-400/70 hover:bg-red-500/20 border border-red-500/12 cursor-wait"
                    : input.trim()
                      ? "bg-blue-600/70 text-white shadow-sm shadow-blue-600/10 hover:bg-blue-500"
                      : "bg-white/[0.02] text-white/12 border border-white/[0.03]",
                )}
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isProcessing ? (
                  <Square className="h-3 w-3" />
                ) : (
                  <Send className={cn("h-3 w-3 transition-opacity", input.trim() ? "opacity-100" : "opacity-40")} />
                )}
              </motion.button>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
