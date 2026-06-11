// Electron shim for @tauri-apps/plugin-notification

import { invoke } from './core'

export async function isPermissionGranted(): Promise<boolean> {
  return invoke('notification_is_supported')
}

export async function requestPermission(): Promise<string> {
  return 'granted'
}

export async function notify(options: { title: string; body?: string; icon?: string }): Promise<void> {
  await invoke('notification_show', options)
}

export async function sendNotification(options: { title: string; body?: string }): Promise<void> {
  await invoke('notification_show', options)
}
