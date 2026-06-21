/**
 * ConfigGenerator
 *
 * Analyzes a project's file structure and configuration to generate
 * a tailored AGENTIC.md file. Scans for:
 *   - package.json → build scripts, dependencies, test framework
 *   - tsconfig.json → language, strictness
 *   - Config files → linters, formatters, test runners
 *   - Directory structure → project layout
 *
 * Usage:
 *   const gen = new ConfigGenerator()
 *   const content = await gen.generate(rootPath)
 *   await gen.write(rootPath, content)
 */

import { isTauri } from "@/runtime/environment"

export interface ProjectProfile {
  /** Detected languages (e.g. ["TypeScript", "CSS"]) */
  languages: string[]
  /** Detected frameworks (e.g. ["React", "Express"]) */
  frameworks: string[]
  /** Build tool (e.g. "Vite", "Webpack", "Next.js") */
  buildTool: string | null
  /** Test framework (e.g. "Vitest", "Jest", "Playwright") */
  testFramework: string | null
  /** Linter (e.g. "ESLint") */
  linter: string | null
  /** Package manager (e.g. "npm", "pnpm", "yarn") */
  packageManager: string | null
  /** Build command from package.json scripts */
  buildCommand: string | null
  /** Test command from package.json scripts */
  testCommand: string | null
  /** Lint command from package.json scripts */
  lintCommand: string | null
  /** Project structure summary */
  structure: string
  /** Whether TypeScript is used */
  isTypeScript: boolean
  /** Whether strict mode is enabled */
  isStrictMode: boolean
}

const KNOWN_TEST_FRAMEWORKS = [
  { key: "vitest", name: "Vitest" },
  { key: "jest",   name: "Jest" },
  { key: "mocha",  name: "Mocha" },
  { key: "jasmine", name: "Jasmine" },
  { key: "playwright", name: "Playwright" },
  { key: "cypress", name: "Cypress" },
  { key: "ava",    name: "AVA" },
  { key: "tape",   name: "Tape" },
]

const KNOWN_FRAMEWORKS = [
  { key: "react",         name: "React" },
  { key: "next",          name: "Next.js" },
  { key: "vue",           name: "Vue.js" },
  { key: "svelte",        name: "Svelte" },
  { key: "express",       name: "Express" },
  { key: "fastify",       name: "Fastify" },
  { key: "nestjs",        name: "NestJS" },
  { key: "hono",          name: "Hono" },
  { key: "remix",         name: "Remix" },
  { key: "astro",         name: "Astro" },
  { key: "solid-js",      name: "Solid.js" },
  { key: "tailwindcss",   name: "Tailwind CSS" },
  { key: "shadcn",        name: "shadcn/ui" },
  { key: "@radix-ui",     name: "Radix UI" },
  { key: "framer-motion", name: "Framer Motion" },
]

export class ConfigGenerator {
  /**
   * Generate the full AGENTIC.md content for a project.
   */
  async generate(rootPath: string): Promise<string> {
    const profile = await this.scan(rootPath)
    const sections: string[] = []

    // Header
    sections.push(`# AgenticOS Project Configuration\n\n<!-- Auto-generated from project scan. Customize this file for your project. -->\n`)

    // Build & Test Commands
    sections.push(`## Build & Test Commands`)
    if (profile.buildCommand) sections.push(`- Build: \`${profile.buildCommand}\``)
    if (profile.testCommand) sections.push(`- Test: \`${profile.testCommand}\``)
    if (profile.lintCommand) sections.push(`- Lint: \`${profile.lintCommand}\``)
    sections.push(`- Typecheck: \`npm run typecheck\`${profile.isStrictMode ? " (strict mode)" : ""}`)
    sections.push(``)

    // Coding Standards
    sections.push(`## Coding Standards`)
    sections.push(`- Language: ${profile.languages.join(", ")}`)
    sections.push(`- Framework: ${profile.frameworks.join(", ") || "None detected"}`)
    sections.push(`- Package Manager: ${profile.packageManager ?? "npm"}`)
    sections.push(`- Build Tool: ${profile.buildTool ?? "Unknown"}`)
    if (profile.testFramework) sections.push(`- Testing: ${profile.testFramework}`)
    if (profile.linter) sections.push(`- Linting: ${profile.linter}`)
    sections.push(``)

    // Project Structure
    sections.push(`## Project Structure`)
    sections.push("```")
    sections.push(profile.structure || "No structure detected")
    sections.push("```\n")

    // Best Practices placeholder
    sections.push(`## Best Practices & Conventions`)
    sections.push(`<!-- Add project-specific conventions here: -->`)
    sections.push(`- \`\`\``)
    sections.push(`- `)
    sections.push(`- \`\`\``)
    sections.push(``)

    return sections.join("\n")
  }

  /**
   * Scan a project directory to build a profile.
   */
  async scan(rootPath: string): Promise<ProjectProfile> {
    const profile: ProjectProfile = {
      languages: [],
      frameworks: [],
      buildTool: null,
      testFramework: null,
      linter: null,
      packageManager: null,
      buildCommand: null,
      testCommand: null,
      lintCommand: null,
      structure: "",
      isTypeScript: false,
      isStrictMode: false,
    }

    // Detect package manager from lockfiles
    try {
      if (isTauri()) {
        const { readDir } = await import("@/lib/electron-api")
        const entries = await readDir(rootPath)
        const names = entries.map((e: any) => e.name?.toLowerCase() ?? "")

        if (names.includes("pnpm-lock.yaml"))     profile.packageManager = "pnpm"
        else if (names.includes("yarn.lock"))      profile.packageManager = "yarn"
        else if (names.includes("package-lock.json")) profile.packageManager = "npm"
        else if (names.includes("bun.lock"))        profile.packageManager = "bun"
      }
    } catch { /* ignore */ }

    // Parse package.json
    try {
      const pkg = await this.readJson(rootPath, "package.json")
      if (pkg) {
        const scripts = (pkg as any).scripts ?? {}

        // Detect test framework from devDependencies
        const allDeps = { ...(pkg as any).dependencies, ...(pkg as any).devDependencies }
        for (const { key, name } of KNOWN_TEST_FRAMEWORKS) {
          if (allDeps[key]) {
            profile.testFramework = name
            break
          }
        }

        // Detect frameworks from dependencies
        for (const { key, name } of KNOWN_FRAMEWORKS) {
          if (allDeps[key]) {
            profile.frameworks.push(name)
          }
        }

        // Detect language from devDependencies
        if (allDeps["typescript"]) {
          profile.isTypeScript = true
          profile.languages.push("TypeScript")
        }

        // Build commands
        if (scripts.build) profile.buildCommand = `npm run build`
        if (scripts.test) profile.testCommand = `npm run test`
        if (scripts.lint) profile.lintCommand = `npm run lint`
        if (scripts["typecheck"]) {} // available

        // Build tool detection
        if (allDeps["vite"])         profile.buildTool = "Vite"
        else if (allDeps["next"])    profile.buildTool = "Next.js"
        else if (allDeps["webpack"]) profile.buildTool = "Webpack"
        else if (allDeps["esbuild"]) profile.buildTool = "esbuild"
        else if (allDeps["tsup"])    profile.buildTool = "tsup"
      }
    } catch { /* ignore */ }

    // Detect linter
    try {
      const entries = await this.readDir(rootPath)
      const names = entries.map((e: any) => e.name?.toLowerCase() ?? "")
      if (names.some((n: string) => n.includes("eslint")))        profile.linter = "ESLint"
      else if (names.some((n: string) => n.includes("biome")))     profile.linter = "Biome"
      else if (names.some((n: string) => n.includes("prettier")))  profile.linter = "Prettier"
    } catch { /* ignore */ }

    // Parse tsconfig.json
    try {
      const tsconfig = await this.readJson(rootPath, "tsconfig.json")
      if (tsconfig) {
        profile.isTypeScript = true
        if (!profile.languages.includes("TypeScript")) profile.languages.push("TypeScript")
        const compilerOptions = (tsconfig as any).compilerOptions ?? {}
        profile.isStrictMode = compilerOptions.strict === true ||
          compilerOptions.noImplicitAny === true
      }
    } catch { /* ignore */ }

    // CSS files → detect styling language
    try {
      const entries = await this.readDir(rootPath)
      const names = entries.map((e: any) => e.name?.toLowerCase() ?? "")
      if (names.some((n: string) => n.endsWith(".css") || n.endsWith(".scss"))) {
        profile.languages.push("CSS")
      }
    } catch { /* ignore */ }

    return profile
  }

  /**
   * Write the generated AGENTIC.md to the project root.
   */
  async write(rootPath: string, content: string): Promise<boolean> {
    try {
      if (isTauri()) {
        const { writeTextFile } = await import("@/lib/electron-api")
        await writeTextFile(`${rootPath}/AGENTIC.md`, content)
        return true
      }
      return false
    } catch (err) {
      console.error("[ConfigGenerator] Failed to write AGENTIC.md:", err)
      return false
    }
  }

  // ── Private helpers ──

  private async readJson(rootPath: string, filename: string): Promise<unknown | null> {
    try {
      if (isTauri()) {
        const { readTextFile } = await import("@/lib/electron-api")
        const content = await readTextFile(`${rootPath}/${filename}`)
        return JSON.parse(content)
      }
      return null
    } catch {
      return null
    }
  }

  private async readDir(path: string): Promise<Array<{ name: string }>> {
    try {
      if (isTauri()) {
        const { readDir } = await import("@/lib/electron-api")
        return await readDir(path)
      }
      return []
    } catch {
      return []
    }
  }
}

/** Singleton instance */
export const configGenerator = new ConfigGenerator()
