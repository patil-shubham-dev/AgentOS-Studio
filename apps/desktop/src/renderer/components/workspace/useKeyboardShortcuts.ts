import { useEffect } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useDiffStore } from "@/stores/diff-store"
import { acceptDiffReviewFile } from "@/lib/diff-review"

export function useDiffNavigation(showTerminal: boolean, setShowTerminal: (v: boolean | ((p: boolean) => boolean)) => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const state = useWorkspaceStore.getState()
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault()
        state.setEditorMode(state.editorMode === "diff" ? "editor" : "diff")
        return
      }
      if (state.editorMode === "diff") {
        const diffFiles = useDiffStore.getState().files
        const fileList = Array.from(diffFiles.values())
        const currentTargetPath = state.diffReviewFile ?? state.activeFilePath
        const currentIdx = fileList.findIndex((f) => f.path === currentTargetPath)
        if (e.ctrlKey && e.altKey && e.key === "ArrowRight") {
          e.preventDefault()
          if (currentIdx < fileList.length - 1) {
            state.openFileInDiffMode(fileList[currentIdx + 1].path)
          }
          return
        }
        if (e.ctrlKey && e.altKey && e.key === "ArrowLeft") {
          e.preventDefault()
          if (currentIdx > 0) {
            state.openFileInDiffMode(fileList[currentIdx - 1].path)
          }
          return
        }
        if (e.ctrlKey && e.key === "Enter") {
          e.preventDefault()
          const targetPath = state.diffReviewFile ?? state.activeFilePath
          if (targetPath) {
            void acceptDiffReviewFile(targetPath)
          }
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          state.setEditorMode("editor")
          return
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault()
        setShowTerminal((p) => !p)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setShowTerminal, showTerminal])
}
