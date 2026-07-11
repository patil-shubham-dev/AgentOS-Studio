import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ProviderModel } from "@/types"
import { Search, X, RefreshCw, Loader2, Box, AlertTriangle, Check, Zap, Eye, BookOpen } from "lucide-react"

interface ModelSelectorProps {
  models: ProviderModel[]
  selected: string[]
  onChange: (ids: string[]) => void
  loading: boolean
  onRefresh: () => void
  error?: string | null
}

function ModelCard({ model, isSelected, onToggle }: { model: ProviderModel; isSelected: boolean; onToggle: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onToggle}
      className={cn(
        "flex items-start gap-3 w-full rounded-xl border p-3 text-left transition-all",
        isSelected
          ? "border-blue-500/40 bg-blue-500/[0.06]"
          : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]",
      )}
    >
      <div className={cn(
        "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
        isSelected ? "bg-blue-500 border-blue-500" : "border-white/20",
      )}>
        {isSelected && <Check className="h-3 w-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            "text-xs font-medium truncate max-w-[200px]",
            isSelected ? "text-blue-300" : "text-white/70",
          )}>
            {model.name}
          </span>
          {model.id.startsWith("gpt-4") && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              Recommended
            </span>
          )}
          {model.id.startsWith("claude-3-5") && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              Recommended
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {model.supportsTools && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-green-400/60">
              <Zap className="h-2.5 w-2.5" /> Tools
            </span>
          )}
          {model.supportsVision && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-purple-400/60">
              <Eye className="h-2.5 w-2.5" /> Vision
            </span>
          )}
          {model.supportsStreaming && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-cyan-400/60">
              Streaming
            </span>
          )}
          {model.contextWindow && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-white/30">
              <BookOpen className="h-2.5 w-2.5" /> {(model.contextWindow / 1000).toFixed(0)}K ctx
            </span>
          )}
        </div>
        <p className="text-[9px] text-white/20 font-mono mt-1 truncate">{model.id}</p>
      </div>
    </motion.button>
  )
}

export function ModelSelector({ models, selected, onChange, loading, onRefresh, error }: ModelSelectorProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query) return models
    const q = query.toLowerCase()
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
  }, [models, query])

  const hasSelectedAll = models.length > 0 && selected.length === models.length

  function toggleSelectAll() {
    if (hasSelectedAll) onChange([])
    else onChange(models.map((m) => m.id))
  }

  if (loading && models.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="h-5 w-5 rounded border border-white/10 bg-white/[0.03] animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-2 w-1/3 rounded bg-white/[0.02] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Search + actions bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20 transition-all"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="h-9 px-3 rounded-lg border border-white/10 text-white/30 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40 flex items-center gap-1.5"
          title="Refresh models"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/10 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400/80 font-medium">Failed to load models</p>
            <p className="text-[10px] text-amber-400/50">{error}</p>
          </div>
          <button onClick={onRefresh} className="shrink-0 text-[10px] text-amber-400/60 hover:text-amber-400 underline">
            Retry
          </button>
        </div>
      )}

      {/* Select all bar */}
      {models.length > 0 && !error && (
        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hasSelectedAll}
              onChange={toggleSelectAll}
              className="rounded border-white/30 bg-white/[0.05] text-blue-500 focus:ring-1 focus:ring-blue-500/40 h-3.5 w-3.5 accent-blue-500"
            />
            <span className="text-[10px] text-white/40">Select all {models.length} models</span>
          </label>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-[10px] text-white/30 hover:text-red-400 transition-colors flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Model cards */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto overscroll-contain pr-1">
        {filtered.length === 0 && !loading && !error && (
          <div className="flex flex-col items-center py-8 text-center">
            <Box className="h-6 w-6 text-white/10 mb-2" />
            <p className="text-xs text-white/30">
              {query ? "No models match your search" : "No models available"}
            </p>
            <p className="text-[10px] text-white/20 mt-1">
              {query ? "Try a different search term" : "Refresh models or check provider configuration."}
            </p>
          </div>
        )}
        {filtered.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            isSelected={selected.includes(model.id)}
            onToggle={() => onChange(selected.includes(model.id) ? selected.filter((s) => s !== model.id) : [...selected, model.id])}
          />
        ))}
      </div>

      {/* Selected summary */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {selected.slice(0, 5).map((id) => {
            const model = models.find((m) => m.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[9px] font-mono text-blue-300 max-w-[160px]">
                <span className="truncate">{model?.name || id}</span>
                <button onClick={() => onChange(selected.filter((s) => s !== id))} className="hover:text-white transition-colors shrink-0">
                  <X className="h-2 w-2" />
                </button>
              </span>
            )
          })}
          {selected.length > 5 && (
            <span className="text-[9px] text-white/30 px-1">+{selected.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  )
}
