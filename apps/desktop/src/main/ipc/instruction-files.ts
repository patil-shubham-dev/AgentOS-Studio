import { ipcMain, app } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join, normalize, sep } from 'path'

const INSTRUCTIONS_DIR = 'agent-instructions'

function getInstructionsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, INSTRUCTIONS_DIR)
  }
  return join(__dirname.split(`out${sep}main`)[0], INSTRUCTIONS_DIR)
}

function sanitizeInstructionPath(requestedPath: string): string | null {
  const normalized = normalize(requestedPath).replace(/^\.\.?(\\|\/)/g, '')
  if (normalized.startsWith('..')) return null
  const resolved = join(getInstructionsRoot(), normalized)
  const root = getInstructionsRoot()
  if (!resolved.startsWith(root)) return null
  return resolved
}

export function registerInstructionFileHandlers(): void {
  ipcMain.handle('read-instruction-file', async (_event, instructionPath: string) => {
    if (typeof instructionPath !== 'string' || instructionPath.length === 0) {
      throw new Error('Invalid instruction path')
    }
    const safePath = sanitizeInstructionPath(instructionPath)
    if (!safePath) {
      throw new Error(`Path traversal detected: "${instructionPath}"`)
    }
    if (!existsSync(safePath)) {
      throw new Error(`Instruction file not found: ${instructionPath}`)
    }
    return readFileSync(safePath, 'utf-8')
  })
}
