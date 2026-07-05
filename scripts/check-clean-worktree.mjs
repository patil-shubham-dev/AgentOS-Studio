import { execSync } from "node:child_process"
import process from "node:process"

if (process.env.SKIP_CLEAN_WORKTREE_CHECK) {
  process.exit(0)
}

let status
try {
  status = execSync("git status --porcelain", {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim()
} catch {
  // Not a git repo — cannot check, skip guard
  process.exit(0)
}

const lines = status
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
const dirty = lines

if (dirty.length > 0) {
  console.error("")
  console.error(
    "  \x1b[41m\x1b[97m\x1b[1m FATAL \x1b[0m Working tree has uncommitted changes — refusing to run tests."
  )
  console.error("")
  console.error(
    "  Tests were run against uncommitted state, but the audit found 16 items"
  )
  console.error(
    "  that were described as 'done' but never actually committed. This guard"
  )
  console.error(
    "  exists to prevent that gap from happening again."
  )
  console.error("")
  console.error("  \x1b[1mCommit or stash these changes first:\x1b[0m")
  console.error("")
  for (const line of dirty) {
    console.error("    " + line)
  }
  console.error("")
  console.error(
    "  \x1b[2mSet SKIP_CLEAN_WORKTREE_CHECK=1 to bypass this guard.\x1b[0m"
  )
  console.error("")
  process.exit(1)
}
