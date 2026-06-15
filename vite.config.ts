import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
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
