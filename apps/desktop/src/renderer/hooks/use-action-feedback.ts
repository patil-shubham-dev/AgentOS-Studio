import { useCallback } from "react"
import { useToastStore, type ToastVariant } from "@/stores/toast-store"

export interface ActionFeedback {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

export function useActionFeedback(): ActionFeedback {
  const addToast = useToastStore((s) => s.addToast)

  const success = useCallback(
    (message: string) => addToast(message, "success"),
    [addToast],
  )

  const error = useCallback(
    (message: string) => addToast(message, "error"),
    [addToast],
  )

  const info = useCallback(
    (message: string) => addToast(message, "info"),
    [addToast],
  )

  return { success, error, info }
}
