import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('.'),
  plugins: [vue()],
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    // Monaco is large by nature; it is served from localhost, so the warning
    // is noise rather than signal here.
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
})
