// Electron shim for @tauri-apps/plugin-http

export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Use native fetch in Electron 28+
  return globalThis.fetch(input, init)
}
