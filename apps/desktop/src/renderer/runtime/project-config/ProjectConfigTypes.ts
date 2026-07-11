export interface ProjectArchitecture {
  type: "monorepo" | "frontend" | "backend" | "fullstack" | "library" | "unknown"
  workspaces: string[]
  entryPoints: string[]
}

export interface ProjectCommands {
  build: string | null
  test: string | null
  lint: string | null
  typecheck: string | null
  format: string | null
  packageManager: string | null
}

export interface ProjectStack {
  languages: string[]
  frameworks: string[]
  buildTool: string | null
  testFramework: string | null
  linter: string | null
  formatter: string | null
}

export interface ProjectConventions {
  isTypeScript: boolean
  isStrictMode: boolean
  styling: string
  customRules: string[]
}

export interface ProjectVerificationRules {
  requiredChecks: string[]
  testPatterns: string[]
  buildBeforeTest: boolean
}

export interface ProjectAgentInstructions {
  general: string[]
  perRole: Record<string, string[]>
}

export interface StructuredProjectConfig {
  overview: string
  architecture: ProjectArchitecture
  commands: ProjectCommands
  stack: ProjectStack
  conventions: ProjectConventions
  verification: ProjectVerificationRules
  agentInstructions: ProjectAgentInstructions
  raw: string
}

const ROLES = ["manager", "coder", "qa", "research", "browser", "vision", "design", "runtime", "memory", "verification"]

export function parseProjectConfig(markdown: string): StructuredProjectConfig {
  const config: StructuredProjectConfig = {
    overview: "",
    architecture: { type: "unknown", workspaces: [], entryPoints: [] },
    commands: { build: null, test: null, lint: null, typecheck: null, format: null, packageManager: null },
    stack: { languages: [], frameworks: [], buildTool: null, testFramework: null, linter: null, formatter: null },
    conventions: { isTypeScript: false, isStrictMode: false, styling: "CSS", customRules: [] },
    verification: { requiredChecks: [], testPatterns: [], buildBeforeTest: true },
    agentInstructions: { general: [], perRole: {} },
    raw: markdown,
  }

  const lines = markdown.split("\n")
  let currentSection = ""
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock
      continue
    }

    const header = line.match(/^##\s+(.+)/)
    if (header) {
      currentSection = header[1].trim().toLowerCase()
      continue
    }

    if (inCodeBlock) continue

    if (currentSection === "quick reference" || currentSection === "overview") {
      if (line.startsWith("|") && !line.startsWith("|---")) {
        const cells = line.split("|").filter(Boolean).map(c => c.trim())
        if (cells.length >= 2) {
          const key = cells[0].toLowerCase()
          const val = cells[1]
          if (key.includes("architecture")) config.architecture.type = normalizeArch(val)
          else if (key.includes("language")) config.stack.languages = val.split(",").map(s => s.trim()).filter(Boolean)
          else if (key.includes("framework")) config.stack.frameworks = val.split(",").map(s => s.trim()).filter(Boolean)
          else if (key.includes("package manager")) config.commands.packageManager = val === "\u2014" ? null : val
          else if (key.includes("build tool")) config.commands.build = val === "\u2014" ? null : val
          else if (key.includes("typescript")) config.conventions.isTypeScript = val.startsWith("Yes")
          else if (key.includes("test")) config.stack.testFramework = val.startsWith("Not detected") ? null : val.replace(/^Yes\s*\(|\)$/g, "")
        }
      }
      if (!line.startsWith("#") && !line.startsWith("|") && line.trim()) {
        config.overview += line.trim() + " "
      }
    }

    else if (currentSection === "build & test commands" && line.trim().startsWith("-")) {
      const match = line.match(/-\s*(Build|Test|Lint|Typecheck|Package manager|Format):\s*`([^`]+)`/)
      if (match) {
        const key = match[1].toLowerCase()
        const val = match[2]
        if (key === "build") config.commands.build = val
        else if (key === "test") config.commands.test = val
        else if (key === "lint") config.commands.lint = val
        else if (key === "typecheck") config.commands.typecheck = val
        else if (key === "format") config.commands.format = val
        else if (key.includes("package")) config.commands.packageManager = val
      }
    }

    else if (currentSection === "project architecture" || currentSection === "architectural context") {
      if (line.includes("**Type:**")) {
        config.architecture.type = normalizeArch(line.split("**Type:**")[1].trim())
      }
      if (line.includes("**Workspaces:**") || line.includes("**Workspaces**")) {
        // Next lines with backtick names are workspace entries
      }
      if (line.trim().startsWith("-")) {
        const item = line.replace(/^-\s*/, "").trim()
        const name = item.replace(/^`(.+)`$/, "$1").trim()
        // If inside backticks, it's a workspace
        if (item.startsWith("`") && item.endsWith("`")) {
          if (!config.architecture.workspaces.includes(name)) {
            config.architecture.workspaces.push(name)
          }
        } else if (name.toLowerCase().includes("entry") || name.toLowerCase().includes("src/")) {
          if (!config.architecture.entryPoints.includes(name)) {
            config.architecture.entryPoints.push(name)
          }
        } else if (name.length > 0 && !name.startsWith("**")) {
          // Only add as entry point if it looks like a file path
          if (name.includes("/") || name.includes(".") || name.startsWith("src/")) {
            if (!config.architecture.entryPoints.includes(name)) {
              config.architecture.entryPoints.push(name)
            }
          }
        }
      }
    }

    else if (currentSection === "technology stack" && line.trim().startsWith("-")) {
      const plain = line.replace(/^-\s*/, "")
      const colonBold = plain.match(/^\*\*([^*:]+):\*\*\s*(.+)/)
      const boldOnly = plain.match(/^\*\*([^*]+)\*\*\s*(.+)/)
      const match = colonBold ?? boldOnly
      if (match) {
        const key = match[1].toLowerCase()
        const val = match[2].replace(/\u2014/g, "").trim()
        if (key === "languages") config.stack.languages = val.split(",").map(s => s.trim()).filter(Boolean)
        else if (key === "frameworks") config.stack.frameworks = val.split(",").map(s => s.trim()).filter(Boolean)
        else if (key === "build tool") config.stack.buildTool = val
        else if (key === "testing") config.stack.testFramework = val
        else if (key === "linting") config.stack.linter = val
        else if (key === "formatter") config.stack.formatter = val
      }
    }

    else if (currentSection === "coding conventions" && line.trim().startsWith("-")) {
      const plain = line.replace(/^-\s*/, "")
      const colonBold = plain.match(/^\*\*([^*:]+):\*\*\s*(.+)/)
      const plainColon = plain.match(/^([^:]+):\s*(.+)/)
      const match = colonBold ?? plainColon
      if (match) {
        const key = match[1].toLowerCase()
        const val = match[2].trim()
        if (key === "typescript") { config.conventions.isTypeScript = val !== "Not used"; config.conventions.isStrictMode = val.toLowerCase().includes("strict") }
        if (key.includes("strict")) config.conventions.isStrictMode = val.toLowerCase().includes("strict")
        if (key === "styling") config.conventions.styling = val
        if (key !== "typescript" && key !== "styling" && !key.includes("strict")) {
          if (val.length > 2) config.conventions.customRules.push(`${key}: ${val}`)
        }
      }
      if (!plain.includes(":")) {
        const trimmed = plain.trim()
        if (trimmed && trimmed.length > 3) config.conventions.customRules.push(trimmed)
      }
    }

    else if (currentSection === "verification rules") {
      if (line.trim().startsWith("-")) {
        const trimmed = line.replace(/^-\s*/, "").trim()
        if (trimmed) config.verification.requiredChecks.push(trimmed)
        // Extract all backtick patterns from this line
        const patternRegex = /`([^`]+)`/g
        let pm
        while ((pm = patternRegex.exec(line)) !== null) {
          if (!config.verification.testPatterns.includes(pm[1])) {
            config.verification.testPatterns.push(pm[1])
          }
        }
      }
    }

    else if (currentSection === "agent instructions" || currentSection === "custom instructions") {
      const roleMatch = line.match(/^###\s+(.+)/)
      if (roleMatch) {
        const roleLabel = roleMatch[1].trim().toLowerCase()
        if (ROLES.includes(roleLabel)) {
          if (!config.agentInstructions.perRole[roleLabel]) config.agentInstructions.perRole[roleLabel] = []
        }
      }
      if (line.trim().startsWith("-") && !line.includes("<!--")) {
        const trimmed = line.replace(/^-\s*/, "").trim()
        if (trimmed && !trimmed.startsWith("<!--")) {
          const role = findActiveRoleForLine(lines, line, currentSection)
          if (role && ROLES.includes(role)) {
            config.agentInstructions.perRole[role]?.push(trimmed)
          } else {
            config.agentInstructions.general.push(trimmed)
          }
        }
      }
    }
  }

  return config
}

function normalizeArch(val: string): ProjectArchitecture["type"] {
  const v = val.toLowerCase().trim()
  if (v.includes("monorepo") || v.includes("mono repo")) return "monorepo"
  if (v.includes("fullstack") || v.includes("full stack")) return "fullstack"
  if (v.includes("backend") || v.includes("back end") || v.includes("api")) return "backend"
  if (v.includes("frontend") || v.includes("front end") || v.includes("ui")) return "frontend"
  if (v.includes("library") || v.includes("lib")) return "library"
  return "unknown"
}

function findActiveRoleForLine(lines: string[], currentLine: string, currentSection: string): string | null {
  const idx = lines.indexOf(currentLine)
  for (let i = idx - 1; i >= 0; i--) {
    const m = lines[i].match(/^###\s+(.+)/)
    if (m) return m[1].trim().toLowerCase()
    if (lines[i].startsWith("## ")) return null
  }
  return null
}

export function formatForRole(config: StructuredProjectConfig, role: string): string {
  const blocks: string[] = []

  if (role === "manager") {
    blocks.push("## Project Configuration (Architecture)")
    blocks.push(`Architecture type: ${config.architecture.type}`)
    if (config.architecture.workspaces.length > 0) {
      blocks.push(`Workspaces: ${config.architecture.workspaces.join(", ")}`)
    }
    blocks.push(`Tech stack: ${config.stack.languages.join(", ")}`)
    blocks.push("")
    blocks.push("### Architecture Context")
    blocks.push("When planning implementation steps, consider the project architecture above.")
    blocks.push("Delegate specialized work to the appropriate agent.")
    if (config.agentInstructions.general.length > 0) {
      blocks.push("", "### Project Instructions", ...config.agentInstructions.general.map(i => `- ${i}`))
    }
  }

  else if (role === "coder") {
    blocks.push("## Project Configuration (Commands & Conventions)")
    if (config.commands.build) blocks.push(`- Build: \`${config.commands.build}\``)
    if (config.commands.test) blocks.push(`- Test: \`${config.commands.test}\``)
    if (config.commands.lint) blocks.push(`- Lint: \`${config.commands.lint}\``)
    if (config.commands.typecheck) blocks.push(`- Typecheck: \`${config.commands.typecheck}\``)
    blocks.push("")
    blocks.push("### Coding Conventions")
    if (config.conventions.isTypeScript) {
      blocks.push(`- TypeScript: ${config.conventions.isStrictMode ? "Strict mode" : "Enabled"}`)
    }
    blocks.push(`- Styling: ${config.conventions.styling}`)
    for (const rule of config.conventions.customRules) {
      blocks.push(`- ${rule}`)
    }
    blocks.push("")
    blocks.push("### Technology Stack")
    blocks.push(`- Languages: ${config.stack.languages.join(", ") || "Unknown"}`)
    blocks.push(`- Frameworks: ${config.stack.frameworks.join(", ") || "None"}`)
    if (config.stack.testFramework) blocks.push(`- Testing: ${config.stack.testFramework}`)
    if (config.agentInstructions.general.length > 0) {
      blocks.push("", "### Project Instructions", ...config.agentInstructions.general.map(i => `- ${i}`))
    }
    const roleInstructions = config.agentInstructions.perRole["coder"]
    if (roleInstructions?.length > 0) {
      blocks.push("", "### Coder Instructions", ...roleInstructions.map(i => `- ${i}`))
    }
  }

  else if (role === "qa") {
    blocks.push("## Project Configuration (Verification)")
    if (config.commands.build) blocks.push(`- Build: \`${config.commands.build}\``)
    if (config.commands.test) blocks.push(`- Test: \`${config.commands.test}\``)
    if (config.commands.lint) blocks.push(`- Lint: \`${config.commands.lint}\``)
    if (config.commands.typecheck) blocks.push(`- Typecheck: \`${config.commands.typecheck}\``)
    if (config.stack.testFramework) blocks.push(`- Test Framework: ${config.stack.testFramework}`)
    if (config.verification.requiredChecks.length > 0) {
      blocks.push("", "### Verification Rules", ...config.verification.requiredChecks.map(r => `- ${r}`))
    }
    if (config.agentInstructions.general.length > 0) {
      blocks.push("", "### Project Instructions", ...config.agentInstructions.general.map(i => `- ${i}`))
    }
    const roleInstructions = config.agentInstructions.perRole["qa"]
    if (roleInstructions?.length > 0) {
      blocks.push("", "### QA Instructions", ...roleInstructions.map(i => `- ${i}`))
    }
  }

  else if (role === "verification") {
    blocks.push("## Project Configuration (Auto-Verification)")
    if (config.commands.build) blocks.push(`- Build: \`${config.commands.build}\``)
    if (config.commands.test) blocks.push(`- Test: \`${config.commands.test}\``)
    if (config.commands.lint) blocks.push(`- Lint: \`${config.commands.lint}\``)
    if (config.commands.typecheck) blocks.push(`- Typecheck: \`${config.commands.typecheck}\``)
    if (config.stack.testFramework) blocks.push(`- Test Framework: ${config.stack.testFramework}`)
    if (config.verification.requiredChecks.length > 0) {
      blocks.push("", "### Auto-Checks", ...config.verification.requiredChecks.map(r => `- ${r}`))
    }
  }

  else if (role === "research") {
    blocks.push("## Project Configuration (Architecture)")
    blocks.push(`Architecture type: ${config.architecture.type}`)
    if (config.architecture.workspaces.length > 0) {
      blocks.push(`Workspaces: ${config.architecture.workspaces.join(", ")}`)
    }
    blocks.push(`Stack: ${config.stack.languages.join(", ")}`)
    blocks.push(`Frameworks: ${config.stack.frameworks.join(", ") || "None"}`)
    if (config.architecture.entryPoints.length > 0) {
      blocks.push("", "### Entry Points", ...config.architecture.entryPoints.map(e => `- ${e}`))
    }
    if (config.agentInstructions.general.length > 0) {
      blocks.push("", "### Project Instructions", ...config.agentInstructions.general.map(i => `- ${i}`))
    }
  }

  else {
    blocks.push(`## Project Configuration (${role})`)
    blocks.push(`Architecture: ${config.architecture.type}`)
    blocks.push(`Stack: ${config.stack.languages.join(", ")}`)
    if (config.commands.build) blocks.push(`Build: \`${config.commands.build}\``)
    if (config.commands.test) blocks.push(`Test: \`${config.commands.test}\``)
    if (config.agentInstructions.general.length > 0) {
      blocks.push("", "### Project Instructions", ...config.agentInstructions.general.map(i => `- ${i}`))
    }
  }

  return blocks.join("\n")
}

export function getCommandsForVerification(config: StructuredProjectConfig): {
  typecheckCommand: string
  lintCommand: string
  testCommand: string
  buildCommand: string
} {
  return {
    typecheckCommand: config.commands.typecheck ?? "npx tsc --noEmit 2>&1",
    lintCommand: config.commands.lint ?? "npx eslint --quiet --ext .ts,.tsx 2>&1 || true",
    testCommand: config.commands.test ?? "npx vitest run --reporter=verbose 2>&1",
    buildCommand: config.commands.build ?? "npx electron-vite build 2>&1",
  }
}
