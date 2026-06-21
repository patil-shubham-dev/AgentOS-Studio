/**
 * ReferenceParser — parses @-symbol references from user input.
 *
 * Supported syntax:
 *   @file path/to/file.ts
 *   @folder path/to/folder/
 *   @web https://example.com
 *   @code "search query" in path/
 *   @lines 42-78 in path/to/file.ts
 *   @git
 *   @problems
 *   @symbol SymbolName
 *   @combined @file path + @lines N-M
 */

export type ContextReferenceType =
  | "file"
  | "folder"
  | "web"
  | "code"
  | "lines"
  | "problems"
  | "git"
  | "symbol"

export interface ContextReference {
  type: ContextReferenceType
  /** The primary target (file path, URL, symbol name, search query) */
  target: string
  /** Optional qualifier (line range, search path scope) */
  qualifier?: string
  /** The original @mention text for replacement */
  raw: string
  /** Character position in the original input */
  start: number
  end: number
}

export interface ParseResult {
  /** Cleaned text with @-references replaced by placeholders */
  text: string
  /** All parsed references */
  references: ContextReference[]
}

const REFERENCE_PATTERNS: {
  type: ContextReferenceType
  pattern: RegExp
  extractTarget: (match: RegExpExecArray) => { target: string; qualifier?: string }
}[] = [
  {
    // @file path/to/file.ts — captures file path (may include spaces in quotes)
    type: "file",
    pattern: /(?:^|\s)@file\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/g,
    extractTarget: (m) => ({ target: m[1] ?? m[2] ?? m[3] }),
  },
  {
    // @folder path/to/folder/
    type: "folder",
    pattern: /(?:^|\s)@folder\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/g,
    extractTarget: (m) => ({ target: m[1] ?? m[2] ?? m[3] }),
  },
  {
    // @web https://...
    type: "web",
    pattern: /(?:^|\s)@web\s+(https?:\/\/\S+)/g,
    extractTarget: (m) => ({ target: m[1] }),
  },
  {
    // @code "search query" in path/  (path is optional)
    type: "code",
    pattern: /(?:^|\s)@code\s+(?:"([^"]+)"|`([^`]+)`|(\S+(?:\s+\S+)*?))(?:\s+in\s+(\S+))?/g,
    extractTarget: (m) => ({ target: m[1] ?? m[2] ?? m[3], qualifier: m[4] }),
  },
  {
    // @lines N-M in path/to/file.ts
    type: "lines",
    pattern: /(?:^|\s)@lines\s+(\d+)\s*[-–]\s*(\d+)\s+in\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/g,
    extractTarget: (m) => ({
      target: m[3] ?? m[4] ?? m[5],
      qualifier: `${m[1]}-${m[2]}`,
    }),
  },
  {
    // @problems — no arguments
    type: "problems",
    pattern: /(?:^|\s)@problems\b/g,
    extractTarget: () => ({ target: "" }),
  },
  {
    // @git — no arguments
    type: "git",
    pattern: /(?:^|\s)@git\b/g,
    extractTarget: () => ({ target: "" }),
  },
  {
    // @symbol SymbolName
    type: "symbol",
    pattern: /(?:^|\s)@symbol\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/g,
    extractTarget: (m) => ({ target: m[1] ?? m[2] ?? m[3] }),
  },
]

export class ReferenceParser {
  private static instance: ReferenceParser

  static getInstance(): ReferenceParser {
    if (!ReferenceParser.instance) {
      ReferenceParser.instance = new ReferenceParser()
    }
    return ReferenceParser.instance
  }

  /**
   * Parse all @-references from the input text.
   * Returns cleaned text (with references removed) + structured reference objects.
   */
  parse(input: string): ParseResult {
    const references: ContextReference[] = []
    let cleanText = input
    let offset = 0

    for (const { type, pattern, extractTarget } of REFERENCE_PATTERNS) {
      // Reset lastIndex for each pattern
      pattern.lastIndex = 0

      let match: RegExpExecArray | null
      while ((match = pattern.exec(cleanText)) !== null) {
        const { target, qualifier } = extractTarget(match)
        if (!target && type !== "problems" && type !== "git") continue

        const raw = match[0].trim()
        // Find the actual position in the original input
        const rawStart = match.index - offset
        const rawEnd = rawStart + match[0].length

        references.push({
          type,
          target,
          qualifier,
          raw,
          start: rawStart,
          end: rawEnd,
        })

        // Remove the reference from the text (replace with empty)
        cleanText =
          cleanText.slice(0, match.index) +
          cleanText.slice(match.index + match[0].length)

        // Adjust offset for subsequent matches
        offset -= match[0].length

        // Reset pattern since we modified the string
        pattern.lastIndex = match.index
      }
    }

    return {
      text: cleanText.replace(/\s+/g, " ").trim(),
      references,
    }
  }

  /**
   * Quick check if input contains any @-references.
   * Useful for showing/hiding UI elements.
   */
  hasReferences(input: string): boolean {
    return REFERENCE_PATTERNS.some(({ pattern }) => {
      pattern.lastIndex = 0
      return pattern.test(input)
    })
  }

  /**
   * Get all reference types that are currently available.
   */
  getAvailableTypes(): { type: ContextReferenceType; label: string; description: string; example: string }[] {
    return [
      { type: "file", label: "File", description: "Inject file content", example: "@file path/to/file.ts" },
      { type: "folder", label: "Folder", description: "Inject directory listing", example: "@folder src/" },
      { type: "web", label: "Web", description: "Fetch web page content", example: "@web https://..." },
      { type: "code", label: "Code", description: "Search code in project", example: "@code query in src/" },
      { type: "lines", label: "Lines", description: "Inject specific line range", example: "@lines 10-30 in file.ts" },
      { type: "problems", label: "Problems", description: "Inject diagnostics", example: "@problems" },
      { type: "git", label: "Git", description: "Inject git status", example: "@git" },
      { type: "symbol", label: "Symbol", description: "Inject symbol definition", example: "@symbol AuthService" },
    ]
  }
}

/** Convenience export for the singleton */
export const referenceParser = ReferenceParser.getInstance()
