// AirPulse service worker: keeps the app shell (html, js, css, fonts, icons) on the device so
// it can be installed and still opens with no signal. The air quality data itself is fetched
// from Open-Meteo by the page and kept in localStorage, so it isn't cached here.
const VERSION = 'v1'
const CACHE = `airpulse-${VERSION}`
const PRECACHE = ['/', '/site.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// pages: try the network first so new deploys show up, fall back to the saved shell offline
async function page(request) {
  try {
    const res = await fetch(request)
    if (res.ok) (await caches.open(CACHE)).put('/', res.clone())
    return res
  } catch {
    return (await caches.match('/')) || new Response('Offline', { status: 503 })
  }
}

// hashed build files and icons never change under the same name
async function cacheFirst(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.status === 200) (await caches.open(CACHE)).put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Open-Meteo, map tiles: straight to the network

  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) event.respondWith(cacheFirst(request))
})
