export const ROLE_TOOL_ALLOWLIST: Record<string, string[]> = {
  manager: ['delegate_task', 'spawn_agent', 'run_skill', 'think', 'reasoning',
    'read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'query_graph',
    'web_search', 'web_fetch',
    'browser_navigate', 'browser_click', 'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title',
    'browser_reload', 'browser_new_tab', 'browser_list_tabs', 'browser_close', 'launch_browser'],
  coder: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'query_graph',
    'web_search', 'web_fetch'],
  research: ['grep_files', 'glob_files', 'read_file', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'web_search', 'web_fetch', 'think', 'reasoning', 'query_graph'],
  runtime: ['bash', 'run_command', 'read_file', 'write_file', 'think', 'reasoning'],
  design: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'design_create_artifact', 'design_add_version', 'design_generate_preview'],
  browser: ['launch_browser', 'browser_navigate', 'browser_click', 'browser_fill', 'browser_type',
    'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title', 'browser_get_content',
    'browser_execute_js', 'browser_wait', 'browser_press_key', 'browser_reload', 'browser_new_tab', 'browser_list_tabs',
    'browser_close', 'browser_double_click', 'browser_hover', 'browser_get_console_logs', 'think', 'reasoning'],
  qa: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'launch_browser', 'browser_navigate', 'browser_click', 'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title'],
  vision: ['browser_screenshot', 'think', 'reasoning'],
  memory: ['read_file', 'write_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'think', 'reasoning'],
  'fast-inference': ['read_file', 'grep_files', 'think', 'reasoning'],
  verification: ['read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning'],
  repair: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning'],
  planner: ['delegate_task', 'spawn_agent', 'run_skill', 'think', 'reasoning',
    'read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'query_graph',
    'web_search', 'web_fetch'],
  reviewer: ['read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning'],
  debugger: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'query_graph'],
  tester: ['read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning'],
}

let bypassRoles: Set<string> = new Set(['superadmin'])

export function setBypassRoles(roles: string[]): void {
  bypassRoles = new Set(roles)
}

export function getBypassRoles(): string[] {
  return Array.from(bypassRoles)
}

export function getAllowedToolsForRole(role: string): string[] | null {
  const entry = ROLE_TOOL_ALLOWLIST[role]
  if (entry === undefined) return null
  return entry
}

export function isRoleKnown(role: string): boolean {
  return role in ROLE_TOOL_ALLOWLIST || bypassRoles.has(role)
}

export function isBypassRole(role: string): boolean {
  return bypassRoles.has(role)
}
