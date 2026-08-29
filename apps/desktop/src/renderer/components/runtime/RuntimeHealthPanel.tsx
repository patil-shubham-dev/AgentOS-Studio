import { useEffect, useState, useRef } from "react"
import { EventBus } from "@/runtime/EventBus"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { getRenderCounts, resetDiagnostics } from "@/runtime/runtime-diagnostics"
import { resetLifetimeTracking } from "@/performance/leak-detector"
import { resetAssertions } from "@/performance/runtime-assertions"
import { getKernel } from "@/core/kernel/startup"
import { useAppStore } from "@/stores/app-store"

// Phase 4: ExecutionSessionManager + timeline-store deleted (PR A 9abbb90).
// This panel no longer shows structured execution sessions; PTY sessions are
// listed via terminal manager if needed. Kept as minimal stub so tsc passes.
export function RuntimeHealthPanel() {
  const [tab, setTab] = useState<"overview" | "kernel">("overview")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, setRefresh] = useState(0)
  useEffect(() => {
    intervalRef.current = setInterval(() => setRefresh((n) => n + 1), 2000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])
  const renderCounts = [...(getRenderCounts?.() ?? new Map()).entries()].sort((a, b) => b[1] - a[1])
  const bus = EventBus.getInstance()
  const ws = useWorkspaceRuntime()
  const providers = useAppStore((s) => s.providers)
  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px", padding: "12px", background: "var(--surface-app)", color: "var(--text-primary)", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {(["overview", "kernel"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "4px 10px", fontSize: "11px", cursor: "pointer", background: tab === t ? "#2563eb" : "var(--surface-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "6px" }}>{t}</button>
        ))}
        <button onClick={() => { resetDiagnostics?.(); resetLifetimeTracking?.(); resetAssertions?.() }} style={{ padding: "4px 10px", fontSize: "11px", cursor: "pointer", background: "#ef4444", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "6px", marginLeft: "auto" }}>Reset</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px", marginBottom: "12px" }}>
        <Metric label="Runtime" value={ws.status} />
        <Metric label="Health" value={ws.health} />
        <Metric label="Agents" value={ws.wiredAgents.length} />
        <Metric label="Providers" value={providers.length} />
      </div>
      {tab === "overview" && <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>Sessions now live in PTY terminal manager (see harness terminal). Structured ExecutionSessionManager removed per v2 pivot.</div>}
      {tab === "kernel" && <KernelTab />}
      <div style={{ marginTop: "12px" }}><RenderTab data={renderCounts} /></div>
      <div style={{ marginTop: "12px" }}><EventsTab bus={bus} /></div>
    </div>
  )
}
function Metric({ label, value, warn: showWarn }: { label: string; value: string | number; warn?: boolean }) {
  return <div style={{ background: "var(--surface-elevated)", padding: "8px", borderRadius: "6px", border: showWarn ? "1px solid #ef4444" : "1px solid var(--border-default)" }}><div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{label}</div><div style={{ fontSize: "14px", fontWeight: 600, color: showWarn ? "#ef4444" : "var(--text-primary)" }}>{value}</div></div>
}
function KernelTab() {
  try {
    const kernel = getKernel()
    const health = kernel.health()
    const services = kernel.serviceHealths()
    return <div><div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text-tertiary)", fontSize: "11px" }}>Kernel</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "6px", marginBottom: "12px" }}><Metric label="Status" value={health.status} warn={health.status !== "running"} /><Metric label="Healthy" value={String(health.healthy)} warn={!health.healthy} /><Metric label="Uptime" value={health.uptime ? `${(health.uptime / 1000).toFixed(0)}s` : "0s"} /><Metric label="Services" value={services.size} /></div>{[...services.entries()].map(([id, svcHealth]) => (<div key={id} style={{ display: "flex", gap: "8px", fontSize: "10px", marginBottom: "2px", padding: "4px 6px", background: "var(--surface-elevated)", borderRadius: "4px" }}><span style={{ color: svcHealth.healthy ? "var(--color-success-text)" : "#ef4444", width: "8px" }}>{svcHealth.healthy ? "●" : "●"}</span><span style={{ color: "#60a5fa", width: "140px" }}>{id}</span><span style={{ color: "var(--text-tertiary)", width: "80px" }}>{svcHealth.status}</span></div>))}</div>
  } catch { return <div style={{ color: "var(--text-secondary)", fontSize: "11px", padding: "8px" }}>Kernel not available</div> }
}
function RenderTab({ data }: { data: [string, number][] }) {
  return <div><div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text-tertiary)", fontSize: "11px" }}>Top Render Counts</div>{data.slice(0, 20).map(([name, count]) => (<BarRow key={name} label={name} value={count} max={data[0]?.[1] ?? 1} />))}</div>
}
function EventsTab({ bus }: { bus: EventBus }) {
  return <div><div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text-tertiary)", fontSize: "11px" }}>EventBus</div><div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}><div>Listeners: {(bus as any).listeners?.size ?? 0}</div></div></div>
}
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "1px", fontSize: "10px" }}><span style={{ color: "var(--text-tertiary)", width: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span><div style={{ flex: 1, height: "14px", background: "var(--surface-elevated)", borderRadius: "3px", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct > 50 ? "#ef4444" : pct > 20 ? "#fbbf24" : "var(--color-success-text)", borderRadius: "3px" }} /></div><span style={{ color: "var(--text-primary)", width: "40px", textAlign: "right" }}>{value}</span></div>
}
