import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Search, X, FunctionSquare, Type, Variable, Package,
  Code, FileCode,
} from "lucide-react"

interface SymbolItem {
  name: string
  kind: string
  detail?: string
  range: { startLineNumber: number; startColumn: number }
  containerName?: string
  tags?: string[]
}

interface SymbolSearchProps {
  open: boolean
  onClose: () => void
  onNavigate: (line: number, column: number) => void
  currentFileSymbols: SymbolItem[]
}

const SYMBOL_KIND_ICONS: Record<string, typeof FunctionSquare> = {
  function: FunctionSquare,
  method: FunctionSquare,
  class: Type,
  interface: Type,
  enum: Type,
  namespace: Package,
  module: Package,
  variable: Variable,
  constant: Variable,
  property: Variable,
  constructor: Code,
  field: Variable,
  struct: Type,
  event: Code,
  operator: Code,
}

const SYMBOL_KIND_COLORS: Record<string, string> = {
  function: "text-yellow-400",
  method: "text-yellow-400",
  class: "text-blue-400",
  interface: "text-cyan-400",
  enum: "text-purple-400",
  namespace: "text-green-400",
  module: "text-green-400",
  variable: "text-white/70",
  constant: "text-orange-400",
  property: "text-white/60",
  constructor: "text-blue-300",
  field: "text-white/60",
  struct: "text-blue-400",
  event: "text-pink-400",
  operator: "text-white/50",
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

function groupSymbols(symbols: SymbolItem[]) {
  const groups: { label: string; symbols: SymbolItem[] }[] = []
  const order = ["functions", "methods", "classes", "interfaces", "enums", "structs", "variables", "constants", "properties", "fields", "modules", "namespaces", "constructors", "events", "operators", "other"]

  const map: Record<string, SymbolItem[]> = {}
  for (const sym of symbols) {
    let kind = sym.kind.toLowerCase()
    if (kind === "function") kind = "functions"
    else if (kind === "method") kind = "methods"
    else if (kind === "class") kind = "classes"
    else if (kind === "interface") kind = "interfaces"
    else if (kind === "enum") kind = "enums"
    else if (kind === "struct") kind = "structs"
    else if (kind === "variable") kind = "variables"
    else if (kind === "constant") kind = "constants"
    else if (kind === "property") kind = "properties"
    else if (kind === "field") kind = "fields"
    else if (kind === "module") kind = "modules"
    else if (kind === "namespace") kind = "namespaces"
    else if (kind === "constructor") kind = "constructors"
    else if (kind === "event") kind = "events"
    else if (kind === "operator") kind = "operators"
    else kind = "other"
    if (!map[kind]) map[kind] = []
    map[kind].push(sym)
  }

  for (const key of order) {
    if (map[key]) {
      groups.push({ label: key, symbols: map[key] })
    }
  }
  return groups
}

export function SymbolSearch({ open, onClose, onNavigate, currentFileSymbols }: SymbolSearchProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!query) return currentFileSymbols
    return currentFileSymbols.filter((s) => fuzzyMatch(s.name, query) || fuzzyMatch(s.containerName || "", query))
  }, [query, currentFileSymbols])

  const groups = useMemo(() => groupSymbols(filtered), [filtered])

  const flatList = useMemo(() => {
    const items: { symbol: SymbolItem; group: string }[] = []
    for (const g of groups) {
      for (const sym of g.symbols) {
        items.push({ symbol: sym, group: g.label })
      }
    }
    return items
  }, [groups])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-sym-idx="${selectedIndex}"]`)
      if (el) el.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((p) => Math.min(p + 1, flatList.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((p) => Math.max(p - 1, 0))
        return
      }
      if (e.key === "Enter" && flatList[selectedIndex]) {
        const sym = flatList[selectedIndex].symbol
        onNavigate(sym.range.startLineNumber, sym.range.startColumn)
        onClose()
      }
    },
    [flatList, selectedIndex, onClose, onNavigate],
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={onClose}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#0d0d0e] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search symbols..."
                className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/20"
              />
              <button
                onClick={onClose}
                className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Symbol list */}
            <div
              ref={listRef}
              className="max-h-[50vh] overflow-y-auto"
              onKeyDown={handleKeyDown}
              tabIndex={-1}
            >
              {flatList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-white/30">
                  <Search className="h-5 w-5 mb-2" />
                  <p className="text-xs">
                    {query ? "No symbols match your search" : "No symbols found in this file"}
                  </p>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 py-1 text-[9px] font-medium text-white/25 uppercase tracking-wider bg-white/[0.02]">
                    {group.label} ({group.symbols.length})
                  </div>
                  {group.symbols.map((sym, gi) => {
                    const flatIndex = flatList.findIndex(
                      (f) => f.symbol.name === sym.name && f.symbol.range.startLineNumber === sym.range.startLineNumber,
                    )
                    const isSelected = flatIndex === selectedIndex
                    const Icon = SYMBOL_KIND_ICONS[sym.kind.toLowerCase()] || FileCode
                    const color = SYMBOL_KIND_COLORS[sym.kind.toLowerCase()] || "text-white/50"

                    return (
                      <button
                        key={`${sym.name}-${sym.range.startLineNumber}`}
                        data-sym-idx={flatIndex}
                        onClick={() => {
                          onNavigate(sym.range.startLineNumber, sym.range.startColumn)
                          onClose()
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                          isSelected ? "bg-blue-500/15 text-white" : "hover:bg-white/[0.03] text-white/70",
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                        <span className="truncate flex-1 text-[12px]">{sym.name}</span>
                        {sym.containerName && (
                          <span className="text-[9px] text-white/30 truncate max-w-[100px]">
                            {sym.containerName}
                          </span>
                        )}
                        <span className="text-[9px] text-white/20 font-mono shrink-0">
                          {sym.range.startLineNumber}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="border-t border-white/[0.06] px-3 py-1.5 text-[9px] text-white/20 flex items-center gap-3">
              <span><kbd className="text-white/40">↑↓</kbd> Navigate</span>
              <span><kbd className="text-white/40">↵</kbd> Go to symbol</span>
              <span><kbd className="text-white/40">Esc</kbd> Close</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type { SymbolItem }
