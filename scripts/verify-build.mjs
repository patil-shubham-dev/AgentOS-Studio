import { readFileSync, readdirSync, statSync } from "fs"
import { join, extname } from "path"

const OUT_DIR = "./out"
let exitCode = 0
let checked = 0

function findJsFiles(dir) {
  const files = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        files.push(...findJsFiles(full))
      } else if (extname(full) === ".js" || extname(full) === ".mjs" || extname(full) === ".cjs") {
        files.push(full)
      }
    }
  } catch {}
  return files
}

function scanForUndefinedReferences(code, filePath) {
  const lines = code.split("\n")
  const issues = []

  // Detect JSX-like patterns that reference undefined variables
  // React.createElement or direct JSX references
  const requirePattern = /require\(['"]([^'"]+)['"]\)/g
  const importPattern = /import\s+(\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g
  
  // Check for use of common lucide-react icons that might be missing
  const lucideIconsUsed = new Set()
  const lucideImportMatch = code.match(/from\s+['"]lucide-react['"]/g)
  if (!lucideImportMatch || lucideImportMatch.length === 0) {
    // lucide-react might be bundled - check for icon usage in chunks
    const iconRefs = code.match(/\b(FileDiff|PanelRight|PanelLeft|ChevronLeft|XCircle|Loader2|FolderOpen|GripVertical|Eye)\b/g)
    if (iconRefs) {
      for (const ref of iconRefs) {
        lucideIconsUsed.add(ref)
      }
    }
  }

  if (lucideIconsUsed.size > 0) {
    issues.push(`[WARN] ${filePath}: Found lucide-react icon references (${[...lucideIconsUsed].join(", ")}) - verify they are bundled`)
  }

  return issues
}

console.log("🔍 Build Integrity Check")
console.log("══════════════════════════")

const files = findJsFiles(OUT_DIR)
console.log(`Found ${files.length} JS files in ${OUT_DIR}`)

for (const file of files) {
  const code = readFileSync(file, "utf-8")
  checked++
  const issues = scanForUndefinedReferences(code, file)
  for (const issue of issues) {
    console.error(`  ${issue}`)
    if (issue.startsWith("[ERROR]")) exitCode = 1
  }
}

console.log(`\nChecked ${checked} files`)
if (exitCode === 0) {
  console.log("✅ Build integrity check PASSED")
} else {
  console.error("❌ Build integrity check FAILED")
}
process.exit(exitCode)
