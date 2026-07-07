import { useWorkspaceStore } from "@/stores/workspace-store"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"

interface InlineVerifyConfig {
  enabled: boolean
  command?: string
  timeoutMs: number
}

const DEFAULT_CONFIG: InlineVerifyConfig = {
  enabled: true,
  timeoutMs: 30_000,
}

async function detectBuildCommand(rootPath: string): Promise<string | null> {
  try {
    const mod = await import("@/lib/electron-api")
    const { readTextFile } = mod
    const pkg = await readTextFile(`${rootPath}/package.json`)
    if (pkg) {
      const parsed = JSON.parse(pkg)
      if (parsed.scripts?.build) return parsed.scripts.build.includes("tsc") ? "npx tsc --noEmit" : null
      if (parsed.scripts?.typecheck) return `npx ${parsed.scripts.typecheck}`
    }
  } catch { console.warn("[InlineVerification] Failed to read package.json") }
  return null
}

export interface VerifyResult {
  passed: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

export const InlineVerificationHook = {
  config: { ...DEFAULT_CONFIG },

  configure(overrides: Partial<InlineVerifyConfig>): void {
    this.config = { ...this.config, ...overrides }
  },

  async afterWrite(ctx: ToolContext, filePath: string): Promise<VerifyResult | null> {
    if (!this.config.enabled) return null

    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) return null

    const command = this.config.command ?? (await detectBuildCommand(rootPath))
    if (!command) return null

    const start = Date.now()
    try {
      const mod = await import("@/runtime/tools/implementations/BashTool")
      const result = await mod.BashTool.execute(ctx, {
        command,
        description: "Auto-verify after file write",
        timeout: this.config.timeoutMs,
      })
      const durationMs = Date.now() - start
      const output = (result.data as any)?.output ?? ""
      const exitCode = (result.data as any)?.exitCode ?? 0

      return {
        passed: exitCode === 0,
        exitCode,
        stdout: output,
        stderr: "",
        durationMs,
      }
    } catch (err) {
      return {
        passed: false,
        exitCode: -1,
        stdout: "",
        stderr: String(err),
        durationMs: Date.now() - start,
      }
    }
  },
}
