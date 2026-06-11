import type { editor } from "monaco-editor"
import { useDebugStore, type DebugBreakpoint } from "@/stores/debug-store"
import { CDPClient } from "./cdp-client"

export class DebugService {
  private editor: editor.IStandaloneCodeEditor | null = null
  private monaco: any = null
  private breakpointDecorations = new Map<string, string[]>()
  private pausedLineDecorations: string[] = []
  readonly cdp = new CDPClient()
  private breakpointMap = new Map<string, string>()

  mount(editor: editor.IStandaloneCodeEditor, monaco: any): void {
    this.editor = editor
    this.monaco = monaco
  }

  unmount(): void {
    this.clearPausedLine()
    this.clearAllBreakpointDecorations()
    this.editor = null
    this.monaco = null
  }

  toggleBreakpoint(line: number, filePath: string): string | null {
    const store = useDebugStore.getState()
    const existing = store.breakpoints.find(
      (bp) => bp.filePath === filePath && bp.line === line,
    )

    if (existing) {
      store.removeBreakpoint(existing.id)
      this.removeBreakpointDecoration(existing.id)
      this.removeCDPBreakpoint(existing.id)
      return null
    }

    const bp: DebugBreakpoint = {
      id: `bp-${filePath}-${line}-${Date.now()}`,
      filePath,
      line,
      enabled: true,
    }
    store.addBreakpoint(bp)
    this.addBreakpointDecoration(bp)
    this.syncBreakpointToCDP(bp)
    return bp.id
  }

  private async syncBreakpointToCDP(bp: DebugBreakpoint): Promise<void> {
    if (!this.cdp.isDebuggerEnabled || !bp.enabled) return
    try {
      const url = filePathToUrl(bp.filePath)
      const cdpId = await this.cdp.setBreakpoint(url, bp.line)
      if (cdpId) this.breakpointMap.set(bp.id, cdpId)
    } catch { /* CDP not ready */ }
  }

  private async removeCDPBreakpoint(bpId: string): Promise<void> {
    const cdpId = this.breakpointMap.get(bpId)
    if (cdpId) {
      try { await this.cdp.removeBreakpoint(cdpId) } catch { /* ignore */ }
      this.breakpointMap.delete(bpId)
    }
  }

  addBreakpointDecoration(bp: DebugBreakpoint): void {
    const ed = this.editor
    if (!ed) return
    const model = ed.getModel()
    if (!model) return
    const filePath = model.uri.path.replace("/workspace/", "")
    if (filePath !== bp.filePath) return

    const decorations = ed.deltaDecorations(
      this.breakpointDecorations.get(bp.id) || [],
      [
        {
          range: {
            startLineNumber: bp.line,
            startColumn: 1,
            endLineNumber: bp.line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            glyphMarginClassName: bp.enabled
              ? "debug-breakpoint-glyph"
              : "debug-breakpoint-disabled-glyph",
            glyphMarginHoverMessage: { value: bp.condition ? `Condition: ${bp.condition}` : "Breakpoint" },
          },
        },
      ],
    )
    this.breakpointDecorations.set(bp.id, decorations)
  }

  removeBreakpointDecoration(id: string): void {
    const ed = this.editor
    if (!ed) return
    const old = this.breakpointDecorations.get(id)
    if (old) {
      ed.deltaDecorations(old, [])
      this.breakpointDecorations.delete(id)
    }
  }

  clearAllBreakpointDecorations(): void {
    const ed = this.editor
    if (!ed) return
    for (const [, decorations] of this.breakpointDecorations) {
      ed.deltaDecorations(decorations, [])
    }
    this.breakpointDecorations.clear()
  }

  setPausedLine(line: number | null): void {
    const ed = this.editor
    if (!ed) return
    if (line === null) {
      this.clearPausedLine()
      return
    }
    this.pausedLineDecorations = ed.deltaDecorations(
      this.pausedLineDecorations,
      [
        {
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: "debug-paused-line",
            glyphMarginClassName: "debug-paused-arrow",
          },
        },
      ],
    )
  }

  clearPausedLine(): void {
    const ed = this.editor
    if (!ed) return
    if (this.pausedLineDecorations.length > 0) {
      ed.deltaDecorations(this.pausedLineDecorations, [])
      this.pausedLineDecorations = []
    }
  }

  refreshBreakpointDecorations(filePath: string): void {
    const store = useDebugStore.getState()
    const fileBps = store.breakpoints.filter((bp) => bp.filePath === filePath)
    for (const bp of fileBps) {
      this.addBreakpointDecoration(bp)
    }
  }

  getBreakpointsForFile(filePath: string): DebugBreakpoint[] {
    return useDebugStore
      .getState()
      .breakpoints.filter((bp) => bp.filePath === filePath)
  }

  private wireCDPEvents(): void {
    this.cdp.on("Debugger.paused", (params: any) => {
      const store = useDebugStore.getState()
      const frames = params.callFrames || []
      const top = frames[0]

      store.setPaused(true)
      if (top) {
        store.setCurrentFrame({
          filePath: top.location?.scriptId || "unknown",
          line: (top.location?.lineNumber ?? 0) + 1,
          column: (top.location?.columnNumber ?? 0) + 1,
          functionName: top.functionName,
        })
        this.setPausedLine((top.location?.lineNumber ?? 0) + 1)
      }
      store.setCallStack(
        frames.map((f: any, i: number) => ({
          filePath: f.location?.scriptId || "unknown",
          line: (f.location?.lineNumber ?? 0) + 1,
          functionName: f.functionName || "(anonymous)",
        }))
      )

      if (top?.scopeChain?.length > 0) {
        const localScope = top.scopeChain.find((s: any) => s.type === "local")
          || top.scopeChain[0]
        if (localScope?.object?.objectId) {
          this.cdp.send("Runtime.getProperties", {
            objectId: localScope.object.objectId,
            ownProperties: false,
            accessorPropertiesOnly: false,
            generatePreview: true,
          }).then((propsResult: any) => {
            const vars = (propsResult.result || [])
              .filter((p: any) => !p.name.startsWith("_") && p.name !== "this" && p.value)
              .map((p: any) => ({
                name: p.name,
                value: p.value?.description ?? p.value?.value ?? String(p.value),
                type: p.value?.type ?? typeof p.value,
              }))
            store.setVariables(vars)
          }).catch(() => {})
        }
      }
    })

    this.cdp.on("Debugger.resumed", () => {
      const store = useDebugStore.getState()
      store.setPaused(false)
      store.setCurrentFrame(null)
      store.setCallStack([])
      store.setVariables([])
    })

    this.cdp.on("Runtime.consoleAPICalled", (params: any) => {
      const store = useDebugStore.getState()
      const args = params.args || []
      const message = args.map((a: any) => a.value ?? a.description ?? "").join(" ")
      store.addConsoleOutput({
        level: params.type === "error" ? "error" : params.type === "warning" ? "warn" : "log",
        message,
      })
    })

    this.cdp.on("Runtime.exceptionThrown", (params: any) => {
      const store = useDebugStore.getState()
      const desc = params.exceptionDetails?.text || "Unknown exception"
      store.addConsoleOutput({ level: "error", message: desc })
    })
  }

  async startSession(filePath: string, workingDir: string): Promise<void> {
    const store = useDebugStore.getState()
    store.setRunning(true)
    store.setConnecting(true)

    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const result = await invoke<string>("debug_launch", { filePath, workingDir })
      const [inspectorUrl, sessionId] = result.split("\n")
      store.setInspectorUrl(inspectorUrl)
      store.setSessionId(sessionId)

      this.wireCDPEvents()
      await this.cdp.connect(inspectorUrl)
      store.setCdpConnected(true)
      await this.cdp.enable()

      const currentBps = store.breakpoints.filter((bp) => bp.enabled)
      for (const bp of currentBps) {
        await this.syncBreakpointToCDP(bp)
      }
      await this.cdp.runIfWaiting()
    } catch (e: any) {
      store.addConsoleOutput({ level: "error", message: `Debug launch failed: ${e}` })
      store.setRunning(false)
    } finally {
      store.setConnecting(false)
    }
  }

  async stopSession(): Promise<void> {
    const store = useDebugStore.getState()
    const sessionId = store.sessionId
    this.cdp.disconnect()
    store.setCdpConnected(false)
    this.clearPausedLine()
    if (sessionId) {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("debug_stop", { sessionId })
      } catch { /* ignore */ }
    }
    store.reset()
  }

  async resume(): Promise<void> {
    try { await this.cdp.resume() } catch { /* ignore */ }
  }

  async stepOver(): Promise<void> {
    try { await this.cdp.stepOver() } catch { /* ignore */ }
  }

  async stepInto(): Promise<void> {
    try { await this.cdp.stepInto() } catch { /* ignore */ }
  }

  async stepOut(): Promise<void> {
    try { await this.cdp.stepOut() } catch { /* ignore */ }
  }
}

function filePathToUrl(filePath: string): string {
  if (filePath.startsWith("file://")) return filePath
  const normalized = filePath.replace(/\\/g, "/")
  if (normalized.startsWith("/")) return `file://${normalized}`
  return `file:///${normalized}`
}

export const debugService = new DebugService()
