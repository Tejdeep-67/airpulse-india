import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { CATEGORIES, categoryFor } from '../lib/aqi.js'
import { useStored, KEYS } from '../lib/prefs.js'
import { checkAlerts } from '../lib/alerts.js'
import { useToast } from '../components/Toasts.jsx'
import { AqiBadge, Reveal, timeAgo } from '../components/ui.jsx'
import { Icon } from '../components/Icon.jsx'
import DailyAqiCard from '../components/DailyAqiCard.jsx'
import { isApp } from '../lib/app.js'

const DEFAULT_RULES = { cities: [], threshold: 200, forecast: true }

function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export default function Alerts() {
  const { cities, now } = useAir()
  const [rules, setRules] = useStored(KEYS.alerts, DEFAULT_RULES)
  const [history, setHistory] = useStored(KEYS.alertLog, [])
  const [perm, setPerm] = useState(permissionState)
  const [query, setQuery] = useState('')
  const toast = useToast()

  useEffect(() => {
    document.title = 'Alerts · AirPulse India'
  }, [])

  const cat = categoryFor(rules.threshold)
  const sorted = useMemo(
    () => [...cities].filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [cities, query]
  )

  const toggle = (id) =>
    setRules((r) => ({ ...r, cities: r.cities.includes(id) ? r.cities.filter((x) => x !== id) : [...r.cities, id] }))

  const askPermission = async () => {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') toast({ title: 'Browser notifications on', body: 'You will get a notification when a watched city crosses your limit.' })
  }

  const sendTest = () => {
    const body = 'This is what an AirPulse alert looks like.'
    toast({ title: 'Test alert', body, color: cat.color })
    if (perm === 'granted') {
      try {
        new Notification('AirPulse test alert', { body, icon: '/favicon.svg' })
      } catch {
        toast({ title: 'Notification blocked', body: 'This browser only shows in-app alerts.' })
      }
    }
  }

  // live preview: which watched cities would alert right now (ignores cooldown)
  const preview = useMemo(() => checkAlerts(cities, rules, {}).fired, [cities, rules])

  return (
    <div className="page container">
      <p className="eyebrow">Alerts</p>
      <h1 className="section-title">Tell me when the air gets bad</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 680 }}>
        Pick cities and an AQI limit. Every time the data refreshes (every 15 min while this page is open) AirPulse
        checks them and shows an in-app alert, plus a browser notification if you allow it. Settings stay in this
        browser only.
      </p>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <h2>1. Your limit</h2>
          <p className="card-sub">Alert when AQI is at or above</p>
          <div className="threshold">
            <span className="threshold-val num" style={{ color: cat.color === '#f2c94c' ? '#a07d00' : cat.color }}>{rules.threshold}</span>
            <AqiBadge aqi={rules.threshold} />
          </div>
          <label className="sr-only" htmlFor="threshold">AQI threshold</label>
          <input
            id="threshold"
            type="range"
            min="50"
            max="400"
            step="10"
            value={rules.threshold}
            onChange={(e) => setRules((r) => ({ ...r, threshold: +e.target.value }))}
            className="range"
            style={{ '--fill': `${((rules.threshold - 50) / 350) * 100}%` }}
          />
          <div className="range-scale small muted" aria-hidden="true"><span>50</span><span>100</span><span>200</span><span>300</span><span>400</span></div>
          <p className="small" style={{ marginTop: 14 }}><b>{cat.name}:</b> {cat.impact}</p>
          <label className="switch">
            <input type="checkbox" checked={rules.forecast} onChange={(e) => setRules((r) => ({ ...r, forecast: e.target.checked }))} />
            <span className="switch-ui" aria-hidden="true" />
            Also warn me when the 24 h forecast says it will cross
          </label>
        </Reveal>

        <Reveal className="card" delay={60}>
          <h2>2. Notifications</h2>
          <p className="card-sub" style={{ marginBottom: 14 }}>
            {isApp
              ? 'In the app these alerts show while it is open. For a notification when it is closed, use the daily AQI notification below.'
              : 'In-app alerts always work. Browser notifications need your permission.'}
          </p>
          <div className="perm">
            {!isApp && <span className={`perm-state ${perm}`}>
              {perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked in browser settings' : perm === 'unsupported' ? 'Not supported here' : 'Not asked yet'}
            </span>}
            {perm === 'default' && <button className="btn accent" onClick={askPermission}><Icon.bell width={16} height={16} /> Allow notifications</button>}
            <button className="btn" onClick={sendTest}>Send a test alert</button>
          </div>
          <h3 style={{ marginTop: 22, fontSize: '1rem' }}>Would alert right now</h3>
          {rules.cities.length === 0 ? (
            <p className="muted small">Pick some cities below first.</p>
          ) : preview.length === 0 ? (
            <p className="muted small">None of your {rules.cities.length} cities is at or heading to {rules.threshold}. Good news.</p>
          ) : (
            <ul className="alert-preview">
              {preview.map((a) => (
                <li key={a.key} style={{ borderLeftColor: a.category.color }}>
                  <b>{a.title}</b>
                  <span className="small muted">{a.kind === 'now' ? 'now' : 'forecast'}</span>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>

      <DailyAqiCard />

      <Reveal className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h2>3. Cities to watch <span className="muted num" style={{ fontWeight: 600 }}>({rules.cities.length})</span></h2>
            <p className="card-sub">Current AQI shown next to each name</p>
          </div>
          <div className="search">
            <label className="sr-only" htmlFor="city-search">Search cities</label>
            <input id="city-search" type="search" placeholder="Search city…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="city-chips">
          {sorted.map((c) => {
            const on = rules.cities.includes(c.id)
            return (
              <button key={c.id} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-pressed={on}>
                <span className="dot" style={{ background: c.category?.color || '#ccd' }} />
                {c.name}
                <span className="num chip-aqi">{c.aqi ?? '–'}</span>
              </button>
            )
          })}
          {sorted.length === 0 && <p className="muted">No city matches “{query}”.</p>}
        </div>
      </Reveal>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h2>Recent alerts</h2>
          {history.length > 0 && <button className="btn" onClick={() => setHistory([])}>Clear</button>}
        </div>
        {history.length === 0 ? (
          <p className="muted">No alerts yet. They will show up here.</p>
        ) : (
          <ul className="history">
            {history.map((h, i) => (
              <li key={i} style={{ borderLeftColor: h.color }}>
                <div><b>{h.title}</b><p className="small muted">{h.body}</p></div>
                <span className="small muted">{timeAgo(h.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <h2>Health advice by AQI category</h2>
        <p className="card-sub" style={{ marginBottom: 12 }}>Health impacts as listed by CPCB, plus a practical tip.</p>
        <div className="advice-table">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="advice-row">
              <span className="badge" style={{ background: c.color, color: c.text }}>{c.name} · {c.min}–{c.max}</span>
              <p>{c.impact}</p>
              <p className="muted">{c.advice}</p>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Alerts only run while the site is open in a tab (there is no server pushing them). <Link to="/model">How the AQI is calculated</Link>.
        </p>
      </Reveal>
    </div>
  )
}
