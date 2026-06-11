export interface GitStatus {
  branch: string
  changes: GitChange[]
  ahead: number
  behind: number
}

export interface GitChange {
  path: string
  status: string
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  timestamp: string
}

import { normalizeError } from "./normalize-error"

const GIT_TIMEOUT_MS = 30_000

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core")
    const result = await tauriInvoke<T>(cmd, args)
    return result
  } catch (err) {
    const msg = normalizeError(err, "Unknown error")
    throw new Error(`Git ${cmd} failed: ${msg}`)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Git ${operation} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

export async function gitStatus(workingDir: string): Promise<GitStatus> {
  return withTimeout(invoke<GitStatus>("git_status", { workingDir }), GIT_TIMEOUT_MS, "status")
}

export async function gitLog(workingDir: string, maxCount?: number): Promise<GitCommit[]> {
  return withTimeout(invoke<GitCommit[]>("git_log", { workingDir, maxCount: maxCount ?? 20 }), GIT_TIMEOUT_MS, "log")
}

export async function gitDiff(workingDir: string, file: string): Promise<string> {
  return withTimeout(invoke<string>("git_diff", { workingDir, file }), GIT_TIMEOUT_MS, "diff")
}

export async function gitCommit(workingDir: string, message: string): Promise<string> {
  return withTimeout(invoke<string>("git_commit", { workingDir, message }), GIT_TIMEOUT_MS, "commit")
}

export async function gitRestore(workingDir: string, file: string): Promise<string> {
  return withTimeout(invoke<string>("git_restore", { workingDir, file }), GIT_TIMEOUT_MS, "restore")
}

export async function gitInit(workingDir: string): Promise<string> {
  return withTimeout(invoke<string>("git_init", { workingDir }), GIT_TIMEOUT_MS, "init")
}

export async function gitPush(workingDir: string, remote?: string, branch?: string): Promise<string> {
  return withTimeout(invoke<string>("git_push", { workingDir, remote: remote ?? "origin", branch }), GIT_TIMEOUT_MS, "push")
}

export async function gitPull(workingDir: string, remote?: string, branch?: string): Promise<string> {
  return withTimeout(invoke<string>("git_pull", { workingDir, remote: remote ?? "origin", branch }), GIT_TIMEOUT_MS, "pull")
}

export async function gitBranchList(workingDir: string): Promise<string[]> {
  return withTimeout(invoke<string[]>("git_branch_list", { workingDir }), GIT_TIMEOUT_MS, "branch list")
}

export async function gitCheckout(workingDir: string, branch: string): Promise<string> {
  return withTimeout(invoke<string>("git_checkout", { workingDir, branch }), GIT_TIMEOUT_MS, "checkout")
}
