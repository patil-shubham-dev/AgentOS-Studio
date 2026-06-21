/**
 * PersonaTypes — type definitions for the Output Styles / Personas system.
 *
 * Personas are user-defined presets stored as `.agentic/presets/*.md` files.
 * Each persona defines a communication style, tone, and formatting preference
 * that gets injected into the system prompt for all agents.
 *
 * A persona file is Markdown with YAML frontmatter:
 * ---
 * name: "Concise Engineer"
 * description: "Short, technical responses"
 * tags: [concise, technical]
 * ---
 * Keep responses brief and focused on what needs to be done...
 */

/** A persona preset loaded from a .agentic/presets/*.md file */
export interface Persona {
  /** Unique identifier (derived from filename without extension) */
  id: string
  /** Human-readable name from frontmatter */
  name: string
  /** One-line description from frontmatter */
  description: string
  /** Categorization / discovery tags */
  tags: string[]
  /** The full instruction text injected into system prompts */
  instruction: string
  /** Source of the persona — where it was loaded from */
  source: 'builtin' | 'user' | 'project'
  /** Absolute path to the source file (empty for builtins) */
  filePath: string
}

/** The built-in "no styling" persona — effectively turns off persona injection */
export const NO_STYLE_PERSONA: Persona = {
  id: 'none',
  name: 'No Style',
  description: 'No output style override — use default agent behavior',
  tags: [],
  instruction: '',
  source: 'builtin',
  filePath: '',
}

/** Default personas shipped with AgenticOS */
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: 'concise-explorer',
    name: 'Concise Explorer',
    description: 'Brief, technical, action-oriented responses with minimal prose',
    tags: ['concise', 'technical', 'direct'],
    instruction: `You communicate in a concise, engineering-focused style:

- Lead with the answer, not the reasoning. State what you found/did first.
- Use short paragraphs (1-3 sentences max) and bullet points.
- Show code snippets inline or as small diffs — not entire files.
- Skip meta-commentary like "I've analyzed your request and here's what I found."
- When explaining tradeoffs, use a pro/con list, not paragraphs.
- For errors: state the error, the cause, and the fix — three sentences max.
- Use active voice: "Refactored AuthService to use JWT" not "The AuthService has been refactored."
- Omit pleasantries like "Let me know if you need anything else."`,
    source: 'builtin',
    filePath: '',
  },
  {
    id: 'formal-reviewer',
    name: 'Formal Reviewer',
    description: 'Detailed, thorough, documentation-style responses with structured analysis',
    tags: ['formal', 'detailed', 'thorough', 'documentation'],
    instruction: `You communicate in a formal, thorough, documentation-oriented style:

- Structure responses with clear headings (## Summary, ## Analysis, ## Recommendations).
- Begin with an executive summary of 2-3 sentences.
- Provide detailed analysis with specific code references (file:line).
- Document assumptions, tradeoffs, and alternatives considered.
- Use numbered lists for sequential steps, bullet points for parallel items.
- Include a "Risk Assessment" section for changes affecting multiple files.
- End with concrete next steps or action items.
- Use full sentences and avoid abbreviations.
- When reviewing code, cite specific line numbers and explain the rationale.`,
    source: 'builtin',
    filePath: '',
  },
  {
    id: 'teacher',
    name: 'Teacher',
    description: 'Explanatory, educational responses that teach concepts while solving problems',
    tags: ['educational', 'explanatory', 'teaching', 'learning'],
    instruction: `You communicate in an educational, teaching-oriented style:

- Explain the "why" behind each recommendation, not just the "what."
- Use analogies and comparisons to build understanding.
- Break down complex concepts into digestible steps.
- Include code examples that illustrate the pattern, not just the fix.
- Highlight common pitfalls and why they happen.
- Use "You might notice that..." to draw attention to important patterns.
- When suggesting a change, explain what the old approach did wrong and why the new one is better.
- Avoid jargon without explanation — or define terms when they first appear.
- Encourage exploration: "Once you try this, you could also...`,
    source: 'builtin',
    filePath: '',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Ultra-concise — single sentence or single code block responses',
    tags: ['minimal', 'terse', 'short'],
    instruction: `You communicate in an ultra-minimal style:

- If the answer is code, show ONLY the code with no explanation.
- If the answer is text, use ONE sentence max.
- Never repeat what the user said back to them.
- Never ask "Would you like me to explain further?"
- Omit all introductory phrases: no "Sure!", "Okay!", "Absolutely!", "Here's..."
- For file edits, show only the diff/changed section.
- No sign-off, no pleasantries, no meta-commentary.`,
    source: 'builtin',
    filePath: '',
  },
]

/** Generate a unique persona ID from a filename */
export function personaIdFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .toLowerCase()
}

/** Parse a persona file from its raw markdown content */
export function parsePersonaMarkdown(
  content: string,
  source: Persona['source'],
  filePath: string,
): Persona {
  // Try to extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  let name = 'Unnamed Persona'
  let description = ''
  let tags: string[] = []
  let instruction = content.trim()

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    instruction = frontmatterMatch[2].trim()

    // Parse frontmatter fields
    const nameMatch = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m)
    if (nameMatch) name = nameMatch[1]

    const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)
    if (descMatch) description = descMatch[1]

    const tagsMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]\s*$/m)
    if (tagsMatch) {
      tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/["']/g, '')).filter(Boolean)
    }
  }

  const id = personaIdFromFilename(filePath.split('/').pop() ?? filePath)

  return { id, name, description, tags, instruction, source, filePath }
}

/** Convert a persona to a system prompt injection string */
export function personaToInstruction(persona: Persona): string {
  if (!persona.instruction) return ''
  return `\n\n## Communication Style\n${persona.instruction}\n`
}
