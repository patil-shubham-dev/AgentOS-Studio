// Lazy-loaded invoke to avoid bundling @/lib/electron-api into main chunk
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@/lib/electron-api")
  return mod.invoke<T>(cmd, args)
}

export async function launchBrowser(url: string): Promise<string> {
  const result = await invoke("browser_launch", { url })
  if (result && typeof result === "object") {
    if ("sessionId" in result) return (result as { sessionId: string }).sessionId
    if ("error" in result) throw new Error((result as { error: string }).error)
  }
  if (typeof result === "string") return result
  throw new Error(`browser_launch returned unexpected type: ${typeof result}`)
}

export async function navigate(sessionId: string, url: string): Promise<void> {
  await invoke("browser_navigate", { sessionId, url })
}

export async function takeScreenshot(sessionId: string): Promise<string> {
  return await invoke<string>("browser_screenshot", { sessionId })
}

export async function executeJs(sessionId: string, js: string): Promise<string> {
  return await invoke<string>("browser_execute_js", { sessionId, js })
}

export async function getUrl(sessionId: string): Promise<string> {
  return await invoke<string>("browser_get_url", { sessionId })
}

export async function getTitle(sessionId: string): Promise<string> {
  return await invoke<string>("browser_get_title", { sessionId })
}

export async function closeBrowser(sessionId: string): Promise<void> {
  await invoke("browser_close", { sessionId })
}

export async function browserClick(sessionId: string, selector: string): Promise<void> {
  await invoke("browser_click", { sessionId, selector })
}

export async function browserFill(sessionId: string, selector: string, value: string): Promise<void> {
  await invoke("browser_fill", { sessionId, selector, value })
}

export async function browserWait(sessionId: string, selector: string, timeout?: number): Promise<void> {
  await invoke("browser_wait", { sessionId, selector, timeout: timeout ?? 5000 })
}

export async function browserGetText(sessionId: string, selector: string): Promise<string> {
  return await invoke<string>("browser_get_text", { sessionId, selector })
}

export async function pressKey(sessionId: string, key: string): Promise<void> {
  await invoke("browser_press_key", { sessionId, key })
}

export async function reload(sessionId: string): Promise<void> {
  await invoke("browser_reload", { sessionId })
}

export async function newTab(sessionId: string, url: string): Promise<{ tab_id: string; url: string; title: string }> {
  return await invoke("browser_new_tab", { sessionId, url })
}

export async function listTabs(sessionId: string): Promise<Array<{ tab_id: string; url: string; title: string }>> {
  return await invoke("browser_list_tabs", { sessionId })
}

export async function getConsoleLogs(sessionId: string): Promise<string[]> {
  return await invoke<string[]>("browser_get_console_logs", { sessionId })
}

export async function detectBrowsers(): Promise<Array<{ name: string; path: string; version: string | null }>> {
  return await invoke("browser_detect_browsers")
}

export async function saveBrowserState(path: string): Promise<void> {
  await invoke("browser_save_state", { path })
}

export async function loadBrowserState(path: string): Promise<Array<{ session_id: string; tabs: Array<{ url: string; title: string }>; active_index: number }>> {
  return await invoke("browser_load_state", { path })
}
