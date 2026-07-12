import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { usePluginStore } from "@/stores/plugin-store"
import { pluginLoader } from "@/runtime/plugins/PluginLoader"
import { pluginRegistry } from "@/runtime/plugins/PluginRegistry"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  Puzzle,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Box,
  Grid3x3,
  Folder,
  Tag,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"

export function PluginsPage() {
  useLeakTracker("PluginsPage")

  const { plugins, isLoading, error, setLoading, setError, togglePlugin, removePlugin, setPlugins } =
    usePluginStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [searchQuery, setSearchQuery] = useState("")
  const [pluginDirOpen, setPluginDirOpen] = useState(false)

  // Load plugins on mount
  const loadPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const result = await pluginLoader.loadAll(rootPath ?? undefined)
      if (result.failed.length > 0) {
        setError(`${result.failed.length} plugin(s) failed to load`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [rootPath, setLoading, setError])

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  // Subscribe to registry updates
  useEffect(() => {
    const unsub = pluginRegistry.onUpdate(() => {
      // Refresh from registry
      const allPlugins = pluginRegistry.getAll()
      setPlugins(allPlugins)
    })
    return unsub
  }, [setPlugins])

  // Filter by search
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return Array.from(plugins.values())
    const q = searchQuery.toLowerCase()
    return Array.from(plugins.values()).filter(
      (p) =>
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.description.toLowerCase().includes(q) ||
        p.manifest.id.toLowerCase().includes(q) ||
        p.manifest.tags?.some((t) => t.toLowerCase().includes(q)),
    )
  }, [plugins, searchQuery])

  const stats = useMemo(() => {
    const all = Array.from(plugins.values())
    return {
      total: all.length,
      enabled: all.filter((p) => p.enabled).length,
      builtin: all.filter((p) => p.manifest.isBuiltin).length,
      user: all.filter((p) => !p.manifest.isBuiltin).length,
    }
  }, [plugins])

  const handleToggle = useCallback(
    (id: string) => {
      togglePlugin(id)
    },
    [togglePlugin],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const plugin = plugins.get(id)
      if (!plugin || plugin.manifest.isBuiltin) return
      pluginRegistry.unregister(id)
      removePlugin(id)
    },
    [plugins, removePlugin],
  )

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-app)]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-[var(--border-default)]">
              <Puzzle className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Plugins</h1>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                Extend AgenticOS with custom tools, MCP servers, and UI components
              </p>
            </div>
          </div>
          <button
            onClick={loadPlugins}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-4 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Reload
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Box, color: "text-indigo-400" },
            { label: "Enabled", value: stats.enabled, icon: CheckCircle2, color: "text-green-400" },
            { label: "Built-in", value: stats.builtin, icon: Grid3x3, color: "text-blue-400" },
            { label: "Custom", value: stats.user, icon: Folder, color: "text-amber-400" },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface-elevated)] p-4">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</span>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">{stat.label}</p>
              </div>
            )
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-xs text-red-300">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-quaternary)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins by name, description, or tag..."
            className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] focus:border-[var(--border-default)] focus:bg-[var(--border-default)] transition-all"
          />
        </div>

        {/* Plugin Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredPlugins.map((plugin) => (
              <motion.div
                key={plugin.manifest.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className={cn(
                  "group relative rounded-2xl border transition-all duration-200 overflow-hidden",
                  plugin.enabled
                    ? "border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/3"
                    : "border-[var(--border-subtle)] bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface-elevated)] hover:border-[var(--border-default)]",
                )}
              >
                {/* Top accent bar */}
                <div
                  className={cn(
                    "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
                    plugin.manifest.isBuiltin
                      ? "from-blue-500/40 to-cyan-500/20"
                      : "from-indigo-500/40 to-purple-500/20",
                  )}
                />

                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-xl border shrink-0",
                        plugin.enabled
                          ? "border-indigo-500/30 bg-indigo-500/10"
                          : "border-[var(--border-default)] bg-[var(--border-subtle)]",
                      )}
                    >
                      <Puzzle
                        className={cn(
                          "h-4 w-4",
                          plugin.enabled ? "text-indigo-400" : "text-[var(--text-tertiary)]",
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {plugin.manifest.name}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-medium",
                            plugin.manifest.isBuiltin
                              ? "text-blue-400 bg-blue-500/10"
                              : "text-indigo-400 bg-indigo-500/10",
                          )}
                        >
                          {plugin.manifest.isBuiltin ? "Built-in" : plugin.manifest.version}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">
                        {plugin.manifest.description}
                      </p>
                    </div>
                  </div>

                  {/* Tags */}
                  {plugin.manifest.tags && plugin.manifest.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {plugin.manifest.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-medium text-[var(--text-tertiary)] bg-[var(--border-subtle)]"
                        >
                          <Tag className="h-2 w-2" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Plugin ID */}
                  <div className="mt-2 rounded-lg bg-[var(--border-subtle)] border border-[var(--border-subtle)] px-2 py-1">
                    <code className="text-[8px] text-[var(--text-quaternary)] font-mono break-all">
                      {plugin.manifest.id}
                    </code>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[var(--border-subtle)]">
                    {/* Enable/Disable Toggle */}
                    <button
                      onClick={() => handleToggle(plugin.manifest.id)}
                      className={cn(
                        "flex items-center gap-1 flex-1 justify-center px-2 py-1.5 rounded-lg text-[9px] font-medium transition-all",
                        plugin.enabled
                          ? "bg-indigo-500/10 text-indigo-400"
                          : "bg-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-strong)]",
                      )}
                    >
                      {plugin.enabled ? (
                        <ToggleRight className="h-3 w-3" />
                      ) : (
                        <ToggleLeft className="h-3 w-3" />
                      )}
                      {plugin.enabled ? "Enabled" : "Disabled"}
                    </button>

                    {/* External link */}
                    {plugin.manifest.homepage && (
                      <>
                        <div className="w-px h-4 bg-[var(--border-subtle)]" />
                        <a
                          href={plugin.manifest.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
                          title="Plugin homepage"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}

                    {/* Delete (user plugins only) */}
                    {!plugin.manifest.isBuiltin && (
                      <>
                        <div className="w-px h-4 bg-[var(--border-subtle)]" />
                        <button
                          onClick={() => handleDelete(plugin.manifest.id)}
                          className="rounded-lg p-1.5 text-[var(--text-quaternary)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Remove plugin"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {filteredPlugins.length === 0 && (
          <div className="text-center py-12">
            <Puzzle className="h-10 w-10 text-[var(--text-quaternary)] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[var(--text-secondary)] mb-1">
              {searchQuery ? "No matching plugins" : "No plugins found"}
            </h3>
            <p className="text-xs text-[var(--text-quaternary)] max-w-md mx-auto">
              {searchQuery
                ? "Try a different search query."
                : "Plugins extend AgenticOS with new capabilities. Install plugins by placing them in ~/.agentic/plugins/"}
            </p>
          </div>
        )}

        {/* Info footer */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] p-4">
          <div className="flex items-start gap-3">
            <Puzzle className="h-4 w-4 text-[var(--text-quaternary)] mt-0.5 shrink-0" />
            <div className="text-[11px] text-[var(--text-quaternary)] leading-relaxed">
              <p className="font-medium text-[var(--text-tertiary)] mb-1">How Plugins Work</p>
              <p>
                Plugins can register new tools, MCP server configurations, UI components, and lifecycle hooks.
                Install plugins by creating a directory in{" "}
                <code className="text-indigo-400">~/.agentic/plugins/&lt;plugin-name&gt;/</code> with a
                <code className="text-indigo-400"> package.json</code> manifest.
              </p>
              <p className="mt-1">
                Built-in plugins are always available. Custom plugins can be toggled on/off and removed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PluginsPage
