import { useRef, useEffect, useCallback, useState } from "react"
import { useDebugStore } from "@/stores/debug-store"
import { debugService } from "@/lib/debug/debug-service"
import { cn } from "@/lib/utils"
import {
  Play, SkipForward, CornerDownRight, CornerUpLeft,
  X, Circle, Pause, Terminal, Square, Loader2, Bug,
} from "lucide-react"

export function DebugPanel() {
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const isPaused = useDebugStore((s) => s.isPaused)
  const isRunning = useDebugStore((s) => s.isRunning)
  const isConnecting = useDebugStore((s) => s.isConnecting)
  const cdpConnected = useDebugStore((s) => s.cdpConnected)
  const currentFrame = useDebugStore((s) => s.currentFrame)
  const callStack = useDebugStore((s) => s.callStack)
  const variables = useDebugStore((s) => s.variables)
  const consoleOutput = useDebugStore((s) => s.consoleOutput)
  const removeBreakpoint = useDebugStore((s) => s.removeBreakpoint)
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint)
  const clearConsole = useDebugStore((s) => s.clearConsole)

  const [filePath, setFilePath] = useState("")
  const [workingDir, setWorkingDir] = useState("")
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleOutput])

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
  }, [])

  const handleLaunch = () => {
    if (!filePath || !workingDir) return
    debugService.startSession(filePath, workingDir)
  }

  const handleStop = () => {
    debugService.stopSession()
  }

  const canStep = isRunning && cdpConnected && isPaused
  const canContinue = isRunning && cdpConnected && isPaused
  const canPause = isRunning && cdpConnected && !isPaused

  return (
    <div className="flex h-full flex-col text-[11px]">
      {/* Launch/Connect bar */}
      {!isRunning ? (
        <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--surface-panel)]/50">
          <Bug className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="File path (e.g. script.js)"
            className="flex-1 min-w-0 bg-[var(--border-default)] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] outline-none focus:border-[var(--accent-code)]/50"
          />
          <input
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Working dir"
            className="w-24 bg-[var(--border-default)] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] outline-none focus:border-[var(--accent-code)]/50"
          />
          <button
            onClick={handleLaunch}
            disabled={!filePath || !workingDir}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              filePath && workingDir
                ? "bg-[var(--color-accent-green)]/80 text-[var(--text-primary)] hover:bg-[var(--color-accent-green)]"
                : "bg-[var(--border-default)] text-[var(--text-quaternary)] cursor-not-allowed",
            )}
          >
            Launch
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--surface-panel)]/50">
          <button
            onClick={() => canContinue ? debugService.resume() : undefined}
            disabled={!canContinue}
            className={cn(
              "rounded p-1 transition-colors",
              canContinue
                ? "text-[var(--color-accent-green)] hover:bg-[var(--border-default)] hover:text-[var(--color-accent-green)]/80"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
            )}
            title="Continue (F5)"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => canStep ? debugService.stepOver() : undefined}
            disabled={!canStep}
            className={cn(
              "rounded p-1 transition-colors",
              canStep
                ? "text-[var(--text-secondary)] hover:bg-[var(--border-default)] hover:text-[var(--text-primary)]"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
            )}
            title="Step Over (F10)"
          >
            <CornerDownRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => canStep ? debugService.stepInto() : undefined}
            disabled={!canStep}
            className={cn(
              "rounded p-1 transition-colors",
              canStep
                ? "text-[var(--text-secondary)] hover:bg-[var(--border-default)] hover:text-[var(--text-primary)]"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
            )}
            title="Step Into (F11)"
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => canStep ? debugService.stepOut() : undefined}
            disabled={!canStep}
            className={cn(
              "rounded p-1 transition-colors",
              canStep
                ? "text-[var(--text-secondary)] hover:bg-[var(--border-default)] hover:text-[var(--text-primary)]"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
            )}
            title="Step Out (Shift+F11)"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {isConnecting && (
              <span className="flex items-center gap-1 text-[9px] text-[var(--color-accent-amber)]/70">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Connecting
              </span>
            )}
            {cdpConnected && isPaused && (
              <span className="flex items-center gap-1 rounded bg-[var(--accent-code)]/15 px-1.5 py-0.5 text-[9px] text-[var(--accent-code)]">
                <Pause className="h-2.5 w-2.5" />
                Paused
              </span>
            )}
            {cdpConnected && !isPaused && !isConnecting && (
              <span className="flex items-center gap-1 rounded bg-[var(--color-accent-green)]/15 px-1.5 py-0.5 text-[9px] text-[var(--color-accent-green)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-green)] animate-pulse" />
                Running
              </span>
            )}
            <button
              onClick={handleStop}
              className="rounded p-1 text-[var(--color-accent-red)]/70 hover:bg-[var(--border-default)] hover:text-[var(--color-accent-red)]/80 transition-colors"
              title="Stop"
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Paused frame info */}
      {currentFrame && isPaused && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--accent-code)]/[0.03] px-2 py-1">
          <p className="text-[10px] font-mono text-[var(--accent-code)] truncate">
            {currentFrame.filePath}:{currentFrame.line}:{currentFrame.column}
          </p>
          {currentFrame.functionName && (
            <p className="text-[9px] text-[var(--text-tertiary)]">{currentFrame.functionName}</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Breakpoints */}
        <div className="border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-[var(--text-tertiary)] uppercase">
            <Circle className="h-2.5 w-2.5" />
            Breakpoints
          </div>
          {breakpoints.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-[var(--text-quaternary)] italic">
              No breakpoints. Click the gutter in the editor to add one.
            </p>
          )}
          {breakpoints.map((bp) => (
            <div
              key={bp.id}
              className="group flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--border-subtle)]"
            >
              <button
                onClick={() => toggleBreakpoint(bp.id)}
                className={cn(
                  "shrink-0 rounded-sm p-0.5 transition-colors",
                  bp.enabled
                    ? "text-[var(--color-accent-red)] hover:text-[var(--color-accent-red)]/80"
                    : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]",
                )}
              >
                <Circle className={cn("h-2.5 w-2.5", bp.enabled ? "fill-[var(--color-accent-red)]" : "")} />
              </button>
              <span className="truncate flex-1 text-[10px] font-mono text-[var(--text-secondary)]">
                {bp.filePath}:{bp.line}
              </span>
              {bp.condition && (
                <span className="text-[8px] text-[var(--color-accent-amber)]/60 truncate max-w-[80px]">
                  if {bp.condition}
                </span>
              )}
              {bp.hitCount !== undefined && (
                <span className="text-[8px] text-[var(--text-tertiary)]">{bp.hitCount}x</span>
              )}
              <button
                onClick={() => removeBreakpoint(bp.id)}
                className="hidden group-hover:inline rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--color-accent-red)] transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Call stack */}
        <div className="border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-[var(--text-tertiary)] uppercase">
            <Terminal className="h-2.5 w-2.5" />
            Call Stack
          </div>
          {callStack.length === 0 && !isPaused && (
            <p className="px-2 py-2 text-[10px] text-[var(--text-quaternary)] italic">
              Call stack shown when paused.
            </p>
          )}
          {callStack.map((frame, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono",
                i === 0 ? "text-[var(--accent-code)] bg-[var(--accent-code)]/[0.04]" : "text-[var(--text-secondary)]",
              )}
            >
              <span className="truncate flex-1">
                {frame.functionName || "(anonymous)"}
              </span>
              <span className="text-[8px] text-[var(--text-tertiary)] truncate max-w-[100px]">
                {frame.filePath}:{frame.line}
              </span>
            </div>
          ))}
        </div>

        {/* Variables */}
        <div className="border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-[var(--text-tertiary)] uppercase">
            Variables
          </div>
          {variables.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-[var(--text-quaternary)] italic">
              Variables shown when paused.
            </p>
          )}
          {variables.map((v, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-0.5 text-[10px] font-mono hover:bg-[var(--border-subtle)]"
            >
              <span className="text-[var(--accent-browser)] shrink-0">{v.name}</span>
              <span className="text-[var(--text-tertiary)] text-[8px] shrink-0">{v.type}</span>
              <span className="truncate text-[var(--text-secondary)]">= {v.value}</span>
            </div>
          ))}
        </div>

        {/* Console output */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-[9px] font-medium text-[var(--text-tertiary)] uppercase">
            <span>Console</span>
            {consoleOutput.length > 0 && (
              <button
                onClick={clearConsole}
                className="text-[8px] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div ref={consoleRef} className="max-h-[200px] overflow-y-auto">
            {consoleOutput.length === 0 && (
              <p className="px-2 py-2 text-[10px] text-[var(--text-quaternary)] italic">
                No console output.
              </p>
            )}
            {consoleOutput.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-1.5 px-2 py-0.5 text-[10px] font-mono",
                  entry.level === "error" && "text-[var(--color-accent-red)] bg-[var(--color-accent-red)]/[0.04]",
                  entry.level === "warn" && "text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/[0.04]",
                  entry.level === "log" && "text-[var(--text-secondary)]",
                )}
              >
                <span className="text-[8px] text-[var(--text-quaternary)] shrink-0 mt-0.5">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="truncate">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
