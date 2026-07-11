import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/desktop/src/renderer'),
      '@agentic-os/shared': resolve(__dirname, 'packages/shared/src'),
      '@agentic-os/ui': resolve(__dirname, 'packages/ui/src'),
      '@agentic-os/providers': resolve(__dirname, 'packages/providers/src'),
    },
  },
  test: {
    include: ['apps/desktop/src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    testTimeout: 120000,
    hookTimeout: 120000,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['apps/desktop/src/**/*.ts', 'apps/desktop/src/**/*.tsx'],
      exclude: ['apps/desktop/src/**/*.test.{ts,tsx}', 'apps/desktop/src/**/*.d.ts', 'tests/**/*.test.{ts,tsx}'],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 65,
        statements: 70,
      },
    },
  },
})
