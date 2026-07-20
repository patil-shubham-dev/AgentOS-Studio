import js from '@eslint/js'
import globals from 'globals'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'out',
    'packages/*/dist',
    '**/__snapshots__',
    'tests/scratch',
    'tests/e2e/fixtures',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-unexpected-multiline': 'warn',
      'no-constant-binary-expression': 'warn',
      'require-yield': 'warn',
      'no-case-declarations': 'warn',
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^@/runtime$|^@/runtime/index$',
            message: 'Do not import from the runtime barrel. Import specific modules by their direct path instead.',
          },
        ],
      }],
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
  reactRefresh.configs.vite,
  {
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
])
