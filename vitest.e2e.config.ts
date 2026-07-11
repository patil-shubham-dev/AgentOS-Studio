import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/desktop/src/renderer'),
      '@agentic-os/shared': resolve(__dirname, 'packages/shared/src'),
      '@agentic-os/ui': resolve(__dirname, 'packages/ui/src'),
      '@agentic-os/providers': resolve(__dirname, 'packages/providers/src'),
    },
  },
  test: {
    include: ['tests/e2e/**/*.test.{ts,tsx}'],
    testTimeout: 60000,
    hookTimeout: 60000,
    globals: true,
    environment: 'node',
    setupFiles: [],
    reporters: ['verbose'],
  },
})
