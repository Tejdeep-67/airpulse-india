import { useEffect, useRef } from 'react'
import { useAir } from '../state/AirData.jsx'
import { useToast } from './Toasts.jsx'
import { checkAlerts } from '../lib/alerts.js'
import { load, save, KEYS } from '../lib/prefs.js'

// runs in the background on every page and checks alert rules after each refresh
export default function AlertWatcher() {
  const { cities, fetchedAt } = useAir()
  const toast = useToast()
  const lastChecked = useRef(null)

  useEffect(() => {
    if (!cities.length || fetchedAt === lastChecked.current) return
    lastChecked.current = fetchedAt
    const rules = load(KEYS.alerts, null)
    const log = load('airpulse:alert-cooldown', {})
    const { fired, log: nextLog } = checkAlerts(cities, rules, log)
    if (!fired.length) return
    save('airpulse:alert-cooldown', nextLog)
    const history = load(KEYS.alertLog, [])
    for (const a of fired) {
      toast({ title: a.title, body: a.body, color: a.category.color })
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(a.title, { body: a.body, icon: '/favicon.svg', tag: a.key })
        } catch {
          // some mobile browsers only allow notifications from a service worker
        }
      }
      history.unshift({ at: Date.now(), title: a.title, body: a.body, color: a.category.color, city: a.city.id })
    }
    save(KEYS.alertLog, history.slice(0, 30))
  }, [cities, fetchedAt, toast])

  return null
}
