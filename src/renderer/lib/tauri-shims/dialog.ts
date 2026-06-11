// Electron shim for @tauri-apps/plugin-dialog

import { invoke } from './core'

export async function open(options?: any): Promise<any> {
  return invoke('dialog_open', { options })
}

export async function save(options?: any): Promise<any> {
  return invoke('dialog_save', { options })
}

export async function message(message: string, options?: any): Promise<void> {
  await invoke('dialog_message', { options: { ...options, message } })
}

export async function ask(message: string, options?: any): Promise<boolean> {
  const result = await invoke('dialog_message', { options: { ...options, message, buttons: ['Yes', 'No'] } })
  return result?.response === 0
}

export async function confirm(message: string, options?: any): Promise<boolean> {
  const result = await invoke('dialog_message', { options: { ...options, message, buttons: ['OK', 'Cancel'] } })
  return result?.response === 0
}
