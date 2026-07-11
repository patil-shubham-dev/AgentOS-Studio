import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"

const ROUTES = ["/control-center", "/code-canvas", "/settings", "/agents", "/logs", "/git", "/__health"]

export function StressTestPage() {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [iteration, setIteration] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [activePanel, setActivePanel] = useState<string | null>(null)

  const runTest = useCallback(async (testFn: () => Promise<void> | void, name: string) => {
    try {
      await testFn()
      setErrors((prev) => prev.filter((e) => e !== name))
    } catch (err) {
      setErrors((prev) => [...prev, `${name}: ${err instanceof Error ? err.message : String(err)}`])
    }
  }, [])

  const routeSpam = useCallback(async () => {
    for (let i = 0; i < 20; i++) {
      const route = ROUTES[i % ROUTES.length]
      navigate(route)
      setIteration((n) => n + 1)
      await new Promise((r) => setTimeout(r, 50))
    }
  }, [navigate])

  const mountSpam = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      setActivePanel(`panel-${i % 3}`)
      await new Promise((r) => setTimeout(r, 100))
      setActivePanel(null)
      await new Promise((r) => setTimeout(r, 50))
    }
  }, [])

  const startStress = useCallback(async () => {
    setRunning(true)
    setErrors([])
    setIteration(0)

    for (let round = 0; round < 3; round++) {
      await runTest(routeSpam, `route-spam-round-${round}`)
      await new Promise((r) => setTimeout(r, 200))
      await runTest(mountSpam, `mount-spam-round-${round}`)
      await new Promise((r) => setTimeout(r, 200))
    }

    setRunning(false)
  }, [routeSpam, mountSpam, runTest])

  return (
    <div style={{ padding: "24px", fontFamily: "monospace", fontSize: "13px" }}>
      <h2 style={{ color: "#e2e8f0", marginBottom: "16px" }}>Stress Test</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          onClick={startStress}
          disabled={running}
          style={{
            padding: "8px 20px", background: running ? "#333" : "#ef4444",
            color: "#fff", border: "none", borderRadius: "8px",
            cursor: running ? "not-allowed" : "pointer", fontWeight: 600,
          }}
        >
          {running ? `Running... (${iteration})` : "Run Stress Test"}
        </button>
        <button
          onClick={() => setErrors([])}
          style={{ padding: "8px 20px", background: "transparent", color: "#888", border: "1px solid #555", borderRadius: "8px", cursor: "pointer" }}
        >
          Clear Errors
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {ROUTES.map((route) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            style={{
              padding: "4px 10px", fontSize: "11px", cursor: "pointer",
              background: "#1a1a2e", color: "#94a3b8",
              border: "1px solid #333", borderRadius: "6px",
            }}
          >
            {route}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <div style={{ background: "#7f1d1d", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
          <div style={{ color: "#fca5a5", fontWeight: 600, marginBottom: "4px" }}>Errors ({errors.length})</div>
          {errors.map((e, i) => (
            <div key={i} style={{ color: "#fef2f2", fontSize: "11px", marginBottom: "2px" }}>{e}</div>
          ))}
        </div>
      )}

      <div style={{ color: "#64748b", fontSize: "11px" }}>
        <div>Iterations: {iteration}</div>
        <div>Running: {String(running)}</div>
        <div>Active panel: {activePanel ?? "none"}</div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <div style={{ color: "#94a3b8", fontWeight: 600, marginBottom: "8px" }}>Fake Panels (mount/unmount test)</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {activePanel && (
            <div style={{ background: "#1a1a2e", padding: "16px", borderRadius: "8px", border: "1px solid #333" }}>
              <div style={{ color: "#60a5fa", fontWeight: 600 }}>{activePanel}</div>
              <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "4px" }}>
                This panel simulates a real component mount
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
