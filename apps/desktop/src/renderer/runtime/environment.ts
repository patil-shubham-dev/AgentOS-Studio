export type RuntimeEnvironment = "tauri" | "browser" | "node"

export class FrontendRuntimeViolationError extends Error {
  constructor(
    moduleName: string,
    apiName: string,
    callsite: string,
  ) {
    super(
      `[FrontendRuntimeViolation] Module "${moduleName}" attempted to use Node.js API "${apiName}" at "${callsite}". ` +
      `This API is not available in the frontend runtime (${getRuntimeEnvironment()}). ` +
      `Use Tauri plugin APIs or platform-safe alternatives.`,
    )
    this.name = "FrontendRuntimeViolationError"
  }
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof window !== "undefined" && typeof (window as any).__TAURI_INTERNALS__ !== "undefined") {
    return "tauri"
  }
  if (typeof window !== "undefined" && (window as any).electronAPI) {
    return "tauri"
  }
  if (typeof window !== "undefined") {
    return "browser"
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node"
  }
  return "browser"
}

export function isTauri(): boolean {
  return getRuntimeEnvironment() === "tauri"
}

export function isBrowser(): boolean {
  return getRuntimeEnvironment() === "browser"
}

export function assertFrontendSafe(moduleName: string, apiName: string, callsite: string): void {
  const env = getRuntimeEnvironment()
  if (env === "node") return
  throw new FrontendRuntimeViolationError(moduleName, apiName, callsite)
}
