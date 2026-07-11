import { SandboxAbstraction, type SandboxPlatform, type SandboxPolicy, type SandboxRequest, type SandboxResult } from './SandboxAbstraction'

export class WindowsSandbox extends SandboxAbstraction {
  readonly platform: SandboxPlatform = 'win32'
  readonly name = 'Windows Job Object + AppContainer'

  async prepare(request: SandboxRequest): Promise<SandboxResult | null> {
    const { command, args, cwd, policy, env } = request

    const constraints: string[] = this.getConstraints(policy)

    const envVars = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : undefined

    try {
      const result = await window.electronAPI?.sandboxExec({
        command,
        args,
        cwd,
        policy: this.toMainPolicy(policy),
        env: envVars,
      })

      if (!result || result.error) {
        console.warn('[WindowsSandbox] Sandbox exec failed:', result?.error)
        return null
      }

      return {
        pid: result.pid,
        constraints,
        platform: 'win32',
      }
    } catch (e) {
      console.warn('[WindowsSandbox] Error:', e)
      return null
    }
  }

  supportsPolicy(policy: SandboxPolicy): boolean {
    return true
  }

  private toMainPolicy(policy: SandboxPolicy) {
    return {
      readPaths: policy.readPaths,
      writePaths: policy.writePaths,
      network: policy.network,
      execPaths: policy.execPaths,
      maxMemory: policy.maxMemory,
      maxProcesses: policy.maxProcesses,
      timeout: policy.timeout,
    }
  }
}
