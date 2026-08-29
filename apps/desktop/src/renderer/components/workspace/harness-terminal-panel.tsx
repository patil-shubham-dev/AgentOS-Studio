import { useEffect, useRef, useState, useCallback } from "react"
import { HarnessPicker } from "./harness-picker"
import { XtermTerminal, type XtermTerminalHandle } from "./xterm-terminal"
import { ptySpawn, type PtySession } from "@/runtime/terminal/pty-runtime"
import { HARNESS_REGISTRY, type HarnessName } from "@/lib/harness-registry"
import { useWorkspaceStore } from "@/stores/workspace-store"

export function HarnessTerminalPanel() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [selected, setSelected] = useState<HarnessName | null>(null)
  const [session, setSession] = useState<PtySession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState("")
  const terminalRef = useRef<XtermTerminalHandle | null>(null)
  const sessionRef = useRef<PtySession | null>(null)

  const spawnHarness = useCallback(async (harness: HarnessName) => {
    setError(null)
    setOutput("")
    sessionRef.current?.kill()
    setSession(null)
    const def = HARNESS_REGISTRY[harness]
    const binary = def.binary
    const args = def.launchArgs ?? []
    try {
      const s = await ptySpawn(binary, rootPath ?? null, args)
      sessionRef.current = s
      setSession(s)
      s.onData((data) => {
        setOutput((prev) => prev + data)
        terminalRef.current?.write(data)
      })
      s.onExit((code) => {
        terminalRef.current?.write(`\r\n\x1b[33m[${def.displayName} exited with code ${code}]\x1b[0m\r\n`)
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Failed to launch ${def.displayName} (${binary} ${args.join(" ")}): ${msg}`)
    }
  }, [rootPath])

  useEffect(() => {
    let cancelled = false
    async function probe() {
      const eapi = (window as any).electronAPI
      if (!eapi?.harnessGetVersion || selected) return
      for (const name of ["opencode", "claude", "codex"] as HarnessName[]) {
        try {
          const v = await eapi.harnessGetVersion(name)
          if (v && !cancelled) {
            setSelected(name)
            spawnHarness(name)
            return
          }
        } catch { /* not installed */ }
      }
    }
    probe()
    return () => { cancelled = true }
  }, [selected, spawnHarness])

  const handleSelect = useCallback((h: HarnessName) => {
    setSelected(h)
    spawnHarness(h)
  }, [spawnHarness])

  useEffect(() => {
    return () => { sessionRef.current?.kill(); sessionRef.current = null }
  }, [])

  const handleData = useCallback((data: string) => {
    session?.write(data)
  }, [session])

  const handleResize = useCallback((cols: number, rows: number) => {
    session?.resize(cols, rows)
  }, [session])

  if (!rootPath) {
    return <div className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)] p-4">Open a workspace to launch harness terminal.</div>
  }

  if (!selected || !session) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Harness Terminal</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Select or install a harness — runs visibly in PTY, no fallback executor.</div>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {error && <div className="mb-3 rounded border border-[var(--color-accent-red)]/20 bg-[var(--color-accent-red)]/5 px-3 py-2 text-[11px] text-[var(--color-accent-red)]">{error}</div>}
          <HarnessPicker workspaceRoot={rootPath} onHarnessSelected={handleSelect} />
        </div>
        {output && <pre className="max-h-32 overflow-auto border-t border-[var(--border-subtle)] bg-black p-2 text-[10px] text-white/70">{output.slice(-3000)}</pre>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a0b]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0c0c0d] px-2 py-1 text-[10px]">
        <span className="font-medium text-white/60">{HARNESS_REGISTRY[selected].displayName}</span>
        <span className="text-white/20">— {rootPath.split(/[\\/]/).pop()}</span>
        <button onClick={() => { sessionRef.current?.kill(); setSession(null); setSelected(null); setError(null) }} className="ml-auto rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/40 hover:text-white/70">Switch harness</button>
      </div>
      {error && <div className="border-b border-[var(--color-accent-red)]/20 bg-[var(--color-accent-red)]/5 px-3 py-1.5 text-[11px] text-[var(--color-accent-red)]">{error}</div>}
      <div className="flex-1 min-h-0">
        <XtermTerminal sessionId={session.id} onData={handleData} onResize={handleResize} className="h-full" ref={(el) => { terminalRef.current = el }} />
      </div>
    </div>
  )
}
