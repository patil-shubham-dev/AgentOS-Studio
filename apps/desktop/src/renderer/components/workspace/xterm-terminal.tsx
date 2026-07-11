import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"

export interface XtermTerminalHandle {
  write: (data: string) => void
  clear: () => void
}

interface XtermTerminalProps {
  sessionId: string
  onData: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  className?: string
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  ({ sessionId, onData, onResize, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        terminalRef.current?.write(data)
      },
      clear: () => {
        terminalRef.current?.clear()
      },
    }))

    useEffect(() => {
      if (!containerRef.current) return

      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon

      const terminal = new Terminal({
        theme: {
          background: "#0a0a0b",
          foreground: "#e0e0e0",
          cursor: "#4ade80",
          selectionBackground: "#264f78",
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        cursorBlink: true,
        cursorStyle: "block",
        allowTransparency: true,
        cols: 80,
        rows: 24,
      })

      terminal.loadAddon(fitAddon)
      terminal.open(containerRef.current)
      terminalRef.current = terminal

      requestAnimationFrame(() => {
        fitAddon.fit()
      })

      const disposeData = terminal.onData((data) => {
        onData(data)
      })

      return () => {
        disposeData.dispose()
        terminal.dispose()
        terminalRef.current = null
        fitAddonRef.current = null
      }
    }, [sessionId, onData])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const observer = new ResizeObserver(() => {
        const term = terminalRef.current
        const fit = fitAddonRef.current
        if (!term || !fit) return
        fit.fit()
        onResize?.(term.cols, term.rows)
      })
      observer.observe(container)

      return () => {
        observer.disconnect()
      }
    }, [onResize])

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />
    )
  },
)

XtermTerminal.displayName = "XtermTerminal"
