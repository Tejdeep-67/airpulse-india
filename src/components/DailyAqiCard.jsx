// Daily AQI notification. Inside the Android app it talks to the native DailyAqi plugin
// (a background job that fetches the AQI once a day and shows a notification).
// On the website it just points to the app, because a closed browser tab can't do this
// without a push server.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { useToast } from './Toasts.jsx'
import { Reveal } from './ui.jsx'
import { Icon } from './Icon.jsx'
import { isApp, DailyAqi, APK_URL, APK_SIZE } from '../lib/app.js'

const pad = (n) => String(n).padStart(2, '0')

export default function DailyAqiCard() {
  return isApp ? <InApp /> : <OnWeb />
}

function OnWeb() {
  return (
    <Reveal className="card daily-card" style={{ marginTop: 18 }}>
      <div className="daily-head">
        <span className="daily-icon"><Icon.bell width={22} height={22} /></span>
        <div>
          <h2>Daily AQI notification <span className="tag">Android app</span></h2>
          <p className="card-sub">Your city's AQI every morning as a phone notification, even when AirPulse is closed.</p>
        </div>
      </div>
      <div className="perm" style={{ marginTop: 14 }}>
        <a className="btn accent" href={APK_URL}><Icon.download width={16} height={16} /> Download Android app ({APK_SIZE})</a>
        <Link className="btn" to="/app">More about the app</Link>
      </div>
    </Reveal>
  )
}

function InApp() {
  const { cities } = useAir()
  const toast = useToast()
  const sorted = useMemo(() => [...cities].sort((a, b) => a.name.localeCompare(b.name)), [cities])
  const [status, setStatus] = useState(null)
  const [cityId, setCityId] = useState('guntur')
  const [time, setTime] = useState('08:00')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    DailyAqi.getStatus()
      .then((s) => {
        setStatus(s)
        if (s.cityId) setCityId(s.cityId)
        setTime(`${pad(s.hour)}:${pad(s.minute)}`)
      })
      .catch(() => setStatus({ enabled: false }))
  }, [])

  const save = async (enabled) => {
    const city = cities.find((c) => c.id === cityId)
    if (enabled && !city) return
    setBusy(true)
    try {
      if (enabled) {
        const [h, m] = time.split(':').map(Number)
        const s = await DailyAqi.enable({ cityId: city.id, cityName: city.name, lat: city.lat, lon: city.lon, hour: h, minute: m })
        setStatus(s)
        toast({ title: 'Daily notification on', body: `${city.name} AQI every day at ${time}.` })
      } else {
        setStatus(await DailyAqi.disable())
        toast({ title: 'Daily notification off' })
      }
    } catch (e) {
      toast({ title: 'Could not turn it on', body: e?.code === 'DENIED' ? 'Allow notifications for AirPulse in your phone settings.' : e?.message || 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    try {
      await DailyAqi.sendNow()
      toast({ title: 'Sending one now', body: 'It shows up in a few seconds.' })
    } catch (e) {
      toast({ title: 'Notifications are off', body: e?.message || 'Allow notifications for AirPulse first.' })
    }
  }

  const on = !!status?.enabled
  // settings changed while it's on: save again with the new city/time
  const dirty = on && (status.cityId !== cityId || `${pad(status.hour)}:${pad(status.minute)}` !== time)

  return (
    <Reveal className="card daily-card" style={{ marginTop: 18 }}>
      <div className="daily-head">
        <span className="daily-icon"><Icon.bell width={22} height={22} /></span>
        <div>
          <h2>Daily AQI notification</h2>
          <p className="card-sub">Once a day the app checks your city and sends the AQI as a notification, even when it's closed.</p>
        </div>
      </div>
      <div className="daily-form">
        <label>
          <span className="small muted">City</span>
          <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span className="small muted">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value || '08:00')} />
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={on} disabled={busy || !status} onChange={(e) => save(e.target.checked)} />
        <span className="switch-ui" aria-hidden="true" />
        {on ? `On · ${status.cityName} at ${pad(status.hour)}:${pad(status.minute)}` : 'Off'}
      </label>
      <div className="perm" style={{ marginTop: 14 }}>
        {dirty && <button className="btn accent" disabled={busy} onClick={() => save(true)}>Save changes</button>}
        {on && <button className="btn" onClick={test}>Send one now</button>}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Android can delay background jobs a little to save battery, so it may come a few minutes late.
      </p>
    </Reveal>
  )
}
