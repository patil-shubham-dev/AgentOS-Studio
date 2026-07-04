import { SandboxAbstraction, detectPlatform } from './SandboxAbstraction'
import { WindowsSandbox } from './WindowsSandbox'
import { LinuxSandbox } from './LinuxSandbox'
import { MacSandbox } from './MacSandbox'
import { generatePolicy, isKnownCommand, getCommandCategory } from './PolicyGenerator'
import type { SandboxPolicy, SandboxRequest, SandboxResult } from './SandboxAbstraction'

export { SandboxAbstraction, detectPlatform }
export { WindowsSandbox } from './WindowsSandbox'
export { LinuxSandbox } from './LinuxSandbox'
export { MacSandbox } from './MacSandbox'
export { generatePolicy, isKnownCommand, getCommandCategory } from './PolicyGenerator'
export type { SandboxPolicy, SandboxRequest, SandboxResult }

let _backend: SandboxAbstraction | null = null
let _enabled = false

export function getSandboxBackend(): SandboxAbstraction | null {
  if (_backend) return _backend
  const platform = detectPlatform()
  switch (platform) {
    case 'win32':
      _backend = new WindowsSandbox()
      break
    case 'linux':
      _backend = new LinuxSandbox()
      break
    case 'darwin':
      _backend = new MacSandbox()
      break
    default:
      _backend = null
  }
  return _backend
}

export function setSandboxEnabled(enabled: boolean): void {
  _enabled = enabled
}

export function isSandboxEnabled(): boolean {
  return _enabled
}

export async function sandboxCommand(request: SandboxRequest): Promise<SandboxResult | null> {
  if (!_enabled) return null
  const backend = getSandboxBackend()
  if (!backend) return null
  if (!backend.supportsPolicy(request.policy)) return null
  return backend.prepare(request)
}
