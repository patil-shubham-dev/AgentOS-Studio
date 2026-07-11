import * as raw from "@/lib/browser"

export interface BrowserAutomationStep {
  id: string
  action: "launch" | "navigate" | "click" | "fill" | "screenshot" | "execute-js" | "wait" | "close"
  label: string
  selector?: string
  value?: string
  status: "pending" | "running" | "done" | "failed"
  result?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export interface BrowserSessionInfo {
  id: string
  url: string
  title: string
  screenshot: string | null
  logs: string[]
  steps: BrowserAutomationStep[]
  createdAt: number
  lastActiveAt: number
}

export type BrowserActionCallback = (step: BrowserAutomationStep) => void

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createStep(
  action: BrowserAutomationStep["action"],
  label: string,
  selector?: string,
  value?: string,
): BrowserAutomationStep {
  return {
    id: crypto.randomUUID(),
    action,
    label,
    selector,
    value,
    status: "pending",
    startedAt: Date.now(),
  }
}

function completeStep(step: BrowserAutomationStep, result?: string): BrowserAutomationStep {
  return { ...step, status: "done", result, completedAt: Date.now() }
}

function failStep(step: BrowserAutomationStep, error: string): BrowserAutomationStep {
  return { ...step, status: "failed", error, completedAt: Date.now() }
}

function runStep(
  step: BrowserAutomationStep,
  onUpdate?: BrowserActionCallback,
): BrowserAutomationStep {
  const running = { ...step, status: "running" as const }
  onUpdate?.(running)
  return running
}

export async function launchSession(
  url: string,
  onUpdate?: BrowserActionCallback,
): Promise<{ sessionId: string; step: BrowserAutomationStep }> {
  const step = runStep(createStep("launch", `Launch browser`, url), onUpdate)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const sessionId = await raw.launchBrowser(url)

      // Inject console log capture
      try {
        await raw.executeJs(
          sessionId,
          `(function() {
            if (!window.__agentic_console_logs) {
              window.__agentic_console_logs = [];
              const methods = ['log','warn','error','info','debug'];
              methods.forEach(m => {
                const original = console[m];
                console[m] = function(...args) {
                  window.__agentic_console_logs.push('[' + m + '] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
                  original.apply(console, args);
                };
              });
            }
          })()`,
        )
      } catch {
        // Console injection is best-effort
      }

      const title = await raw.getTitle(sessionId)
      const finalStep = completeStep(step, `Launched ${url}`)
      onUpdate?.(finalStep)
      return { sessionId, step: finalStep }
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      const failed = failStep(step, String(e))
      onUpdate?.(failed)
      throw e
    }
  }
  throw new Error("Failed to launch browser after retries")
}

export async function navigate(
  sessionId: string,
  url: string,
  onUpdate?: BrowserActionCallback,
): Promise<BrowserAutomationStep> {
  const step = runStep(createStep("navigate", `Navigate to ${url}`), onUpdate)

  try {
    await raw.navigate(sessionId, url)
    const title = await raw.getTitle(sessionId)
    const finalStep = completeStep(step, `Navigated to ${url} — ${title}`)
    onUpdate?.(finalStep)
    return finalStep
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function takeScreenshot(
  sessionId: string,
  onUpdate?: BrowserActionCallback,
): Promise<{ base64: string; step: BrowserAutomationStep }> {
  const step = runStep(createStep("screenshot", "Take screenshot"), onUpdate)

  try {
    const base64 = await raw.takeScreenshot(sessionId)
    const finalStep = completeStep(step, "Screenshot captured")
    onUpdate?.(finalStep)
    return { base64, step: finalStep }
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function clickSelector(
  sessionId: string,
  selector: string,
  onUpdate?: BrowserActionCallback,
): Promise<BrowserAutomationStep> {
  const step = runStep(createStep("click", `Click`, selector), onUpdate)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await raw.browserClick(sessionId, selector)
      const finalStep = completeStep(step, `Clicked ${selector}`)
      onUpdate?.(finalStep)
      return finalStep
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS)
        continue
      }
      const failed = failStep(step, String(e))
      onUpdate?.(failed)
      throw e
    }
  }
  throw new Error("Failed to click element after retries")
}

export async function fillField(
  sessionId: string,
  selector: string,
  value: string,
  onUpdate?: BrowserActionCallback,
): Promise<BrowserAutomationStep> {
  const step = runStep(createStep("fill", `Fill field`, selector, value), onUpdate)

  try {
    await raw.browserFill(sessionId, selector, value)
    const finalStep = completeStep(step, `Filled ${selector} with "${value}"`)
    onUpdate?.(finalStep)
    return finalStep
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function executeJavaScript(
  sessionId: string,
  js: string,
  onUpdate?: BrowserActionCallback,
): Promise<{ result: string; step: BrowserAutomationStep }> {
  const step = runStep(createStep("execute-js", "Execute JavaScript", js), onUpdate)

  try {
    const result = await raw.executeJs(sessionId, js)
    const truncated = result.length > 200 ? result.slice(0, 200) + "..." : result
    const finalStep = completeStep(step, truncated)
    onUpdate?.(finalStep)
    return { result, step: finalStep }
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function waitForSelector(
  sessionId: string,
  selector: string,
  timeout = 5000,
  onUpdate?: BrowserActionCallback,
): Promise<BrowserAutomationStep> {
  const step = runStep(createStep("wait", `Wait for selector`, selector, String(timeout)), onUpdate)

  try {
    await raw.browserWait(sessionId, selector, timeout)
    const finalStep = completeStep(step, `Selector "${selector}" appeared`)
    onUpdate?.(finalStep)
    return finalStep
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function closeSession(
  sessionId: string,
  onUpdate?: BrowserActionCallback,
): Promise<BrowserAutomationStep> {
  const step = runStep(createStep("close", "Close browser"), onUpdate)

  try {
    await raw.closeBrowser(sessionId)
    const finalStep = completeStep(step, "Browser closed")
    onUpdate?.(finalStep)
    return finalStep
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    throw e
  }
}

export async function fetchConsoleLogs(sessionId: string): Promise<string[]> {
  try {
    return await raw.getConsoleLogs(sessionId)
  } catch {
    return []
  }
}

const DOM_EXTRACT_SCRIPT = `
(function() {
  const results = [];
  const seen = new Set();
  const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY', 'LABEL']);
  const interactiveRoles = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'switch', 'textbox']);

  function getCssSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let path = [];
    while (el && el.nodeType === 1) {
      let selector = el.tagName.toLowerCase();
      if (el.id) {
        path.unshift('#' + CSS.escape(el.id));
        break;
      }
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\\s+/).filter(c => !c.startsWith('_') && c.length < 20).slice(0, 2);
        if (cls.length) selector += '.' + cls.map(c => CSS.escape(c)).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(el) + 1;
          selector += ':nth-of-type(' + idx + ')';
        }
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function walk(node, depth) {
    if (depth > 15) return;
    if (node.nodeType !== 1) return;
    if (seen.has(node)) return;
    seen.add(node);

    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role') || '';
    const isInteractive = interactiveTags.has(node.tagName) || interactiveRoles.has(role) || node.getAttribute('onclick') || (node.tagName === 'A' && node.href);

    if (isInteractive) {
      const text = (node.textContent || '').trim().slice(0, 120);
      const ariaLabel = node.getAttribute('aria-label') || '';
      const href = node.tagName === 'A' ? (node.getAttribute('href') || '') : '';
      const inputType = node.tagName === 'INPUT' ? (node.getAttribute('type') || 'text') : '';
      const placeholder = node.getAttribute('placeholder') || '';
      const alt = node.getAttribute('alt') || '';
      const testId = node.getAttribute('data-testid') || node.getAttribute('data-test-id') || '';

      results.push({
        tag,
        text: text || ariaLabel || alt || '',
        selector: getCssSelector(node),
        href: href ? (href.startsWith('/') ? window.location.origin + href : href) : '',
        type: inputType,
        placeholder,
        testId,
        role,
      });
    }

    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], depth + 1);
    }
  }

  walk(document.body, 0);
  return JSON.stringify({ url: window.location.href, title: document.title, elements: results });
})();
`

export async function getDom(
  sessionId: string,
  onUpdate?: BrowserActionCallback,
): Promise<{ url: string; title: string; elements: Array<{ tag: string; text: string; selector: string; href: string; type: string; placeholder: string; testId: string; role: string }>; step: BrowserAutomationStep }> {
  const step = runStep(createStep("execute-js", "Extract page DOM"), onUpdate)
  try {
    const { result } = await executeJavaScript(sessionId, DOM_EXTRACT_SCRIPT)
    let parsed
    try {
      parsed = JSON.parse(result)
    } catch {
      parsed = { url: '', title: '', elements: [] }
    }
    const finalStep = completeStep(step, `${parsed.elements?.length ?? 0} interactive elements found`)
    onUpdate?.(finalStep)
    return { ...parsed, step: finalStep }
  } catch (e) {
    const failed = failStep(step, String(e))
    onUpdate?.(failed)
    return { url: '', title: '', elements: [], step: failed }
  }
}

export const BROWSER_ACTION_LABELS: Record<BrowserAutomationStep["action"], string> = {
  launch: "Launch Browser",
  navigate: "Navigate",
  click: "Click Element",
  fill: "Fill Field",
  screenshot: "Screenshot",
  "execute-js": "Execute JS",
  wait: "Wait for Element",
  close: "Close Browser",
}

export const BROWSER_ACTION_COLORS: Record<BrowserAutomationStep["action"], string> = {
  launch: "text-emerald-400",
  navigate: "text-blue-400",
  click: "text-amber-400",
  fill: "text-violet-400",
  screenshot: "text-cyan-400",
  "execute-js": "text-green-400",
  wait: "text-orange-400",
  close: "text-red-400",
}
