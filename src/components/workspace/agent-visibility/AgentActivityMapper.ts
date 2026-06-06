export type ActivityType =
  | "initializing"
  | "planning"
  | "researching"
  | "browsing"
  | "searching"
  | "reading"
  | "editing"
  | "writing"
  | "running"
  | "validating"
  | "analyzing"
  | "finalizing"
  | "idle"
  | "complete"
  | "failed"

export interface Activity {
  type: ActivityType
  label: string
  detail?: string
  toolName?: string
  path?: string
}

const TOOL_TO_ACTIVITY: Record<string, { type: ActivityType; label: string }> = {
  grep_files: { type: "searching", label: "Searching project files" },
  glob_files: { type: "searching", label: "Finding files" },
  read_file: { type: "reading", label: "Reading files" },
  write_file: { type: "writing", label: "Writing code" },
  edit_file: { type: "editing", label: "Editing files" },
  run_command: { type: "running", label: "Running commands" },
  launch_browser: { type: "browsing", label: "Launching browser" },
  browser_navigate: { type: "browsing", label: "Opening page" },
  browser_screenshot: { type: "browsing", label: "Taking screenshot" },
  browser_click: { type: "browsing", label: "Clicking element" },
  browser_fill: { type: "browsing", label: "Filling form" },
  browser_execute_js: { type: "browsing", label: "Running JavaScript" },
  browser_get_text: { type: "browsing", label: "Reading page content" },
  browser_wait: { type: "browsing", label: "Waiting for element" },
  web_search: { type: "researching", label: "Searching the web" },
  web_fetch: { type: "researching", label: "Fetching web page" },
  design_create_artifact: { type: "editing", label: "Creating design" },
  design_add_version: { type: "editing", label: "Updating design" },
  design_generate_preview: { type: "analyzing", label: "Generating preview" },
  delegate_subtask: { type: "planning", label: "Delegating task" },
  run_skill: { type: "running", label: "Running skill" },
}

const PHASE_TO_ACTIVITY: Record<string, { type: ActivityType; label: string }> = {
  routing: { type: "analyzing", label: "Analyzing request" },
  orchestrating: { type: "planning", label: "Planning approach" },
  thinking: { type: "analyzing", label: "Analyzing" },
  planning: { type: "planning", label: "Planning approach" },
  searching: { type: "searching", label: "Searching project" },
  reading: { type: "reading", label: "Reading files" },
  writing: { type: "writing", label: "Writing code" },
  editing: { type: "editing", label: "Editing files" },
  validating: { type: "validating", label: "Running validation" },
  analyzing: { type: "analyzing", label: "Analyzing results" },
  finalizing: { type: "finalizing", label: "Preparing response" },
  synthesizing: { type: "finalizing", label: "Preparing response" },
}

const AGENT_ROLE_LABELS: Record<string, string> = {
  manager: "Manager Agent",
  coder: "Coder Agent",
  qa: "QA Agent",
  design: "Design Agent",
  vision: "Vision Agent",
  runtime: "Runtime Agent",
  browser: "Browser Agent",
  research: "Research Agent",
  memory: "Memory Agent",
}

export function getAgentLabel(role: string): string {
  return AGENT_ROLE_LABELS[role] ?? `${role.charAt(0).toUpperCase() + role.slice(1)} Agent`
}

export function mapToolToActivity(toolName: string): Activity {
  return TOOL_TO_ACTIVITY[toolName] ?? { type: "running", label: `Running ${toolName.replace(/_/g, " ")}` }
}

export function mapPhaseToActivity(phase: string): Activity | null {
  const match = PHASE_TO_ACTIVITY[phase.toLowerCase()]
  if (match) return match
  return null
}

export function getActivityForToolCall(toolName: string, args?: Record<string, unknown>): Activity {
  const base = mapToolToActivity(toolName)
  if (args?.path && typeof args.path === "string") {
    return { ...base, detail: args.path, toolName, path: args.path }
  }
  if (args?.url && typeof args.url === "string") {
    return { ...base, detail: args.url, toolName }
  }
  if (args?.pattern && typeof args.pattern === "string") {
    return { ...base, detail: args.pattern, toolName }
  }
  if (args?.command && typeof args.command === "string") {
    const truncated = args.command.length > 40 ? args.command.slice(0, 40) + "..." : args.command
    return { ...base, detail: truncated, toolName }
  }
  return { ...base, toolName }
}

export function getStateForToolCall(toolName: string): string {
  const activity = mapToolToActivity(toolName)
  switch (activity.type) {
    case "searching": case "researching": return "researching"
    case "browsing": return "browsing"
    case "reading": return "researching"
    case "editing": case "writing": return "editing"
    case "running": case "analyzing": return "validating"
    case "planning": return "planning"
    default: return "planning"
  }
}

export function getAgentStateIcon(state: string): string {
  switch (state) {
    case "idle": return "○"
    case "planning": return "◎"
    case "researching": return "◇"
    case "browsing": return "◇"
    case "editing": return "●"
    case "validating": return "◆"
    case "complete": return "✓"
    case "failed": return "✗"
    default: return "○"
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
