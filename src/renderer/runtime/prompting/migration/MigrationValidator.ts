import { LegacyPromptAdapter } from './LegacyPromptAdapter'
import { PromptParityTester } from './PromptParityTester'
import type { PromptAST } from '../ast/PromptNode'
import { astToString } from '../ast/PromptTree'

export type MigrationMode = 'legacy' | 'hybrid' | 'new'

export class MigrationValidator {
  private mode: MigrationMode = 'new'
  private parityTester: PromptParityTester
  private legacyFallback: ((role: string, ctx: any) => Promise<string>) | null = null

  constructor() {
    this.parityTester = new PromptParityTester()
  }

  setMode(mode: MigrationMode): void {
    this.mode = mode
  }

  getMode(): MigrationMode {
    return this.mode
  }

  isNewEnabled(): boolean {
    return this.mode === 'new' || this.mode === 'hybrid'
  }

  registerLegacyFallback(fn: (role: string, ctx: any) => Promise<string>): void {
    this.legacyFallback = fn
  }

  async resolvePrompt(
    role: string,
    ctx: any,
    newSystemFn: (role: string, ctx: any) => Promise<PromptAST>,
    legacyFn?: (role: string, ctx: any) => Promise<string>,
  ): Promise<{ promptText: string; mode: MigrationMode; ast?: PromptAST }> {
    const useLegacy = legacyFn ?? this.legacyFallback

    switch (this.mode) {
      case 'legacy': {
        if (!useLegacy) throw new Error('No legacy fallback registered')
        const text = await useLegacy(role, ctx)
        const ast = LegacyPromptAdapter.adaptFromFactory(text, role)
        return { promptText: text, mode: 'legacy', ast }
      }

      case 'hybrid': {
        const [newAST, oldText] = await Promise.all([
          newSystemFn(role, ctx),
          useLegacy ? useLegacy(role, ctx) : Promise.resolve(''),
        ])
        const newText = astToString(newAST)

        const parity = this.parityTester.testParity(oldText || '', newAST, role)
        if (!parity.passed) {
          console.warn('[Migration] Parity warning:', parity.warnings)
        }

        return { promptText: newText, mode: 'hybrid', ast: newAST }
      }

      case 'new': {
        const ast = await newSystemFn(role, ctx)
        return { promptText: astToString(ast), mode: 'new', ast }
      }
    }
  }

  compare(oldPrompt: string, newAST: PromptAST, role: string) {
    return this.parityTester.testParity(oldPrompt, newAST, role)
  }
}
