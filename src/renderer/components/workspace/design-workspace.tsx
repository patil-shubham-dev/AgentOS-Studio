import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useDesignStore } from "@/stores/design-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"
import { copyToClipboard } from "@/lib/clipboard"
import { useHaptic } from "@/lib/haptics"
import type { DesignArtifact, DesignArtifactVersion } from "@/types"
import {
  Palette, Plus, Trash2, Code2, Eye, EyeOff,
  Clock, Loader2, Sparkles, Copy,
  Download, Upload, FileCode,
  GitBranch, ChevronRight, ChevronDown, X,
  Search, AlertCircle, CheckCircle2,
  Maximize2, Minimize2, ArrowUpToLine,
  Layers,
} from "lucide-react"
import { PremiumEmptyState, getDesignEmptyState } from "./premium-empty-state"

// ── Placeholder code for empty state (no fake artifacts) ──

// ── Device presets for preview ──
const DEVICE_PRESETS = [
  { name: "Desktop", width: 1280, height: 800, icon: Maximize2 },
  { name: "Tablet", width: 768, height: 1024, icon: Minimize2 },
  { name: "Mobile", width: 375, height: 812, icon: Smartphone },
]

function Smartphone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  )
}

function generateHtmlPreview(code: string): string {
  const escapedCode = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0b; color: #e4e4e7; padding: 1.5rem; }
    pre { background: #1a1a2e; padding: 1rem; border-radius: 0.5rem; overflow: auto; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .notice { color: #888; font-size: 12px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <p class="notice">Code preview — visual rendering requires a build step</p>
  <pre><code>${escapedCode}</code></pre>
</body>
</html>`
}

// ── Version Timeline Component ──

function VersionTimeline({ versions, currentVersion, onSelect }: {
  versions: DesignArtifactVersion[]
  currentVersion: number
  onSelect: (version: number) => void
}) {
  if (versions.length === 0) return null

  return (
    <div className="space-y-1 px-2 py-2">
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <GitBranch className="h-2.5 w-2.5 text-white/30" />
        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Version History</span>
      </div>
      {[...versions].reverse().map((v, idx) => {
        const isLast = idx === versions.length - 1
        const isCurrent = v.version === currentVersion
        return (
          <button
            key={v.version}
            onClick={() => onSelect(v.version)}
            className={cn(
              "w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-all group",
              isCurrent
                ? "bg-purple-500/10 border border-purple-500/15"
                : "hover:bg-white/[0.03] border border-transparent",
            )}
          >
            <div className="relative flex flex-col items-center mt-1">
              <div className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isCurrent ? "bg-purple-500" : "bg-white/20 group-hover:bg-white/40",
              )} />
              {!isLast && <div className="w-px h-4 bg-white/[0.06] my-0.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-mono font-medium",
                  isCurrent ? "text-purple-400" : "text-white/50",
                )}>
                  v{v.version}
                </span>
                {isCurrent && (
                  <span className="text-[8px] text-purple-400/60 font-medium">current</span>
                )}
              </div>
              <p className="text-[9px] text-white/30 mt-0.5 line-clamp-1">{v.label}</p>
              <p className="text-[8px] text-white/20 mt-0.5">
                {new Date(v.timestamp).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {isCurrent && (
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Create Artifact Dialog ──

function CreateArtifactDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const addArtifact = useDesignStore((s) => s.addArtifact)

  function handleCreate() {
    if (!name.trim()) return
    addArtifact({
      name: name.trim(),
      description: description.trim(),
      tags: [],
    })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-80 rounded-xl border border-white/[0.08] bg-[#0d0d0e] shadow-2xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-purple-500/10 border border-purple-500/15">
              <Palette className="h-3 w-3 text-purple-400" />
            </div>
            <span className="text-sm font-medium text-white/70">New Design Artifact</span>
          </div>
          <button onClick={onClose} className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-white/40 block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Button Component"
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-purple-500/30 focus:bg-purple-500/[0.03] transition-all placeholder:text-white/20"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-white/40 block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-purple-500/30 focus:bg-purple-500/[0.03] transition-all placeholder:text-white/20"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded-lg bg-purple-500/20 border border-purple-500/30 px-3 py-1.5 text-[10px] text-purple-400 hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Artifact
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main DesignWorkspace ──

export function DesignWorkspace() {
  const artifacts = useDesignStore((s) => s.artifacts)
  const currentArtifactId = useDesignStore((s) => s.currentArtifactId)
  const setCurrentArtifact = useDesignStore((s) => s.setCurrentArtifact)
  const addVersion = useDesignStore((s) => s.addVersion)
  const removeArtifact = useDesignStore((s) => s.removeArtifact)
  const setCurrentVersion = useDesignStore((s) => s.setCurrentVersion)
  const applyToCode = useDesignStore((s) => s.applyToCode)
  const setApplyToCode = useDesignStore((s) => s.setApplyToCode)
  const resetApplyToCode = useDesignStore((s) => s.resetApplyToCode)

  const { pulse, notify } = useHaptic()

  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")
  const [previewMode, setPreviewMode] = useState<"code" | "visual" | "split">("split")
  const [devicePreset, setDevicePreset] = useState(DEVICE_PRESETS[0])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const currentArtifact = useMemo(() => {
    return artifacts.find((a) => a.id === currentArtifactId) ?? null
  }, [artifacts, currentArtifactId])

  const currentVersionData = useMemo(() => {
    if (!currentArtifact) return null
    return currentArtifact.versions.find((v) => v.version === currentArtifact.currentVersion) ?? null
  }, [currentArtifact])

  const filteredArtifacts = useMemo(() => {
    if (!search.trim()) return artifacts
    const q = search.toLowerCase()
    return artifacts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [artifacts, search])

  // ── Create artifact from clipboard ──
  const handleImportClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        notify("Clipboard is empty", "error", "error")
        return
      }
      const id = useDesignStore.getState().addArtifact({
        name: "Imported Component",
        description: `Imported from clipboard (${text.length} chars)`,
        tags: ["imported"],
      })
      useDesignStore.getState().addVersion(id, {
        label: "Initial import",
        code: text,
        htmlPreview: generateHtmlPreview(text),
        changes: "Imported from clipboard",
      })
      pulse("success")
      notify("Artifact created from clipboard", "success", "success")
    } catch {
      notify("Failed to read clipboard", "error", "error")
    }
  }, [notify, pulse])

  // ── Apply to code (actual file write with Tauri + web fallback) ──
  const handleApplyToCode = useCallback(async () => {
    if (!currentArtifact || !currentVersionData) return

    setApplyToCode({ isApplying: true, progress: "Preparing to apply design...", result: "idle" })
    pulse("medium")

    try {
      const rootPath = useWorkspaceStore.getState().rootPath
      if (!rootPath) {
        setApplyToCode({ isApplying: false, result: "error", errorMessage: "No workspace folder open" })
        pulse("error")
        return
      }

      setApplyToCode({ progress: "Creating component file..." })
      const safeName = currentArtifact.name
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase()
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "design-component"

      const fileName = `${safeName}.tsx`
      const targetPath = `${rootPath}/${fileName}`
      const content = currentVersionData.code

      setApplyToCode({ progress: `Writing to ${fileName}...` })

      // Try Tauri invoke first
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("write_text_file", { path: targetPath, content })
      } catch {
        // Web fallback: download as blob
        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }

      setApplyToCode({
        isApplying: false,
        targetPath,
        result: "success",
        progress: `Applied to ${fileName}`,
      })

      pulse("success")
      notify(`Design "${currentArtifact.name}" applied to ${fileName}`, "success", "success")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setApplyToCode({
        isApplying: false,
        result: "error",
        errorMessage: msg,
        progress: "",
      })
      pulse("error")
    }
  }, [currentArtifact, currentVersionData, setApplyToCode, pulse, notify])

  // ── Regenerate with AI ──
  const handleRegenerate = useCallback(async () => {
    if (!currentArtifact) return
    pulse("selection")
    notify("Design regeneration is not yet available", "info", "selection")
  }, [currentArtifact, notify, pulse])

  // ── Export ──
  const handleExport = useCallback(async () => {
    if (!currentVersionData) return
    await copyToClipboard(currentVersionData.code)
    pulse("success")
    notify("Design code copied to clipboard", "success", "success", 2000)
  }, [currentVersionData, notify, pulse])

  // ── Generate sample if empty ──
  const generateSample = useCallback(() => {
    notify("Create an artifact by pasting code from the clipboard", "info", "selection")
  }, [notify])

  const htmlPreviewSrc = useMemo(() => {
    if (!currentVersionData) return ""
    return currentVersionData.htmlPreview || generateHtmlPreview(currentVersionData.code)
  }, [currentVersionData])

  return (
    <div className="flex h-full bg-[#0a0a0b]">
      {/* ── Artifact Browser Sidebar ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0 border-r border-white/[0.06] bg-[#0c0c0d] overflow-hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3 w-3 text-purple-400" />
                  <span className="text-[10px] font-medium text-white/30 uppercase tracking-wider">Designs</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="rounded p-0.5 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                    title="New artifact"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={handleImportClipboard}
                    className="rounded p-0.5 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                    title="Import from clipboard"
                  >
                    <Upload className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-2 py-1.5 border-b border-white/[0.06]">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search artifacts..."
                    className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] pl-6 pr-2 py-1 text-[10px] text-white/60 outline-none focus:border-purple-500/30 transition-all placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Artifact list */}
              <div className="flex-1 overflow-y-auto py-1">
                {filteredArtifacts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Palette className="h-5 w-5 text-white/15" />
                    <p className="text-[10px] text-white/30">No artifacts yet</p>
                    {artifacts.length === 0 && (
                      <button
                        onClick={generateSample}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[9px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all mt-1"
                      >
                        Import from Clipboard
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5 px-1">
                    {filteredArtifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        onClick={() => setCurrentArtifact(artifact.id)}
                        className={cn(
                          "w-full rounded-lg px-2.5 py-2 text-left transition-all group",
                          currentArtifactId === artifact.id
                            ? "bg-purple-500/10 border border-purple-500/15"
                            : "hover:bg-white/[0.03] border border-transparent",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-[11px] font-medium truncate",
                            currentArtifactId === artifact.id ? "text-purple-300" : "text-white/60 group-hover:text-white/80",
                          )}>
                            {artifact.name}
                          </span>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); removeArtifact(artifact.id) }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeArtifact(artifact.id); } }}
                            className="rounded p-0.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            aria-label={`Delete ${artifact.name}`}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </div>
                        </div>
                        {artifact.description && (
                          <p className="text-[9px] text-white/30 mt-0.5 line-clamp-1">{artifact.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] text-white/20 font-mono">
                            {artifact.versions.length} version{artifact.versions.length !== 1 ? "s" : ""}
                          </span>
                          {artifact.tags.length > 0 && (
                            <div className="flex gap-0.5">
                              {artifact.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-white/[0.04] px-1 py-px text-[7px] text-white/25"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-md border border-white/[0.06] border-l-0 bg-[#0c0c0d] p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
        title="Toggle design browser"
      >
        {sidebarOpen ? <ChevronDown className="h-3 w-3 -rotate-90" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!currentArtifact ? (
          /* ── Premium Empty State ── */
          <PremiumEmptyState config={getDesignEmptyState(
            () => setShowCreate(true),
            handleImportClipboard,
            generateSample,
          )} />
        ) : (
          /* ── Artifact Content ── */
          <>
            {/* Artifact Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0c0c0d]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-purple-500/10 border border-purple-500/15">
                  <Palette className="h-3 w-3 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-white/70 truncate">{currentArtifact.name}</span>
                    {currentVersionData && (
                      <span className="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-mono text-purple-400/70 border border-purple-500/15">
                        v{currentVersionData.version}
                      </span>
                    )}
                    {currentArtifact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-white/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {currentArtifact.description && (
                    <p className="text-[9px] text-white/40 mt-0.5">{currentArtifact.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Preview mode toggles */}
                <div className="flex items-center gap-0.5 mr-2 border-r border-white/[0.06] pr-2" role="radiogroup" aria-label="Preview mode">
                  <button
                    onClick={() => setPreviewMode("code")}
                    role="radio"
                    aria-checked={previewMode === "code"}
                    className={cn(
                      "rounded p-1 transition-all",
                      previewMode === "code" ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/60",
                    )}
                    title="Code view"
                    aria-label="Code view"
                  >
                    <Code2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPreviewMode("visual")}
                    role="radio"
                    aria-checked={previewMode === "visual"}
                    className={cn(
                      "rounded p-1 transition-all",
                      previewMode === "visual" ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/60",
                    )}
                    title="Visual preview"
                    aria-label="Visual preview"
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPreviewMode("split")}
                    role="radio"
                    aria-checked={previewMode === "split"}
                    className={cn(
                      "rounded p-1 transition-all",
                      previewMode === "split" ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/60",
                    )}
                    title="Split view"
                    aria-label="Split view"
                  >
                    <FileCode className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>

                {/* Device presets */}
                <div className="flex items-center gap-0.5 mr-2 border-r border-white/[0.06] pr-2" role="radiogroup" aria-label="Device preset">
                  {DEVICE_PRESETS.map((d) => {
                    const Icon = d.icon
                    const isActive = devicePreset.name === d.name
                    return (
                      <button
                        key={d.name}
                        onClick={() => setDevicePreset(d)}
                        role="radio"
                        aria-checked={isActive}
                        aria-label={`${d.name} (${d.width}×${d.height})`}
                        className={cn(
                          "rounded p-1 transition-all",
                          isActive ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/60",
                        )}
                        title={`${d.name} (${d.width}×${d.height})`}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>

                {/* Actions */}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[9px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                  title="Export code"
                  aria-label="Export design code"
                >
                  <Download className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[9px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                  title="Regenerate with AI"
                  aria-label="Regenerate design with AI"
                >
                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Regenerate</span>
                </button>
                <button
                  onClick={handleApplyToCode}
                  disabled={applyToCode.isApplying || !currentVersionData}
                  className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[9px] text-purple-400 hover:bg-purple-500/20 transition-all disabled:opacity-40"
                  title="Apply design to codebase"
                  aria-label={applyToCode.isApplying ? "Applying design to code..." : "Apply design to codebase"}
                >
                  {applyToCode.isApplying ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowUpToLine className="h-2.5 w-2.5" aria-hidden="true" />
                  )}
                  <span>{applyToCode.isApplying ? "Applying..." : "Apply to Code"}</span>
                </button>
              </div>
            </div>

            {/* Apply result banner */}
            <AnimatePresence>
              {applyToCode.result !== "idle" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={cn(
                    "border-b px-4 py-2 text-[10px]",
                    applyToCode.result === "success"
                      ? "border-green-500/15 bg-green-500/[0.03]"
                      : "border-red-500/15 bg-red-500/[0.03]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {applyToCode.result === "success" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                        <span className="text-green-400">{applyToCode.progress}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 text-red-400" />
                        <span className="text-red-400">{applyToCode.errorMessage || applyToCode.progress}</span>
                      </>
                    )}
                    <button
                      onClick={resetApplyToCode}
                      className="ml-auto rounded p-0.5 text-white/30 hover:text-white/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main content area with split panels */}
            <div className="flex-1 flex overflow-hidden">
              {/* Code panel */}
              {(previewMode === "code" || previewMode === "split") && currentVersionData && (
                <div className={cn(
                  "flex flex-col overflow-hidden",
                  previewMode === "split" ? "flex-1" : "w-full",
                )}>
                  <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.06] bg-[#0c0c0d]">
                    <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Code</span>
                    <button
                      onClick={() => copyToClipboard(currentVersionData.code)}
                      className="rounded p-0.5 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                      title="Copy code"
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <pre className="p-4 text-[11px] font-mono text-white/60 leading-relaxed whitespace-pre-wrap">
                      <code>{currentVersionData.code}</code>
                    </pre>
                  </div>
                </div>
              )}

              {/* Visual preview panel */}
              {(previewMode === "visual" || previewMode === "split") && (
                <div className={cn(
                  "flex flex-col overflow-hidden",
                  previewMode === "split"
                    ? "flex-1 border-l border-white/[0.06]"
                    : "w-full",
                  previewMode === "visual" ? "border-l-0" : "",
                )}>
                  <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.06] bg-[#0c0c0d]">
                    <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Preview</span>
                    <span className="text-[8px] text-white/20 font-mono">{devicePreset.width}×{devicePreset.height}</span>
                  </div>
                  <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-4">
                    {currentVersionData ? (
                      <div
                        className="transition-all duration-200 overflow-hidden rounded-lg border border-white/[0.06]"
                        style={{ width: Math.min(devicePreset.width, 750), height: Math.min(devicePreset.height, 500) }}
                      >
                        <iframe
                          srcDoc={htmlPreviewSrc}
                          title="Design Preview"
                          className="w-full h-full bg-[#0a0a0b]"
                          sandbox="allow-scripts"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 pt-16">
                        <EyeOff className="h-5 w-5 text-white/15" />
                        <p className="text-[10px] text-white/30">No version data to preview</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom: Version timeline */}
            {currentArtifact.versions.length > 0 && (
              <div className="border-t border-white/[0.06] bg-[#0c0c0d]">
                <div className="flex items-center gap-2 overflow-x-auto px-3 py-1.5">
                  {currentArtifact.versions.map((v) => {
                    const isCurrent = v.version === currentArtifact.currentVersion
                    return (
                      <button
                        key={v.version}
                        onClick={() => setCurrentVersion(currentArtifact.id, v.version)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] transition-all whitespace-nowrap",
                          isCurrent
                            ? "bg-purple-500/10 border border-purple-500/15 text-purple-400"
                            : "border border-transparent text-white/40 hover:text-white/60 hover:bg-white/[0.04]",
                        )}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        <span className="font-mono font-medium">v{v.version}</span>
                        <span className="text-[8px] text-white/30">{v.label}</span>
                        {isCurrent && <span className="h-1 w-1 rounded-full bg-purple-500" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Artifact Dialog */}
      <AnimatePresence>
        {showCreate && (
          <div role="dialog" aria-modal="true" aria-label="Create new design artifact">
            <CreateArtifactDialog onClose={() => setShowCreate(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
