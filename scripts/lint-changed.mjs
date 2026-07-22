import { execFileSync } from 'node:child_process'

const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})

const files = output
  .split(/\r?\n/)
  .filter((file) => /^apps\/desktop\/src\/renderer\/.*\.(ts|tsx)$/.test(file))

if (files.length === 0) {
  console.log('No changed renderer TypeScript files to lint.')
  process.exit(0)
}

execFileSync(
  process.execPath,
  [
    '--max-old-space-size=4096',
    './node_modules/eslint/bin/eslint.js',
    ...files,
  ],
  { stdio: 'inherit' },
)
