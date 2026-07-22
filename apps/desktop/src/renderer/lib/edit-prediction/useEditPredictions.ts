import { useCallback, useSyncExternalStore } from "react"
import { editPredictionStore } from "./edit-prediction-store"

const listeners = new Set<() => void>()

function subscribeToStore(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn())
}

const origRecord = editPredictionStore.recordEdit.bind(editPredictionStore)
editPredictionStore.recordEdit = (filePath: string, sessionId: string) => {
  origRecord(filePath, sessionId)
  notifyListeners()
}

export function useEditPredictions(activeFilePath: string | null) {
  const getSnapshot = useCallback(() => {
    if (!activeFilePath) return []
    return editPredictionStore.getPredictions(activeFilePath)
  }, [activeFilePath])

  const predictions = useSyncExternalStore(subscribeToStore, getSnapshot, () => [])

  const recordEdit = useCallback((filePath: string, sessionId: string) => {
    editPredictionStore.recordEdit(filePath, sessionId)
  }, [])

  return { predictions, recordEdit }
}
