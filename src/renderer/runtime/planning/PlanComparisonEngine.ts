/**
 * PlanComparisonEngine — generates implementation plans from multiple AI providers
 * and scores them for side-by-side comparison.
 *
 * Uses the same plan generation approach as PlanGenerator but queries multiple
 * providers simultaneously to let the user choose the best approach.
 */

import { PlanGenerator } from "./PlanGenerator"
import type { ImplementationPlan } from "./PlanTypes"
import { useAppStore } from "@/stores/app-store"
import { ProviderRuntime } from "@/runtime/providers/ProviderRuntime"
import { usePlanComparisonStore, type PlanComparisonEntry } from "@/stores/plan-comparison-store"

export interface ComparisonResult {
  entries: PlanComparisonEntry[]
  bestEntry: PlanComparisonEntry | undefined
  totalDurationMs: number
}

export class PlanComparisonEngine {
  private static instance: PlanComparisonEngine
  private generator = PlanGenerator.getInstance()

  static getInstance(): PlanComparisonEngine {
    if (!PlanComparisonEngine.instance) {
      PlanComparisonEngine.instance = new PlanComparisonEngine()
    }
    return PlanComparisonEngine.instance
  }

  /**
   * Generate plans from multiple providers simultaneously.
   * Returns results as they complete via the store.
   */
  async compare(
    userInput: string,
    providerIds?: string[],
    signal?: AbortSignal,
  ): Promise<ComparisonResult> {
    const store = usePlanComparisonStore.getState()
    store.clear()
    store.setStatus("generating")

    const providers = useAppStore.getState().providers ?? []
    const relevant = providerIds
      ? providers.filter((p) => providerIds.includes(p.id))
      : providers.slice(0, 3) // Use first 3 by default

    if (relevant.length === 0) {
      store.setStatus("error")
      store.setError("No providers configured. Add providers in Settings first.")
      return { entries: [], bestEntry: undefined, totalDurationMs: 0 }
    }

    const startTime = Date.now()
    store.setGeneratingProviders(relevant.map((p) => `${p.name} (${p.models[0]?.id ?? "unknown"})`))

    const results = await Promise.allSettled(
      relevant.map(async (provider) => {
        const modelId = provider.models[0]?.id
        const label = `${provider.name} (${modelId ?? "unknown"})`

        try {
          const plan = await this.generator.generatePlan(userInput, signal)
          const duration = Date.now() - startTime

          const entry: PlanComparisonEntry = {
            modelProvider: label,
            modelName: modelId ?? "unknown",
            plan,
            generatedAt: Date.now(),
            score: this.scorePlan(plan),
          }

          // Add to store as each completes
          usePlanComparisonStore.getState().addEntry(entry)
          usePlanComparisonStore.getState().removeGeneratingProvider(label)

          return entry
        } catch (err) {
          usePlanComparisonStore.getState().removeGeneratingProvider(label)
          throw err
        }
      }),
    )

    const totalDurationMs = Date.now() - startTime
    const entries = results
      .filter((r): r is PromiseFulfilledResult<PlanComparisonEntry> => r.status === "fulfilled")
      .map((r) => r.value)

    const bestEntry = entries.length > 0
      ? entries.reduce((best, current) => {
          const bestScore = best.score ?? 0
          const currentScore = current.score ?? 0
          return currentScore > bestScore ? current : best
        })
      : undefined

    // Mark best entry
    if (bestEntry) {
      usePlanComparisonStore.getState().setEntries(
        entries.map((e) => ({
          ...e,
          isBest: e.modelProvider === bestEntry.modelProvider,
        })),
      )
    }

    store.setStatus(entries.length > 0 ? "ready" : "error")
    if (entries.length === 0) {
      store.setError("All providers failed to generate a plan")
    }

    return { entries, bestEntry, totalDurationMs }
  }

  /**
   * Score a plan on a 0–100 scale based on structure and completeness.
   */
  private scorePlan(plan: ImplementationPlan): number {
    let score = 0

    // Title and overview presence (0–15)
    if (plan.title && plan.title.length > 5) score += 10
    if (plan.overview && plan.overview.length > 20) score += 5

    // Step quantity (0–25)
    if (plan.steps.length >= 5) score += 25
    else if (plan.steps.length >= 3) score += 18
    else if (plan.steps.length >= 1) score += 10

    // Step quality — description length (0–25)
    const avgDescLength =
      plan.steps.reduce((sum, s) => sum + s.description.length, 0) / Math.max(1, plan.steps.length)
    if (avgDescLength > 100) score += 25
    else if (avgDescLength > 50) score += 18
    else if (avgDescLength > 20) score += 10

    // Files mentioned (0–20)
    const totalFiles = plan.steps.reduce((sum, s) => sum + s.filesAffected.length, 0)
    if (totalFiles >= 5) score += 20
    else if (totalFiles >= 3) score += 14
    else if (totalFiles >= 1) score += 8

    // Verification criteria (0–15)
    if (plan.verificationCriteria.length >= 3) score += 15
    else if (plan.verificationCriteria.length >= 1) score += 8

    return Math.min(100, score)
  }

  /**
   * Compute differences between two plans for side-by-side display.
   */
  computeDifferences(planA: ImplementationPlan, planB: ImplementationPlan): string[] {
    const diffs: string[] = []

    // Step count
    if (planA.steps.length !== planB.steps.length) {
      diffs.push(`Step count: ${planA.steps.length} vs ${planB.steps.length}`)
    }

    // Files affected
    const filesA = new Set(planA.steps.flatMap((s) => s.filesAffected.map((f) => f.path)))
    const filesB = new Set(planB.steps.flatMap((s) => s.filesAffected.map((f) => f.path)))
    const onlyA = [...filesA].filter((f) => !filesB.has(f))
    const onlyB = [...filesB].filter((f) => !filesA.has(f))
    if (onlyA.length > 0) diffs.push(`Files only in A: ${onlyA.join(", ")}`)
    if (onlyB.length > 0) diffs.push(`Files only in B: ${onlyB.join(", ")}`)

    // Files in both but different change type
    const common = [...filesA].filter((f) => filesB.has(f))
    const typeDiff = common.filter((f) => {
      const typeA = planA.steps.flatMap((s) => s.filesAffected).find((fa) => fa.path === f)?.changeType
      const typeB = planB.steps.flatMap((s) => s.filesAffected).find((fa) => fa.path === f)?.changeType
      return typeA !== typeB
    })
    if (typeDiff.length > 0) {
      diffs.push(`Files with different change types: ${typeDiff.join(", ")}`)
    }

    // Verification count
    if (planA.verificationCriteria.length !== planB.verificationCriteria.length) {
      diffs.push(
        `Verification criteria: ${planA.verificationCriteria.length} vs ${planB.verificationCriteria.length}`,
      )
    }

    return diffs
  }

  /**
   * Compare a plan against all others and tag differences on each entry.
   */
  tagDifferences(entries: PlanComparisonEntry[]): PlanComparisonEntry[] {
    if (entries.length < 2) return entries

    return entries.map((entry) => {
      const diffs: string[] = []
      for (const other of entries) {
        if (other.modelProvider === entry.modelProvider) continue
        diffs.push(...this.computeDifferences(entry.plan, other.plan))
      }
      return { ...entry, differences: [...new Set(diffs)] }
    })
  }
}
