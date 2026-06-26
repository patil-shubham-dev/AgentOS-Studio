import { DeduplicationEngine } from "./DeduplicationEngine"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { MemoryCandidate, MemoryCategory, MemoryScope, ExtractionTrigger, MemoryEntry } from "./types"

export interface ExtractionResult {
  candidates: MemoryCandidate[]
  trigger: ExtractionTrigger
  timestamp: number
  sourceEventCount: number
}

interface ExtractionPipeline {
  storage: {
    query: (q: any) => Promise<MemoryEntry[]>
  }
  scoring: {
    inferCategoryFromContent: (content: string) => { category: MemoryCategory; weight: number }
  }
  extraction: ExtractionEngine
}

export class ExtractionEngine {
  private pipeline: ExtractionPipeline | null = null

  setPipeline(p: ExtractionPipeline): void {
    this.pipeline = p
  }

  async extractFromEvent(event: ExecutionEvent, trigger: ExtractionTrigger): Promise<ExtractionResult> {
    const candidates: MemoryCandidate[] = []
    const sourceEventCount = 1

    switch (event.type) {
      case "EXECUTION_COMPLETE":
        candidates.push(...this.extractExecutionComplete(event))
        break
      case "GOAL_ACHIEVED":
        candidates.push(...this.extractGoalAchieved(event))
        break
      case "TOOL_COMPLETE":
        candidates.push(...this.extractToolComplete(event))
        break
      case "FILE_EDIT":
        candidates.push(...this.extractFileEdit(event))
        break
      case "VERIFY_PASSED":
        candidates.push(...this.extractVerifyPassed(event))
        break
      case "VERIFY_FAILED":
        candidates.push(...this.extractVerifyFailed(event))
        break
      case "BROWSER_NAVIGATE":
        candidates.push(...this.extractBrowserNavigate(event))
        break
      case "BROWSER_CLICK":
      case "BROWSER_TYPE":
        candidates.push(...this.extractBrowserAction(event))
        break
      case "EXECUTION_FAILED":
        candidates.push(...this.extractExecutionFailed(event))
        break
    }

    if (this.pipeline && candidates.length > 0) {
      const deduped = await this.deduplicateAgainst(candidates)
      return { candidates: deduped, trigger, timestamp: Date.now(), sourceEventCount }
    }

    return { candidates, trigger, timestamp: Date.now(), sourceEventCount }
  }

  async extractFromEvents(
    events: ExecutionEvent[],
    trigger: ExtractionTrigger,
  ): Promise<ExtractionResult> {
    const allCandidates: MemoryCandidate[] = []

    for (const event of events) {
      const result = await this.extractFromEvent(event, trigger)
      allCandidates.push(...result.candidates)
    }

    if (this.pipeline) {
      const deduped = await this.deduplicateAgainst(allCandidates)
      return { candidates: deduped, trigger, timestamp: Date.now(), sourceEventCount: events.length }
    }

    return { candidates: allCandidates, trigger, timestamp: Date.now(), sourceEventCount: events.length }
  }

  async extractManual(input: { content: string; tags?: string[]; category?: MemoryCategory; source?: string }): Promise<ExtractionResult> {
    const candidate: MemoryCandidate = {
      content: input.content,
      source: input.source ?? "manual",
      category: input.category,
      tags: input.tags,
      scope: "project",
    }

    const candidates = this.pipeline
      ? await this.deduplicateAgainst([candidate])
      : [candidate]

    return { candidates, trigger: "manual", timestamp: Date.now(), sourceEventCount: 1 }
  }

  private async deduplicateAgainst(candidates: MemoryCandidate[]): Promise<MemoryCandidate[]> {
    if (!this.pipeline || candidates.length === 0) return candidates

    const existing = await this.pipeline.storage.query({ limit: 1000 })
    const dedup = new DeduplicationEngine()
    const results = await dedup.deduplicateBatch(candidates, existing)

    return results
      .filter((r) => r.mergeAction !== "skipped")
      .map((r) => {
        if (r.mergeAction === "merged" && r.mergedInto) {
          return {
            content: r.mergedInto.content,
            source: r.candidate.source,
            type: r.mergedInto.type as any,
            scope: r.mergedInto.scope as any,
            category: r.mergedInto.category as any,
            tags: r.mergedInto.tags,
            filePaths: r.mergedInto.filePaths,
            importance: r.mergedInto.importance,
            confidence: r.mergedInto.confidence,
            metadata: r.mergedInto.metadata,
            ttl: r.mergedInto.ttl,
          }
        }
        return r.candidate
      })
  }

  private extractExecutionComplete(event: ExecutionEvent & { content?: string; filesEdited?: number; commandsRun?: number; toolCalls?: number }): MemoryCandidate[] {
    const candidates: MemoryCandidate[] = []

    if (event.content && event.content.length > 20) {
      candidates.push({
        content: `Task completed: ${event.content.slice(0, 500)}`,
        source: "execution",
        type: "session",
        scope: "session",
        category: "learning",
        tags: ["execution", "complete", `files_${event.filesEdited ?? 0}`, `tools_${event.toolCalls ?? 0}`],
        importance: 0.7,
        confidence: 0.8,
      })
    }

    if ((event.filesEdited ?? 0) > 0) {
      candidates.push({
        content: `Execution edited ${event.filesEdited} file(s) and ran ${event.commandsRun ?? 0} command(s)`,
        source: "execution",
        type: "session",
        scope: "session",
        category: "workflow",
        tags: ["execution", "workflow", "summary"],
      })
    }

    return candidates
  }

  private extractGoalAchieved(event: ExecutionEvent & { objective?: string; iterations?: number; stepsCompleted?: number }): MemoryCandidate[] {
    if (!event.objective) return []

    return [{
      content: `Goal achieved: ${event.objective.slice(0, 500)} (${event.iterations ?? 0} iterations, ${event.stepsCompleted ?? 0} steps)`,
      source: "execution",
      type: "long_term",
      scope: "project",
      category: "learning",
      tags: ["goal", "achieved", "success"],
      importance: 0.85,
      confidence: 0.9,
    }]
  }

  private extractToolComplete(event: ExecutionEvent & { toolName?: string; result?: string; durationMs?: number }): MemoryCandidate[] {
    if (!event.toolName) return []

    const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result)
    const candidates: MemoryCandidate[] = []

    candidates.push({
      content: `Tool ${event.toolName} completed in ${event.durationMs ?? 0}ms`,
      source: "execution",
      type: "session",
      scope: "ephemeral",
      category: "tool_usage",
      tags: ["tool", event.toolName, "complete"],
      ttl: 30 * 60 * 1000,
    })

    if (event.toolName === "write_file" || event.toolName === "edit_file") {
      candidates.push({
        content: `File operation via ${event.toolName}`,
        source: "execution",
        type: "session",
        scope: "session",
        category: "pattern",
        tags: ["tool", event.toolName, "file_operation"],
      })
    }

    return candidates
  }

  private extractFileEdit(event: ExecutionEvent & { path?: string; additions?: number; deletions?: number }): MemoryCandidate[] {
    if (!event.path) return []

    return [{
      content: `Edited ${event.path} (+${event.additions ?? 0}/-${event.deletions ?? 0} lines)`,
      source: "execution",
      type: "session",
      scope: "session",
      category: "pattern",
      tags: ["file_edit", "execution"],
      filePaths: [event.path],
    }]
  }

  private extractVerifyPassed(event: ExecutionEvent & { details?: string[]; recovered?: boolean }): MemoryCandidate[] {
    const detailStr = event.details?.join(", ") ?? ""
    const tagSuffix = event.recovered ? "_recovered" : ""

    return [{
      content: `Verification passed: ${detailStr.slice(0, 300)}`,
      source: "verification",
      type: "session",
      scope: "session",
      category: "learning",
      tags: ["verification", "passed", ...(event.recovered ? ["recovered"] : [])],
      importance: event.recovered ? 0.8 : 0.6,
      confidence: 0.85,
    }]
  }

  private extractVerifyFailed(event: ExecutionEvent & { lintErrors?: number; typeErrors?: number; buildErrors?: number; testFailures?: number; details?: string[] }): MemoryCandidate[] {
    const parts: string[] = []
    if (event.lintErrors) parts.push(`${event.lintErrors} lint error(s)`)
    if (event.typeErrors) parts.push(`${event.typeErrors} type error(s)`)
    if (event.buildErrors) parts.push(`${event.buildErrors} build error(s)`)
    if (event.testFailures) parts.push(`${event.testFailures} test failure(s)`)

    return [{
      content: `Verification failed: ${parts.join(", ")}`,
      source: "verification",
      type: "session",
      scope: "session",
      category: "error",
      tags: ["verification", "failed", "error"],
      importance: 0.6,
      confidence: 0.9,
    }]
  }

  private extractBrowserNavigate(event: ExecutionEvent & { url?: string; title?: string; durationMs?: number }): MemoryCandidate[] {
    if (!event.url) return []

    return [{
      content: `Visited ${event.title ?? event.url} (${event.url})`,
      source: "browser",
      type: "browser",
      scope: "session",
      category: "browser_action",
      tags: ["browser", "navigation", "web"],
      importance: 0.3,
    }]
  }

  private extractBrowserAction(event: ExecutionEvent & { selector?: string; durationMs?: number }): MemoryCandidate[] {
    return [{
      content: `Browser ${event.type}: selector=${event.selector ?? "unknown"}`,
      source: "browser",
      type: "browser",
      scope: "ephemeral",
      category: "browser_action",
      tags: ["browser", event.type.toLowerCase()],
      ttl: 30 * 60 * 1000,
      importance: 0.2,
    }]
  }

  private extractExecutionFailed(event: ExecutionEvent & { error?: string; durationMs?: number }): MemoryCandidate[] {
    return [{
      content: `Execution failed: ${(event.error ?? "unknown error").slice(0, 500)}`,
      source: "execution",
      type: "session",
      scope: "session",
      category: "error",
      tags: ["execution", "failure", "error"],
      importance: 0.5,
      confidence: 0.95,
    }]
  }
}
