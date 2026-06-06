import type { ToolDef } from "@agentic-os/providers"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"
import { buildTool } from "@/runtime/tools/core/AgentTool"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"
import type { ToolResult } from "@/runtime/tools/core/ToolResult"
import { agentToolsToToolDefs } from "@/runtime/tools/conversion/agentToolToToolDef"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { normalizeError } from "@/lib/normalize-error"
import { emitTelemetry } from "@/lib/telemetry"
import {
  implGrepFiles, implGlobFiles, implReadFile, implWriteFile, implEditFile, implRunCommand,
  implDesignCreateArtifact, implDesignAddVersion, implDesignGeneratePreview,
  implDelegateSubtask, implRunSkill,
} from "@/lib/tool-executor"

/**
 * Define all built-in tools as structured descriptors.
 * Used both for fallback (non-RuntimeOS) mode and as the source
 * for AgentTool registration.
 */
interface BuiltinToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  roles: string[]
}

const BUILTIN_TOOLS: BuiltinToolDef[] = [
  {
    name: "grep_files",
    description: "Search file contents with a regex pattern in the workspace",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search" },
        include: { type: "string", description: "Comma-separated file extensions (e.g. ts,tsx)" },
      },
      required: ["pattern"],
    },
    roles: ["*"],
  },
  {
    name: "glob_files",
    description: "Find files matching a glob pattern in the workspace",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. src/**/*.ts)" },
      },
      required: ["pattern"],
    },
    roles: ["*"],
  },
  {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
      },
      required: ["path"],
    },
    roles: ["*"],
  },
  {
    name: "write_file",
    description: "Write content to a file (creates directories if needed)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
    roles: ["coding", "coder", "design", "runtime"],
  },
  {
    name: "edit_file",
    description: "Apply targeted text replacements in an existing file using one or more exact old_content/new_content edits",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the workspace root" },
        edits: {
          type: "array",
          description: "Minimal exact replacements to apply in order",
          items: {
            type: "object",
            properties: {
              old_content: { type: "string", description: "Exact text to find" },
              new_content: { type: "string", description: "Replacement text" },
            },
            required: ["old_content", "new_content"],
          },
        },
        file: { type: "string", description: "Backward-compatible absolute file path" },
        old_string: { type: "string", description: "Backward-compatible text to find" },
        new_string: { type: "string", description: "Backward-compatible replacement text" },
      },
      required: [],
    },
    roles: ["coding", "coder", "design", "runtime"],
  },
  {
    name: "run_command",
    description: "Run a shell command in the workspace directory",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to run" },
        args: { type: "array", items: { type: "string" }, description: "Command arguments" },
      },
      required: ["command"],
    },
    roles: ["*"],
  },
  {
    name: "design_create_artifact",
    description: "Create a new design artifact in the DesignWorkspace with component code",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the design artifact (e.g. 'Button Component')" },
        description: { type: "string", description: "Description of the design" },
        code: { type: "string", description: "The full React + Tailwind component code" },
        label: { type: "string", description: "Version label (e.g. 'Initial design', 'Redesigned')" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization (e.g. ui, component, button)" },
      },
      required: ["name", "description", "code", "label"],
    },
    roles: ["design"],
  },
  {
    name: "design_add_version",
    description: "Add a new version to an existing design artifact",
    parameters: {
      type: "object",
      properties: {
        artifact_id: { type: "string", description: "The ID of the design artifact to update" },
        code: { type: "string", description: "Updated component code" },
        label: { type: "string", description: "Version label describing the change" },
        changes: { type: "string", description: "Description of what changed in this version" },
      },
      required: ["artifact_id", "code", "label", "changes"],
    },
    roles: ["design"],
  },
  {
    name: "design_generate_preview",
    description: "Generate an HTML preview string for a component design",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Component code to generate a preview for" },
      },
      required: ["code"],
    },
    roles: ["design"],
  },
  {
    name: "launch_browser",
    description: "Launch a headless browser session and navigate to a URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_navigate",
    description: "Navigate the browser to a new URL",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        url: { type: "string", description: "Destination URL" },
      },
      required: ["session_id", "url"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page (returns base64 PNG data URI)",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_click",
    description: "Click an element in the browser page matching a CSS selector",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        selector: { type: "string", description: "CSS selector for the element to click" },
      },
      required: ["session_id", "selector"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_fill",
    description: "Fill an input field in the browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        selector: { type: "string", description: "CSS selector for the input element" },
        value: { type: "string", description: "Value to type into the field" },
      },
      required: ["session_id", "selector", "value"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_execute_js",
    description: "Execute JavaScript in the browser page context",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        js: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["session_id", "js"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_get_title",
    description: "Get the title of the current browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_close",
    description: "Close an active browser session",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_get_text",
    description: "Get the text content of an element in the browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        selector: { type: "string", description: "CSS selector for the element" },
      },
      required: ["session_id", "selector"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_wait",
    description: "Wait for a CSS selector to appear in the browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        selector: { type: "string", description: "CSS selector to wait for" },
        timeout: { type: "number", description: "Maximum wait time in ms (default: 5000)" },
      },
      required: ["session_id", "selector"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_get_url",
    description: "Get the current URL of the browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_press_key",
    description: "Press a keyboard key in the browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        key: { type: "string", description: "Key to press (e.g. Enter, Tab, Escape)" },
      },
      required: ["session_id", "key"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_reload",
    description: "Reload the current browser page",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_new_tab",
    description: "Open a new tab in the browser session",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
        url: { type: "string", description: "URL to open in the new tab" },
      },
      required: ["session_id", "url"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "browser_list_tabs",
    description: "List all open tabs in a browser session",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Browser session ID" },
      },
      required: ["session_id"],
    },
    roles: ["browser", "qa", "design"],
  },
  {
    name: "web_search",
    description: "Search the web for a query and return summarized results",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        num_results: { type: "number", description: "Number of results to return (default: 5)" },
      },
      required: ["query"],
    },
    roles: ["*"],
  },
  {
    name: "web_fetch",
    description: "Fetch a web page and return its text content",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
    roles: ["*"],
  },
  {
    name: "delegate_subtask",
    description: "Delegate a subtask to a specialized sub-agent with its own isolated context window",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["explore", "plan", "verify", "general"], description: "Sub-agent type" },
        task: { type: "string", description: "The task prompt for the sub-agent" },
        model: { type: "string", description: "Optional: Override the model used" },
      },
      required: ["type", "task"],
    },
    roles: ["manager"],
  },
  {
    name: "run_skill",
    description: "Execute a registered skill by name and return the generated prompt. Skills are reusable, version-controlled prompt templates that can include tool access, model configuration, and system prompt sections.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill to execute" },
        args: { type: "string", description: "Arguments to pass to the skill's prompt generator" },
      },
      required: ["name", "args"],
    },
    roles: ["*"],
  },
]

const roleCache = new Map<string, BuiltinToolDef[]>()

function getToolsForRole(role: string): BuiltinToolDef[] {
  const cached = roleCache.get(role)
  if (cached) return cached
  const result = BUILTIN_TOOLS.filter(t => t.roles.includes("*") || t.roles.includes(role))
  roleCache.set(role, result)
  return result
}

function builtinDefToToolDef(def: BuiltinToolDef): ToolDef {
  return { type: "function", function: { name: def.name, description: def.description, parameters: def.parameters } }
}

/**
 * Build an AgentTool wrapper around a BuiltinToolDef.
 * The execute function delegates to the existing tool-executor pipeline.
 */
function createAgentTool(def: BuiltinToolDef): AgentTool {
  return buildTool({
    name: def.name,
    description: def.description,
    inputSchema: def.parameters as Record<string, unknown>,
    supportedModes: () => {
      if (def.roles.includes("*")) return ['*']
      return def.roles
    },
    requiredCapabilities: () => [],
    execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
      const rootPath = useWorkspaceStore.getState().rootPath

      const dispatcher: Record<string, (ctx: ToolContext, input: Record<string, unknown>) => Promise<string>> = {
        grep_files: async (_, i) => implGrepFiles(rootPath, String(i.pattern ?? ''), i.include as string | undefined),
        glob_files: async (_, i) => implGlobFiles(rootPath, String(i.pattern ?? '')),
        read_file: async (_, i) => implReadFile(rootPath, String(i.path ?? '')),

        write_file: async (_, i) => implWriteFile(rootPath, String(i.path ?? ''), String(i.content ?? '')),
        edit_file: async (_, i) => implEditFile(rootPath, i as any),

        run_command: async (c, i) => implRunCommand(rootPath, c.role ?? 'coder', crypto.randomUUID(), String(i.command ?? ''), i.args as string[] | undefined, c.onOutput),

        design_create_artifact: async (_, i) => implDesignCreateArtifact(i),
        design_add_version: async (_, i) => implDesignAddVersion(i),
        design_generate_preview: async (_, i) => implDesignGeneratePreview(String(i.code ?? '')),

        delegate_subtask: async (_, i) => implDelegateSubtask(i),
        run_skill: async (ctx, i) => implRunSkill(String(i.name ?? ''), String(i.args ?? ''), ctx.role ?? 'coder'),

        launch_browser: async (_, i) => {
          const { launchBrowser } = await import("@/lib/browser")
          return await launchBrowser(String(i.url ?? ""))
        },
        browser_navigate: async (_, i) => {
          const { navigate } = await import("@/lib/browser")
          await navigate(String(i.session_id ?? ""), String(i.url ?? ""))
          return `Navigated to ${i.url}`
        },
        browser_screenshot: async (_, i) => {
          const { takeScreenshot } = await import("@/lib/browser")
          return await takeScreenshot(String(i.session_id ?? ""))
        },
        browser_click: async (_, i) => {
          const { browserClick } = await import("@/lib/browser")
          await browserClick(String(i.session_id ?? ""), String(i.selector ?? ""))
          return `Clicked ${i.selector}`
        },
        browser_fill: async (_, i) => {
          const { browserFill } = await import("@/lib/browser")
          await browserFill(String(i.session_id ?? ""), String(i.selector ?? ""), String(i.value ?? ""))
          return `Filled ${i.selector} with "${i.value}"`
        },
        browser_execute_js: async (_, i) => {
          const { executeJs } = await import("@/lib/browser")
          return await executeJs(String(i.session_id ?? ""), String(i.js ?? ""))
        },
        browser_get_title: async (_, i) => {
          const { getTitle } = await import("@/lib/browser")
          return await getTitle(String(i.session_id ?? ""))
        },
        browser_get_text: async (_, i) => {
          const { browserGetText } = await import("@/lib/browser")
          return await browserGetText(String(i.session_id ?? ""), String(i.selector ?? ""))
        },
        browser_close: async (_, i) => {
          const { closeBrowser } = await import("@/lib/browser")
          await closeBrowser(String(i.session_id ?? ""))
          return "Browser closed"
        },
        browser_wait: async (_, i) => {
          const { browserWait } = await import("@/lib/browser")
          await browserWait(String(i.session_id ?? ""), String(i.selector ?? ""), Number(i.timeout ?? 5000))
          return `Selector "${i.selector}" appeared`
        },
        browser_get_url: async (_, i) => {
          const { getUrl } = await import("@/lib/browser")
          return await getUrl(String(i.session_id ?? ""))
        },
        browser_press_key: async (_, i) => {
          const { pressKey } = await import("@/lib/browser")
          await pressKey(String(i.session_id ?? ""), String(i.key ?? ""))
          return `Pressed key: ${i.key}`
        },
        browser_reload: async (_, i) => {
          const { reload } = await import("@/lib/browser")
          await reload(String(i.session_id ?? ""))
          return "Page reloaded"
        },
        browser_new_tab: async (_, i) => {
          const { newTab } = await import("@/lib/browser")
          const info = await newTab(String(i.session_id ?? ""), String(i.url ?? ""))
          return `Opened new tab: ${info.url}`
        },
        browser_list_tabs: async (_, i) => {
          const { listTabs } = await import("@/lib/browser")
          const tabs = await listTabs(String(i.session_id ?? ""))
          return tabs.map((t) => `[${t.tab_id}] ${t.title} — ${t.url}`).join("\n")
        },

        web_search: async (_, i) => {
          const query = String(i.query ?? "")
          const num = Number(i.num_results ?? 5)
          try {
            const resp = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}`, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            })
            const html = await resp.text()
            // Simple extraction: get text between <h3> tags (search result titles)
            const titles = html.match(/<h3[^>]*>(.*?)<\/h3>/g)?.map(t => t.replace(/<[^>]+>/g, "")) ?? []
            const snippets = html.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>(.*?)<\/div>/g)?.map(s => s.replace(/<[^>]+>/g, "")) ?? []
            const results = titles.map((t, i) => `${i + 1}. ${t}${snippets[i] ? ` — ${snippets[i].slice(0, 200)}` : ""}`).join("\n")
            return results || "No results found"
          } catch (e) {
            return `Search failed: ${e}`
          }
        },
        web_fetch: async (_, i) => {
          const url = String(i.url ?? "")
          try {
            const resp = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            })
            const text = await resp.text()
            // Strip HTML tags and return plain text
            const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            return cleaned.slice(0, 10000) // Limit to 10k chars
          } catch (e) {
            return `Fetch failed: ${e}`
          }
        },
      }

      try {
        const impl = dispatcher[def.name]
        if (impl) {
          const content = await impl(ctx, input)
          return { data: content }
        }
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Unknown tool: ${def.name}`, metadata: { toolName: def.name, role: ctx.role, input: JSON.stringify(input).slice(0, 200) } })
        return { data: null, error: `Unknown tool: ${def.name}`, isError: true }
      } catch (err) {
        const errMsg = normalizeError(err, `Tool ${def.name} failed`)
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: errMsg, metadata: { toolName: def.name, role: ctx.role, input: JSON.stringify(input).slice(0, 200) } })
        return { data: null, error: errMsg, isError: true }
      }
    },
    permissions: async () => ({ behavior: 'allow' as const }),
    isReadOnly: () => ['grep_files', 'glob_files', 'read_file', 'design_generate_preview'].includes(def.name),
    isConcurrencySafe: () => ['grep_files', 'glob_files', 'read_file'].includes(def.name),
  })
}

/**
 * Register all built-in tools into the RuntimeOS ToolRegistry.
 * Called once during application startup.
 */
export function registerBuiltinTools(): void {
  const runtime = RuntimeOS.getInstance()
  const already = runtime.toolRegistry.size().builtin
  if (already > 0) return

  const agents = BUILTIN_TOOLS.map(createAgentTool)
  runtime.toolRegistry.registerMany(agents)
}

/**
 * Get available ToolDefs for a given role.
 *
 * When RuntimeOS is initialized, tools are sourced from the ToolRegistry
 * (which includes built-in, MCP, and plugin tools). Otherwise, a static
 * hardcoded list is returned for backward compatibility.
 */
export function getTools(role: string): ToolDef[] {
  try {
    const runtime = RuntimeOS.getInstance()

    const allTools = runtime.toolRegistry.getByMode(role)
    if (allTools.length > 0) {
      return agentToolsToToolDefs(allTools)
    }
  } catch {
    // RuntimeOS not initialized — fall through to hardcoded
  }

  return getToolsForRole(role).map(builtinDefToToolDef)
}
