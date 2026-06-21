/**
 * ToolExecutionScheduler — partitions tool calls into parallel groups.
 *
 * Read-only tools (read_file, grep_files, glob_files, web_search, web_fetch)
 * can execute in parallel since they don't mutate state.
 *
 * Write tools (write_file, edit_file, run_command, bash, etc.) must execute
 * sequentially to prevent data races.
 *
 * Browser tools can run in parallel with file tools but are sequential
 * with each other (shared browser session).
 */

/** Tools that read but don't mutate — safe to parallelize */
const READ_ONLY_TOOLS = new Set([
  "read_file",
  "grep_files",
  "glob_files",
  "search_files",
  "find_files",
  "file_tree",
  "list_files",
  "workspace_index",
  "project_analysis",
  "web_search",
  "web_fetch",
  "git_diff",
  "git_log",
  "git_status",
  "browser_snapshot",
])

/** Tools that mutate state — must be sequential */
const WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "file_delete",
  "file_move",
  "file_copy",
  "folder_create",
  "folder_delete",
  "run_command",
  "bash",
  "git_commit",
  "git_push",
  "build_project",
  "run_tests",
])

/** Browser navigation tools — parallel with file tools, sequential with each other */
const BROWSER_TOOLS = new Set([
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "browser_js_execute",
])

export interface ToolCallEntry {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolExecutionGroup {
  /** Tools in this group — execute them in parallel */
  tools: ToolCallEntry[]
  /** Group type for logging */
  type: "read" | "write" | "browser"
  /** Group index for event ordering */
  groupIndex: number
}

export class ToolExecutionScheduler {
  private static instance: ToolExecutionScheduler

  static getInstance(): ToolExecutionScheduler {
    if (!ToolExecutionScheduler.instance) {
      ToolExecutionScheduler.instance = new ToolExecutionScheduler()
    }
    return ToolExecutionScheduler.instance
  }

  /**
   * Partition tool calls into execution groups.
   *
   * Algorithm:
   * 1. Scan sequentially. Accumulate read-only tools into a group until
   *    a write tool is encountered.
   * 2. On write tool: flush accumulated read group, then execute write
   *    tool alone.
   * 3. Browser tools: if browser tools are in the batch, they form their
   *    own sequential chain while read tools run alongside.
   *
   * Result: optimal parallelization without data races.
   */
  schedule(toolCalls: ToolCallEntry[]): ToolExecutionGroup[] {
    if (toolCalls.length === 0) return []

    const groups: ToolExecutionGroup[] = []
    let readBuffer: ToolCallEntry[] = []
    let groupIndex = 0

    const flushReads = () => {
      if (readBuffer.length > 0) {
        groups.push({
          tools: [...readBuffer],
          type: "read",
          groupIndex: groupIndex++,
        })
        readBuffer = []
      }
    }

    for (const tc of toolCalls) {
      if (BROWSER_TOOLS.has(tc.name)) {
        // Browser tool — flush reads, then add as own sequential group
        flushReads()
        groups.push({
          tools: [tc],
          type: "browser",
          groupIndex: groupIndex++,
        })
        continue
      }

      if (WRITE_TOOLS.has(tc.name)) {
        // Write tool — flush reads, then add as own sequential group
        flushReads()
        groups.push({
          tools: [tc],
          type: "write",
          groupIndex: groupIndex++,
        })
        continue
      }

      // Read-only or unknown tool — add to read buffer
      readBuffer.push(tc)
    }

    // Flush remaining read buffer
    flushReads()

    return groups
  }

  /**
   * Get the concurrency limit for parallel execution.
   */
  getConcurrencyLimit(): number {
    return 3
  }
}
