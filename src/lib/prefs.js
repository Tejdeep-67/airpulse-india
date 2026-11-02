// tiny localStorage helpers for user preferences (my city, alert rules, etc.)
import { useCallback, useEffect, useState } from 'react'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (private mode / storage full)
  }
}

// useState that is saved to localStorage and synced across tabs
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => load(key, fallback))
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key) setValue(load(key, fallback))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(
    (v) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        save(key, next)
        return next
      })
    },
    [key]
  )
  return [value, set]
}

export const KEYS = {
  myCity: 'airpulse:my-city',
  alerts: 'airpulse:alerts',
  alertLog: 'airpulse:alert-log',
  compare: 'airpulse:compare',
  scoreboard: 'airpulse:scoreboard',
}
