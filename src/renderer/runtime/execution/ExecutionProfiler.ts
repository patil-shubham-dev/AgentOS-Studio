export type ProfileStage =
  | "gateway"
  | "snapshot"
  | "impact-preview"
  | "dependency-ordering"
  | "edit-execution"
  | "verification"
  | "failure-analysis"
  | "repair-planning"
  | "repair-execution"
  | "regression-check"
  | "regression-repair"
  | "patch-quality"
  | "total"

export interface StageProfile {
  stage: ProfileStage
  durationMs: number
  toolCalls: number
  tokenUsage: number
  timestamp: number
}

export interface ExecutionProfile {
  executionId: string
  task: string
  stages: StageProfile[]
  totalDurationMs: number
  totalToolCalls: number
  totalTokenUsage: number
  bottlenecks: string[]
  recommendations: string[]
}

export class ExecutionProfiler {
  private static instance: ExecutionProfiler
  private profiles: ExecutionProfile[] = []

  static getInstance(): ExecutionProfiler {
    if (!ExecutionProfiler.instance) {
      ExecutionProfiler.instance = new ExecutionProfiler()
    }
    return ExecutionProfiler.instance
  }

  beginProfile(executionId: string, task: string): ExecutionProfile {
    const profile: ExecutionProfile = {
      executionId,
      task,
      stages: [],
      totalDurationMs: 0,
      totalToolCalls: 0,
      totalTokenUsage: 0,
      bottlenecks: [],
      recommendations: [],
    }
    this.profiles.push(profile)
    return profile
  }

  recordStage(profile: ExecutionProfile, stage: ProfileStage, durationMs: number, toolCalls = 0, tokenUsage = 0): void {
    profile.stages.push({ stage, durationMs, toolCalls, tokenUsage, timestamp: Date.now() })
    profile.totalDurationMs += durationMs
    profile.totalToolCalls += toolCalls
    profile.totalTokenUsage += tokenUsage

    if (durationMs > 5000) {
      profile.bottlenecks.push(`${stage}: ${durationMs}ms`)
    }
  }

  finishProfile(profile: ExecutionProfile): ExecutionProfile {
    this.analyze(profile)
    return profile
  }

  private analyze(profile: ExecutionProfile): void {
    const stages = profile.stages

    const totalDuration = stages.reduce((s, st) => s + st.durationMs, 0)
    const heavyStages = stages.filter(s => s.durationMs / totalDuration > 0.25)

    for (const hs of heavyStages) {
      profile.recommendations.push(`Stage "${hs.stage}" consumes ${((hs.durationMs / totalDuration) * 100).toFixed(0)}% of total time — consider caching or skipping when unchanged.`)
    }

    if (stages.filter(s => s.stage === "verification").some(s => s.durationMs > 10000)) {
      profile.recommendations.push("Verification is slow — consider parallel stage execution.")
    }

    if (stages.filter(s => s.stage === "impact-preview").some(s => s.durationMs > 3000)) {
      profile.recommendations.push("Impact preview is slow — cache results for unchanged file sets.")
    }

    if (profile.totalToolCalls > 5) {
      profile.recommendations.push(`High tool call count (${profile.totalToolCalls}) — consolidate redundant tool invocations.`)
    }

    const repairStages = stages.filter(s => s.stage === "repair-execution")
    if (repairStages.length > 1) {
      profile.recommendations.push(`Multiple repair attempts (${repairStages.length}) — consider increasing verify-before-repair threshold.`)
    }

    profile.recommendations = [...new Set(profile.recommendations)]
  }

  getProfile(executionId: string): ExecutionProfile | undefined {
    return this.profiles.find(p => p.executionId === executionId)
  }

  getStats(): { avgDurationMs: number; avgToolCalls: number; commonBottlenecks: string[] } {
    if (this.profiles.length === 0) return { avgDurationMs: 0, avgToolCalls: 0, commonBottlenecks: [] }

    const avgDuration = this.profiles.reduce((s, p) => s + p.totalDurationMs, 0) / this.profiles.length
    const avgCalls = this.profiles.reduce((s, p) => s + p.totalToolCalls, 0) / this.profiles.length

    const bottleneckCounts = new Map<string, number>()
    for (const p of this.profiles) {
      for (const b of p.bottlenecks) {
        bottleneckCounts.set(b, (bottleneckCounts.get(b) ?? 0) + 1)
      }
    }

    const commonBottlenecks = [...bottleneckCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([b, c]) => `${b} (${c}x)`)

    return { avgDurationMs: Math.round(avgDuration), avgToolCalls: avgCalls, commonBottlenecks }
  }

  formatProfile(profile: ExecutionProfile): string {
    const lines: string[] = [
      `━━━ Execution Profile: ${profile.executionId} ━━━`,
      `Task: ${profile.task}`,
      `Total: ${profile.totalDurationMs}ms, ${profile.totalToolCalls} calls, ${profile.totalTokenUsage} tokens`,
      "",
      "### Stages",
    ]

    const sorted = [...profile.stages].sort((a, b) => b.durationMs - a.durationMs)
    for (const stage of sorted) {
      const pct = profile.totalDurationMs > 0 ? ((stage.durationMs / profile.totalDurationMs) * 100).toFixed(1) : "0"
      const icon = stage.durationMs > 5000 ? "⚠" : "·"
      lines.push(`  ${icon} ${stage.stage}: ${stage.durationMs}ms (${pct}%) [${stage.toolCalls} calls, ${stage.tokenUsage} tok]`)
    }

    if (profile.bottlenecks.length > 0) {
      lines.push("", "### Bottlenecks")
      for (const b of profile.bottlenecks) {
        lines.push(`  ⚠ ${b}`)
      }
    }

    if (profile.recommendations.length > 0) {
      lines.push("", "### Recommendations")
      for (const r of profile.recommendations) {
        lines.push(`  → ${r}`)
      }
    }

    lines.push("", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  clear(): void {
    this.profiles = []
  }
}
