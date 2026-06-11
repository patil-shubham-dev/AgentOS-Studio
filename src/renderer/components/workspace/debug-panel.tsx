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
        <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-2 py-1.5 bg-black/20">
          <Bug className="h-3 w-3 text-white/40 shrink-0" />
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="File path (e.g. script.js)"
            className="flex-1 min-w-0 bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/50"
          />
          <input
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Working dir"
            className="w-24 bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/50"
          />
          <button
            onClick={handleLaunch}
            disabled={!filePath || !workingDir}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              filePath && workingDir
                ? "bg-green-600/80 text-white hover:bg-green-500"
                : "bg-white/[0.06] text-white/20 cursor-not-allowed",
            )}
          >
            Launch
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-white/[0.04] px-2 py-1.5 bg-black/20">
          <button
            onClick={() => canContinue ? debugService.resume() : undefined}
            disabled={!canContinue}
            className={cn(
              "rounded p-1 transition-colors",
              canContinue
                ? "text-green-400 hover:bg-white/[0.06] hover:text-green-300"
                : "text-white/20 cursor-not-allowed",
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
                ? "text-white/70 hover:bg-white/[0.06] hover:text-white"
                : "text-white/20 cursor-not-allowed",
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
                ? "text-white/70 hover:bg-white/[0.06] hover:text-white"
                : "text-white/20 cursor-not-allowed",
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
                ? "text-white/70 hover:bg-white/[0.06] hover:text-white"
                : "text-white/20 cursor-not-allowed",
            )}
            title="Step Out (Shift+F11)"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {isConnecting && (
              <span className="flex items-center gap-1 text-[9px] text-yellow-400/70">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Connecting
              </span>
            )}
            {cdpConnected && isPaused && (
              <span className="flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] text-blue-400">
                <Pause className="h-2.5 w-2.5" />
                Paused
              </span>
            )}
            {cdpConnected && !isPaused && !isConnecting && (
              <span className="flex items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[9px] text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Running
              </span>
            )}
            <button
              onClick={handleStop}
              className="rounded p-1 text-red-400/70 hover:bg-white/[0.06] hover:text-red-300 transition-colors"
              title="Stop"
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Paused frame info */}
      {currentFrame && isPaused && (
        <div className="border-b border-white/[0.04] bg-blue-500/[0.03] px-2 py-1">
          <p className="text-[10px] font-mono text-blue-400 truncate">
            {currentFrame.filePath}:{currentFrame.line}:{currentFrame.column}
          </p>
          {currentFrame.functionName && (
            <p className="text-[9px] text-white/40">{currentFrame.functionName}</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Breakpoints */}
        <div className="border-b border-white/[0.04]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-white/30 uppercase">
            <Circle className="h-2.5 w-2.5" />
            Breakpoints
          </div>
          {breakpoints.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-white/20 italic">
              No breakpoints. Click the gutter in the editor to add one.
            </p>
          )}
          {breakpoints.map((bp) => (
            <div
              key={bp.id}
              className="group flex items-center gap-1.5 px-2 py-1 hover:bg-white/[0.03]"
            >
              <button
                onClick={() => toggleBreakpoint(bp.id)}
                className={cn(
                  "shrink-0 rounded-sm p-0.5 transition-colors",
                  bp.enabled
                    ? "text-red-400 hover:text-red-300"
                    : "text-white/20 hover:text-white/40",
                )}
              >
                <Circle className={cn("h-2.5 w-2.5", bp.enabled ? "fill-red-400" : "")} />
              </button>
              <span className="truncate flex-1 text-[10px] font-mono text-white/60">
                {bp.filePath}:{bp.line}
              </span>
              {bp.condition && (
                <span className="text-[8px] text-yellow-400/60 truncate max-w-[80px]">
                  if {bp.condition}
                </span>
              )}
              {bp.hitCount !== undefined && (
                <span className="text-[8px] text-white/30">{bp.hitCount}x</span>
              )}
              <button
                onClick={() => removeBreakpoint(bp.id)}
                className="hidden group-hover:inline rounded p-0.5 text-white/30 hover:text-red-400 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Call stack */}
        <div className="border-b border-white/[0.04]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-white/30 uppercase">
            <Terminal className="h-2.5 w-2.5" />
            Call Stack
          </div>
          {callStack.length === 0 && !isPaused && (
            <p className="px-2 py-2 text-[10px] text-white/20 italic">
              Call stack shown when paused.
            </p>
          )}
          {callStack.map((frame, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono",
                i === 0 ? "text-blue-400 bg-blue-500/[0.04]" : "text-white/50",
              )}
            >
              <span className="truncate flex-1">
                {frame.functionName || "(anonymous)"}
              </span>
              <span className="text-[8px] text-white/30 truncate max-w-[100px]">
                {frame.filePath}:{frame.line}
              </span>
            </div>
          ))}
        </div>

        {/* Variables */}
        <div className="border-b border-white/[0.04]">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-white/30 uppercase">
            Variables
          </div>
          {variables.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-white/20 italic">
              Variables shown when paused.
            </p>
          )}
          {variables.map((v, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-0.5 text-[10px] font-mono hover:bg-white/[0.02]"
            >
              <span className="text-cyan-400 shrink-0">{v.name}</span>
              <span className="text-white/30 text-[8px] shrink-0">{v.type}</span>
              <span className="truncate text-white/70">= {v.value}</span>
            </div>
          ))}
        </div>

        {/* Console output */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-[9px] font-medium text-white/30 uppercase">
            <span>Console</span>
            {consoleOutput.length > 0 && (
              <button
                onClick={clearConsole}
                className="text-[8px] text-white/20 hover:text-white/50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div ref={consoleRef} className="max-h-[200px] overflow-y-auto">
            {consoleOutput.length === 0 && (
              <p className="px-2 py-2 text-[10px] text-white/20 italic">
                No console output.
              </p>
            )}
            {consoleOutput.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-1.5 px-2 py-0.5 text-[10px] font-mono",
                  entry.level === "error" && "text-red-400 bg-red-500/[0.04]",
                  entry.level === "warn" && "text-yellow-400 bg-yellow-500/[0.04]",
                  entry.level === "log" && "text-white/60",
                )}
              >
                <span className="text-[8px] text-white/20 shrink-0 mt-0.5">
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
