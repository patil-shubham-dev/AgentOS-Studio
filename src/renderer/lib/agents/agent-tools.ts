import type { ToolDef } from "@agentic-os/providers"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"
import { agentToolsToToolDefs } from "@/runtime/tools/conversion/agentToolToToolDef"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { ALL_BUILTIN_TOOLS } from "@/runtime/tools/implementations"

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
 * Register all built-in tools into the RuntimeOS ToolRegistry.
 * Called once during application startup.
 */
export function registerBuiltinTools(): void {
  const runtime = RuntimeOS.getInstance()
  const already = runtime.toolRegistry.size().builtin
  if (already > 0) return

  runtime.toolRegistry.registerMany(ALL_BUILTIN_TOOLS)
  runtime.toolRegistry.registerBuiltinToolDefs(ALL_BUILTIN_TOOLS.map(t => ({
    name: t.name,
    aliases: (t as any).aliases,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>,
    isReadOnly: t.isReadOnly({}),
    isConcurrencySafe: t.isConcurrencySafe({}),
  })))
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
