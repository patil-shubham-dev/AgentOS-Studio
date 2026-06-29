import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: ['electron-updater', 'electron-updater/out/main', 'js-yaml']
    })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss(), nodePolyfills({ globals: { process: true, Buffer: true } })],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@agentic-os/shared': resolve(__dirname, 'packages/shared/src'),
        '@agentic-os/ui': resolve(__dirname, 'packages/ui/src'),
        '@agentic-os/providers': resolve(__dirname, 'packages/providers/src')
      }
    },
    define: {
      'process.env': '{}'
    }
  }
})
