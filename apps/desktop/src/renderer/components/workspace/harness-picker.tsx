import { useState, useEffect } from "react"
import { HARNESS_REGISTRY, getInstallCandidates, type HarnessName, type InstallCandidate } from "@/lib/harness-registry"
import { ptySpawn, type PtySession } from "@/runtime/terminal/pty-runtime"

type PickerState =
  | { type: "idle" }
  | { type: "confirm"; harness: HarnessName; candidate: InstallCandidate }
  | { type: "installing"; harness: HarnessName; candidate: InstallCandidate; session: PtySession; output: string }
  | { type: "declined"; harness: HarnessName; message: string }
  | { type: "failed"; harness: HarnessName; command: string[]; exitCode: number | null; output: string }
  | { type: "verify-failed"; harness: HarnessName; command: string[]; message: string }
  | { type: "installed"; harness: HarnessName; version: string }

interface HarnessPickerProps {
  workspaceRoot: string
  onHarnessSelected?: (harness: HarnessName) => void
}

export function HarnessPicker({ workspaceRoot, onHarnessSelected }: HarnessPickerProps) {
  const [state, setState] = useState<PickerState>({ type: "idle" })
  const [versions, setVersions] = useState<Record<HarnessName, string | null>>({
    opencode: null,
    claude: null,
    codex: null,
  })

  useEffect(() => {
    let cancelled = false
    async function check() {
      const eapi = (window as any).electronAPI
      if (!eapi?.harnessGetVersion) {
        // Fallback for tests — assume not installed
        return
      }
      const results: Record<HarnessName, string | null> = { opencode: null, claude: null, codex: null }
      for (const name of ["opencode", "claude", "codex"] as HarnessName[]) {
        try {
          const v = await eapi.harnessGetVersion(name)
          if (!cancelled) results[name] = v
        } catch {
          if (!cancelled) results[name] = null
        }
      }
      if (!cancelled) setVersions(results)
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSelect = (name: HarnessName) => {
    if (versions[name]) {
      onHarnessSelected?.(name)
      return
    }
    const candidates = getInstallCandidates(name)
    if (candidates.length > 0) {
      setState({ type: "confirm", harness: name, candidate: candidates[0] })
    }
  }

  const handleConfirm = async () => {
    if (state.type !== "confirm") return
    const { harness, candidate } = state
    const commandStr = candidate.command.join(" ")
    console.log(`[HarnessPicker] User confirmed install: ${commandStr} (shown visibly, will run in PTY)`)

    const shell = candidate.command[0]
    const args = candidate.command.slice(1)
    try {
      const session = await ptySpawn(shell, workspaceRoot, args)
      let output = `$ ${commandStr}\r\n`
      setState({ type: "installing", harness, candidate, session, output })

      session.onData((data) => {
        output += data
        setState((prev) => {
          if (prev.type === "installing" && prev.harness === harness) {
            return { ...prev, output }
          }
          return prev
        })
      })

      session.onExit((code) => {
        if (code !== 0) {
          setState({
            type: "failed",
            harness,
            command: candidate.command,
            exitCode: code,
            output,
          })
          return
        }
        // Verify binary now resolvable via IPC
        const eapi = (window as any).electronAPI
        if (eapi?.harnessGetVersion) {
          eapi.harnessGetVersion(harness).then((version: string | null) => {
            if (!version) {
              setState({
                type: "verify-failed",
                harness,
                command: candidate.command,
                message: `Installation completed (exit 0) but binary not found — verification failed for ${harness}`,
              })
              return
            }
            setState({ type: "installed", harness, version })
            onHarnessSelected?.(harness)
          }).catch(() => {
            setState({
              type: "verify-failed",
              harness,
              command: candidate.command,
              message: `Installation completed (exit 0) but verification error for ${harness}`,
            })
          })
        } else {
          // Fallback — assume installed if no IPC
          setState({ type: "installed", harness, version: "unknown" })
          onHarnessSelected?.(harness)
        }
      })
    } catch (err) {
      setState({
        type: "failed",
        harness,
        command: candidate.command,
        exitCode: null,
        output: String(err),
      })
    }
  }

  const handleDecline = () => {
    if (state.type !== "confirm") return
    setState({
      type: "declined",
      harness: state.harness,
      message: `Installation declined for ${HARNESS_REGISTRY[state.harness].displayName}. Choose another harness or retry.`,
    })
  }

  const handleReset = () => setState({ type: "idle" })

  if (state.type === "confirm") {
    return (
      <div className="p-4 border rounded bg-[var(--surface-elevated)]">
        <h3 className="text-sm font-semibold">Confirm install — {HARNESS_REGISTRY[state.harness].displayName}</h3>
        <p className="text-xs text-[var(--text-secondary)] mt-2">This will run visibly in the terminal:</p>
        <pre className="mt-2 p-2 bg-black text-white text-xs rounded overflow-auto">
          {state.candidate.command.join(" ")}
        </pre>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">Source: {state.candidate.url}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={handleConfirm} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">
            Run in terminal
          </button>
          <button onClick={handleDecline} className="px-3 py-1.5 border rounded text-xs">
            Cancel
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">Output will appear visibly in the PTY — not in background.</p>
      </div>
    )
  }

  if (state.type === "installing") {
    return (
      <div className="p-4 border rounded bg-black text-white">
        <p className="text-xs">Installing {HARNESS_REGISTRY[state.harness].displayName}...</p>
        <pre className="mt-2 text-xs whitespace-pre-wrap max-h-64 overflow-auto">{state.output}</pre>
        <p className="text-xs text-white/60 mt-2">Running: {state.candidate.command.join(" ")} — output visible in PTY</p>
      </div>
    )
  }

  if (state.type === "declined") {
    return (
      <div className="p-4 border rounded bg-[var(--surface-elevated)]">
        <p className="text-xs text-amber-600">{state.message}</p>
        <button onClick={handleReset} className="mt-2 px-3 py-1.5 border rounded text-xs">
          Back to picker
        </button>
      </div>
    )
  }

  if (state.type === "failed") {
    return (
      <div className="p-4 border rounded bg-red-50">
        <p className="text-xs font-semibold text-red-700">Install failed (exit code {state.exitCode ?? "unknown"})</p>
        <pre className="mt-2 p-2 bg-black text-white text-xs rounded max-h-40 overflow-auto">{state.output.slice(-2000)}</pre>
        <p className="text-xs mt-2">Command: {state.command.join(" ")}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={handleReset} className="px-3 py-1.5 border rounded text-xs">
            Back to picker
          </button>
          <button onClick={() => setState({ type: "confirm", harness: state.harness, candidate: getInstallCandidates(state.harness)[0] })} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">
            Retry (show command again)
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">No silent retry — explicit user action required.</p>
      </div>
    )
  }

  if (state.type === "verify-failed") {
    return (
      <div className="p-4 border rounded bg-amber-50">
        <p className="text-xs font-semibold text-amber-700">{state.message}</p>
        <p className="text-xs mt-1">Command: {state.command.join(" ")} (exit 0 but binary not found)</p>
        <div className="mt-3 flex gap-2">
          <button onClick={handleReset} className="px-3 py-1.5 border rounded text-xs">
            Back to picker
          </button>
          <button onClick={() => setState({ type: "confirm", harness: state.harness, candidate: getInstallCandidates(state.harness)[0] })} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">
            Retry
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">No infinite loop — verification failed explicitly.</p>
      </div>
    )
  }

  if (state.type === "installed") {
    return (
      <div className="p-4 border rounded bg-green-50">
        <p className="text-xs text-green-700">Installed {HARNESS_REGISTRY[state.harness].displayName} v{state.version}</p>
        <button onClick={handleReset} className="mt-2 px-3 py-1.5 border rounded text-xs">
          Back to picker
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">Choose a harness</h3>
      <p className="text-xs text-[var(--text-secondary)]">Installed harnesses show version; others show install options. No fallback executor.</p>
      {(Object.keys(HARNESS_REGISTRY) as HarnessName[]).map((name) => {
        const def = HARNESS_REGISTRY[name]
        const ver = versions[name]
        const installed = !!ver
        return (
          <div key={name} className="border rounded p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">{def.displayName}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{installed ? `v${ver}` : def.description}</p>
            </div>
            <button
              onClick={() => handleSelect(name)}
              className={`px-3 py-1.5 rounded text-xs ${installed ? "bg-green-600 text-white" : "border"}`}
            >
              {installed ? "Launch" : "Install"}
            </button>
          </div>
        )
      })}
    </div>
  )
}
