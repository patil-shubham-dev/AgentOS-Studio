import type { languages } from "monaco-editor"

interface CodeLensAction {
  title: string
  command: string
  icon?: string
}

const AI_LENS_ACTIONS: CodeLensAction[] = [
  { title: "Explain this", command: "ai-codelens.explain" },
  { title: "Write test", command: "ai-codelens.write-test" },
  { title: "Add error handling", command: "ai-codelens.add-error-handling" },
  { title: "Optimize", command: "ai-codelens.optimize" },
]

const DECLARATION_PATTERNS = [
  /^(export\s+)?(async\s+)?function\s+\w+/,
  /^(export\s+)?(async\s+)?(private|protected|public|static)?\s*\w+\s*\(/,
  /^(export\s+)?class\s+\w+/,
  /^(export\s+)?(abstract\s+)?class\s+\w+/,
  /^(export\s+)?interface\s+\w+/,
  /^(export\s+)?type\s+\w+\s*=/,
  /^(export\s+)?enum\s+\w+/,
  /^(export\s+)?const\s+\w+\s*=\s*(\(|async|function)/,
  /^(export\s+)?function\s*\*/,
  /^(export\s+)?default\s+(function|class)\s+\w+/,
  /^(export\s+)?module\s+(\w+|['"][^'"]+['"])/,
  /^(export\s+)?namespace\s+\w+/,
  /^(export\s+)?component\s+\w+/i,
  /^(public|private|protected)\s+(static\s+)?(async\s+)?\w+\s*\(/,
]

function isDeclarationLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return false
  return DECLARATION_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function createAiCodeLensProvider(): languages.CodeLensProvider {
  return {
    provideCodeLenses: (model) => {
      const lines = model.getValue().split("\n")
      const lenses: languages.CodeLens[] = []
      const maxLenses = 20

      for (let i = 0; i < lines.length && lenses.length < maxLenses; i++) {
        if (!isDeclarationLine(lines[i])) continue

        for (const action of AI_LENS_ACTIONS) {
          lenses.push({
            range: {
              startLineNumber: i + 1,
              startColumn: 1,
              endLineNumber: i + 1,
              endColumn: 1,
            },
            command: {
              id: action.command,
              title: `✨ ${action.title}`,
              arguments: [
                model.uri.toString(),
                i + 1,
                action.command,
              ],
            },
          })
        }

        if (lenses.length >= maxLenses) break
      }

      return { lenses, dispose: () => {} }
    },
    resolveCodeLens: (model, codeLens) => codeLens,
  }
}
