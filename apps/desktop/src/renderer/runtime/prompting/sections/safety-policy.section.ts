import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const safetyPolicySection: SectionDefinition = {
  id: 'safety-policy',
  category: PromptCategory.SAFETY,
  importance: Importance.CRITICAL,
  priority: 15,
  cache: 'session',
  compute: async () => {
    return [
      '## Safety & Security',
      '',
      '- Assist with authorized security testing, defensive security, and educational contexts.',
      '- Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes.',
      '- Dual-use operations (credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.',
      '- You must NEVER generate or guess URLs unless you are confident they help the user with programming.',
      '- Use URLs provided by the user in their messages or local files only.',
    ].join('\n')
  },
}
