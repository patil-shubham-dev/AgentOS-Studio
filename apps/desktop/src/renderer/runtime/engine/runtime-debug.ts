const RUNTIME_DEBUG_KEY = "agenticos:runtime-debug"

export function isRuntimeDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(RUNTIME_DEBUG_KEY) === "1"
  } catch {
    return false
  }
}

export function runtimeDebugLog(...args: unknown[]): void {
  if (isRuntimeDebugEnabled()) console.log(...args)
}

export function runtimeDebugTrace(message: string): void {
  if (isRuntimeDebugEnabled()) console.trace(message)
}
