import { SandboxAbstraction, type SandboxPlatform, type SandboxPolicy, type SandboxRequest, type SandboxResult } from './SandboxAbstraction'

export class MacSandbox extends SandboxAbstraction {
  readonly platform: SandboxPlatform = 'darwin'
  readonly name = 'macOS sandbox-exec'

  async prepare(request: SandboxRequest): Promise<SandboxResult | null> {
    const { command, args, cwd, policy, env } = request
    const constraints: string[] = this.getConstraints(policy)

    try {
      const result = await window.electronAPI?.sandboxExec({
        command,
        args,
        cwd,
        policy: this.toMainPolicy(policy),
        env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined,
      })

      if (!result || result.error) {
        console.warn('[MacSandbox] Sandbox exec failed:', result?.error)
        return null
      }

      return {
        pid: result.pid,
        constraints,
        platform: 'darwin',
      }
    } catch (e) {
      console.warn('[MacSandbox] Error:', e)
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
