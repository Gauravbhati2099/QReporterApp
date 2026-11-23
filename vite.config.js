import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function offlineShellPlugin() {
  const serviceWorkerTemplate = readFileSync(
    new URL('./src/service-worker.js', import.meta.url),
    'utf8',
  )
  let base = '/'

  return {
    name: 'qreport-offline-shell',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((fileName) => fileName !== 'sw.js')
      const precacheUrls = [
        ...new Set([base, `${base}index.html`, ...files.map((fileName) => `${base}${fileName}`)]),
      ]
      const cacheVersion = createHash('sha256')
        .update(precacheUrls.join('\n'))
        .update(String(bundle['index.html']?.source ?? ''))
        .digest('hex')
        .slice(0, 12)

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerTemplate
          .replace('__CACHE_NAME__', `qreport-shell-${cacheVersion}`)
          .replace(
            '/*__PRECACHE_URLS__*/ []',
            JSON.stringify(precacheUrls),
          ),
      })
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), offlineShellPlugin()],
})
