// Electron shim for @tauri-apps/plugin-fs

import { invoke } from './core'

export async function readTextFile(path: string): Promise<string> {
  return invoke('read_text_file', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke('write_text_file', { path, content })
}

export async function readDir(path: string): Promise<any[]> {
  return invoke('read_directory', { path })
}

export async function exists(path: string): Promise<boolean> {
  return invoke('file_exists', { path })
}

export async function mkdir(path: string): Promise<void> {
  return invoke('create_directory', { path })
}

export async function remove(path: string): Promise<void> {
  return invoke('delete_file', { path })
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath })
}

export async function stat(path: string): Promise<any> {
  return invoke('get_file_stats', { path })
}

export async function readFile(path: string): Promise<Uint8Array> {
  const b64 = await invoke('read_binary_file', { path })
  const binaryStr = atob(b64 as string)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  let binary = ''
  for (let i = 0; i < contents.length; i++) {
    binary += String.fromCharCode(contents[i])
  }
  const b64 = btoa(binary)
  return invoke('write_binary_file', { path, data: b64 })
}

export enum BaseDirectory {
  AppData = 'appData',
  AppConfig = 'appConfig',
  AppCache = 'appCache',
  AppDataDir = 'appDataDir',
  Audio = 'audio',
  Cache = 'cache',
  Config = 'config',
  Data = 'data',
  Desktop = 'desktop',
  Document = 'document',
  Download = 'download',
  Executable = 'executable',
  Font = 'font',
  Home = 'home',
  LocalData = 'localData',
  Log = 'log',
  Picture = 'picture',
  Public = 'public',
  Resource = 'resource',
  RoamingAppData = 'roamingAppData',
  Runtime = 'runtime',
  Temp = 'temp',
  Template = 'template',
  Video = 'video'
}
