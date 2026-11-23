const CACHE_NAME = '__CACHE_NAME__'
const PRECACHE_URLS = /*__PRECACHE_URLS__*/ []
const CACHE_PREFIX = 'qreport-shell-'
const APP_SHELL_URL = `${self.registration.scope}index.html`

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
      self.skipWaiting(),
    ]),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  const requestUrl = new URL(request.url)
  if (!requestUrl.href.startsWith(self.registration.scope)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (request.mode === 'navigate') {
        try {
          const response = await fetch(request)
          if (response.ok) {
            await cache.put(request, response.clone())
            return response
          }

          return (
            (await cache.match(APP_SHELL_URL, { ignoreVary: true })) ??
            Response.error()
          )
        } catch {
          return (
            (await cache.match(request, { ignoreVary: true })) ??
            (await cache.match(APP_SHELL_URL, { ignoreVary: true })) ??
            Response.error()
          )
        }
      }

      const cachedResponse = await cache.match(request, { ignoreVary: true })
      if (cachedResponse) return cachedResponse

      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    }),
  )
})
