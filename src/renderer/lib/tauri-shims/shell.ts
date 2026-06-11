// Electron shim for @tauri-apps/plugin-shell

import { invoke } from './core'

export class Command {
  private program: string
  private args: string[]

  constructor(program: string, args: string[] = []) {
    this.program = program
    this.args = args
  }

  static create(program: string, args: string[] = []): Command {
    return new Command(program, args)
  }

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    const id = await invoke('terminal_create', { shellPath: this.program, cwd: process.cwd() })
    return { code: 0, stdout: `[Terminal ${id}]`, stderr: '' }
  }
}

export async function open(path: string): Promise<void> {
  window.open(path, '_blank')
}
