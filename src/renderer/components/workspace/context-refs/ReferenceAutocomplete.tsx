/**
 * ReferenceAutocomplete — a popover dropdown that appears when the user types `@`
 * in the composer, showing available context reference types and agent mentions.
 *
 * Features:
 *   - Triggered by typing @ in the composer
 *   - Shows context references (file, folder, web, code, lines, symbol, git, problems)
 *   - Shows agent mentions (coder, designer, browser, debugger, qa, runtime)
 *   - Filters as user types after @
 *   - Keyboard navigation (arrow keys + Enter/Tab)
 *   - Inserts the selected reference into the composer
 */

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  FileText, FolderOpen, Globe, Search, Braces,
  GitBranch, AlertTriangle, Link,
  Code2, Palette, Bug, Terminal,
} from "lucide-react"

// ── Reference Type Definitions ──

export interface AutocompleteItem {
  id: string
  label: string
  icon: typeof FileText
  description: string
  example?: string
  /** The text to insert when selected (e.g., "@file ") */
  insertText: string
  /** Category for grouping in the dropdown */
  category: "context" | "agent"
  /** Color scheme */
  color: string
  bgColor: string
}

const CONTEXT_REFERENCES: AutocompleteItem[] = [
  {
    id: "@file", label: "File", icon: FileText,
    description: "Inject file content", example: "@file path/to/file.ts",
    insertText: "@file ", category: "context",
    color: "text-cyan-400", bgColor: "bg-cyan-500/10",
  },
  {
    id: "@folder", label: "Folder", icon: FolderOpen,
    description: "List directory contents", example: "@folder src/",
    insertText: "@folder ", category: "context",
    color: "text-blue-400", bgColor: "bg-blue-500/10",
  },
  {
    id: "@web", label: "Web", icon: Globe,
    description: "Fetch web page content", example: "@web https://...",
    insertText: "@web ", category: "context",
    color: "text-violet-400", bgColor: "bg-violet-500/10",
  },
  {
    id: "@code", label: "Code", icon: Search,
    description: "Search code in project", example: "@code query in src/",
    insertText: "@code ", category: "context",
    color: "text-emerald-400", bgColor: "bg-emerald-500/10",
  },
  {
    id: "@lines", label: "Lines", icon: Braces,
    description: "Inject specific line range", example: "@lines 10-30 in file.ts",
    insertText: "@lines ", category: "context",
    color: "text-amber-400", bgColor: "bg-amber-500/10",
  },
  {
    id: "@symbol", label: "Symbol", icon: Link,
    description: "Find symbol definition", example: "@symbol AuthService",
    insertText: "@symbol ", category: "context",
    color: "text-pink-400", bgColor: "bg-pink-500/10",
  },
  {
    id: "@git", label: "Git", icon: GitBranch,
    description: "Git status and changes", example: "@git",
    insertText: "@git ", category: "context",
    color: "text-orange-400", bgColor: "bg-orange-500/10",
  },
  {
    id: "@problems", label: "Problems", icon: AlertTriangle,
    description: "Workspace diagnostics", example: "@problems",
    insertText: "@problems ", category: "context",
    color: "text-red-400", bgColor: "bg-red-500/10",
  },
]

const AGENT_MENTIONS: AutocompleteItem[] = [
  {
    id: "@coder", label: "Coder", icon: Code2,
    description: "Senior software engineer",
    insertText: "@coder ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
  {
    id: "@designer", label: "Designer", icon: Palette,
    description: "UI/UX designer",
    insertText: "@designer ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
  {
    id: "@browser", label: "Browser", icon: Globe,
    description: "Browser automation",
    insertText: "@browser ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
  {
    id: "@debugger", label: "Debugger", icon: Bug,
    description: "Debug expert",
    insertText: "@debugger ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
  {
    id: "@qa", label: "QA", icon: Search,
    description: "Testing & verification",
    insertText: "@qa ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
  {
    id: "@runtime", label: "Runtime", icon: Terminal,
    description: "Command execution",
    insertText: "@runtime ", category: "agent",
    color: "text-purple-400", bgColor: "bg-purple-500/10",
  },
]

const ALL_ITEMS = [...CONTEXT_REFERENCES, ...AGENT_MENTIONS]

// ── Props ──

interface ReferenceAutocompleteProps {
  /** Whether the autocomplete is visible */
  isOpen: boolean
  /** The filter text (what comes after @) */
  filter: string
  /** Whether to show context refs, agent mentions, or both */
  mode: "context" | "agent" | "all"
  /** Called when user selects an item */
  onSelect: (item: AutocompleteItem) => void
  /** Called to close the dropdown */
  onClose: () => void
  /** Currently selected index for keyboard navigation */
  selectedIndex: number
  /** Called when selected index changes */
  onSelectedIndexChange: (index: number) => void
}

// ── Component ──

export function ReferenceAutocomplete({
  isOpen,
  filter,
  mode,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange,
}: ReferenceAutocompleteProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter items based on filter text
  const filteredContextRefs = CONTEXT_REFERENCES.filter((ref) =>
    ref.id.slice(1).startsWith(filter.toLowerCase()),
  )
  const filteredAgentMentions = AGENT_MENTIONS.filter((m) =>
    m.id.slice(1).startsWith(filter.toLowerCase()),
  )

  const showContext = mode === "all" || mode === "context"
  const showAgents = mode === "all" || mode === "agent"

  const allFiltered = [
    ...(showContext ? filteredContextRefs : []),
    ...(showAgents ? filteredAgentMentions : []),
  ]

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  // Reset selected index when filter changes
  useEffect(() => {
    onSelectedIndexChange(0)
  }, [filter, onSelectedIndexChange])

  if (!isOpen || allFiltered.length === 0) return null

  return (
    <AnimatePresence>
      {isOpen && allFiltered.length > 0 && (
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
          {/* Context References Section */}
          {showContext && filteredContextRefs.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-white/15 font-medium uppercase tracking-wider border-b border-white/[0.03]">
                Context References
                <span className="ml-2 text-white/10 font-normal normal-case">Inject files, code, web, git</span>
              </div>
              <div className="max-h-48 overflow-y-auto p-1" role="presentation">
                {filteredContextRefs.map((ref, idx) => (
                  <AutocompleteRow
                    key={ref.id}
                    item={ref}
                    isSelected={idx === selectedIndex}
                    onSelect={() => onSelect(ref)}
                    onHover={() => onSelectedIndexChange(idx)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Agent Mentions Section */}
          {showAgents && filteredAgentMentions.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-white/15 font-medium uppercase tracking-wider border-b border-white/[0.03]">
                Agents
                <span className="ml-2 text-white/10 font-normal normal-case">@mention an agent</span>
              </div>
              <div className="max-h-48 overflow-y-auto p-1" role="presentation">
                {filteredAgentMentions.map((agent, idx) => {
                  const actualIndex = (showContext ? filteredContextRefs.length : 0) + idx
                  return (
                    <AutocompleteRow
                      key={agent.id}
                      item={agent}
                      isSelected={actualIndex === selectedIndex}
                      onSelect={() => onSelect(agent)}
                      onHover={() => onSelectedIndexChange(actualIndex)}
                    />
                  )
                })}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Row Component ──

interface AutocompleteRowProps {
  item: AutocompleteItem
  isSelected: boolean
  onSelect: () => void
  onHover: () => void
}

function AutocompleteRow({ item, isSelected, onSelect, onHover }: AutocompleteRowProps) {
  const Icon = item.icon

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-all",
        isSelected ? item.bgColor : "hover:bg-white/[0.03]",
      )}
    >
      <div className={cn(
        "flex items-center justify-center h-6 w-6 rounded-lg shrink-0",
        item.category === "context" ? "bg-cyan-500/10" : "bg-purple-500/10",
      )}>
        <Icon className={cn("h-3 w-3", item.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[11px] font-semibold font-mono", isSelected ? "text-white/85" : "text-white/70")}>
            {item.id}
          </span>
          <span className="text-[9px] text-white/25">{item.label}</span>
        </div>
        <p className="text-[8px] text-white/20 truncate mt-0.5">
          {item.description}
          {item.example && (
            <span className="text-white/10 ml-1">— {item.example}</span>
          )}
        </p>
      </div>
    </button>
  )
}

// ── Utility: Parse last word for @-trigger detection ──

export interface AutocompleteState {
  isOpen: boolean
  filter: string
  mode: "context" | "agent" | "all"
}

/**
 * Parse the input text to determine the autocomplete state.
 * Returns whether the autocomplete should be open, the filter text, and the mode.
 */
export function getAutocompleteState(input: string): AutocompleteState {
  const words = input.split(/\s/)
  const lastWord = words[words.length - 1] ?? ""

  if (!lastWord.startsWith("@") || lastWord.length <= 1) {
    return { isOpen: false, filter: "", mode: "all" }
  }

  const afterAt = lastWord.slice(1).toLowerCase()

  // If the input looks like it could be a file path (contains / or .), suggest context refs
  const isFilePath = afterAt.includes("/") || afterAt.includes("\\") || afterAt.includes(".")

  // If after @ they type something matching an agent name, suggest agents
  const matchesAgent = AGENT_MENTIONS.some((m) => m.id.slice(1).startsWith(afterAt))
  const matchesContext = CONTEXT_REFERENCES.some((r) => r.id.slice(1).startsWith(afterAt))

  let mode: "context" | "agent" | "all" = "all"
  if (matchesAgent && !matchesContext) mode = "agent"
  else if (matchesContext && !matchesAgent) mode = "context"

  return {
    isOpen: true,
    filter: afterAt,
    mode,
  }
}

/**
 * Get the total count of filtered items — used for keyboard navigation bounds.
 */
export function getFilteredCount(
  filter: string,
  mode: "context" | "agent" | "all",
): number {
  let count = 0
  if (mode === "all" || mode === "context") {
    count += CONTEXT_REFERENCES.filter((r) => r.id.slice(1).startsWith(filter)).length
  }
  if (mode === "all" || mode === "agent") {
    count += AGENT_MENTIONS.filter((m) => m.id.slice(1).startsWith(filter)).length
  }
  return count
}

/**
 * Insert an autocomplete item into the input text.
 * Replaces the last word (the @trigger) with the item's insertText.
 */
export function insertAutocompleteItem(input: string, item: AutocompleteItem): string {
  const words = input.split(/\s/)
  words[words.length - 1] = item.insertText
  return words.join(" ") + " "
}
