import { PromptRegistry } from "./registry/PromptRegistry"
import { PromptCompositionEngine, type CompositionResult } from "./composition/PromptCompositionEngine"
import { defaultContext, type ResolutionContext } from "./registry/SectionDefinition"
import { registerDefaultSections } from "./sections"
import { TokenEstimator } from "@/runtime/context/TokenEstimator"

export interface CoreSystemPromptSection {
  id: string
  content: string | null
  tokens: number
}

export interface CoreSystemPrompt {
  sections: CoreSystemPromptSection[]
  promptText: string
  totalTokens: number
  compressionRatio: number
}

export interface CoreSystemPromptRequest {
  role: string
  userMessage: string
  activeFilePath?: string
  executionMode?: string
}

export class CoreSystemPromptBuilder {
  private registry: PromptRegistry
  private engine: PromptCompositionEngine
  private initialized = false

  constructor() {
    this.registry = new PromptRegistry()
    this.engine = new PromptCompositionEngine(this.registry)
  }

  private ensureInitialized(): void {
    if (this.initialized) return
    registerDefaultSections(this.registry)
    this.initialized = true
  }

  async build(request: CoreSystemPromptRequest): Promise<CoreSystemPrompt> {
    this.ensureInitialized()

    const ctx: ResolutionContext = {
      ...defaultContext(),
      role: request.role,
      executionMode: request.executionMode,
      activeFilePath: request.activeFilePath,
    }

    const plan = this.registry.plan(ctx)
    const composeResult: CompositionResult = await this.engine.compose(plan, ctx)

    const sections: CoreSystemPromptSection[] = []

    for (const node of composeResult.ast.nodes) {
      sections.push({
        id: node.id,
        content: node.content,
        tokens: TokenEstimator.rough(node.content ?? ""),
      })
    }

    return {
      sections,
      promptText: composeResult.promptText,
      totalTokens: TokenEstimator.rough(composeResult.promptText),
      compressionRatio: composeResult.compressionRatio,
    }
  }

  getRegistry(): PromptRegistry {
    return this.registry
  }

  getEngine(): PromptCompositionEngine {
    return this.engine
  }

  reset(): void {
    this.registry = new PromptRegistry()
    this.engine = new PromptCompositionEngine(this.registry)
    this.initialized = false
  }
}
