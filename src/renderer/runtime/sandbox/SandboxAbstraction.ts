export type SandboxPlatform = 'linux' | 'win32' | 'darwin' | 'unknown'

export interface SandboxPolicy {
  readPaths: string[]
  writePaths: string[]
  network: boolean
  execPaths: string[]
  allowedSyscalls?: string[]
  maxMemory?: number
  maxProcesses?: number
  timeout?: number
}

export interface SandboxRequest {
  command: string
  args: string[]
  cwd: string
  policy: SandboxPolicy
  env?: Record<string, string>
}

export interface SandboxResult {
  pid: number
  constraints: string[]
  platform: SandboxPlatform
}

export abstract class SandboxAbstraction {
  abstract readonly platform: SandboxPlatform
  abstract readonly name: string

  abstract prepare(request: SandboxRequest): Promise<SandboxResult | null>
  abstract supportsPolicy(policy: SandboxPolicy): boolean

  getConstraints(policy: SandboxPolicy): string[] {
    const constraints: string[] = []

    if (policy.readPaths.length > 0) {
      constraints.push(`read: ${policy.readPaths.join(', ')}`)
    }
    if (policy.writePaths.length > 0) {
      constraints.push(`write: ${policy.writePaths.join(', ')}`)
    }
    if (policy.execPaths.length > 0) {
      constraints.push(`exec: ${policy.execPaths.join(', ')}`)
    }
    constraints.push(policy.network ? 'network: allowed' : 'network: blocked')
    if (policy.maxMemory) constraints.push(`max memory: ${policy.maxMemory}MB`)
    if (policy.maxProcesses) constraints.push(`max processes: ${policy.maxProcesses}`)
    if (policy.timeout) constraints.push(`timeout: ${policy.timeout}s`)

    return constraints
  }
}

export function detectPlatform(): SandboxPlatform {
  if (typeof process !== 'undefined' && process.platform) {
    switch (process.platform) {
      case 'linux': return 'linux'
      case 'win32': return 'win32'
      case 'darwin': return 'darwin'
    }
  }
  return 'unknown'
}
