import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import type { ReplaySession, ReplayFrame } from "@/runtime/observability/ExecutionReplay"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Terminal,
  FileEdit,
  Bot,
  Activity,
  Braces,
  MousePointer,
  ChevronRight,
  Zap,
  Search,
} from "lucide-react"

interface SessionReplayViewerProps {
  sessionId?: string
  autoLoad?: boolean
  onClose?: () => void
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10]

const EVENT_COLORS: Record<string, string> = {
  TOOL_START: "text-blue-400 border-blue-500/20 bg-blue-500/8",
  TOOL_COMPLETE: "text-green-400 border-green-500/20 bg-green-500/8",
  TOOL_ERROR: "text-red-400 border-red-500/20 bg-red-500/8",
  AGENT_ASSIGNED: "text-purple-400 border-purple-500/20 bg-purple-500/8",
  MESSAGE_COMPLETE: "text-cyan-400 border-cyan-500/20 bg-cyan-500/8",
  FILE_EDIT: "text-amber-400 border-amber-500/20 bg-amber-500/8",
  COMMAND_START: "text-sky-400 border-sky-500/20 bg-sky-500/8",
  COMMAND_COMPLETE: "text-green-400 border-green-500/20 bg-green-500/8",
  COMMAND_ERROR: "text-red-400 border-red-500/20 bg-red-500/8",
  EXECUTION_FAILED: "text-red-500 border-red-500/20 bg-red-500/10",
  VERIFY_PASSED: "text-green-400 border-green-500/20 bg-green-500/8",
  VERIFY_FAILED: "text-orange-400 border-orange-500/20 bg-orange-500/8",
  GOAL_ACHIEVED: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",
  PLAN_PROPOSED: "text-indigo-400 border-indigo-500/20 bg-indigo-500/8",
  PLAN_APPROVED: "text-green-400 border-green-500/20 bg-green-500/8",
  BROWSER_NAVIGATE: "text-violet-400 border-violet-500/20 bg-violet-500/8",
}

const EVENT_ICONS: Record<string, typeof Bot> = {
  TOOL_START: Bot,
  TOOL_COMPLETE: CheckCircle2,
  TOOL_ERROR: XCircle,
  AGENT_ASSIGNED: Bot,
  MESSAGE_COMPLETE: Activity,
  FILE_EDIT: FileEdit,
  COMMAND_START: Terminal,
  COMMAND_COMPLETE: Terminal,
  COMMAND_ERROR: Terminal,
  EXECUTION_FAILED: AlertTriangle,
  VERIFY_PASSED: CheckCircle2,
  VERIFY_FAILED: XCircle,
  BROWSER_NAVIGATE: MousePointer,
  THINKING_STARTED: Braces,
  TOKEN: Zap,
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return mins > 0 ? `${mins}m ${remainingSecs}s` : `${secs}s`
}

function getEventSummary(event: ExecutionEvent): string {
  switch (event.type) {
    case "TOOL_START":
      return `Tool: ${(event as any).toolName ?? (event as any).name ?? "unknown"}`
    case "TOOL_COMPLETE":
      return `✓ ${(event as any).toolName ?? (event as any).name ?? "tool"} (${(event as any).durationMs ?? 0}ms)`
    case "TOOL_ERROR":
      return `✗ ${(event as any).toolName ?? "tool"}: ${(event as any).error?.slice(0, 60) ?? "unknown error"}`
    case "AGENT_ASSIGNED":
      return `${(event as any).roleName ?? (event as any).roleId ?? "agent"} assigned`
    case "MESSAGE_COMPLETE":
      return `Response: ${((event as any).content?.length ?? 0)} chars`
    case "FILE_EDIT":
      return `Edited: ${(event as any).path ?? "unknown"} (+${(event as any).additions ?? 0}/-${(event as any).deletions ?? 0})`
    case "COMMAND_START":
      return `$ ${(event as any).command?.slice(0, 80) ?? "command"}`
    case "COMMAND_COMPLETE":
      return `✓ (exit ${(event as any).exitCode ?? 0}, ${(event as any).durationMs ?? 0}ms)`
    case "COMMAND_ERROR":
      return `✗ ${(event as any).error?.slice(0, 80) ?? "error"}`
    case "EXECUTION_FAILED":
      return `Failed: ${(event as any).error?.slice(0, 80) ?? "unknown"}`
    case "VERIFY_PASSED":
      return `Verification passed (${(event as any).details?.length ?? 0} checks)`
    case "VERIFY_FAILED":
      return `Verification failed`
    case "THINKING_STARTED":
      return `Thinking: ${(event as any).label ?? ""}`
    case "TOKEN":
      return `Token: ${(event as any).token?.slice(0, 40) ?? ""}`
    case "GOAL_ACHIEVED":
      return `Goal achieved in ${(event as any).iterations ?? "?"} iterations`
    default:
      return event.type
  }
}

export function SessionReplayViewer({ sessionId, autoLoad = true, onClose }: SessionReplayViewerProps) {
  const [sessions, setSessions] = useState<ReplaySession[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(sessionId ?? null)
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [filterText, setFilterText] = useState("")
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())
  const speedMenuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const obsManager = useMemo(() => ObservabilityManager.getInstance(), [])
  const replay = useMemo(() => obsManager.getReplay(), [obsManager])

  // Load sessions
  useEffect(() => {
    if (!autoLoad) return
    setIsLoading(true)
    replay
      .getSessions(20)
      .then((result) => {
        setSessions(result)
        if (!selectedSession && result.length > 0) {
          setSelectedSession(result[0].id)
        }
      })
      .finally(() => setIsLoading(false))
  }, [autoLoad, replay])

  // Load full session data when selected
  useEffect(() => {
    if (!selectedSession) return
    const existing = sessions.find((s) => s.id === selectedSession)
    if (existing && existing.frames.length > 0) return

    setIsLoading(true)
    replay
      .loadSession(selectedSession)
      .then((loaded) => {
        if (loaded) {
          setSessions((prev) => prev.map((s) => (s.id === loaded.id ? loaded : s)))
        }
      })
      .finally(() => setIsLoading(false))
  }, [selectedSession, replay])

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return
    const handleClick = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showSpeedMenu])

  // Playback logic
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
      return
    }

    const session = sessions.find((s) => s.id === selectedSession)
    if (!session || currentFrameIndex >= session.frames.length - 1) {
      setIsPlaying(false)
      return
    }

    const frame = session.frames[currentFrameIndex]
    const nextFrame = session.frames[currentFrameIndex + 1]
    const deltaMs = nextFrame ? nextFrame.deltaMs - frame.deltaMs : 100
    const adjustedDelay = Math.max(16, Math.min(2000, deltaMs / speed))

    playbackTimerRef.current = setTimeout(() => {
      setCurrentFrameIndex((i) => i + 1)
    }, adjustedDelay)

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
      }
    }
  }, [isPlaying, currentFrameIndex, selectedSession, sessions, speed])

  // Auto-scroll to current frame
  useEffect(() => {
    if (listRef.current && currentFrameIndex > 0) {
      const el = listRef.current.querySelector(`[data-frame-index="${currentFrameIndex}"]`)
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" })
      }
    }
  }, [currentFrameIndex])

  const currentSession = sessions.find((s) => s.id === selectedSession)
  const frames = currentSession?.frames ?? []
  const filteredFrames = useMemo(() => {
    if (!filterText) return frames
    const lower = filterText.toLowerCase()
    return frames.filter((f) => {
      const summary = getEventSummary(f.event).toLowerCase()
      return summary.includes(lower) || f.event.type.toLowerCase().includes(lower)
    })
  }, [frames, filterText])

  const summary = currentSession
    ? replay.getTraceSummary(currentSession.id)
    : null

  const handlePlay = useCallback(() => {
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(0)
    }
    setIsPlaying((v) => !v)
  }, [currentFrameIndex, frames.length])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
    setCurrentFrameIndex(0)
  }, [])

  const handleStepForward = useCallback(() => {
    setIsPlaying(false)
    setCurrentFrameIndex((i) => Math.min(i + 1, frames.length - 1))
  }, [frames.length])

  const handleStepBackward = useCallback(() => {
    setIsPlaying(false)
    setCurrentFrameIndex((i) => Math.max(i - 1, 0))
  }, [])

  const handleFrameSelect = useCallback((index: number) => {
    setIsPlaying(false)
    setCurrentFrameIndex(index)
  }, [])

  const toggleEventExpanded = useCallback((idx: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const progress = frames.length > 0 ? ((currentFrameIndex + 1) / frames.length) * 100 : 0

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] rounded-xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/10">
              <RotateCcw className="h-3 w-3 text-blue-400" />
            </div>
            <span className="text-xs font-semibold text-white/80">Session Replay</span>
            {isPlaying && (
              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full animate-pulse">
                Playing · {speed}x
              </span>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded hover:bg-white/[0.04] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session list sidebar */}
        <div className="w-52 shrink-0 border-r border-white/[0.04] overflow-y-auto bg-white/[0.01]">
          <div className="px-3 py-2 border-b border-white/[0.04]">
            <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
              Sessions ({sessions.length})
            </span>
          </div>
          {isLoading && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 text-white/20 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[10px] text-white/20">No replay sessions yet</p>
              <p className="text-[8px] text-white/10 mt-1">Sessions appear after execution</p>
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  setSelectedSession(session.id)
                  setCurrentFrameIndex(0)
                  setIsPlaying(false)
                }}
                className={cn(
                  "w-full px-3 py-2 text-left border-b border-white/[0.02] transition-colors",
                  selectedSession === session.id
                    ? "bg-blue-500/8"
                    : "hover:bg-white/[0.02]",
                )}
              >
                <p className="text-[10px] font-medium text-white/60 truncate">
                  {session.summary.slice(0, 40)}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[8px] text-white/20">
                    {session.eventCount} events
                  </span>
                  <span className="text-[8px] text-white/20">
                    {formatTime(session.totalDurationMs)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Main replay area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary bar */}
          {summary && (
            <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-white/20" />
                <span className="text-[9px] text-white/30">{summary.totalEvents} events</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bot className="h-3 w-3 text-white/20" />
                <span className="text-[9px] text-white/30">{summary.agentAssignments} agents</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-white/20" />
                <span className="text-[9px] text-white/30">{summary.toolCalls} tools</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-white/20" />
                <span className={cn("text-[9px]", summary.errors > 0 ? "text-red-400" : "text-white/30")}>
                  {summary.errors} errors
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Clock className="h-3 w-3 text-white/20" />
                <span className="text-[9px] text-white/30">{formatTime(summary.durationMs)}</span>
              </div>
            </div>
          )}

          {/* Search/filter */}
          <div className="px-4 py-2 border-b border-white/[0.04]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter events..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/60 placeholder:text-white/20 outline-none focus:border-white/15"
              />
            </div>
          </div>

          {/* Event timeline */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 text-white/20 animate-spin" />
              </div>
            ) : filteredFrames.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <RotateCcw className="h-8 w-8 text-white/10 mb-3" />
                <p className="text-xs text-white/30">
                  {selectedSession ? "No events to display" : "Select a session to view"}
                </p>
                <p className="text-[10px] text-white/20 mt-1">
                  {filterText ? "Try a different filter" : "Session events appear here"}
                </p>
              </div>
            ) : (
              <div className="py-2">
                {filteredFrames.map((frame, fi) => {
                  const actualIndex = frames.indexOf(frame)
                  const isCurrent = actualIndex === currentFrameIndex && !isPlaying
                  const EventIcon = EVENT_ICONS[frame.event.type as keyof typeof EVENT_ICONS] ?? Activity
                  const colorClass = EVENT_COLORS[frame.event.type as keyof typeof EVENT_COLORS]
                  const isExpanded = expandedEvents.has(actualIndex)

                  return (
                    <div
                      key={fi}
                      data-frame-index={actualIndex}
                      onClick={() => handleFrameSelect(actualIndex)}
                      onDoubleClick={() => toggleEventExpanded(actualIndex)}
                      className={cn(
                        "flex items-start gap-2.5 px-4 py-1.5 cursor-pointer transition-colors border-l-2",
                        isCurrent
                          ? "bg-blue-500/8 border-l-blue-400"
                          : "border-l-transparent hover:bg-white/[0.02]",
                      )}
                    >
                      {/* Timeline indicator */}
                      <div className="flex items-center gap-1.5 mt-0.5 shrink-0 w-16">
                        <span
                          className={cn(
                            "text-[9px] font-mono",
                            isCurrent ? "text-blue-400" : "text-white/15",
                          )}
                        >
                          +{Math.round(frame.deltaMs)}ms
                        </span>
                      </div>

                      {/* Event icon */}
                      <div
                        className={cn(
                          "flex items-center justify-center h-5 w-5 rounded shrink-0 mt-0.5",
                          colorClass?.split(" ")[0] ?? "text-white/30",
                        )}
                      >
                        <EventIcon className="h-3 w-3" />
                      </div>

                      {/* Event content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              isCurrent ? "text-blue-300" : "text-white/50",
                            )}
                          >
                            {getEventSummary(frame.event)}
                          </span>
                        </div>
                        {isExpanded && (
                          <pre className="mt-1 text-[8px] text-white/20 font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(frame.event, null, 2).slice(0, 500)}
                          </pre>
                        )}
                      </div>

                      {/* Index indicator */}
                      <span className="text-[8px] text-white/10 font-mono shrink-0">
                        #{actualIndex + 1}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Playback controls */}
          <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
            {/* Progress bar */}
            <div className="mb-2 h-1 bg-white/[0.06] rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                const idx = Math.floor(pct * frames.length)
                handleFrameSelect(Math.max(0, Math.min(idx, frames.length - 1)))
              }}
            >
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={handleReset}
                  disabled={currentFrameIndex === 0}
                  className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:opacity-20"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleStepBackward}
                  disabled={currentFrameIndex === 0}
                  className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:opacity-20"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                </button>
                <button
                  onClick={handlePlay}
                  disabled={frames.length === 0}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    isPlaying
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]",
                  )}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={handleStepForward}
                  disabled={currentFrameIndex >= frames.length - 1}
                  className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:opacity-20"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[9px] text-white/20 font-mono">
                  {currentFrameIndex + 1}/{frames.length}
                </span>

                {/* Speed selector */}
                <div className="relative" ref={speedMenuRef}>
                  <button
                    onClick={() => setShowSpeedMenu((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-white/[0.06] transition-all"
                  >
                    <Zap className="h-3 w-3" />
                    {speed}x
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-1 rounded-lg border border-white/[0.08] bg-[#0f0f10] shadow-xl overflow-hidden z-50">
                      {SPEED_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setSpeed(opt)
                            setShowSpeedMenu(false)
                          }}
                          className={cn(
                            "block w-full px-3 py-1.5 text-[10px] text-left transition-colors",
                            speed === opt
                              ? "text-blue-400 bg-blue-500/10"
                              : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]",
                          )}
                        >
                          {opt}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleReset}
                  className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all"
                  title="Reset"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Current frame indicator */}
            {frames[currentFrameIndex] && (
              <div className="mt-2 text-[9px] text-white/20 text-center truncate">
                {getEventSummary(frames[currentFrameIndex].event)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
