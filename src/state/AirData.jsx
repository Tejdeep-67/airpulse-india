import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAll, readCache, REFRESH_MS } from '../lib/api.js'
import { deriveCity } from '../lib/derive.js'

const AirContext = createContext(null)

// status: 'loading' (nothing to show yet), 'live', 'stale' (showing cache, refresh failed), 'error'
export function AirDataProvider({ children }) {
  const [data, setData] = useState(() => readCache())
  const [status, setStatus] = useState(() => (readCache() ? 'cached' : 'loading'))
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const fresh = await fetchAll()
      setData(fresh)
      setStatus('live')
      setError(null)
    } catch (err) {
      setError(err.message || 'network error')
      const hasData = readCache() != null
      if (hasData) {
        setStatus('stale')
      } else {
        // nothing cached yet (first visit while the API is down): show the saved
        // snapshot so the page isn't empty, with a clear banner about it
        try {
          const snap = (await import('../data/snapshot.json')).default
          setData((d) => d || snap)
          setStatus('snapshot')
        } catch {
          setStatus('error')
        }
      }
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [])

  // first load: use the cache if it is still fresh, otherwise fetch
  useEffect(() => {
    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < REFRESH_MS) {
      setStatus('live')
    } else {
      refresh()
    }
  }, [refresh])

  // auto refresh + a 30s ticker for the "updated x min ago" text
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!data && status !== 'error') return
    const age = data ? Date.now() - data.fetchedAt : 0
    // after a failed refresh try again sooner (1 min) instead of waiting 15
    const failed = status === 'stale' || status === 'error' || status === 'snapshot'
    const wait = failed ? 60000 : Math.max(5000, REFRESH_MS - age)
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') refresh()
    }, wait)
    return () => clearTimeout(t)
  }, [data, status, refresh, now])

  // coming back to the tab after a while -> refresh straight away
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && data && Date.now() - data.fetchedAt > REFRESH_MS) refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [data, refresh])

  const cities = useMemo(() => {
    if (!data) return []
    // a saved snapshot is shown as of the time it was saved, not as of now
    const ref = data.snapshot ? new Date(data.fetchedAt) : new Date(now)
    return data.cities.map((c) => deriveCity(c, ref))
    // recompute when the hour changes too (now ticks every 30s)
  }, [data, Math.floor(now / 3600000)]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({
      cities,
      byId: Object.fromEntries(cities.map((c) => [c.id, c])),
      fetchedAt: data?.fetchedAt ?? null,
      status,
      error,
      refreshing,
      refresh,
      now,
    }),
    [cities, data, status, error, refreshing, refresh, now]
  )

  return <AirContext.Provider value={value}>{children}</AirContext.Provider>
}

export function useAir() {
  const ctx = useContext(AirContext)
  if (!ctx) throw new Error('useAir must be used inside AirDataProvider')
  return ctx
}
