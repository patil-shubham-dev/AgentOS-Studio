import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react"
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
  Layers, Globe,
} from "lucide-react"
import { PremiumEmptyState, getDesignEmptyState } from "./premium-empty-state"
import { DesignPreviewSkeleton } from "@/components/ui/Skeleton"

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
        <GitBranch className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
        <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Version History</span>
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
                ? "bg-[var(--accent-design)]/10 border border-[var(--accent-design)]/15"
                : "hover:bg-[var(--border-subtle)] border border-transparent",
            )}
          >
            <div className="relative flex flex-col items-center mt-1">
              <div className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isCurrent ? "bg-[var(--accent-design)]" : "bg-[var(--border-subtle)] group-hover:bg-[var(--border-default)]",
              )} />
              {!isLast && <div className="w-px h-4 bg-[var(--border-default)] my-0.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-mono font-medium",
                  isCurrent ? "text-[var(--accent-design)]" : "text-[var(--text-secondary)]",
                )}>
                  v{v.version}
                </span>
                {isCurrent && (
                  <span className="text-[8px] text-[var(--accent-design)]/60 font-medium">current</span>
                )}
              </div>
              <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1">{v.label}</p>
              <p className="text-[8px] text-[var(--text-quaternary)] mt-0.5">
                {new Date(v.timestamp).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {isCurrent && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-design)] mt-1.5 shrink-0" />
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
        className="w-80 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-2xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-[var(--accent-design)]/10 border border-[var(--accent-design)]/15">
              <Palette className="h-3 w-3 text-[var(--accent-design)]" />
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">New Design Artifact</span>
          </div>
          <button onClick={onClose} className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Button Component"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--accent-design)]/30 focus:bg-[var(--accent-design)]/[0.03] transition-all placeholder:text-[var(--text-quaternary)]"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--accent-design)]/30 focus:bg-[var(--accent-design)]/[0.03] transition-all placeholder:text-[var(--text-quaternary)]"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded-lg bg-[var(--accent-design)]/20 border border-[var(--accent-design)]/30 px-3 py-1.5 text-[10px] text-[var(--accent-design)] hover:bg-[var(--accent-design)]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Artifact
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Inline Code Editor ──

function CodeEditor({ code, onSave }: { code: string; onSave: (code: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(code)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(code)
    setEditing(false)
  }, [code])

  async function handleSave() {
    if (value === code) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(value)
      setEditing(false)
    } catch { /* handled by caller */ }
    setSaving(false)
  }

  if (!editing) {
    return (
      <div className="relative group h-full" onDoubleClick={() => setEditing(true)}>
        <pre className="p-4 text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap h-full overflow-auto">
          <code>{value}</code>
        </pre>
        <button
          onClick={() => setEditing(true)}
          className="absolute top-2 right-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-panel)]/80 backdrop-blur-sm px-2 py-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-all"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-default)] bg-[var(--surface-panel)] shrink-0">
        <span className="text-[9px] text-[var(--text-tertiary)]">Editing — double-click to preview rendered output</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditing(false); setValue(code) }}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || value === code}
            className="rounded-md border border-[var(--accent-design)]/20 bg-[var(--accent-design)]/10 px-2 py-1 text-[9px] text-[var(--accent-design)] hover:bg-[var(--accent-design)]/20 transition-all disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save as Version"}
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 w-full bg-transparent p-4 text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed outline-none resize-none"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}

// ── Main DesignWorkspace ──

const PreviewPane = lazy(() => import("@/components/workspace/preview/PreviewPane").then(m => ({ default: m.PreviewPane })))

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
  const [previewMode, setPreviewMode] = useState<"code" | "visual" | "split" | "live">("split")
  const [devicePreset, setDevicePreset] = useState(DEVICE_PRESETS[0])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)

  const currentArtifact = useMemo(() => {
    return artifacts.find((a) => a.id === currentArtifactId) ?? null
  }, [artifacts, currentArtifactId])

  const currentVersionData = useMemo(() => {
    if (!currentArtifact) return null
    return currentArtifact.versions.find((v) => v.version === currentArtifact.currentVersion) ?? null
  }, [currentArtifact])

  const htmlPreviewSrc = useMemo(() => {
    if (!currentVersionData) return ""
    return currentVersionData.htmlPreview || generateHtmlPreview(currentVersionData.code)
  }, [currentVersionData])

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

  // ── Show loading skeleton when preview content changes ──
  useEffect(() => {
    setPreviewLoading(true)
  }, [htmlPreviewSrc])

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
        const { invoke } = await import("@/lib/electron-api")
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
  const [regenerating, setRegenerating] = useState(false)
  const handleRegenerate = useCallback(async () => {
    if (!currentArtifact || !currentVersionData || regenerating) return
    setRegenerating(true)
    pulse("selection")
    try {
      const { ExecutionSessionManager } = await import("@/runtime/sessions/ExecutionSessionManager")
      const sessionManager = ExecutionSessionManager.getInstance()
      const correlationId = `design-regen-${Date.now()}`
      const task = `Improve this ${currentArtifact.name} component. Here is the current code:\n\n${currentVersionData.code}\n\n${currentArtifact.description ? "Context: " + currentArtifact.description + "\n\n" : ""}Return ONLY the improved code wrapped in \`\`\`...\`\`\` with a brief summary of changes.`
      await sessionManager.start({
        input: task,
        activeRole: "coder",
        correlationId,
      })
      notify(`AI regeneration started for "${currentArtifact.name}"`, "success", "success", 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify(`Regeneration failed: ${msg}`, "error", "error")
    } finally {
      setRegenerating(false)
    }
  }, [currentArtifact, currentVersionData, regenerating, notify, pulse])

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

  return (
    <div className="flex h-full bg-[var(--surface-app)]">
      {/* ── Artifact Browser Sidebar ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-panel)] overflow-hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3 w-3 text-[var(--accent-design)]" />
                  <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Designs</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
                    title="New artifact"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={handleImportClipboard}
                    className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
                    title="Import from clipboard"
                  >
                    <Upload className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-2 py-1.5 border-b border-[var(--border-default)]">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-quaternary)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search artifacts..."
                    className="w-full rounded-md border border-[var(--border-default)] bg-[var(--border-subtle)] pl-6 pr-2 py-1 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent-design)]/30 transition-all placeholder:text-[var(--text-quaternary)]"
                  />
                </div>
              </div>

              {/* Artifact list */}
              <div className="flex-1 overflow-y-auto py-1">
                {filteredArtifacts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Palette className="h-5 w-5 text-[var(--text-quaternary)]" />
                    <p className="text-[10px] text-[var(--text-tertiary)]">No artifacts yet</p>
                    {artifacts.length === 0 && (
                      <button
                        onClick={generateSample}
                        className="rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-3 py-1.5 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all mt-1"
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
                            ? "bg-[var(--accent-design)]/10 border border-[var(--accent-design)]/15"
                            : "hover:bg-[var(--border-subtle)] border border-transparent",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-[11px] font-medium truncate",
                            currentArtifactId === artifact.id ? "text-[var(--accent-design)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]",
                          )}>
                            {artifact.name}
                          </span>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); removeArtifact(artifact.id) }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeArtifact(artifact.id); } }}
                            className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            aria-label={`Delete ${artifact.name}`}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </div>
                        </div>
                        {artifact.description && (
                          <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1">{artifact.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] text-[var(--text-quaternary)] font-mono">
                            {artifact.versions.length} version{artifact.versions.length !== 1 ? "s" : ""}
                          </span>
                          {artifact.tags.length > 0 && (
                            <div className="flex gap-0.5">
                              {artifact.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-[var(--border-subtle)] px-1 py-px text-[7px] text-[var(--text-quaternary)]"
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
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-md border border-[var(--border-default)] border-l-0 bg-[var(--surface-panel)] p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
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
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-[var(--accent-design)]/10 border border-[var(--accent-design)]/15">
                  <Palette className="h-3 w-3 text-[var(--accent-design)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--text-secondary)] truncate">{currentArtifact.name}</span>
                    {currentVersionData && (
                      <span className="rounded-md bg-[var(--accent-design)]/10 px-1.5 py-0.5 text-[8px] font-mono text-[var(--accent-design)]/70 border border-[var(--accent-design)]/15">
                        v{currentVersionData.version}
                      </span>
                    )}
                    {currentArtifact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-[var(--border-subtle)] px-1.5 py-0.5 text-[8px] text-[var(--text-tertiary)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {currentArtifact.description && (
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5">{currentArtifact.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Preview mode toggles */}
                <div className="flex items-center gap-0.5 mr-2 border-r border-[var(--border-default)] pr-2" role="radiogroup" aria-label="Preview mode">
                  <button
                    onClick={() => setPreviewMode("code")}
                    role="radio"
                    aria-checked={previewMode === "code"}
                    className={cn(
                      "rounded p-1 transition-all",
                      previewMode === "code" ? "bg-[var(--border-default)] text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
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
                      previewMode === "visual" ? "bg-[var(--border-default)] text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
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
                      previewMode === "split" ? "bg-[var(--border-default)] text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                    )}
                    title="Split view"
                    aria-label="Split view"
                  >
                    <FileCode className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPreviewMode("live")}
                    role="radio"
                    aria-checked={previewMode === "live"}
                    className={cn(
                      "rounded p-1 transition-all",
                      previewMode === "live" ? "bg-[var(--border-default)] text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                    )}
                    title="Live browser preview"
                    aria-label="Live browser preview"
                  >
                    <Globe className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>

                {/* Device presets */}
                <div className="flex items-center gap-0.5 mr-2 border-r border-[var(--border-default)] pr-2" role="radiogroup" aria-label="Device preset">
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
                          isActive ? "bg-[var(--border-default)] text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
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
                  className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--border-subtle)] px-2 py-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
                  title="Export code"
                  aria-label="Export design code"
                >
                  <Download className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--border-subtle)] px-2 py-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all disabled:opacity-40"
                  title="Regenerate with AI"
                  aria-label="Regenerate design with AI"
                >
                  {regenerating ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  )}
                  <span>{regenerating ? "Generating..." : "Regenerate"}</span>
                </button>
                <button
                  onClick={handleApplyToCode}
                  disabled={applyToCode.isApplying || !currentVersionData}
                  className="flex items-center gap-1 rounded-md border border-[var(--accent-design)]/20 bg-[var(--accent-design)]/10 px-2.5 py-1 text-[9px] text-[var(--accent-design)] hover:bg-[var(--accent-design)]/20 transition-all disabled:opacity-40"
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
                      ? "border-[var(--accent-diff)]/15 bg-[var(--accent-diff)]/[0.03]"
                      : "border-[var(--color-accent-red)]/15 bg-[var(--color-accent-red)]/[0.03]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {applyToCode.result === "success" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-[var(--accent-diff)]" />
                        <span className="text-[var(--accent-diff)]">{applyToCode.progress}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 text-[var(--color-accent-red)]" />
                        <span className="text-[var(--color-accent-red)]">{applyToCode.errorMessage || applyToCode.progress}</span>
                      </>
                    )}
                    <button
                      onClick={resetApplyToCode}
                      className="ml-auto rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main content area with split panels */}
            <div className="flex-1 flex overflow-hidden">
              {previewMode === "live" ? (
                /* ── Live browser preview (merged from PreviewPane) ── */
                <div className="flex-1 flex flex-col overflow-hidden">
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-xs">Loading preview...</div>}>
                    <PreviewPane />
                  </Suspense>
                </div>
              ) : (
                <>
                  {/* Code panel */}
                  {(previewMode === "code" || previewMode === "split") && currentVersionData && (
                    <div className={cn(
                      "flex flex-col overflow-hidden",
                      previewMode === "split" ? "flex-1" : "w-full",
                    )}>
                      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-default)] bg-[var(--surface-panel)]">
                        <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Code</span>
                        <button
                          onClick={() => copyToClipboard(currentVersionData.code)}
                          className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
                          title="Copy code"
                        >
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <CodeEditor
                          code={currentVersionData.code}
                          onSave={async (newCode) => {
                            if (!currentArtifact) return
                            addVersion(currentArtifact.id, {
                              label: "Manual edit",
                              code: newCode,
                              htmlPreview: generateHtmlPreview(newCode),
                              changes: "Edited in design pane",
                            })
                            pulse("success")
                            notify("Code updated — new version created", "success", "success", 2000)
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Visual preview panel */}
                  {(previewMode === "visual" || previewMode === "split") && (
                    <div className={cn(
                      "flex flex-col overflow-hidden",
                      previewMode === "split"
                        ? "flex-1 border-l border-[var(--border-default)]"
                        : "w-full",
                      previewMode === "visual" ? "border-l-0" : "",
                    )}>
                      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-default)] bg-[var(--surface-panel)]">
                        <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Preview</span>
                        <span className="text-[8px] text-[var(--text-quaternary)] font-mono">{devicePreset.width}×{devicePreset.height}</span>
                      </div>
                      <div className="flex-1 overflow-auto bg-[var(--border-subtle)] flex items-start justify-center p-4">
                        {currentVersionData ? (
                          <div className="relative transition-all duration-200 overflow-hidden rounded-lg border border-[var(--border-default)]"
                            style={{ width: Math.min(devicePreset.width, 750), height: Math.min(devicePreset.height, 500) }}
                          >
                            {previewLoading && (
                              <div className="absolute inset-0 z-10"><DesignPreviewSkeleton /></div>
                            )}
                            <iframe
                              srcDoc={htmlPreviewSrc}
                              title="Design Preview"
                              className="w-full h-full bg-[var(--surface-app)]"
                              sandbox="allow-scripts"
                              onLoad={() => setPreviewLoading(false)}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 pt-16">
                            <EyeOff className="h-5 w-5 text-[var(--text-quaternary)]" />
                            <p className="text-[10px] text-[var(--text-tertiary)]">No version data to preview</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom: Version timeline */}
            {currentArtifact.versions.length > 0 && (
              <div className="border-t border-[var(--border-default)] bg-[var(--surface-panel)]">
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
                            ? "bg-[var(--accent-design)]/10 border border-[var(--accent-design)]/15 text-[var(--accent-design)]"
                            : "border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]",
                        )}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        <span className="font-mono font-medium">v{v.version}</span>
                        <span className="text-[8px] text-[var(--text-tertiary)]">{v.label}</span>
                        {isCurrent && <span className="h-1 w-1 rounded-full bg-[var(--accent-design)]" />}
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
