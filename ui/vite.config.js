import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

// Baked in at build time rather than fetched: the version cannot change while
// a session is open, so an API round-trip would buy nothing. Release order
// makes this correct — CI bumps package.json, then `npm publish` runs the build.
const { version } = JSON.parse(readFileSync(here('../package.json'), 'utf8'))

export default defineConfig({
  root: here('.'),
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(version) },
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
