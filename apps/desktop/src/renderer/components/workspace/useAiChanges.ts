import { useRef, useEffect } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useHaptic } from "@/lib/haptics"
import type { OpenFile } from "@/types"
import type { AIChange } from "./AiChangeOverlay"

export function useAiChanges(
  activeFile: OpenFile | undefined,
  setAiChanges: React.Dispatch<React.SetStateAction<AIChange[]>>,
  setShowAiOverlay: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const { pulse } = useHaptic()
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile
  const aiChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = useWorkspaceStore.subscribe((state) => {
      const currentFile = activeFileRef.current
      const lastFile = state.openFiles[state.openFiles.length - 1]
      if (lastFile && lastFile.isDirty && currentFile?.path === lastFile.path) {
        if (aiChangeDebounceRef.current) {
          clearTimeout(aiChangeDebounceRef.current)
        }
        aiChangeDebounceRef.current = setTimeout(() => {
          requestAnimationFrame(() => {
            setAiChanges((prev) => {
              if (prev.some((c) => c.filePath === lastFile.path)) return prev
              return [...prev, {
                filePath: lastFile.path,
                originalContent: currentFile?.content || "",
                newContent: lastFile.content,
                applied: false,
                rejected: false,
              }]
            })
            setShowAiOverlay(true)
            pulse("medium")
          })
        }, 300)
      }
    })
    return () => {
      unsub()
      if (aiChangeDebounceRef.current) {
        clearTimeout(aiChangeDebounceRef.current)
      }
    }
  }, [])
}
