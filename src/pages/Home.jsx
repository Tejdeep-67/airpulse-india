import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { CATEGORIES, POLLUTANTS } from '../lib/aqi.js'
import { nearestCity } from '../lib/derive.js'
import { useStored, KEYS } from '../lib/prefs.js'
import MapView from '../components/MapView.jsx'
import { AqiBadge, AqiRing, AnimatedNumber, Reveal, Skeleton } from '../components/ui.jsx'
import { Icon } from '../components/Icon.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import useTitle from '../lib/useTitle'

function NationalPulse({ cities }) {
  const withAqi = cities.filter((c) => c.aqi != null)
  const counts = CATEGORIES.map((cat) => ({ cat, n: withAqi.filter((c) => c.category.key === cat.key).length }))
  const avg = withAqi.length ? Math.round(withAqi.reduce((s, c) => s + c.aqi, 0) / withAqi.length) : null
  const goodish = withAqi.filter((c) => c.aqi <= 100).length
  return (
    <div className="pulse-card card">
      <p className="eyebrow">National pulse</p>
      <div className="pulse-stats">
        <div>
          <div className="big num"><AnimatedNumber value={withAqi.length} /></div>
          <div className="muted small">cities live</div>
        </div>
        <div>
          <div className="big num"><AnimatedNumber value={avg} /></div>
          <div className="muted small">average AQI</div>
        </div>
        <div>
          <div className="big num"><AnimatedNumber value={goodish} /></div>
          <div className="muted small">at 100 or below</div>
        </div>
      </div>
      <div className="catbar" role="img" aria-label={counts.map((c) => `${c.cat.name}: ${c.n}`).join(', ')}>
        {counts.filter((c) => c.n > 0).map(({ cat, n }) => (
          <span key={cat.key} style={{ flexGrow: n, background: cat.color }} title={`${cat.name}: ${n}`} />
        ))}
      </div>
      <ul className="catlegend">
        {counts.map(({ cat, n }) => (
          <li key={cat.key} className={n === 0 ? 'zero' : ''}>
            <span className="dot" style={{ background: cat.color }} /> {cat.name} <b className="num">{n}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MyCity({ byId, cities }) {
  const [myCity, setMyCity] = useStored(KEYS.myCity, null)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState('')
  const city = myCity ? byId[myCity] : null

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setMsg('Location is not available in this browser, pick a city below instead.')
      return
    }
    setLocating(true)
    setMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestCity(pos.coords.latitude, pos.coords.longitude)
        setMyCity(near.city.id)
        setMsg(near.distance > 150 ? `Closest city we track is ${near.city.name}, ${Math.round(near.distance)} km away.` : '')
        setLocating(false)
      },
      () => {
        setMsg('Could not get your location (permission denied?). Pick a city instead.')
        setLocating(false)
      },
      { timeout: 10000, maximumAge: 600000 }
    )
  }

  return (
    <div className="card mycity">
      <div className="card-head">
        <div>
          <p className="eyebrow">My city</p>
          <h2>{city ? city.name : 'Where are you?'}</h2>
          {city && <p className="card-sub">{city.state}</p>}
        </div>
        <button className="btn" onClick={locate} disabled={locating}>
          <Icon.locate width={16} height={16} /> {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {city ? (
        <div className="mycity-body">
          <AqiRing aqi={city.aqi} size={150} stroke={11} />
          <div>
            <AqiBadge aqi={city.aqi} />
            <p className="mycity-advice">{city.category?.advice}</p>
            <p className="muted small">
              Main pollutant: <b>{city.dominant ? POLLUTANTS[city.dominant].label : '–'}</b>
              {city.weather.temp != null && <> · {Math.round(city.weather.temp)}°C</>}
            </p>
            <Link to={`/city/${city.id}`} className="btn primary" style={{ marginTop: 6 }}>
              Open {city.name} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      ) : (
        <p className="muted">Allow location and we will pick the nearest of our {cities.length} cities, or choose one:</p>
      )}
      <label className="sr-only" htmlFor="mycity-select">Choose your city</label>
      <select id="mycity-select" className="select" value={myCity || ''} onChange={(e) => setMyCity(e.target.value || null)}>
        <option value="">Choose a city…</option>
        {[...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {msg && <p className="small muted" role="status">{msg}</p>}
    </div>
  )
}

function Rankings({ cities }) {
  const [mode, setMode] = useState('worst')
  const [showAll, setShowAll] = useState(false)
  const ranked = useMemo(() => {
    const list = cities.filter((c) => c.aqi != null)
    list.sort((a, b) => (mode === 'worst' ? b.aqi - a.aqi : a.aqi - b.aqi))
    return list
  }, [cities, mode])
  const shown = showAll ? ranked : ranked.slice(0, 10)
  const max = Math.max(1, ...ranked.map((c) => c.aqi))
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Rankings right now</h2>
          <p className="card-sub">Live CPCB AQI, highest sub-index wins</p>
        </div>
        <div className="seg" role="group" aria-label="Sort rankings">
          <button className={mode === 'worst' ? 'on' : ''} onClick={() => setMode('worst')} aria-pressed={mode === 'worst'}>Most polluted</button>
          <button className={mode === 'best' ? 'on' : ''} onClick={() => setMode('best')} aria-pressed={mode === 'best'}>Cleanest</button>
        </div>
      </div>
      <ol className="rank-list">
        {shown.map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
            <span className="rank-n num">{i + 1}</span>
            <Link to={`/city/${c.id}`} className="rank-name">
              {c.name}
              <small>{c.state}</small>
            </Link>
            <span className="rank-bar" aria-hidden="true">
              <span style={{ width: `${(c.aqi / max) * 100}%`, background: c.category.color }} />
            </span>
            <span className="rank-aqi num">{c.aqi}</span>
            <span className={`rank-delta num ${c.change24h > 0 ? 'up' : c.change24h < 0 ? 'down' : ''}`} title="change vs 24 hours ago">
              {c.change24h == null ? '' : `${c.change24h > 0 ? '▲' : c.change24h < 0 ? '▼' : '•'} ${Math.abs(c.change24h)}`}
            </span>
          </li>
        ))}
      </ol>
      {ranked.length > 10 && (
        <button className="btn" onClick={() => setShowAll((v) => !v)} style={{ marginTop: 12 }}>
          {showAll ? 'Show top 10' : `Show all ${ranked.length} cities`}
        </button>
      )}
    </div>
  )
}

function WorseningSoon({ cities }) {
  const list = cities
    .filter((c) => c.aqi != null && c.peakNext24 != null && c.peakNext24 - c.aqi >= 15)
    .sort((a, b) => b.peakNext24 - b.aqi - (a.peakNext24 - a.aqi))
    .slice(0, 6)
  return (
    <div className="card">
      <h2>Getting worse in the next 24 h</h2>
      <p className="card-sub" style={{ marginBottom: 12 }}>Peak AQI from the CAMS forecast vs now</p>
      {list.length === 0 ? (
        <p className="muted">No city is expected to rise by 15+ points. Calm day ahead.</p>
      ) : (
        <ul className="soon-list">
          {list.map((c) => (
            <li key={c.id}>
              <Link to={`/city/${c.id}`}>{c.name}</Link>
              <span className="num">
                <b style={{ color: c.category.color === '#f2c94c' ? '#a07d00' : undefined }}>{c.aqi}</b>
                <span className="muted"> → </span>
                <b>{c.peakNext24}</b>
              </span>
              <AqiBadge aqi={c.peakNext24} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Home() {
  useTitle(null)
  const { cities, byId, status } = useAir()
  const [myCity] = useStored(KEYS.myCity, null)
  const navigate = useNavigate()
  const loading = cities.length === 0

  const cleanest = cities.filter((c) => c.aqi != null).sort((a, b) => a.aqi - b.aqi)[0]
  const worst = cities.filter((c) => c.aqi != null).sort((a, b) => b.aqi - a.aqi)[0]

  return (
    <div className="page container">
      <StatusBanner />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Live · 37 Indian cities · refreshed every 15 min</p>
          <h1>
            India&apos;s air, <span className="serif grad-text">right now.</span>
          </h1>
          <p className="lead">
            Real-time air quality and weather with the official CPCB AQI worked out from raw pollutant data,
            a PM2.5 forecast model I trained myself, and alerts when your city crosses a limit.
          </p>
          {!loading && cleanest && worst && (
            <div className="hero-facts">
              <button className="fact" onClick={() => navigate(`/city/${cleanest.id}`)}>
                <span className="muted small">Cleanest now</span>
                <b>{cleanest.name}</b>
                <AqiBadge aqi={cleanest.aqi} size="sm" />
                <span className="num fact-n">{cleanest.aqi}</span>
              </button>
              <button className="fact" onClick={() => navigate(`/city/${worst.id}`)}>
                <span className="muted small">Most polluted now</span>
                <b>{worst.name}</b>
                <AqiBadge aqi={worst.aqi} size="sm" />
                <span className="num fact-n">{worst.aqi}</span>
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="card"><Skeleton h={22} w="40%" /><Skeleton h={64} style={{ marginTop: 16 }} /><Skeleton h={14} style={{ marginTop: 16 }} /><Skeleton h={60} style={{ marginTop: 16 }} /></div>
        ) : (
          <NationalPulse cities={cities} />
        )}
      </section>

      <div className="grid g-hero" style={{ marginTop: 22 }}>
        <Reveal className="card map-card">
          <div className="card-head">
            <div>
              <h2>Live map</h2>
              <p className="card-sub">Tap a city for its full page. Pulsing rings mean AQI above 200.</p>
            </div>
          </div>
          {loading ? <Skeleton h={680} r={18} /> : <MapView cities={cities} myCityId={myCity} />}
          <ul className="map-legend" aria-label="AQI colour legend">
            {CATEGORIES.map((c) => (
              <li key={c.key}><span className="dot" style={{ background: c.color }} />{c.name} <span className="muted">{c.min}–{c.max}</span></li>
            ))}
          </ul>
        </Reveal>
        <div className="grid" style={{ alignContent: 'start' }}>
          {loading ? <div className="card"><Skeleton h={200} /></div> : <Reveal><MyCity byId={byId} cities={cities} /></Reveal>}
          {!loading && <Reveal delay={80}><WorseningSoon cities={cities} /></Reveal>}
        </div>
      </div>

      <Reveal style={{ marginTop: 22 }}>
        {loading ? <div className="card"><Skeleton h={320} /></div> : <Rankings cities={cities} />}
      </Reveal>
      {status === 'error' && loading && null}
    </div>
  )
}
