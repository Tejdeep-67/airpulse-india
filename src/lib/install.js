// "Install as app" helpers (PWA) + the service worker registration.

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isAndroid = () => /Android/i.test(navigator.userAgent)
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

// Chrome / Edge fire beforeinstallprompt when the site can be installed. Keep it so the
// page can show its own "Install" button instead of only the browser menu.
let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export const canPromptInstall = () => deferred !== null
export function onInstallChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export async function promptInstall() {
  if (!deferred) return false
  const d = deferred
  deferred = null
  await d.prompt()
  const { outcome } = await d.userChoice
  notify()
  return outcome === 'accepted'
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker not registered', err))
  })
}
