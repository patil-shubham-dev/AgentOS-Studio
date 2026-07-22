import { memo, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GitBranch, Sparkles, Check, Copy, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"

export const CommitMessageGen = memo(function CommitMessageGen() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!rootPath || generating) return
    setGenerating(true)
    try {
      const { gitDiff, gitStatus } = await import("@/lib/git")
      const statusResult = await gitStatus(rootPath).catch(() => null)
      const diffText = await gitDiff(rootPath, "").catch(() => "")
      if (!diffText && !statusResult) {
        setMessage("No uncommitted changes detected.")
        return
      }
      const changes = statusResult?.changes ?? []
      const summary = changes.map(c => `${c.status === "modified" ? "🔄" : c.status === "added" ? "➕" : c.status === "deleted" ? "➖" : "📄"} ${c.path}`).join("\n")
      setMessage(summary ? `Changes:\n${summary}` : diffText?.slice(0, 500) ?? "")
    } catch {
      setMessage("Failed to analyze changes.")
    } finally {
      setGenerating(false)
    }
  }, [rootPath, generating])

  const handleCopy = useCallback(async () => {
    if (message) {
      await navigator.clipboard.writeText(message).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [message])

  if (!rootPath) return null

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-all hover:bg-white/[0.04] disabled:opacity-40"
        style={{ color: "var(--text-tertiary)" }}
      >
        {generating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <GitBranch className="h-3 w-3" />
        )}
        <span>{generating ? "Analyzing..." : "Generate Commit Msg"}</span>
      </button>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 overflow-hidden"
          >
            <div className="rounded-lg p-2 border" style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              borderColor: "var(--border-subtle)",
            }}>
              <pre className="text-[10px] font-mono leading-relaxed max-h-20 overflow-y-auto whitespace-pre-wrap"
                style={{ color: "var(--text-secondary)" }}>
                {message}
              </pre>
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors hover:bg-white/[0.04]"
                  style={{ color: "var(--text-quaternary)" }}
                >
                  {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors hover:bg-white/[0.04]"
                  style={{ color: "var(--text-quaternary)" }}
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Regenerate
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
