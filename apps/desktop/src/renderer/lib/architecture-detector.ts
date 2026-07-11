export interface ArchitectureSummary {
  moduleBoundaries: ModuleBoundary[]
  language: string
  framework: string
  entryPoints: string[]
  hasTsconfig: boolean
  hasEslint: boolean
  hasVitest: boolean
}

export interface ModuleBoundary {
  type: string
  path: string
  exports: string[]
  imports: string[]
}

export interface DetectedProject {
  rootPath: string
  files: string[]
  language: string
  framework: string
  entryPoints: string[]
}

export class ArchitectureDetector {
  private knownExtensions: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".mts": "typescript",
    ".cts": "typescript",
  }

  private frameworkIndicators: Record<string, string[]> = {
    React: ["react", "react-dom", "react/jsx-runtime"],
    Vue: ["vue", "vue-router"],
    Angular: ["@angular/core", "@angular/platform-browser"],
    Svelte: ["svelte", "svelte/kit"],
    Next: ["next"],
    Express: ["express"],
    Fastify: ["fastify"],
  }

  detect(rootPath: string, files: string[]): {
    language: string
    framework: string
    entryPoints: string[]
    hasTsconfig: boolean
    hasEslint: boolean
    hasVitest: boolean
  } {
    const extensions = new Set(files.map(f => {
      const dot = f.lastIndexOf(".")
      return dot >= 0 ? f.slice(dot) : ""
    }))

    let language = "unknown"
    for (const [ext, lang] of Object.entries(this.knownExtensions)) {
      if (extensions.has(ext)) {
        language = lang
        break
      }
    }

    let framework = "Unknown"
    const fileSet = new Set(files.map(f => f.toLowerCase()))
    for (const [name, indicators] of Object.entries(this.frameworkIndicators)) {
      if (indicators.some(ind => fileSet.has(ind) || fileSet.has(`node_modules/${ind}/package.json`))) {
        framework = name
        break
      }
    }

    const entryPoints = files.filter(f =>
      /\/?(main|app|index)\.(ts|tsx|js|jsx)$/i.test(f)
    )

    return {
      language,
      framework,
      entryPoints,
      hasTsconfig: files.some(f => f === "tsconfig.json"),
      hasEslint: files.some(f => f.includes(".eslintrc") || f === ".eslintrc.json"),
      hasVitest: files.some(f => f.includes("vitest.config")),
    }
  }

  getArchitecture(rootPath: string, files: string[]): ArchitectureSummary {
    const detection = this.detect(rootPath, files)

    const moduleBoundaries: ModuleBoundary[] = []
    const componentPattern = /^(src\/)?(components|pages|screens|views|widgets)\//i
    const storePattern = /^(src\/)?(stores|state|store|redux)\//i
    const servicePattern = /^(src\/)?(services|api|graphql)\//i
    const utilPattern = /^(src\/)?(lib|utils|helpers|hooks)\//i
    const configPattern = /^(src\/)?(config|constants|types)\//i

    for (const file of files) {
      let type = "other"
      if (componentPattern.test(file)) type = "component"
      else if (storePattern.test(file)) type = "store"
      else if (servicePattern.test(file)) type = "service"
      else if (utilPattern.test(file)) type = "util"
      else if (configPattern.test(file)) type = "config"

      moduleBoundaries.push({
        type,
        path: file,
        exports: [],
        imports: [],
      })
    }

    return {
      moduleBoundaries,
      language: detection.language,
      framework: detection.framework,
      entryPoints: detection.entryPoints,
      hasTsconfig: detection.hasTsconfig,
      hasEslint: detection.hasEslint,
      hasVitest: detection.hasVitest,
    }
  }
}
