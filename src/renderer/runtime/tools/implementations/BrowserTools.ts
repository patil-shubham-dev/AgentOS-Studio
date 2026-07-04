import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { BrowserMemory } from '@/runtime/memory/BrowserMemory'
import { isViewportSession, routeThroughViewport, retryBrowserAction } from '@/lib/browser-controller'

const VIEWPORT_ACTIONS: Record<string, string> = {
  navigate: 'navigate',
  browserClick: 'click',
  browserFill: 'fill',
  pressKey: 'press_key',
  takeScreenshot: 'screenshot',
  executeJs: 'execute_js',
  reload: 'reload',
  getUrl: 'get_url',
  getTitle: 'get_title',
}

const RETRYABLE_VIEWPORT_ACTIONS = new Set(['click', 'fill', 'press_key'])

async function invokeBrowser<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const sessionId = String(args.sessionId ?? args.session_id ?? '')
  const viewportAction = VIEWPORT_ACTIONS[method]

  // Route through live viewport when session is __viewport__
  if (isViewportSession(sessionId) && viewportAction) {
    const isRetryable = RETRYABLE_VIEWPORT_ACTIONS.has(viewportAction)
    const doRoute = () => routeThroughViewport(viewportAction, args)

    const result = isRetryable
      ? await retryBrowserAction(doRoute, { maxRetries: 1, baseDelay: 300, timeout: 8000 })
      : await doRoute()

    if (!result.success) throw new Error(result.error ?? 'Viewport action failed')
    return result.result as T
  }

  const b = await import('@/lib/browser')
  const m = (b as any)[method]
  if (typeof m !== 'function') throw new Error(`Browser method ${method} not found`)
  const result = await m(...Object.values(args)) as Promise<T>

  try {
    BrowserMemory.getInstance().record({
      action: method,
      sessionId,
      tabId: String(args.tabId ?? ''),
      url: String(args.url ?? ''),
      title: String(args.title ?? ''),
      durationMs: 0,
      timestamp: Date.now(),
    })
  } catch {}

  return result
}

function sessionActivity(sessionId: string, action: string): string | null {
  return sessionId ? `${action} in browser session ${sessionId.slice(0, 8)}...` : `Browser ${action.toLowerCase()}`
}

export const LaunchBrowserTool: AgentTool = buildTool({
  name: 'launch_browser',
  description: 'Launch a headless browser session and navigate to a URL',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
    },
    required: ['url'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_NAVIGATE],
  getActivityDescription: (input) => `Launching browser to ${(input as any)?.url}`,
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const url = String(input.url ?? '')
    const result = await invokeBrowser<string>('launchBrowser', { url })
    return { data: result }
  },
})

export const BrowserNavigateTool: AgentTool = buildTool({
  name: 'browser_navigate',
  description: 'Navigate the browser to a new URL',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      url: { type: 'string', description: 'Destination URL' },
    },
    required: ['session_id', 'url'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_NAVIGATE],
  getActivityDescription: (input) => sessionActivity((input as any)?.session_id, 'Navigating'),
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('navigate', { sessionId: input.session_id, url: input.url })
    return { data: `Navigated to ${input.url}` }
  },
})

export const BrowserScreenshotTool: AgentTool = buildTool({
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current browser page (returns base64 PNG data URI)',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  getActivityDescription: (input) => sessionActivity((input as any)?.session_id, 'Taking screenshot'),
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await invokeBrowser<string>('takeScreenshot', { sessionId: input.session_id })
    return { data: result }
  },
})

export const BrowserClickTool: AgentTool = buildTool({
  name: 'browser_click',
  description: 'Click an element in the browser page matching a CSS selector',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector for the element to click' },
    },
    required: ['session_id', 'selector'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  getActivityDescription: (input) => `Clicking ${(input as any)?.selector}`,
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('browserClick', { sessionId: input.session_id, selector: input.selector })
    return { data: `Clicked ${input.selector}` }
  },
})

export const BrowserFillTool: AgentTool = buildTool({
  name: 'browser_fill',
  description: 'Fill an input field in the browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector for the input element' },
      value: { type: 'string', description: 'Value to type into the field' },
    },
    required: ['session_id', 'selector', 'value'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  getActivityDescription: (input) => `Filling ${(input as any)?.selector}`,
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('browserFill', { sessionId: input.session_id, selector: input.selector, value: input.value })
    return { data: `Filled ${input.selector} with "${input.value}"` }
  },
})

export const BrowserExecuteJsTool: AgentTool = buildTool({
  name: 'browser_execute_js',
  description: 'Execute JavaScript in the browser page context',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      js: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['session_id', 'js'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  permissions: async () => ({ behavior: 'ask', reason: 'Executing JavaScript in a browser page can read sensitive data, modify page content, or access local storage' }),
  getActivityDescription: (input) => sessionActivity((input as any)?.session_id, 'Executing JS'),
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await invokeBrowser<string>('executeJs', { sessionId: input.session_id, js: input.js })
    return { data: result }
  },
})

export const BrowserGetTitleTool: AgentTool = buildTool({
  name: 'browser_get_title',
  description: 'Get the title of the current browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await invokeBrowser<string>('getTitle', { sessionId: input.session_id })
    return { data: result }
  },
})

export const BrowserGetTextTool: AgentTool = buildTool({
  name: 'browser_get_text',
  description: 'Get the text content of an element in the browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector for the element' },
    },
    required: ['session_id', 'selector'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await invokeBrowser<string>('browserGetText', { sessionId: input.session_id, selector: input.selector })
    return { data: result }
  },
})

export const BrowserWaitTool: AgentTool = buildTool({
  name: 'browser_wait',
  description: 'Wait for a CSS selector to appear in the browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector to wait for' },
      timeout: { type: 'number', description: 'Maximum wait time in ms (default: 5000)' },
    },
    required: ['session_id', 'selector'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('browserWait', { sessionId: input.session_id, selector: input.selector, timeout: input.timeout ?? 5000 })
    return { data: `Selector "${input.selector}" appeared` }
  },
})

export const BrowserCloseTool: AgentTool = buildTool({
  name: 'browser_close',
  description: 'Close an active browser session',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('closeBrowser', { sessionId: input.session_id })
    return { data: 'Browser closed' }
  },
})

export const BrowserGetUrlTool: AgentTool = buildTool({
  name: 'browser_get_url',
  description: 'Get the current URL of the browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await invokeBrowser<string>('getUrl', { sessionId: input.session_id })
    return { data: result }
  },
})

export const BrowserPressKeyTool: AgentTool = buildTool({
  name: 'browser_press_key',
  description: 'Press a keyboard key in the browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      key: { type: 'string', description: 'Key to press (e.g. Enter, Tab, Escape)' },
    },
    required: ['session_id', 'key'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('pressKey', { sessionId: input.session_id, key: input.key })
    return { data: `Pressed key: ${input.key}` }
  },
})

export const BrowserReloadTool: AgentTool = buildTool({
  name: 'browser_reload',
  description: 'Reload the current browser page',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    await invokeBrowser('reload', { sessionId: input.session_id })
    return { data: 'Page reloaded' }
  },
})

export const BrowserNewTabTool: AgentTool = buildTool({
  name: 'browser_new_tab',
  description: 'Open a new tab in the browser session',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
      url: { type: 'string', description: 'URL to open in the new tab' },
    },
    required: ['session_id', 'url'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_NAVIGATE],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const info = await invokeBrowser<{ url: string }>('newTab', { sessionId: input.session_id, url: input.url })
    return { data: `Opened new tab: ${info.url}` }
  },
})

export const BrowserListTabsTool: AgentTool = buildTool({
  name: 'browser_list_tabs',
  description: 'List all open tabs in a browser session',
  namespace: 'browser',
  phase: 'future',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Browser session ID' },
    },
    required: ['session_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.BROWSER_INTERACT],
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const tabs = await invokeBrowser<Array<{ tab_id: string; title: string; url: string }>>('listTabs', { sessionId: input.session_id })
    return { data: tabs.map((t) => `[${t.tab_id}] ${t.title} \u2014 ${t.url}`).join('\n') }
  },
})
