import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import { useToastStore } from "@/stores/toast-store"
import type { GatewayProvider } from "@/types"
import {
  X, Check, ChevronRight, Code2, Bot, Settings2, Server,
  Loader2, AlertTriangle, CheckCircle2, FileCode,
  Monitor, Terminal, Braces, Zap, Search,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface DetectedSource {
  id: "vscode" | "cursor" | "claude-desktop"
  name: string
  icon: string
  detected: boolean
  configFiles: Array<{
    path: string
    name: string
    exists: boolean
    size: number
    description: string
  }>
  providerCount?: number
  mcpServerCount?: number
}

interface ImportableData {
  source: string
  providers?: Array<{
    name: string
    baseUrl: string
    apiKey: string
    models: string[]
  }>
  mcpServers?: Array<{
    name: string
    command: string
    args: string[]
  }>
  editorSettings?: Record<string, unknown>
  theme?: string
  fontSize?: number
}

interface ImportSelection {
  sourceId: string
  importProviders: boolean
  importMcpServers: boolean
  importEditorSettings: boolean
}

interface ImportState {
  scanning: boolean
  importing: boolean
  done: boolean
  detectedSources: DetectedSource[]
  importedData: ImportableData[]
  error: string | null
}

// ─── Source Config ──────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { icon: typeof Code2; color: string; description: string }> = {
  "vscode": { icon: Code2, color: "text-blue-400", description: "Editor settings & keybindings" },
  "cursor": { icon: Monitor, color: "text-emerald-400", description: "Editor settings & keybindings" },
  "claude-desktop": { icon: Bot, color: "text-purple-400", description: "Providers, API keys & MCP servers" },
}

// ─── Format Bytes ───────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ImportSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function ImportSettingsDialog({ open, onClose }: ImportSettingsDialogProps) {
  const addProvider = useAppStore((s) => s.addProvider)
  const addMcpServer = useAppStore((s) => s.addMcpServer)
  const addToast = useToastStore((s) => s.addToast)

  const [state, setState] = useState<ImportState>({
    scanning: true,
    importing: false,
    done: false,
    detectedSources: [],
    importedData: [],
    error: null,
  })

  const [selections, setSelections] = useState<Record<string, ImportSelection>>({})
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [importResults, setImportResults] = useState<Array<{ source: string; success: boolean; items: number; message: string }>>([])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setState({
        scanning: true,
        importing: false,
        done: false,
        detectedSources: [],
        importedData: [],
        error: null,
      })
      setSelections({})
      setExpandedSource(null)
      setImportResults([])
      scanSources()
    }
  }, [open])

  const scanSources = useCallback(async () => {
    setState((prev) => ({ ...prev, scanning: true, error: null }))
    try {
      const result = await (window.electronAPI as any)?.importSettingsScan()
      if (!result) {
        setState((prev) => ({ ...prev, scanning: false, error: "Failed to scan for settings" }))
        return
      }

      const detected = result.sources as DetectedSource[]

      // Read data for each detected source
      const dataMap: ImportableData[] = []
      const defaultSelections: Record<string, ImportSelection> = {}

      for (const source of detected) {
        if (!source.detected) continue

        const data = await (window.electronAPI as any)?.importSettingsRead(source.id)
        if (data) {
          dataMap.push(data as ImportableData)

          // Default selections based on what's available
          defaultSelections[source.id] = {
            sourceId: source.id,
            importProviders: !!(data as ImportableData).providers?.length,
            importMcpServers: !!(data as ImportableData).mcpServers?.length,
            importEditorSettings: !!(data as ImportableData).editorSettings && Object.keys((data as ImportableData).editorSettings!).length > 0,
          }
        }
      }

      setState((prev) => ({
        ...prev,
        scanning: false,
        detectedSources: detected,
        importedData: dataMap,
      }))
      setSelections(defaultSelections)
    } catch (err) {
      console.error("[ImportSettings] Scan failed:", err)
      setState((prev) => ({ ...prev, scanning: false, error: "Failed to scan for settings. Check console for details." }))
    }
  }, [])

  const hasImportable = state.detectedSources.some((s) => s.detected)

  const toggleSelection = useCallback((sourceId: string, field: keyof ImportSelection) => {
    setSelections((prev) => {
      const current = prev[sourceId]
      if (!current) return prev
      return {
        ...prev,
        [sourceId]: { ...current, [field]: !current[field] },
      }
    })
  }, [])

  const performImport = useCallback(async () => {
    setState((prev) => ({ ...prev, importing: true, error: null }))
    const results: Array<{ source: string; success: boolean; items: number; message: string }> = []

    for (const data of state.importedData) {
      const sel = selections[data.source]
      if (!sel) continue
      if (!sel.importProviders && !sel.importMcpServers && !sel.importEditorSettings) {
        results.push({ source: data.source, success: true, items: 0, message: "No items selected" })
        continue
      }

      let importedItems = 0
      // const _sourceMeta = SOURCE_META[data.source]

      try {
        // Import providers (from Claude Desktop)
        if (sel.importProviders && data.providers) {
          for (const p of data.providers) {
            if (!p.apiKey) continue
            const provider: GatewayProvider = {
              id: `${data.source}-${p.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
              name: p.name,
              baseUrl: p.baseUrl,
              apiKey: p.apiKey,
              runtime: null,
              isLocal: false,
              isOpenAiCompatible: true,
              models: p.models.map((m) => ({
                id: m,
                name: m,
                supportsTools: true,
                supportsVision: true,
                supportsStreaming: true,
              })),
              createdAt: new Date().toISOString(),
            }
            addProvider(provider)
            importedItems++
          }
        }

        // Import MCP servers (from Claude Desktop)
        if (sel.importMcpServers && data.mcpServers) {
          for (const server of data.mcpServers) {
            if (!server.command) continue
            addMcpServer({
              id: `imported-${data.source}-${server.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
              name: server.name,
              command: server.command,
              args: server.args || [],
              env: {},
              enabled: true,
              status: "disconnected",
            })
            importedItems++
          }
        }

        results.push({
          source: data.source,
          success: true,
          items: importedItems,
          message: `Imported ${importedItems} item${importedItems !== 1 ? "s" : ""}`,
        })
      } catch (err) {
        console.error(`[ImportSettings] Import from ${data.source} failed:`, err)
        results.push({
          source: data.source,
          success: false,
          items: 0,
          message: "Import failed — see console for details",
        })
      }
    }

    setImportResults(results)
    setState((prev) => ({ ...prev, importing: false, done: true }))

    const totalImported = results.reduce((acc, r) => acc + r.items, 0)
    if (totalImported > 0) {
      addToast(`Successfully imported ${totalImported} item${totalImported !== 1 ? "s" : ""}`, "success", 4000)
    }
  }, [state.importedData, selections, addProvider, addMcpServer, addToast])

  const totalSelected = Object.values(selections).reduce(
    (acc, sel) => acc + (sel.importProviders ? 1 : 0) + (sel.importMcpServers ? 1 : 0) + (sel.importEditorSettings ? 1 : 0),
    0,
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-white/10 bg-[#0d0d12] shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
                    <Settings2 className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white/90">Import Settings</h2>
                    <p className="text-[10px] text-white/40">From VS Code, Cursor, and Claude Desktop</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
                {/* Scanning state */}
                {state.scanning && (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20">
                      <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                    </div>
                    <p className="text-sm text-white/60">Scanning for existing installations...</p>
                    <p className="text-[10px] text-white/30">Checking VS Code, Cursor, and Claude Desktop config files</p>
                  </div>
                )}

                {/* Error state */}
                {state.error && (
                  <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-red-400">Scan failed</p>
                      <p className="text-[10px] text-red-400/70 mt-0.5">{state.error}</p>
                    </div>
                    <button
                      onClick={scanSources}
                      className="ml-auto shrink-0 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* No sources found */}
                {!state.scanning && !state.error && !hasImportable && (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10">
                      <Search className="h-6 w-6 text-white/30" />
                    </div>
                    <p className="text-sm text-white/60">No settings found</p>
                    <p className="text-xs text-white/30 text-center max-w-xs">
                      We checked VS Code, Cursor, and Claude Desktop but didn't find any
                      configuration files to import.
                    </p>
                    <button
                      onClick={onClose}
                      className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20 transition-all"
                    >
                      Close
                    </button>
                  </div>
                )}

                {/* Done state — show results */}
                {state.done && !state.scanning && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <span className="text-xs font-semibold text-white/70">Import Complete</span>
                    </div>
                    {importResults.map((result) => (
                      <div
                        key={result.source}
                        className={cn(
                          "rounded-xl border p-3 flex items-start gap-3",
                          result.success
                            ? "border-green-500/15 bg-green-500/[0.03]"
                            : "border-red-500/15 bg-red-500/[0.03]",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                            result.success
                              ? "bg-green-500/10 border border-green-500/20"
                              : "bg-red-500/10 border border-red-500/20",
                          )}
                        >
                          {result.success
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : <AlertTriangle className="h-4 w-4 text-red-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/70 capitalize">{result.source.replace("-", " ")}</p>
                          <p className={cn("text-[10px]", result.success ? "text-green-400/60" : "text-red-400/60")}>
                            {result.message}
                          </p>
                        </div>
                        {result.items > 0 && (
                          <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[8px] font-mono text-green-400">
                            +{result.items}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Source cards — detected sources for selection */}
                {!state.scanning && !state.error && hasImportable && !state.done && (
                  <>
                    <p className="text-[10px] text-white/30">
                      Select what to import from each detected application.
                      API keys will be securely stored.
                    </p>

                    <div className="space-y-2">
                      {state.detectedSources
                        .filter((s) => s.detected)
                        .map((source) => {
                          const meta = SOURCE_META[source.id]
                          const Icon = meta?.icon || FileCode
                          const sel = selections[source.id]
                          const data = state.importedData.find((d) => d.source === source.id)
                          const isExpanded = expandedSource === source.id

                          return (
                            <div
                              key={source.id}
                              className={cn(
                                "rounded-xl border transition-all",
                                isExpanded ? "border-white/15 bg-white/[0.03]" : "border-white/5 bg-white/[0.02]",
                              )}
                            >
                              {/* Source header */}
                              <button
                                onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                                className="flex w-full items-center gap-3 p-3 text-left"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 shrink-0">
                                  <Icon className={cn("h-4 w-4", meta?.color || "text-white/40")} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-white/80">{source.name}</span>
                                    {source.id === "claude-desktop" && source.providerCount && source.providerCount > 0 && (
                                      <span className="rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-medium text-purple-400">
                                        {source.providerCount} provider{source.providerCount !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                    {source.id === "claude-desktop" && source.mcpServerCount && source.mcpServerCount > 0 && (
                                      <span className="rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-medium text-cyan-400">
                                        {source.mcpServerCount} MCP
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-white/30 mt-0.5">{meta?.description}</p>
                                </div>
                                <ChevronRight
                                  className={cn(
                                    "h-4 w-4 text-white/20 transition-transform",
                                    isExpanded && "rotate-90",
                                  )}
                                />
                              </button>

                              {/* Expanded: config files + import options */}
                              {isExpanded && (
                                <div className="px-3 pb-3 pt-0 space-y-3">
                                  {/* Config file sizes */}
                                  <div className="space-y-1">
                                    {source.configFiles.map((file) => (
                                      <div
                                        key={file.path}
                                        className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5"
                                      >
                                        <FileCode className="h-3 w-3 text-white/20 shrink-0" />
                                        <span className="text-[10px] text-white/50 font-mono flex-1 truncate">{file.name}</span>
                                        <span className="text-[9px] text-white/30 font-mono">{fmtBytes(file.size)}</span>
                                        <Check className="h-3 w-3 text-green-400/60 shrink-0" />
                                      </div>
                                    ))}
                                  </div>

                                  {/* Importable data checkboxes */}
                                  {data && (
                                    <div className="space-y-1.5">
                                      {data.providers && data.providers.length > 0 && (
                                        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-white/[0.02] transition-all">
                                          <div
                                            className={cn(
                                              "flex h-4 w-4 items-center justify-center rounded border shrink-0 transition-all",
                                              sel?.importProviders ? "border-blue-500 bg-blue-500" : "border-white/20",
                                            )}
                                          >
                                            {sel?.importProviders && <Check className="h-3 w-3 text-white" />}
                                          </div>
                                          <Server className="h-3.5 w-3.5 text-purple-400/60" />
                                          <span className="text-[11px] text-white/60 flex-1">
                                            Provider{data.providers.length > 1 ? "s" : ""}
                                          </span>
                                          <span className="text-[10px] text-white/30 font-mono">{data.providers.length}</span>
                                        </label>
                                      )}

                                      {data.mcpServers && data.mcpServers.length > 0 && (
                                        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-white/[0.02] transition-all">
                                          <div
                                            className={cn(
                                              "flex h-4 w-4 items-center justify-center rounded border shrink-0 transition-all",
                                              sel?.importMcpServers ? "border-blue-500 bg-blue-500" : "border-white/20",
                                            )}
                                            onClick={() => toggleSelection(source.id, "importMcpServers")}
                                          >
                                            {sel?.importMcpServers && <Check className="h-3 w-3 text-white" />}
                                          </div>
                                          <Terminal className="h-3.5 w-3.5 text-cyan-400/60" />
                                          <span className="text-[11px] text-white/60 flex-1">MCP Servers</span>
                                          <span className="text-[10px] text-white/30 font-mono">{data.mcpServers.length}</span>
                                        </label>
                                      )}

                                      {data.editorSettings && Object.keys(data.editorSettings).length > 0 && (
                                        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-white/[0.02] transition-all">
                                          <div
                                            className={cn(
                                              "flex h-4 w-4 items-center justify-center rounded border shrink-0 transition-all",
                                              sel?.importEditorSettings ? "border-blue-500 bg-blue-500" : "border-white/20",
                                            )}
                                            onClick={() => toggleSelection(source.id, "importEditorSettings")}
                                          >
                                            {sel?.importEditorSettings && <Check className="h-3 w-3 text-white" />}
                                          </div>
                                          <Braces className="h-3.5 w-3.5 text-emerald-400/60" />
                                          <span className="text-[11px] text-white/60 flex-1">Editor Settings</span>
                                          <span className="text-[10px] text-white/30 font-mono">
                                            {Object.keys(data.editorSettings).length}
                                          </span>
                                        </label>
                                      )}

                                      {/* Preview of settings */}
                                      {data.editorSettings && Object.keys(data.editorSettings).length > 0 && (
                                        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2.5 space-y-1">
                                          <p className="text-[8px] text-white/20 font-medium uppercase tracking-wider">Settings Preview</p>
                                          {data.theme && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] text-white/30">Theme:</span>
                                              <span className="text-[9px] text-white/60">{data.theme}</span>
                                            </div>
                                          )}
                                          {data.fontSize && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] text-white/30">Font size:</span>
                                              <span className="text-[9px] text-white/60">{data.fontSize}px</span>
                                            </div>
                                          )}
                                          <p className="text-[8px] text-white/20">
                                            + {Object.keys(data.editorSettings).length - (data.theme ? 1 : 0) - (data.fontSize ? 1 : 0)} more settings
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              {!state.scanning && !state.error && !state.done && hasImportable && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-black/20">
                  <span className="text-[10px] text-white/30">
                    {totalSelected > 0
                      ? `${totalSelected} item${totalSelected !== 1 ? "s" : ""} selected`
                      : "Select items to import"
                    }
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      className="rounded-lg border border-white/5 px-3 py-1.5 text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={performImport}
                      disabled={totalSelected === 0 || state.importing}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[10px] font-medium transition-all",
                        totalSelected > 0
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500"
                          : "bg-white/[0.03] text-white/20 border border-white/5 cursor-not-allowed",
                      )}
                    >
                      {state.importing ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Importing...</>
                      ) : (
                        <><Zap className="h-3 w-3" /> Import Selected</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Done footer */}
              {state.done && (
                <div className="flex items-center justify-end px-5 py-3 border-t border-white/5 bg-black/20">
                  <button
                    onClick={onClose}
                    className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-[10px] font-medium text-white hover:from-blue-500 hover:to-purple-500 transition-all"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ImportSettingsDialog
