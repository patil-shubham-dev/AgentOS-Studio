import { BenchmarkHarness, type BenchmarkTask, type BenchmarkReport } from "@/runtime/execution/BenchmarkHarness"

const BENCHMARK_100_TASKS: BenchmarkTask[] = [
  { id: "RF01", category: "refactor", description: "Rename ImpactAnalyzer class", filesToEdit: ["src/renderer/runtime/intelligence/ImpactAnalyzer.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RF02", category: "refactor", description: "Rename userStore to authStore", filesToEdit: ["src/renderer/stores/user-store.ts"], expectedSuccess: true, expectedFilesCount: 5 },
  { id: "RF03", category: "refactor", description: "Move StatusBadge component", filesToEdit: ["src/renderer/components/StatusBadge.tsx"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "RF04", category: "refactor", description: "Extract Button variants", filesToEdit: ["src/renderer/components/Button.tsx"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "RF05", category: "refactor", description: "Split large module into smaller files", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "RF06", category: "refactor", description: "Convert class to functional component", filesToEdit: ["src/renderer/components/UserList.tsx"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "RF07", category: "refactor", description: "Rename interface UserData to UserProfile", filesToEdit: ["src/renderer/types/User.ts"], expectedSuccess: true, expectedFilesCount: 6 },
  { id: "RF08", category: "refactor", description: "Rename function getData to fetchData", filesToEdit: ["src/renderer/lib/http.ts"], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "RF09", category: "refactor", description: "Extract validation logic to shared util", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "RF10", category: "refactor", description: "Replace deprecated API call", filesToEdit: ["src/renderer/api/legacy.ts"], expectedSuccess: true, expectedFilesCount: 3 },

  { id: "CF01", category: "cross-file", description: "Update import paths after file move", filesToEdit: ["src/renderer/utils/helpers.ts"], expectedSuccess: true, expectedFilesCount: 8 },
  { id: "CF02", category: "cross-file", description: "Propagate type change across modules", filesToEdit: ["src/renderer/types/Project.ts"], expectedSuccess: true, expectedFilesCount: 5 },
  { id: "CF03", category: "cross-file", description: "Update ToolContext downstream", filesToEdit: ["src/renderer/runtime/tools/ToolContext.ts"], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "CF04", category: "cross-file", description: "Change event payload shape", filesToEdit: ["src/renderer/types/EventTypes.ts"], expectedSuccess: true, expectedFilesCount: 6 },
  { id: "CF05", category: "cross-file", description: "Add parameter to exported function", filesToEdit: ["src/renderer/lib/telemetry.ts"], expectedSuccess: true, expectedFilesCount: 5 },
  { id: "CF06", category: "cross-file", description: "Fix useStore JSX references", filesToEdit: ["src/renderer/stores/app-store.ts"], expectedSuccess: true, expectedFilesCount: 7 },
  { id: "CF07", category: "cross-file", description: "Update barrel exports after rename", filesToEdit: ["src/renderer/lib/index.ts"], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "CF08", category: "cross-file", description: "Change hook return type", filesToEdit: ["src/renderer/hooks/useAuth.ts"], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "CF09", category: "cross-file", description: "Update store subscription pattern", filesToEdit: ["src/renderer/stores/notification-store.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "CF10", category: "cross-file", description: "Migrate context provider to new API", filesToEdit: ["src/renderer/context/AuthContext.tsx"], expectedSuccess: true, expectedFilesCount: 5 },

  { id: "VP01", category: "verification", description: "Run typecheck after rename", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },
  { id: "VP02", category: "verification", description: "Run lint after refactor", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },
  { id: "VP03", category: "verification", description: "Run tests after bugfix", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },
  { id: "VP04", category: "verification", description: "Run monorepo verification", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },
  { id: "VP05", category: "verification", description: "Verify build after config change", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },

  { id: "AA01", category: "architecture", description: "Add new service module", filesToEdit: ["src/renderer/services/NewService.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "AA02", category: "architecture", description: "Extract shared type", filesToEdit: ["src/renderer/types/shared.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "AA03", category: "architecture", description: "Create middleware pipeline", filesToEdit: ["src/renderer/middleware/chain.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "AA04", category: "architecture", description: "Add plugin system hook", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "AA05", category: "architecture", description: "Add error boundary component", filesToEdit: ["src/renderer/components/ErrorBoundary.tsx"], expectedSuccess: true, expectedFilesCount: 2 },

  { id: "BF01", category: "bugfix", description: "Fix null reference in render", filesToEdit: ["src/renderer/components/DataGrid.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF02", category: "bugfix", description: "Fix race condition in store", filesToEdit: ["src/renderer/stores/workspace-store.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "BF03", category: "bugfix", description: "Fix broken import path", filesToEdit: ["src/renderer/runtime/execution/ExecutionQueue.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF04", category: "bugfix", description: "Fix undefined property access", filesToEdit: ["src/renderer/components/Sidebar.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF05", category: "bugfix", description: "Fix event handler binding", filesToEdit: ["src/renderer/components/Modal.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF06", category: "bugfix", description: "Fix incorrect state update", filesToEdit: ["src/renderer/hooks/useAsync.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "BF07", category: "bugfix", description: "Fix missing key prop", filesToEdit: ["src/renderer/components/List.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF08", category: "bugfix", description: "Fix async cleanup", filesToEdit: ["src/renderer/hooks/useWebSocket.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF09", category: "bugfix", description: "Fix stale closure in callback", filesToEdit: ["src/renderer/hooks/useTimer.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "BF10", category: "bugfix", description: "Fix incorrect type guard", filesToEdit: ["src/renderer/lib/guards.ts"], expectedSuccess: true, expectedFilesCount: 2 },

  { id: "IM01", category: "import", description: "Add missing export", filesToEdit: ["src/renderer/lib/utils.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "IM02", category: "import", description: "Fix circular dependency", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "IM03", category: "import", description: "Remove unused import", filesToEdit: ["src/renderer/components/Dashboard.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "IM04", category: "import", description: "Add missing type import", filesToEdit: ["src/renderer/api/client.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "IM05", category: "import", description: "Reorder imports to fix lint", filesToEdit: ["src/renderer/lib/format.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "TP01", category: "type", description: "Fix type mismatch in API", filesToEdit: ["src/renderer/api/types.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "TP02", category: "type", description: "Update interface contract", filesToEdit: ["src/renderer/types/User.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "TP03", category: "type", description: "Add missing type parameter", filesToEdit: ["src/renderer/types/GenericList.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "TP04", category: "type", description: "Narrow union type", filesToEdit: ["src/renderer/types/Status.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "TP05", category: "type", description: "Fix generic constraint", filesToEdit: ["src/renderer/lib/generics.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "RP01", category: "repair", description: "Auto-fix verification failure: missing export", filesToEdit: ["src/renderer/components/Button.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RP02", category: "repair", description: "Auto-fix verification failure: bad import", filesToEdit: ["src/renderer/routes/App.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RP03", category: "repair", description: "Auto-fix lint errors", filesToEdit: ["src/renderer/components/Form.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RP04", category: "repair", description: "Auto-fix type assignment", filesToEdit: ["src/renderer/lib/transform.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RP05", category: "repair", description: "Recover from build failure", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "SG01", category: "regression", description: "Detect deleted export", filesToEdit: ["src/renderer/lib/telemetry.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "SG02", category: "regression", description: "Detect broken interface", filesToEdit: ["src/renderer/types/Project.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "SG03", category: "regression", description: "Detect orphan symbol", filesToEdit: ["src/renderer/components/OldComponent.tsx"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "SG04", category: "regression", description: "Detect dead route", filesToEdit: ["src/renderer/routes/legacy.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "SG05", category: "regression", description: "Detect circular dependency", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 2 },

  { id: "PQ01", category: "quality", description: "Score patch correctness", filesToEdit: ["src/renderer/components/Modal.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "PQ02", category: "quality", description: "Score patch scope: large change", filesToEdit: ["src/renderer/lib/http.ts", "src/renderer/api/client.ts", "src/renderer/api/types.ts", "src/renderer/stores/api-store.ts"], expectedSuccess: true, expectedFilesCount: 4 },
  { id: "PQ03", category: "quality", description: "Score patch with tests", filesToEdit: ["src/renderer/services/AuthService.ts", "src/renderer/services/__tests__/AuthService.test.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "PQ04", category: "quality", description: "Score high-risk patch", filesToEdit: ["src/renderer/stores/root-store.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "PQ05", category: "quality", description: "Score patch with coverage gap", filesToEdit: ["src/renderer/lib/parser.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "EX01", category: "execution", description: "Enforce dependency ordering: sources first", filesToEdit: ["src/renderer/services/ServiceA.ts", "src/renderer/services/ServiceB.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "EX02", category: "execution", description: "Enforce dependency ordering: reject cycle", filesToEdit: ["src/renderer/services/CircularA.ts", "src/renderer/services/CircularB.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "EX03", category: "execution", description: "Enforce single-file bypass", filesToEdit: ["src/renderer/components/Input.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "EX04", category: "execution", description: "Gateway route FAST mode", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "EX05", category: "execution", description: "Gateway route FULL mode", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "SM01", category: "snapshot", description: "Create and restore snapshot", filesToEdit: ["src/renderer/components/Header.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "SM02", category: "snapshot", description: "Multiple snapshot lifecycle", filesToEdit: ["src/renderer/components/Footer.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "SM03", category: "snapshot", description: "Snapshot commit on success", filesToEdit: ["src/renderer/components/Card.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "SM04", category: "snapshot", description: "Snapshot restore on nested failure", filesToEdit: ["src/renderer/components/Badge.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "SM05", category: "snapshot", description: "Latest snapshot restore", filesToEdit: ["src/renderer/components/Tooltip.tsx"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "FM01", category: "memory", description: "Record failure pattern to memory", filesToEdit: ["src/renderer/runtime/verification/VerificationPipeline.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "FM02", category: "memory", description: "Match failure against known patterns", filesToEdit: ["src/renderer/runtime/intelligence/ImpactAnalyzer.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "FM03", category: "memory", description: "Warn before edit based on past failures", filesToEdit: ["src/renderer/types/User.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "FM04", category: "memory", description: "Pattern persistence across sessions", filesToEdit: ["src/renderer/lib/telemetry.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "FM05", category: "memory", description: "High-fail-rate pattern warning", filesToEdit: ["src/renderer/hooks/useAuth.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "GW01", category: "gateway", description: "Route through UnifiedExecutionGateway", filesToEdit: ["src/renderer/runtime/execution/UnifiedExecutor.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "GW02", category: "gateway", description: "Gateway: abort on CRITICAL risk", filesToEdit: ["src/renderer/stores/root-store.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "GW03", category: "gateway", description: "Gateway: snapshot restore on failure", filesToEdit: ["src/renderer/components/Accordion.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "GW04", category: "gateway", description: "Gateway: commit on success", filesToEdit: ["src/renderer/components/Tabs.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "GW05", category: "gateway", description: "Gateway: re-route after failure", filesToEdit: ["src/renderer/lib/errors.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "PR01", category: "profiler", description: "Profile single-file edit", filesToEdit: ["src/renderer/components/Label.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "PR02", category: "profiler", description: "Profile multi-file refactor", filesToEdit: ["src/renderer/services/ProfileService.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "PR03", category: "profiler", description: "Profile with recovery loop", filesToEdit: ["src/renderer/lib/validator.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "PR04", category: "profiler", description: "Bottleneck detection", filesToEdit: ["src/renderer/components/Table.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "PR05", category: "profiler", description: "Recommendation generation", filesToEdit: ["src/renderer/lib/sanitize.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "CB01", category: "context", description: "Context budget within limits", filesToEdit: ["src/renderer/components/Breadcrumb.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "CB02", category: "context", description: "Context budget over threshold — compression", filesToEdit: ["src/renderer/stores/ui-store.ts"], expectedSuccess: true, expectedFilesCount: 3 },
  { id: "CB03", category: "context", description: "Large history truncation", filesToEdit: ["src/renderer/hooks/usePagination.ts"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "CB04", category: "context", description: "Token estimation accuracy", filesToEdit: ["src/renderer/components/SearchBar.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "CB05", category: "context", description: "Budget exhaustion handling", filesToEdit: ["src/renderer/lib/cache.ts"], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "RL01", category: "reliability", description: "Circuit breaker opens on repeated failure", filesToEdit: ["src/renderer/components/Spinner.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RL02", category: "reliability", description: "Exponential backoff retry", filesToEdit: ["src/renderer/services/RetryService.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RL03", category: "reliability", description: "Health check all subsystems", filesToEdit: ["src/renderer/lib/startup.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RL04", category: "reliability", description: "Circuit breaker half-open probe", filesToEdit: ["src/renderer/services/ExternalApi.ts"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "RL05", category: "reliability", description: "Concurrent health checks", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 1 },

  { id: "HE01", category: "human-eval", description: "Human eval: task clarity", filesToEdit: ["src/renderer/components/NavBar.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "HE02", category: "human-eval", description: "Human eval: output correctness", filesToEdit: ["src/renderer/components/Toast.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "HE03", category: "human-eval", description: "Human eval: regression check", filesToEdit: ["src/renderer/components/Dropdown.tsx"], expectedSuccess: true, expectedFilesCount: 2 },
  { id: "HE04", category: "human-eval", description: "Human eval: patch quality", filesToEdit: ["src/renderer/components/Chip.tsx"], expectedSuccess: true, expectedFilesCount: 1 },
  { id: "HE05", category: "human-eval", description: "Human eval: end-to-end", filesToEdit: [], expectedSuccess: true, expectedFilesCount: 0 },
]

const P6_METRIC_THRESHOLDS = {
  successRate: 92,
  avgToolCalls: 4.5,
  avgRetries: 0.2,
  repairSuccess: 90,
  regressionDetection: 95,
  latencyReduction: 25,
}

export class Benchmark100 {
  private harness = new BenchmarkHarness()

  getTasks(): BenchmarkTask[] {
    return BENCHMARK_100_TASKS
  }

  async runAll(): Promise<BenchmarkReport> {
    return this.harness.runAll()
  }

  async runCategory(category: string): Promise<BenchmarkReport> {
    const tasks = BENCHMARK_100_TASKS.filter(t => t.category === category)
    const startTime = Date.now()

    const results = await Promise.all(tasks.map(t => this.harness.runTask(t)))

    const passedTasks = results.filter(r => r.passed).length
    const totalTasks = results.length
    const successRate = totalTasks > 0 ? (passedTasks / totalTasks) * 100 : 0
    const avgToolCalls = results.reduce((s, r) => s + (r.metrics.toolCalls ?? 0), 0) / (totalTasks || 1)
    const avgRetries = results.reduce((s, r) => s + (r.metrics.retries ?? 0), 0) / (totalTasks || 1)
    const avgDurationMs = results.reduce((s, r) => s + r.durationMs, 0) / (totalTasks || 1)

    const metrics = [
      { name: "Success Rate", value: successRate, unit: "%", threshold: P6_METRIC_THRESHOLDS.successRate, passed: successRate >= P6_METRIC_THRESHOLDS.successRate },
      { name: "Avg Tool Calls", value: avgToolCalls, unit: "", threshold: P6_METRIC_THRESHOLDS.avgToolCalls, passed: avgToolCalls < P6_METRIC_THRESHOLDS.avgToolCalls },
      { name: "Avg Retries", value: avgRetries, unit: "", threshold: P6_METRIC_THRESHOLDS.avgRetries, passed: avgRetries < P6_METRIC_THRESHOLDS.avgRetries },
      { name: "Avg Duration", value: avgDurationMs, unit: "ms", threshold: undefined, passed: true },
    ]

    return {
      timestamp: Date.now(),
      totalTasks,
      passedTasks,
      failedTasks: totalTasks - passedTasks,
      successRate,
      avgToolCalls,
      avgRetries,
      avgDurationMs,
      metrics,
      results,
      summary: `${category}: ${successRate.toFixed(1)}% success, ${avgToolCalls.toFixed(1)} calls`,
    }
  }

  getMetricThresholds(): typeof P6_METRIC_THRESHOLDS {
    return P6_METRIC_THRESHOLDS
  }

  getTaskCountByCategory(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const t of BENCHMARK_100_TASKS) {
      counts[t.category] = (counts[t.category] ?? 0) + 1
    }
    return counts
  }

  formatCategoryBreakdown(): string {
    const counts = this.getTaskCountByCategory()
    const lines: string[] = ["━━━ Benchmark100 Task Breakdown ━━━"]
    for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${cat}: ${count} tasks`)
    }
    lines.push(`  Total: ${BENCHMARK_100_TASKS.length} tasks`)
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }
}
