/**
 * ConfigInitBanner — prompts the user to generate an AGENTIC.md config file
 * when one doesn't exist in the workspace. Shown on first workspace open.
 *
 * Features:
 *   - Detects if AGENTIC.md exists
 *   - Shows a dismissible banner if missing
 *   - "Generate" button that creates a tailored AGENTIC.md via ConfigGenerator
 *   - "Dismiss" to hide permanently for this workspace
 *   - Visual feedback on generation success/failure
 */

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { configGenerator } from "@/runtime/project-config/ConfigGenerator"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { loadFileTree } from "@/lib/filesystem"
import {
  FileText,
  Sparkles,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react"

const DISMISSED_KEY = "agentic-config-banner-dismissed"

function isDismissedForWorkspace(rootPath: string): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (!dismissed) return false
    const parsed = JSON.parse(dismissed)
    return Array.isArray(parsed) && parsed.includes(rootPath)
  } catch {
    return false
  }
}

function markDismissed(rootPath: string): void {
  try {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    const list: string[] = dismissed ? JSON.parse(dismissed) : []
    if (!list.includes(rootPath)) {
      list.push(rootPath)
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(list))
    }
  } catch {
    // Ignore storage errors
  }
}

export function ConfigInitBanner() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<"success" | "error" | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [hasConfig, setHasConfig] = useState<boolean | null>(null)

  // Check if AGENTIC.md exists on mount or when rootPath changes
  useEffect(() => {
    if (!rootPath) {
      setVisible(false)
      setChecking(false)
      return
    }

    setChecking(true)
    setResult(null)
    setHasConfig(null)

    // Check if dismissed for this workspace
    if (isDismissedForWorkspace(rootPath)) {
      setVisible(false)
      setChecking(false)
      return
    }

    // Run the check asynchronously
    let cancelled = false

    const check = async () => {
      try {
        const result = await configLoader.load(rootPath)
        if (!cancelled) {
          const exists = result.configs.some((c) => c.source === "project")
          setHasConfig(exists)
          setVisible(!exists)
        }
      } catch {
        if (!cancelled) {
          setHasConfig(false)
          setVisible(true)
        }
      } finally {
        if (!cancelled) {
          setChecking(false)
        }
      }
    }

    check()
    return () => { cancelled = true }
  }, [rootPath])

  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false)
  const [existingConfig, setExistingConfig] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!rootPath) return

    // Check if AGENTIC.md already exists
    try {
      const result = await configLoader.load(rootPath)
      const alreadyExists = result.configs.some((c) => c.source === "project")
      if (alreadyExists) {
        setExistingConfig(true)
        setShowConfirmOverwrite(true)
        return
      }
    } catch {
      // If we can't check, proceed with generation
    }

    await doGenerate()
  }, [rootPath])

  const doGenerate = useCallback(async () => {
    if (!rootPath) return

    setGenerating(true)
    setResult(null)
    setErrorMessage("")
    setShowConfirmOverwrite(false)

    try {
      const content = await configGenerator.generate(rootPath)
      const written = await configGenerator.write(rootPath, content)

      if (written) {
        setResult("success")
        configLoader.invalidateCache()
        const tree = await loadFileTree(rootPath)
        useWorkspaceStore.getState().setFileTree(tree)
        setTimeout(() => setVisible(false), 2000)
      } else {
        setResult("error")
        setErrorMessage("Could not write to filesystem. Make sure the workspace directory is writable.")
      }
    } catch (err) {
      setResult("error")
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [rootPath])

  const handleDismiss = useCallback(() => {
    if (rootPath) markDismissed(rootPath)
    setVisible(false)
    setResult(null)
  }, [rootPath])

  if (!visible || checking) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
        animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={cn(
          "rounded-xl border overflow-hidden",
          result === "success"
            ? "border-green-500/20 bg-green-500/5"
            : result === "error"
              ? "border-red-500/20 bg-red-500/5"
              : "border-blue-500/20 bg-gradient-to-r from-blue-500/8 to-indigo-500/5",
        )}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          {/* Icon */}
          {result === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
          ) : result === "error" ? (
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <FileText className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {result === "success" ? (
              <>
                <p className="text-xs font-semibold text-green-400">AGENTIC.md Created</p>
                <p className="text-[10px] text-green-300/70 mt-0.5">
                  Project configuration generated successfully. The AI will now follow your project conventions.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-white/80">Configure Project for Better Results</p>
                <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">
                  No <code className="text-blue-400">AGENTIC.md</code> file found. Generate one to let the AI
                  understand your project structure, build commands, and coding conventions — resulting in
                  more accurate and context-aware responses.
                </p>
              </>
            )}

            {/* Error detail */}
            {result === "error" && errorMessage && (
              <p className="text-[9px] text-red-400/60 mt-1">{errorMessage}</p>
            )}

            {/* Confirmation dialog for overwrite */}
            {showConfirmOverwrite && (
              <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <p className="text-[10px] text-amber-400/80 mb-2">
                  AGENTIC.md already exists in this project. Overwrite it?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={doGenerate}
                    className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25 text-[10px] font-medium text-amber-400 hover:bg-amber-500/25 transition-all"
                  >
                    Overwrite
                  </button>
                  <button
                    onClick={() => setShowConfirmOverwrite(false)}
                    className="px-2 py-1 rounded-lg text-[10px] text-white/30 hover:text-white/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            {!showConfirmOverwrite && (
              <div className="flex items-center gap-2 mt-2">
                {result !== "success" && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1 rounded-lg bg-blue-500/15 border border-blue-500/25 px-3 py-1.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/25 transition-all disabled:opacity-50"
                  >
                    {generating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {generating ? "Generating..." : "Generate AGENTIC.md"}
                  </button>
                )}
                {result !== "success" && (
                  <button
                    onClick={handleDismiss}
                    className="rounded-lg px-3 py-1.5 text-[10px] text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-all"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
