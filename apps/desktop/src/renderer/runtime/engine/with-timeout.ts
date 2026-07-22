const DEFAULT_TIMEOUT_MS = 5_000

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`)
    this.name = "TimeoutError"
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs))
    }, timeoutMs)

    promise.then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  operation: string,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  try {
    return await withTimeout(promise, operation, timeoutMs)
  } catch (err) {
    console.warn(`[Timeout] ${operation} — using fallback: ${err instanceof Error ? err.message : String(err)}`)
    return fallback
  }
}
