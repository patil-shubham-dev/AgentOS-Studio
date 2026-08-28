import { ipcMain } from "electron"
import { getVersion, isInstalled, listHarnesses, getInstallCandidates, getHarness, HARNESS_REGISTRY } from "../services/harness-registry"

export function registerHarnessIpcHandlers(): void {
  ipcMain.handle("harness:getVersion", (_event, name: string) => {
    if (!name || typeof name !== "string") throw new Error("Invalid harness name")
    if (!HARNESS_REGISTRY[name as keyof typeof HARNESS_REGISTRY]) throw new Error(`Unknown harness: ${name}`)
    return getVersion(name as keyof typeof HARNESS_REGISTRY)
  })

  ipcMain.handle("harness:isInstalled", (_event, name: string) => {
    if (!name || typeof name !== "string") throw new Error("Invalid harness name")
    if (!HARNESS_REGISTRY[name as keyof typeof HARNESS_REGISTRY]) throw new Error(`Unknown harness: ${name}`)
    return isInstalled(name as keyof typeof HARNESS_REGISTRY)
  })

  ipcMain.handle("harness:list", () => {
    return listHarnesses().map((name) => {
      const def = getHarness(name)
      const version = getVersion(name)
      return {
        name,
        displayName: def?.displayName,
        binary: def?.binary,
        version,
        installed: !!version,
        launchArgs: def?.launchArgs,
        install: def?.install,
      }
    })
  })

  ipcMain.handle("harness:getInstallCandidates", (_event, name: string) => {
    if (!name || typeof name !== "string") throw new Error("Invalid harness name")
    if (!HARNESS_REGISTRY[name as keyof typeof HARNESS_REGISTRY]) throw new Error(`Unknown harness: ${name}`)
    return getInstallCandidates(name as keyof typeof HARNESS_REGISTRY)
  })
}
