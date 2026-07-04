import { ArchitectureAwareRanker } from '@/runtime/intelligence/ArchitectureAwareRanker'
import { VerificationGraph } from '@/runtime/intelligence/VerificationGraph'
import { ImpactAnalyzer } from '@/runtime/intelligence/ImpactAnalyzer'

export interface IntelligenceInput {
  rootPath?: string
  activeFilePath?: string
  taskQuery?: string
  role?: string
}

export interface IntelligenceResult {
  architectureContextBlock: string
  verificationPlanBlock: string
  impactContextBlock: string
}

export async function injectIntelligenceContext(input: IntelligenceInput): Promise<IntelligenceResult> {
  let architectureContextBlock = ''
  let verificationPlanBlock = ''
  let impactContextBlock = ''

  if (!input.rootPath || (!input.activeFilePath && !input.taskQuery)) {
    return { architectureContextBlock, verificationPlanBlock, impactContextBlock }
  }

  try {
    const archRanker = new ArchitectureAwareRanker()
    const archCtx = await archRanker.getArchitectureContext(input.taskQuery ?? '', input.activeFilePath)
    if (archCtx) architectureContextBlock = archCtx

    if (input.role === 'verification' || input.role === 'qa') {
      const vGraph = new VerificationGraph()
      if (input.activeFilePath) {
        const plan = await vGraph.planVerification([input.activeFilePath])
        if (plan.mustVerify.length > 0) {
          verificationPlanBlock = `<verification_plan risk="${plan.riskLevel}">
  ${plan.mustVerify.slice(0, 5).map(v => `<target path="${v.path}" priority="${v.priority}">${v.reason}</target>`).join('\n  ')}
</verification_plan>`
        }
      }
    }

    if (input.activeFilePath && (input.role === 'coder' || input.role === 'manager')) {
      const impact = new ImpactAnalyzer()
      const report = await impact.analyze(input.activeFilePath)
      if (report.consumers.length > 0 || report.relatedTests.length > 0) {
        impactContextBlock = `<impact file="${input.activeFilePath}" risk="${report.riskScore}">
  ${report.summary}
</impact>`
      }
    }
  } catch (err) {
    console.warn('[ContextManager] Failed to inject intelligence context:', err)
  }

  return { architectureContextBlock, verificationPlanBlock, impactContextBlock }
}
