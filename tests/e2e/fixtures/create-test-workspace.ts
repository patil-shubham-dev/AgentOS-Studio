import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface TestWorkspace {
  root: string
  cleanup: () => void
}

const STRUCTURE: Record<string, string | null> = {
  'src/index.ts': `console.log("hello world");\n`,
  'src/utils/helpers.ts': `export function add(a: number, b: number): number { return a + b; }\n`,
  'src/utils/strings.ts': `export function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }\n`,
  'src/components/App.tsx': `import React from 'react';\nexport const App: React.FC = () => <div>Hello</div>;\n`,
  'src/components/Button.tsx': `import React from 'react';\nexport const Button: React.FC<{ label: string }> = ({ label }) => <button>{label}</button>;\n`,
  'src/styles/main.css': `body { margin: 0; padding: 0; }\n`,
  'README.md': `# Test Workspace\n\nA fixture for workspace E2E tests.\n`,
  'package.json': JSON.stringify({ name: 'test-workspace', version: '1.0.0' }, null, 2) + '\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs' } }, null, 2) + '\n',
  '.gitignore': 'node_modules/\ndist/\n',
}

export function createTestWorkspace(): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'agentic-ws-test-'))

  for (const [filePath, content] of Object.entries(STRUCTURE)) {
    const fullPath = join(root, filePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    if (content !== null) {
      writeFileSync(fullPath, content, 'utf-8')
    } else {
      mkdirSync(fullPath, { recursive: true })
    }
  }

  return {
    root,
    cleanup: () => {
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true })
      }
    },
  }
}
