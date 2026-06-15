import { ipcMain, app } from "electron"
import { VerificationService } from "./VerificationService"

let service: VerificationService | null = null

function getService(): VerificationService {
  if (!service) service = new VerificationService()
  return service
}

export function registerVerificationHandlers(): void {
  const projectRoot = app.isPackaged ? process.resourcesPath : __dirname.split("\\out\\main")[0]

  ipcMain.handle("verification:run-command", async (_event, command: string, timeout?: number) => {
    return getService().runCommand(command, projectRoot, timeout)
  })

  ipcMain.handle("verification:run-benchmarks", async () => {
    return getService().runBenchmarks(projectRoot)
  })

  ipcMain.handle("verification:security-scan", async (_event, changedFiles: string[]) => {
    return getService().securityScan(changedFiles, projectRoot)
  })

  ipcMain.handle("verification:regression-scan", async () => {
    return getService().regressionScan(projectRoot)
  })

  ipcMain.handle("verification:verify-changes", async (_event, changedFiles: string[]) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)
    try {
      return await getService().verifyChanges(changedFiles, projectRoot, controller.signal)
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle("verification:run-stage", async (_event, stage: string, command: string) => {
    return getService().runStage(stage, command, projectRoot)
  })

  ipcMain.handle("verification:auto-fix", async () => {
    return getService().autoFix(projectRoot)
  })
}
