import { useAir } from '../state/AirData.jsx'
import { timeAgo } from './ui.jsx'

export default function StatusBanner() {
  const { status, error, fetchedAt, refresh, refreshing, now } = useAir()
  if (status === 'stale') {
    return (
      <div className="banner" role="status">
        <span>
          Couldn&apos;t reach Open-Meteo just now ({error}). Showing the last good data from {timeAgo(fetchedAt, now)}. Retrying every minute.
        </span>
        <button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? 'Trying…' : 'Retry now'}</button>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="banner err" role="alert">
        <span>Couldn&apos;t load live data ({error}) and there is nothing cached yet. Check your connection, it will retry automatically.</span>
        <button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? 'Trying…' : 'Retry now'}</button>
      </div>
    )
  }
  return null
}
