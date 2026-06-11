import { useEffect, useState, useRef } from "react"
import { EventBus } from "@/runtime/EventBus"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { getRenderCounts, getMutationTrace, resetDiagnostics } from "@/runtime/runtime-diagnostics"
import { getLifetimeStats, getActiveComponentCount, getTotalMounts, getTotalUnmounts, assertStableLifetime, resetLifetimeTracking } from "@/performance/leak-detector"
import { getSubscriptionCount, getTimerCount, getSubscriptionRegistry, getTimerRegistry, resetAssertions } from "@/performance/runtime-assertions"
import { getKernel } from "@/core/kernel/startup"

import { useAppStore } from "@/stores/app-store"

type Tab = "overview" | "task-graph" | "sessions" | "providers" | "tools" | "render" | "subscriptions" | "timers" | "mutations" | "lifetime" | "events" | "kernel"

export function RuntimeHealthPanel() {
  const [tab, setTab] = useState<Tab>("overview")
  const [refresh, setRefresh] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setRefresh((n) => n + 1), 2000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  const renderCounts = [...(getRenderCounts?.() ?? new Map()).entries()].sort((a, b) => b[1] - a[1])
  const mutationTrace = getMutationTrace?.() ?? []
  const recentMutations = mutationTrace.slice(-20)
  const lifetimeStats = getLifetimeStats?.() ?? new Map()
  const lifetimeEntries = [...lifetimeStats.entries()].sort((a, b) => b[1].active - a[1].active)
  const subRegistry = getSubscriptionRegistry?.() ?? new Map()
  const timerRegistry = getTimerRegistry?.() ?? new Map()
  const bus = EventBus.getInstance()
  const eventCount = (bus as any).eventCount ?? 0
  const listenerCount = (bus as any).listeners?.size ?? 0

  const ws = useWorkspaceRuntime()
  const timeline = useTimelineStore()
  const providers = useAppStore((s) => s.providers)
  const sessions = ExecutionSessionManager.getInstance()
  const activeSessions = sessions.getActiveSessions()
  const recentSessions = activeSessions
  const allToolCalls = Array.from(timeline.agentSessions.values()).reduce((sum, s) => sum + s.toolCalls.length, 0)
  const allErrors = Array.from(timeline.agentSessions.values()).filter((s) => s.streamState === "failed").length
  const engineDiagnostics = {
    state: (ws.status === "running" || ws.status === "ready" ? "RUNNING" : "ERROR") as "RUNNING" | "ERROR",
    totalToolCalls: allToolCalls,
    totalErrors: allErrors,
    avgExecutionMs: 0,
    historyLength: timeline.events.length,
    totalTokens: timeline.streamingMetrics.tokensReceived,
    status: (allErrors > 0 ? "degraded" : "ok") as "ok" | "degraded",
    activeSessions: activeSessions.length,
    sessionsCreated: sessions.getActiveSessions().length,
  }

  const activeSubs = getSubscriptionCount?.() ?? 0
  const activeTimers = getTimerCount?.() ?? 0
  const activeComponents = getActiveComponentCount?.() ?? 0
  const totalMounts = getTotalMounts?.() ?? 0
  const totalUnmounts = getTotalUnmounts?.() ?? 0
  const stableIssues = assertStableLifetime?.() ?? []

  const tabs: Tab[] = ["overview", "task-graph", "sessions", "providers", "tools", "events", "render", "kernel"]

  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px", padding: "12px", background: "#0d0d10", color: "#e2e8f0", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "4px 10px", fontSize: "11px", cursor: "pointer",
              background: tab === t ? "#2563eb" : "#1a1a2e",
              color: "#fff", border: "1px solid #333", borderRadius: "6px",
            }}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => { resetDiagnostics?.(); resetLifetimeTracking?.(); resetAssertions?.() }}
          style={{ padding: "4px 10px", fontSize: "11px", cursor: "pointer", background: "#ef4444", color: "#fff", border: "1px solid #333", borderRadius: "6px", marginLeft: "auto" }}
        >
          Reset
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px", marginBottom: "12px" }}>
        <Metric label="Runtime" value={ws.status} />
        <Metric label="Health" value={ws.health} />
        <Metric label="Agents" value={ws.wiredAgents.length} />
        <Metric label="Engine" value={engineDiagnostics.state} warn={false} />
        <Metric label="Active Sessions" value={activeSessions.length} />
        <Metric label="Tool Calls" value={engineDiagnostics.totalToolCalls} />
        <Metric label="Errors" value={engineDiagnostics.totalErrors} warn={engineDiagnostics.totalErrors > 0} />
        <Metric label="Avg Exec" value={`${engineDiagnostics.avgExecutionMs}ms`} />
        <Metric label="Memory" value={`${ws.memoryPressure}%`} warn={ws.memoryPressure > 80} />
        <Metric label="Tokens" value={ws.tokenUsage} />
        <Metric label="Components" value={activeComponents} />
        <Metric label="Subscriptions" value={activeSubs} warn={activeSubs > 20} />
        <Metric label="EventBus" value={eventCount} />
        <Metric label="Providers" value={providers.length} />
      </div>

      {tab === "overview" && <OverviewTab engine={engineDiagnostics} sessions={activeSessions} />}
      {tab === "task-graph" && <TaskGraphTab timeline={timeline} />}
      {tab === "sessions" && <SessionsTab sessions={recentSessions} />}
      {tab === "providers" && <ProvidersTab providers={providers} />}
      {tab === "tools" && <ToolsTab />}
      {tab === "events" && <EventsTab bus={bus} eventCount={eventCount} listenerCount={listenerCount} />}
      {tab === "render" && <RenderTab data={renderCounts} />}
      {tab === "kernel" && <KernelTab />}
    </div>
  )
}

function Metric({ label, value, warn: showWarn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{
      background: "#1a1a2e", padding: "8px", borderRadius: "6px", border: showWarn ? "1px solid #ef4444" : "1px solid #2a2a3e",
    }}>
      <div style={{ fontSize: "10px", color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: showWarn ? "#ef4444" : "#e2e8f0" }}>{value}</div>
    </div>
  )
}

function OverviewTab({ engine, sessions }: { engine: any; sessions: any[] }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Execution Engine</div>
      <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "12px" }}>
        <div>State: <span style={{ color: engine.state === "ERROR" ? "#ef4444" : "#22c55e" }}>{engine.state}</span></div>
        <div>History length: {engine.historyLength}</div>
        <div>Total tokens: {engine.totalTokens}</div>
        <div>Total tool calls: {engine.totalToolCalls}</div>
        <div>Avg execution: {engine.avgExecutionMs}ms</div>
      </div>

      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Active Sessions</div>
      {sessions.length === 0 && <Empty />}
      {sessions.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: "8px", fontSize: "10px", marginBottom: "2px", padding: "4px 6px", background: "#1a1a2e", borderRadius: "4px" }}>
          <span style={{ color: "#60a5fa", width: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{s.input.slice(0, 40)}</span>
          <span style={{ color: "#fbbf24", width: "60px" }}>{s.status}</span>
          <span style={{ color: "#64748b" }}>{((Date.now() - s.startedAt) / 1000).toFixed(1)}s</span>
        </div>
      ))}
    </div>
  )
}

function TaskGraphTab({ timeline }: { timeline: any }) {
  const sessions = Array.from(timeline.agentSessions.values())
  const counts = timeline.getExecutionCounts()

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Active Agent Sessions</div>
      {sessions.length === 0 && <Empty />}
      {sessions.map((session: any) => (
        <div key={session.stepId} style={{ marginBottom: "8px", padding: "8px", background: "#1a1a2e", borderRadius: "6px", border: session.status === "running" ? "1px solid #2563eb40" : "1px solid #2a2a3e" }}>
          <div style={{ display: "flex", gap: "8px", fontSize: "10px", marginBottom: "4px" }}>
            <span style={{
              color: session.status === "running" ? "#60a5fa" : session.status === "error" ? "#ef4444" : "#22c55e",
              fontWeight: 600, width: "70px",
            }}>
              {session.status}
            </span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{session.roleName}</span>
            <span style={{ color: "#64748b" }}>
              {session.modelName && `${session.modelName}`}
              {session.providerName && ` via ${session.providerName}`}
            </span>
          </div>
          <div style={{ fontSize: "9px", color: "#64748b", display: "flex", gap: "12px" }}>
            <span>Tools: {session.toolCalls.length}</span>
            <span>Files: {session.fileEdits.length}</span>
            <span>Terminal: {session.terminalOutputs.length}</span>
            <span>Text: {session.streamingText.length} chars</span>
          </div>
          {session.toolCalls.length > 0 && (
            <div style={{ marginTop: "4px", fontSize: "9px", color: "#94a3b8" }}>
              {session.toolCalls.map((tc: any) => (
                <div key={tc.id} style={{ display: "flex", gap: "4px", padding: "1px 0" }}>
                  <span style={{ color: tc.status === "running" ? "#fbbf24" : tc.status === "complete" ? "#22c55e" : "#ef4444" }}>{tc.status === "running" ? "\u25D1" : tc.status === "complete" ? "\u2713" : "\u2717"}</span>
                  <span>{tc.name}</span>
                  <span style={{ color: "#64748b" }}>{tc.args?.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {sessions.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontWeight: 600, marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>Execution Summary</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", display: "flex", gap: "16px" }}>
            <span>Files: {counts.filesEdited}</span>
            <span>Commands: {counts.commandsRun}</span>
            <span>Browser: {counts.browserActions}</span>
            <span>Agents: {counts.agentsUsed?.join(", ")}</span>
            <span>Duration: {counts.totalDurationMs}ms</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionsTab({ sessions }: { sessions: any[] }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Recent Execution Sessions</div>
      {sessions.length === 0 && <Empty />}
      {sessions.map((s) => (
        <div key={s.id} style={{ padding: "6px", marginBottom: "4px", background: "#1a1a2e", borderRadius: "4px", fontSize: "10px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "2px" }}>
            <span style={{ color: s.status === "completed" ? "#22c55e" : s.status === "failed" ? "#ef4444" : s.status === "cancelled" ? "#fbbf24" : "#60a5fa", fontWeight: 600, width: "80px" }}>{s.status}</span>
            <span style={{ color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{s.input}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: "9px" }}>
            <span>{new Date(s.startedAt).toLocaleTimeString()}</span>
            {s.completedAt && <span> | {(s.completedAt - s.startedAt) / 1000}s</span>}
            {s.result && <span> | tools={s.result.toolCallCount} files={s.result.filesEdited} errors={s.result.failures}</span>}
            {s.error && <span style={{ color: "#ef4444" }}> | {s.error.slice(0, 100)}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProvidersTab({ providers }: { providers: any[] }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Provider Activity ({providers.length})</div>
      {providers.length === 0 && <Empty />}
      {providers.map((p) => {
        const modelCount = p.models?.length ?? 0
        return (
          <div key={p.id} style={{ padding: "6px", marginBottom: "4px", background: "#1a1a2e", borderRadius: "4px", fontSize: "10px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "2px" }}>
              <span style={{ color: "#60a5fa", fontWeight: 600, width: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{p.id}</span>
              <span style={{ color: "#22c55e" }}>{p.baseUrl ? "\u25CF" : "\u25CB"}</span>
              <span style={{ color: p.apiKey ? "#22c55e" : "#ef4444" }}>key: {p.apiKey ? "set" : "missing"}</span>
              <span style={{ color: "#64748b" }}>{modelCount} models</span>
              <span style={{ color: "#64748b" }}>{p.isLocal ? "local" : "remote"}</span>
            </div>
            {modelCount > 0 && (
              <div style={{ color: "#64748b", fontSize: "9px", paddingLeft: "8px" }}>
                {p.models.slice(0, 3).map((m: any) => m.id).join(", ")}
                {modelCount > 3 && ` +${modelCount - 3} more`}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ToolsTab() {
  const timeline = useTimelineStore()
  const allToolCalls: { session: any; tool: any }[] = []
  for (const session of timeline.agentSessions.values()) {
    for (const tc of session.toolCalls) {
      allToolCalls.push({ session, tool: tc })
    }
  }
  const recentTools = allToolCalls.slice(-20).reverse()

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "8px", color: "#94a3b8", fontSize: "11px" }}>Tool Execution Traces (last 20)</div>
      {recentTools.length === 0 && <Empty />}
      {recentTools.map(({ session, tool }, i) => (
        <div key={`${session.stepId}-${tool.id}-${i}`} style={{ padding: "4px 6px", marginBottom: "2px", background: "#1a1a2e", borderRadius: "4px", fontSize: "9px", display: "flex", gap: "6px" }}>
          <span style={{ color: "#64748b", width: "50px" }}>{i === 0 ? "latest" : `-${i}s`}</span>
          <span style={{
            color: tool.status === "running" ? "#fbbf24" : tool.status === "complete" ? "#22c55e" : tool.status === "error" ? "#ef4444" : "#64748b",
            width: "60px",
          }}>
            {tool.status}
          </span>
          <span style={{ color: "#60a5fa", width: "80px" }}>{tool.name}</span>
          <span style={{ color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{tool.args?.slice(0, 80)}</span>
          <span style={{ color: "#64748b", width: "80px" }}>{session.roleName}</span>
          {tool.durationMs && <span style={{ color: "#64748b", width: "50px" }}>{tool.durationMs}ms</span>}
        </div>
      ))}
    </div>
  )
}

function EventsTab({ bus, eventCount, listenerCount }: { bus: EventBus; eventCount: number; listenerCount: number }) {
  const timeline = useTimelineStore()
  const activeSessions = Array.from(timeline.agentSessions.values())
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>EventBus State</div>
      <div style={{ fontSize: "10px", color: "#94a3b8" }}>
        <div>Total events emitted: {eventCount}</div>
        <div>Listener types: {listenerCount}</div>
        <div>Buffered subscribers: {(bus as any).bufferedSubscribers?.size ?? 0}</div>
      </div>
      <div style={{ fontWeight: 600, marginTop: "12px", marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>Active Task Graph</div>
      {activeSessions.length === 0 && <Empty />}
      {activeSessions.map((session) => (
        <div key={session.stepId} style={{ display: "flex", gap: "8px", fontSize: "10px", marginBottom: "2px", padding: "4px 6px", background: "#1a1a2e", borderRadius: "4px" }}>
          <span style={{ color: session.status === "running" ? "#60a5fa" : session.status === "error" ? "#f87171" : "#4ade80", width: "70px" }}>
            {session.status}
          </span>
          <span style={{ color: "#e2e8f0", width: "90px" }}>{session.roleName}</span>
          <span style={{ color: "#94a3b8" }}>
            tools={session.toolCalls.length} files={session.fileEdits.length} terminal={session.terminalOutputs.length}
          </span>
        </div>
      ))}
    </div>
  )
}

function RenderTab({ data }: { data: [string, number][] }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>Top Render Counts (last 10s)</div>
      {data.length === 0 && <Empty />}
      {data.slice(0, 20).map(([name, count]) => (
        <BarRow key={name} label={name} value={count} max={data[0]?.[1] ?? 1} />
      ))}
    </div>
  )
}

function KernelTab() {
  try {
    const kernel = getKernel()
    const health = kernel.health()
    const services = kernel.serviceHealths()

    return (
      <div>
        <div style={{ fontWeight: 600, marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>Kernel</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "6px", marginBottom: "12px" }}>
          <Metric label="Status" value={health.status} warn={health.status !== "running"} />
          <Metric label="Healthy" value={String(health.healthy)} warn={!health.healthy} />
          <Metric label="Uptime" value={health.uptime ? `${(health.uptime / 1000).toFixed(0)}s` : "0s"} />
          <Metric label="Services" value={services.size} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: "6px", color: "#94a3b8", fontSize: "11px" }}>Registered Services</div>
        {[...services.entries()].map(([id, svcHealth]) => (
          <div key={id} style={{ display: "flex", gap: "8px", fontSize: "10px", marginBottom: "2px", padding: "4px 6px", background: "#1a1a2e", borderRadius: "4px" }}>
            <span style={{ color: svcHealth.healthy ? "#4ade80" : "#ef4444", width: "8px" }}>
              {svcHealth.healthy ? "\u25CF" : "\u25CF"}
            </span>
            <span style={{ color: "#60a5fa", width: "140px" }}>{id}</span>
            <span style={{ color: "#94a3b8", width: "80px" }}>{svcHealth.status}</span>
            {svcHealth.message && <span style={{ color: "#64748b", fontSize: "9px" }}>{svcHealth.message}</span>}
            {svcHealth.error && <span style={{ color: "#f87171", fontSize: "9px" }}>{svcHealth.error}</span>}
          </div>
        ))}
      </div>
    )
  } catch {
    return <div style={{ color: "#64748b", fontSize: "11px", padding: "8px" }}>Kernel not available</div>
  }
}

function Empty() {
  return <div style={{ color: "#64748b", fontSize: "11px", padding: "8px" }}>No data yet</div>
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "1px", fontSize: "10px" }}>
      <span style={{ color: "#94a3b8", width: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: "14px", background: "#1a1a2e", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct > 50 ? "#ef4444" : pct > 20 ? "#fbbf24" : "#22c55e", borderRadius: "3px" }} />
      </div>
      <span style={{ color: "#e2e8f0", width: "40px", textAlign: "right" }}>{value}</span>
    </div>
  )
}
