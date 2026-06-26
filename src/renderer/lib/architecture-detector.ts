export interface ArchitectureSummary {
  framework: string
  entryPoints: string[]
  moduleBoundaries: ModuleBoundary[]
  routingStructure?: string[]
  dataFlowPatterns?: string[]
  buildTool: string
  testFramework: string
  stateManagement?: string
  stylingApproach?: string
}

export interface ModuleBoundary {
  name: string
  files: string[]
  type: "page" | "component" | "service" | "store" | "lib" | "route" | "test" | "config"
}

export interface DetectedProject {
  name: string
  language: "typescript" | "javascript" | "unknown"
  framework: string
  entryPoints: string[]
  hasTsconfig: boolean
  hasEslint: boolean
  hasVitest: boolean
  hasJest: boolean
  hasPlaywright: boolean
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

export class ArchitectureDetector {
  private summary: ArchitectureSummary | null = null
  private detected: DetectedProject | null = null

  detect(projectRoot: string, filePaths: string[]): DetectedProject {
    const pkg = this.readPackageJson(projectRoot)
    const deps = pkg?.dependencies ?? {}
    const devDeps = pkg?.devDependencies ?? {}

    const framework = this.detectFramework(deps, devDeps, filePaths)
    const entryPoints = this.findEntryPoints(filePaths, pkg)

    const detected: DetectedProject = {
      name: pkg?.name ?? projectRoot.split(/[/\\]/).pop() ?? "Project",
      language: this.detectLanguage(filePaths),
      framework,
      entryPoints,
      hasTsconfig: filePaths.some((p) => p.endsWith("tsconfig.json")),
      hasEslint: !!(deps.eslint || devDeps.eslint),
      hasVitest: !!(deps.vitest || devDeps.vitest),
      hasJest: !!(deps.jest || devDeps.jest),
      hasPlaywright: !!(devDeps["@playwright/test"]),
      dependencies: deps,
      devDependencies: devDeps,
    }

    this.detected = detected
    return detected
  }

  getArchitecture(projectRoot: string, filePaths: string[]): ArchitectureSummary {
    const detected = this.detect(projectRoot, filePaths)
    const boundaries = this.detectModuleBoundaries(filePaths)

    const summary: ArchitectureSummary = {
      framework: detected.framework,
      entryPoints: detected.entryPoints,
      moduleBoundaries: boundaries,
      buildTool: this.detectBuildTool(detected.dependencies, detected.devDependencies),
      testFramework: detected.hasVitest ? "vitest" : detected.hasJest ? "jest" : "unknown",
      stateManagement: this.detectStateManagement(detected.dependencies),
      stylingApproach: this.detectStyling(detected.dependencies),
    }

    const routing = this.detectRouting(detected.dependencies, filePaths)
    if (routing) summary.routingStructure = routing

    const dataFlows = this.detectDataFlowPatterns(detected.dependencies, filePaths)
    if (dataFlows.length > 0) summary.dataFlowPatterns = dataFlows

    this.summary = summary
    return summary
  }

  private detectFramework(deps: Record<string, string>, devDeps: Record<string, string>, filePaths: string[]): string {
    if (deps.next || filePaths.some((p) => p.includes("next.config"))) return "Next.js"
    if (deps.react || deps["react-dom"]) {
      if (filePaths.some((p) => p.includes("vite.config") || p.includes("vite-env"))) return "React + Vite"
      if (deps["react-router"] || deps["react-router-dom"]) return "React + React Router"
      return "React"
    }
    if (deps.vue || deps["vue-router"]) return "Vue"
    if (deps.svelte) return "Svelte"
    if (deps.angular || deps["@angular/core"]) return "Angular"
    if (deps.electron || devDeps.electron) return "Electron"
    if (deps.express) return "Express.js"
    if (deps.nest) return "NestJS"
    return "Unknown"
  }

  private findEntryPoints(filePaths: string[], pkg?: { main?: string; module?: string } | null): string[] {
    const entries: string[] = []
    const entryCandidates = ["main.ts", "main.tsx", "index.ts", "index.tsx", "app.ts", "app.tsx", "server.ts", "cli.ts"]
    for (const candidate of entryCandidates) {
      const match = filePaths.find((p) => p.endsWith(candidate) || p.endsWith(`src/${candidate}`))
      if (match) entries.push(match)
    }
    if (entries.length === 0 && pkg) {
      const mainField = pkg.main || pkg.module
      if (mainField) entries.push(mainField)
    }
    return entries
  }

  private detectModuleBoundaries(filePaths: string[]): ModuleBoundary[] {
    const groups = new Map<string, string[]>()
    for (const p of filePaths) {
      const parts = p.replace(/\\/g, "/").split("/")
      if (parts.length < 2) continue
      const dir = parts[parts.length - 2]
      if (!groups.has(dir)) groups.set(dir, [])
      groups.get(dir)!.push(p)
    }

    const boundaries: ModuleBoundary[] = []
    for (const [name, files] of groups) {
      let type: ModuleBoundary["type"] = "lib"
      if (files.some((f) => f.includes(".test.") || f.includes(".spec."))) type = "test"
      else if (name === "pages" || name === "routes") type = "page"
      else if (name === "components") type = "component"
      else if (name === "stores" || name === "store") type = "store"
      else if (name === "services" || name === "api") type = "service"
      else if (name === "config") type = "config"

      boundaries.push({ name, files, type })
    }
    return boundaries
  }

  private detectBuildTool(deps: Record<string, string>, devDeps: Record<string, string>): string {
    if (devDeps.vite) return "Vite"
    if (devDeps.webpack) return "Webpack"
    if (devDeps.esbuild) return "esbuild"
    if (devDeps.turbopack || deps.next) return "Next.js (built-in)"
    if (devDeps["@electron-forge/cli"]) return "Electron Forge"
    if (devDeps.electron) return "Electron (custom)"
    return "Unknown"
  }

  private detectStateManagement(deps: Record<string, string>): string | undefined {
    if (deps.zustand) return "Zustand"
    if (deps.redux || deps["@reduxjs/toolkit"]) return "Redux"
    if (deps.mobx) return "MobX"
    if (deps.pinia || deps.vuex) return "Pinia/Vuex"
    if (deps.jotai) return "Jotai"
    if (deps.recoil) return "Recoil"
    return undefined
  }

  private detectStyling(deps: Record<string, string>): string | undefined {
    if (deps.tailwindcss || deps["@tailwindcss/vite"]) return "Tailwind CSS"
    if (deps["styled-components"]) return "Styled Components"
    if (deps["@emotion/react"]) return "Emotion"
    if (deps.sass || deps["sass-embedded"]) return "Sass/SCSS"
    if (deps["styled-jsx"]) return "Styled JSX"
    return undefined
  }

  private detectRouting(deps: Record<string, string>, filePaths: string[]): string[] | undefined {
    const routes: string[] = []
    if (deps["react-router"] || deps["react-router-dom"]) {
      const routeFiles = filePaths.filter((p) => p.includes("router") || p.includes("routes") || p.includes("navigation"))
      if (routeFiles.length > 0) routes.push(...routeFiles)
    }
    if (filePaths.some((p) => p.startsWith("pages/"))) {
      const pageDirs = new Set(filePaths.filter((p) => p.startsWith("pages/")).map((p) => p.split("/").slice(0, 2).join("/")))
      routes.push(...Array.from(pageDirs))
    }
    if (filePaths.some((p) => p.startsWith("src/app/"))) {
      routes.push("App Router (Next.js 13+)")
    }
    return routes.length > 0 ? routes : undefined
  }

  private detectDataFlowPatterns(deps: Record<string, string>, filePaths: string[]): string[] {
    const patterns: string[] = []
    if (deps.zustand || deps.redux || deps["@reduxjs/toolkit"]) patterns.push("unidirectional (Flux/Redux)")
    if (deps.mobx) patterns.push("observable (MobX)")
    if (deps.rxjs) patterns.push("reactive streams (RxJS)")
    if (deps.graphql || deps["@apollo/client"]) patterns.push("GraphQL queries/mutations")
    if (deps["react-query"] || deps["@tanstack/react-query"]) patterns.push("server state fetching (React Query)")
    if (deps.swr) patterns.push("server state fetching (SWR)")
    if (filePaths.some((p) => p.includes("event") || p.includes("emitter") || p.includes("pubsub"))) patterns.push("event-driven")
    if (filePaths.some((p) => p.includes("middleware") || p.includes("interceptor"))) patterns.push("middleware chain")
    if (Object.keys(deps).some((d) => d.includes("i18n") || d.includes("intl"))) patterns.push("i18n internationalization")
    return patterns
  }

  private detectLanguage(filePaths: string[]): "typescript" | "javascript" | "unknown" {
    if (filePaths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx"))) return "typescript"
    if (filePaths.some((p) => p.endsWith(".js") || p.endsWith(".jsx"))) return "javascript"
    return "unknown"
  }

  private readPackageJson(projectRoot: string): { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
    try {
      const fs = require("fs")
      const pkgPath = `${projectRoot}/package.json`
      if (fs.existsSync(pkgPath)) {
        return JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
      }
    } catch {
    }
    return null
  }

}
