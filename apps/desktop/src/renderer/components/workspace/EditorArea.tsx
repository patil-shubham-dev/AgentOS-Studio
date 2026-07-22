import { motion } from "framer-motion"
import type { editor } from "monaco-editor"
import type { OnMount, OnChange } from "@monaco-editor/react"
import Editor from "@monaco-editor/react"
import { DiffViewerPane } from "./diff-viewer/DiffViewerPane"
import { MultiFileComposerPane } from "./MultiFileComposerPane"
import { SplitEditor } from "./SplitEditor"
import type { OpenFile } from "@/types"

interface EditorAreaProps {
  editorMode: string
  diffReviewFile: string | null
  onSwitchToEditor: () => void
  splitMode: string
  language: string
  activeFile: OpenFile | undefined
  editorOptions: editor.IStandaloneEditorConstructionOptions
  handleEditorMount: OnMount
  handleContentChange: OnChange
  children?: React.ReactNode
}

export function EditorArea({
  editorMode,
  diffReviewFile,
  onSwitchToEditor,
  splitMode,
  language,
  activeFile,
  editorOptions,
  handleEditorMount,
  handleContentChange,
  children,
}: EditorAreaProps) {
  return (
    <div className="flex-1 relative overflow-hidden min-h-0">
      {editorMode === "diff" ? (
        <DiffViewerPane
          onSwitchToEditor={onSwitchToEditor}
          diffReviewFile={diffReviewFile}
        />
      ) : editorMode === "composer" ? (
        <MultiFileComposerPane />
      ) : splitMode === "none" ? (
        <Editor
          key="monaco-editor"
          defaultLanguage={language}
          language={language}
          onChange={handleContentChange}
          onMount={handleEditorMount}
          options={editorOptions}
          theme="agentic-dark"
          loading={
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full items-center justify-center"
            >
              <div className="flex items-center gap-2 text-white/30">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-[11px]"
                >
                  Loading editor...
                </motion.span>
              </div>
            </motion.div>
          }
        />
      ) : (
        <SplitEditor
          activeFile={activeFile}
          language={language}
          handleEditorMount={handleEditorMount}
          handleContentChange={handleContentChange}
        />
      )}

      {children}
    </div>
  )
}
