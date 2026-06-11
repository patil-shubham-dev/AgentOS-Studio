// Electron shim for @tauri-apps/plugin-clipboard-manager

import { invoke } from './core'

export async function writeText(text: string): Promise<void> {
  return invoke('clipboard_write_text', { text })
}

export async function readText(): Promise<string> {
  return invoke('clipboard_read_text')
}

export async function writeImage(image: string): Promise<void> {
  return invoke('clipboard_write_image', { data: image })
}

export async function readImage(): Promise<string> {
  return invoke('clipboard_read_image')
}
