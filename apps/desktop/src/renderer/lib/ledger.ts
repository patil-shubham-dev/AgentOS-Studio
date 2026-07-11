import { useLedgerStore } from "@/stores/ledger-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { safeSetItem, safeGetItem } from "./safe-storage"

const LEDGER_FILE = "ledger.json"

/**
 * Get the filesystem path for ledger persistence.
 * Returns null if no workspace is open (falls back to localStorage).
 */
function getLedgerPath(): string | null {
  const rootPath = useWorkspaceStore.getState().rootPath
  if (!rootPath) return null
  return `${rootPath.replace(/\\+$/, "")}/.agentic-os/${LEDGER_FILE}`
}

/**
 * Write a text file via Tauri IPC. Falls back silently when not in Tauri env.
 */
async function writeFile(path: string, content: string): Promise<boolean> {
  try {
    const { invoke } = await import("@/lib/electron-api")
    await invoke("write_text_file", { path, content })
    return true
  } catch {
    return false
  }
}

/**
 * Read a text file via Tauri IPC. Falls back silently when not in Tauri env.
 */
async function readFile(path: string): Promise<string | null> {
  try {
    const { invoke } = await import("@/lib/electron-api")
    return await invoke<string>("read_text_file", { path })
  } catch {
    return null
  }
}

export async function persistLedger() {
  try {
    const data = JSON.stringify(useLedgerStore.getState().entries, null, 2)

    // Try filesystem first (Tauri environment with workspace open)
    const ledgerPath = getLedgerPath()
    if (ledgerPath) {
      const written = await writeFile(ledgerPath, data)
      if (written) return // success
    }

    // Fall back to localStorage
    safeSetItem(LEDGER_FILE, data)
  } catch (e) {
    console.error("Failed to persist ledger:", e)
  }
}

export async function loadLedger() {
  try {
    // Try filesystem first
    const ledgerPath = getLedgerPath()
    if (ledgerPath) {
      const data = await readFile(ledgerPath)
      if (data) {
        const entries = JSON.parse(data)
        if (Array.isArray(entries)) {
          useLedgerStore.getState().loadEntries(entries)
          return
        }
      }
    }

    // Fall back to localStorage
    const data = safeGetItem(LEDGER_FILE)
    if (data) {
      const entries = JSON.parse(data)
      if (Array.isArray(entries)) {
        useLedgerStore.getState().loadEntries(entries)
      }
    }
  } catch (e) {
    console.error("Failed to load ledger:", e)
  }
}
