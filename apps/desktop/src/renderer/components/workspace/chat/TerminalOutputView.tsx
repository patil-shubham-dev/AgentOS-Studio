import { memo, useCallback } from "react"
import { motion } from "framer-motion"
import { FileCode, ExternalLink } from "lucide-react"
import { parseTerminalOutput, extractFileLocations } from "@/lib/terminal-output-parser"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface TerminalOutputViewProps {
  output: string
  maxHeight?: number
  showLineNumbers?: boolean
}

export const TerminalOutputView = memo(function TerminalOutputView({
  output,
  maxHeight = 240,
  showLineNumbers,
}: TerminalOutputViewProps) {
  const openFile = useWorkspaceStore((s) => s.openFile)
  const lines = parseTerminalOutput(output)
  const locations = extractFileLocations(output)

  const handleFileClick = useCallback((path: string, line?: number) => {
    openFile(path, line ? { startLine: line } : undefined)
  }, [openFile])

  if (!output) return null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "rgba(0,0,0,0.25)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* File locations bar */}
      {locations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}>
          <FileCode className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--text-quaternary)" }} />
          <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
            {locations.length} file{locations.length > 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap gap-1 ml-1">
            {locations.slice(0, 6).map((loc, i) => (
              <button
                key={`${loc.path}:${loc.line ?? ""}:${i}`}
                onClick={() => handleFileClick(loc.path, loc.line)}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] font-mono transition-all hover:bg-white/[0.06]"
                style={{ color: "var(--color-accent-brand)", backgroundColor: "rgba(59,130,246,0.06)" }}
                title={`${loc.path}${loc.line ? `:${loc.line}` : ""}`}
              >
                <ExternalLink className="h-2 w-2" />
                {loc.path.split(/[\\/]/).pop()}{loc.line ? `:${loc.line}` : ""}
              </button>
            ))}
            {locations.length > 6 && (
              <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
                +{locations.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Output content */}
      <pre
        className="overflow-y-auto p-2 text-[9px] font-mono leading-relaxed"
        style={{
          color: "var(--text-tertiary)",
          maxHeight,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className="flex">
            {showLineNumbers && (
              <span
                className="shrink-0 w-8 text-right mr-2 select-none text-[8px]"
                style={{ color: "var(--text-quaternary)" }}
              >
                {i + 1}
              </span>
            )}
            <span className="flex-1">
              {line.segments.map((seg, j) => {
                if (seg.type === "filepath") {
                  return (
                    <button
                      key={j}
                      onClick={() => {
                        const loc = locations.find((l) => l.path === seg.text)
                        handleFileClick(loc?.path ?? seg.text, loc?.line)
                      }}
                      className="underline decoration-dotted underline-offset-2 hover:decoration-solid transition-all"
                      style={{ color: "var(--color-accent-brand)" }}
                    >
                      {seg.text}
                    </button>
                  )
                }
                if (seg.type === "lineno") {
                  return (
                    <span key={j} className="opacity-60">
                      {seg.text}
                    </span>
                  )
                }
                if (seg.type === "error") {
                  return (
                    <span key={j} style={{ color: "rgba(239,68,68,0.7)" }}>
                      {seg.text}
                    </span>
                  )
                }
                return <span key={j}>{seg.text}</span>
              })}
            </span>
          </div>
        ))}
      </pre>
    </motion.div>
  )
})
