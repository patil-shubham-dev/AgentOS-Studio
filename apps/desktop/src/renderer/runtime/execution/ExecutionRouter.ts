import type { RuntimeRole } from "@/types"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import { routeWithLLMFallback } from "@/runtime/manager-routing-engine"
import { applyModeConstraints } from "@/runtime/execution-mode"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import type { ExecutionMode } from "./UnifiedExecutor"

const WORKSPACE_CAPABILITIES = {
  requiresTerminal: new Set(["run_command", "bash", "terminal"]),
  requiresFilesystem: new Set(["read_file", "write_file", "edit_file", "file_delete", "file_move", "file_copy", "folder_create", "folder_delete", "folder_list", "list_files"]),
  requiresGit: new Set(["git_diff", "git_commit", "git_push", "git_status", "git_log"]),
  requiresSearch: new Set(["grep_files", "glob_files", "search_files", "find_files", "file_tree", "workspace_index", "project_analysis"]),
  requiresBuild: new Set(["build_project", "run_tests"]),
}

export async function assignAgentForTask(
  input: string,
  wiredRoles: RuntimeRole[],
  providers: any[],
  executionId: string,
  reqMode?: ExecutionMode,
): Promise<RoutingDecision> {
  const store = useAgentStore.getState()
  store.clearAssignments()
  store.clearOrchestrationSteps()

  const fastProvider = providers.find((p: any) => p.id === "fast-inference" || p.id === "manager")
  const llmClassifier = fastProvider ? async (text: string) => {
    try {
      const result = await providerGateway.chat({
        messages: [{ role: 'user', content: `Classify the following user request into exactly one category: conversation, coding, research, execution, planning, browser-task, ui-analysis, multi-agent. Reply with only the category name and confidence (0-1), nothing else.\n\nRequest: ${text.slice(0, 500)}` }],
        providerId: fastProvider.id,
        model: fastProvider.models?.[0]?.id,
      })
      const categoryMatch = result.content?.match(/(conversation|coding|research|execution|planning|browser-task|ui-analysis|multi-agent)/i)
      const confidenceMatch = result.content?.match(/(\d\.\d+)/)
      return {
        category: (categoryMatch?.[1]?.toLowerCase() ?? "conversation") as any,
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.6,
      }
    } catch {
      return { category: "conversation" as const, confidence: 0.5 }
    }
  } : undefined

  const decision = await routeWithLLMFallback(input, wiredRoles, llmClassifier)
  const mode = reqMode ?? "full"
  const constrained = applyModeConstraints(mode, [...decision.selectedRoles], decision.intentCategory)
    .filter((role, i, arr) => arr.indexOf(role) === i)
  const result: RoutingDecision = { ...decision, selectedRoles: constrained as RoutingDecision["selectedRoles"] }
  for (const role of result.selectedRoles) {
    store.addAgentAssignment({ role, reason: result.reasoning, status: "active", startedAt: Date.now() })
  }
  store.addOrchestrationStep({
    type: result.requiresDelegation ? "delegate" : "analyze",
    agent: result.selectedRoles[0] ?? "manager",
    description: result.reasoning,
    status: "running",
  })
  return result
}

export function orderPipelineRoles(roles: string[]): string[] {
  const ORDER: Record<string, number> = {
    research: 0, coder: 1, browser: 2, vision: 3, qa: 4,
    verification: 5, runtime: 6, "fast-inference": 7, design: 8, memory: 9, manager: 10,
  }
  return [...roles].sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99))
}

export function checkWorkspaceRequired(decision: RoutingDecision): boolean {
  try {
    const os = RuntimeOS.getInstance()
    for (const role of decision.selectedRoles) {
      for (const tool of os.toolPoolAssembler.assembleForRole(role)) {
        for (const [, tools] of Object.entries(WORKSPACE_CAPABILITIES)) {
          if (tools.has(tool.name)) return true
        }
      }
    }
  } catch { console.warn("[UnifiedExecutor] Tool resolution failed") }
  return false
}

export async function checkMultiAgentEligibility(input: string, _filesTouched?: string[]): Promise<boolean> {
  const multiAgentEnabled = FeatureFlagManager.getInstance().isEnabled("multiAgent")
  if (!multiAgentEnabled) return false

  const multiAgentSkills = ["batch-parallel", "plan"]
  const lower = input.toLowerCase()
  for (const skill of multiAgentSkills) {
    if (lower.includes(`/${skill}`) || lower.includes(`run ${skill}`) || lower.includes(`use ${skill}`)) {
      return true
    }
  }

  if (_filesTouched && _filesTouched.length >= 3) {
    return true
  }

  return false
}
