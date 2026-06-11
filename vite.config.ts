import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@tauri-apps/api/core': resolve(__dirname, 'src/renderer/lib/tauri-shims/core.ts'),
      '@tauri-apps/api/event': resolve(__dirname, 'src/renderer/lib/tauri-shims/core.ts'),
      '@tauri-apps/plugin-fs': resolve(__dirname, 'src/renderer/lib/tauri-shims/fs.ts'),
      '@tauri-apps/plugin-dialog': resolve(__dirname, 'src/renderer/lib/tauri-shims/dialog.ts'),
      '@tauri-apps/plugin-shell': resolve(__dirname, 'src/renderer/lib/tauri-shims/shell.ts'),
      '@tauri-apps/plugin-clipboard-manager': resolve(__dirname, 'src/renderer/lib/tauri-shims/clipboard.ts'),
      '@tauri-apps/plugin-http': resolve(__dirname, 'src/renderer/lib/tauri-shims/http.ts'),
      '@tauri-apps/plugin-notification': resolve(__dirname, 'src/renderer/lib/tauri-shims/notification.ts'),
      '@tauri-apps/api': resolve(__dirname, 'src/renderer/lib/tauri-shims/index.ts'),
      '@agentic-os/shared': resolve(__dirname, 'packages/shared/src'),
      '@agentic-os/ui': resolve(__dirname, 'packages/ui/src'),
      '@agentic-os/providers': resolve(__dirname, 'packages/providers/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: mode === 'development',
    chunkSizeWarningLimit: 2000,
  },
  define: {
    'process.env': '{}',
  },
}))
