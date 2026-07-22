import { useRef, useCallback } from "react"
import type { OnMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useDiagnosticsStore, type Diagnostic } from "@/stores/diagnostics-store"
import { AGENTIC_DARK_THEME } from "@/lib/themes/agentic-dark"
import { createAiCodeLensProvider } from "@/lib/themes/agentic-code-lens"
import { debugService } from "@/lib/debug/debug-service"
import { registerInlineCompletionProvider, setupCompletionTracking } from "@/lib/completion/completion-provider"
import { setMonacoInstance } from "./editor-utils"
import type { SymbolItem } from "./symbol-search"
import type { InlineEditState } from "./EditorOverlays"

interface MonacoMountCallbacks {
  setCursorPosition: (line: number, col: number) => void
  setSelectedText: (text: string) => void
  setVisibleRange: (start: number, end: number) => void
  setUserActive: (active: boolean) => void
  setShowMinimap: (fn: (prev: boolean) => boolean) => void
  setShowProblems: (fn: (prev: boolean) => boolean) => void
  setShowDebugPanel: (fn: (prev: boolean) => boolean) => void
  setSymbolSearchOpen: (open: boolean) => void
  setCurrentFileSymbols: (items: SymbolItem[]) => void
  setInlineEdit: (state: InlineEditState | ((prev: InlineEditState) => InlineEditState)) => void
  onSave: () => void
}

export function useMonacoMount(callbacks: MonacoMountCallbacks) {
  const themeGuardRef = useRef(false)

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    setMonacoInstance(monaco)

    const themeName = "agentic-dark"
    if (!themeGuardRef.current) {
      themeGuardRef.current = true
      monaco.editor.defineTheme(themeName, AGENTIC_DARK_THEME)
    }
    monaco.editor.setTheme(themeName)

    editor.onDidChangeCursorPosition((e) => {
      callbacks.setCursorPosition(e.position.lineNumber, e.position.column)
    })

    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel()
      if (model) {
        callbacks.setSelectedText(model.getValueInRange(e.selection))
      }
    })

    editor.onDidScrollChange(() => {
      const visibleRange = editor.getVisibleRanges()
      if (visibleRange.length > 0) {
        callbacks.setVisibleRange(visibleRange[0].startLineNumber, visibleRange[0].endLineNumber)
      }
    })

    editor.onDidFocusEditorText(() => callbacks.setUserActive(true))
    editor.onDidBlurEditorText(() => callbacks.setUserActive(false))

    registerInlineCompletionProvider(monaco, editor)
    setupCompletionTracking(editor)
    editor.updateOptions({ inlineSuggest: { enabled: true } })

    const codeActionDisposable = monaco.languages.registerCodeActionProvider("*", {
      provideCodeActions: (model, range) => {
        const diagnostics = monaco.editor.getModelMarkers({ resource: model.uri })
        const lineDiags = diagnostics.filter((d) =>
          range.startLineNumber <= d.startLineNumber && d.startLineNumber <= range.endLineNumber
        )
        const actions: import("monaco-editor").languages.CodeAction[] = []
        for (const diag of lineDiags.slice(0, 3)) {
          actions.push({
            title: `Fix: ${diag.message.slice(0, 60)}`,
            kind: "quickfix",
            diagnostics: [diag],
          })
        }
        if (range.startLineNumber === range.endLineNumber) {
          actions.push({ title: "Explain this line", kind: "refactor.extract" })
        } else {
          actions.push({ title: "Explain selected code", kind: "refactor.extract" })
          actions.push({ title: "Optimize selected code", kind: "refactor.rewrite" })
        }
        return { actions, dispose: () => {} }
      },
    })
    editor.onDidDispose(() => codeActionDisposable.dispose())

    const codeLensDisposable = monaco.languages.registerCodeLensProvider("*", createAiCodeLensProvider())
    editor.onDidDispose(() => codeLensDisposable.dispose())

    const lensCommands = [
      { id: "ai-codelens.explain", action: "explain" },
      { id: "ai-codelens.write-test", action: "write-test" },
      { id: "ai-codelens.add-error-handling", action: "add-error-handling" },
      { id: "ai-codelens.optimize", action: "optimize" },
    ] as const
    for (const cmd of lensCommands) {
      editor.addAction({
        id: cmd.id,
        label: `AI: ${cmd.action}`,
        run: (ed) => {
          const model = ed.getModel()
          if (!model) return
          const selection = ed.getSelection()
          if (!selection) return
          const selected = model.getValueInRange(selection)
          const text = selected || model.getLineContent(selection.startLineNumber)
          if (!text.trim()) return

          const instructions: Record<string, string> = {
            explain: "Explain this code in detail, covering what it does and how it works.",
            "write-test": "Write comprehensive unit tests for this code covering edge cases.",
            "add-error-handling": "Add proper error handling to this code, including try-catch and input validation.",
            optimize: "Optimize this code for better performance and readability.",
          }

          const fullLineRange = new (monaco.Range)(
            selection.startLineNumber, 1,
            selection.endLineNumber, model.getLineMaxColumn(selection.endLineNumber),
          )
          const fullLineText = model.getValueInRange(fullLineRange)

          callbacks.setInlineEdit({
            active: true,
            selectedRange: {
              startLine: selection.startLineNumber,
              startCol: 1,
              endLine: selection.endLineNumber,
              endCol: model.getLineMaxColumn(selection.endLineNumber),
            },
            selectedText: fullLineText,
            instruction: instructions[cmd.action] ?? "Explain this code.",
            generatedPatch: null,
            editedCode: null,
            loading: true,
            streaming: false,
            tokenCount: 0,
            error: null,
            viewMode: cmd.action === "write-test" || cmd.action === "optimize" || cmd.action === "add-error-handling" ? "edit" : "explain",
          })
        },
      })
    }

    editor.addAction({
      id: "save-file", label: "Save File",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => callbacks.onSave(),
    })

    editor.addAction({
      id: "toggle-minimap", label: "Toggle Minimap",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
      run: () => callbacks.setShowMinimap((p) => !p),
    })

    editor.addAction({
      id: "toggle-problems", label: "Toggle Problems Panel",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyPeriod],
      run: () => callbacks.setShowProblems((p) => !p),
    })

    editor.addAction({
      id: "inline-ai-edit", label: "Inline AI Edit",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      contextMenuGroupId: "1_modification",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection || selection.isEmpty()) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return
        callbacks.setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber,
            startCol: selection.startColumn,
            endLine: selection.endLineNumber,
            endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "",
          generatedPatch: null,
          editedCode: null,
          loading: false,
          streaming: false,
          tokenCount: 0,
          error: null,
          viewMode: "edit",
        })
      },
    })

    editor.addAction({
      id: "symbol-search", label: "Go to Symbol",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO],
      run: () => {
        const model = editor.getModel()
        if (model) {
          monaco.languages.provideDocumentSymbols(model).then((symbols: any) => {
            if (symbols) {
              const items: SymbolItem[] = symbols.map((s: any) => ({
                name: s.name,
                kind: s.kind,
                detail: s.detail,
                range: { startLineNumber: s.range.startLineNumber, startColumn: s.range.startColumn },
                containerName: s.containerName,
                tags: s.tags,
              }))
              callbacks.setCurrentFileSymbols(items)
              callbacks.setSymbolSearchOpen(true)
            }
          }).catch(() => {})
        }
      },
    })

    editor.addAction({
      id: "toggle-debug-panel", label: "Toggle Debug Panel",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD],
      run: () => callbacks.setShowDebugPanel((p) => !p),
    })

    editor.addAction({
      id: "format-document", label: "Format Document",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: (ed) => { ed.getAction("editor.action.formatDocument")?.run() },
    })

    editor.addAction({
      id: "rename-symbol", label: "Rename Symbol",
      keybindings: [monaco.KeyCode.F2],
      run: (ed) => { ed.getAction("editor.action.rename")?.run() },
    })

    editor.addAction({
      id: "ai-explain", label: "AI: Explain Selection",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
      contextMenuGroupId: "navigation",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return
        callbacks.setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber, startCol: selection.startColumn,
            endLine: selection.endLineNumber, endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "Explain this code in detail, covering what it does and how it works.",
          generatedPatch: null, editedCode: null, loading: true, streaming: false, tokenCount: 0, error: null,
          viewMode: "explain",
        })
      },
    })

    editor.addAction({
      id: "ai-optimize", label: "AI: Optimize Selection",
      contextMenuGroupId: "navigation",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return
        callbacks.setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber, startCol: selection.startColumn,
            endLine: selection.endLineNumber, endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "Optimize this code for better performance and readability.",
          generatedPatch: null, editedCode: null, loading: true, streaming: false, tokenCount: 0, error: null,
          viewMode: "optimize",
        })
      },
    })

    // Debug gutter: click to add/remove breakpoints
    editor.onMouseDown((e) => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = e.target.position?.lineNumber
        if (line) {
          const model = editor.getModel()
          if (model) {
            const filePath = model.uri.path.replace("/workspace/", "")
            debugService.toggleBreakpoint(line, filePath)
          }
        }
      }
    })

    debugService.mount(editor, monaco)

    // Sync Monaco markers (diagnostics) to diagnostics store
    monaco.editor.onDidChangeMarkers((resources: any[]) => {
      for (const resource of resources) {
        const markers = monaco.editor.getModelMarkers({ resource })
        const diagnostics: Diagnostic[] = markers.map((marker: any) => ({
          filePath: resource.path.replace("/workspace/", ""),
          fileName: resource.path.split("/").pop() ?? "",
          line: marker.startLineNumber,
          column: marker.startColumn,
          message: marker.message,
          severity: marker.severity === monaco.MarkerSeverity.Error
            ? "error"
            : marker.severity === monaco.MarkerSeverity.Warning
              ? "warning"
              : "info",
          code: typeof marker.code === "string" ? marker.code : marker.code?.toString(),
        }))
        useDiagnosticsStore.getState().addDiagnostics(diagnostics)
      }
    })
  }, [])

  return { handleEditorMount }
}
