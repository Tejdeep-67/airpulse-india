import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { POLLUTANTS, BREAKPOINTS, categoryFor, aqiSeries } from '../lib/aqi.js'
import { loadModel, forecastPm25 } from '../lib/forecast.js'
import { useStored, KEYS } from '../lib/prefs.js'
import ChartView from '../components/ChartView.jsx'
import { AqiBadge, AqiRing, AnimatedNumber, Reveal, Skeleton, dayHourLabel, hourLabel, windDir } from '../components/ui.jsx'
import { Icon } from '../components/Icon.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import { recordForecast } from '../lib/scoreboard.js'

const PAST_HOURS = 72
const AHEAD_HOURS = 48

function usePm25Forecast(city) {
  const [state, setState] = useState({ status: 'loading', data: null })
  useEffect(() => {
    if (!city) return
    let alive = true
    loadModel()
      .then((model) => {
        if (!alive) return
        const out = forecastPm25(model, city.raw, city, city.nowIdx)
        setState(out ? { status: 'ok', data: out, model } : { status: 'nodata', data: null })
        if (out) recordForecast(city, out)
      })
      .catch(() => alive && setState({ status: 'error', data: null }))
    return () => {
      alive = false
    }
  }, [city])
  return state
}

function WeatherTiles({ w }) {
  const tiles = [
    { icon: Icon.thermo, label: 'Temperature', value: w.temp, unit: '°C', extra: w.feels != null ? `feels ${Math.round(w.feels)}°` : '' },
    { icon: Icon.drop, label: 'Humidity', value: w.rh, unit: '%' },
    { icon: Icon.wind, label: 'Wind', value: w.wind, unit: 'km/h', extra: windDir(w.wdir), dir: w.wdir },
    { icon: Icon.rain, label: 'Rain', value: w.rain, unit: 'mm', decimals: 1 },
  ]
  return (
    <div className="wx-tiles">
      {tiles.map((t) => (
        <div className="wx" key={t.label}>
          <t.icon width={18} height={18} />
          <span className="muted small">{t.label}</span>
          <b className="num">
            <AnimatedNumber value={t.value} decimals={t.decimals || 0} />
            <small> {t.unit}</small>
          </b>
          {t.extra && (
            <span className="small muted">
              {t.dir != null && (
                <span className="wind-arrow" style={{ transform: `rotate(${t.dir + 180}deg)` }} aria-hidden="true">↑</span>
              )}
              {t.extra}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function PollutantGrid({ city }) {
  return (
    <div className="pollutants">
      {Object.keys(POLLUTANTS).map((p) => {
        const meta = POLLUTANTS[p]
        const conc = city.concentrations[p]
        const sub = city.subIndices[p]
        const cat = categoryFor(sub)
        const isDom = city.dominant === p
        return (
          <div key={p} className={`pol ${isDom ? 'dom' : ''}`}>
            <div className="pol-top">
              <b>{meta.label}</b>
              {isDom && <span className="pol-tag">main</span>}
            </div>
            <div className="pol-val num">
              {conc == null ? '–' : p === 'co' ? conc.toFixed(2) : Math.round(conc)} <small>{meta.unit}</small>
            </div>
            <div className="pol-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, ((sub || 0) / 500) * 100)}%`, background: cat?.color || '#ccd' }} />
            </div>
            <div className="small muted">
              sub-index <b className="num" style={{ color: 'var(--ink)' }}>{sub == null ? '–' : Math.round(sub)}</b> · {meta.avg} avg
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function CityPage() {
  const { id } = useParams()
  const { byId, cities } = useAir()
  const city = byId[id]
  const [myCity, setMyCity] = useStored(KEYS.myCity, null)
  const [alerts, setAlerts] = useStored(KEYS.alerts, { cities: [], threshold: 200, forecast: true })
  const fc = usePm25Forecast(city)
  const [range, setRange] = useState('72')

  useEffect(() => {
    if (city) document.title = `${city.name} AQI ${city.aqi ?? ''} · AirPulse India`
    return () => {
      document.title = 'AirPulse India - live air quality for Indian cities'
    }
  }, [city])

  const charts = useMemo(() => {
    if (!city) return null
    const raw = city.raw
    const past = range === '24' ? 24 : PAST_HOURS
    const start = Math.max(0, city.nowIdx - past)
    const end = Math.min(raw.time.length - 1, city.nowIdx + AHEAD_HOURS)
    const idx = []
    for (let i = start; i <= end; i++) idx.push(i)
    const labels = idx.map((i) => dayHourLabel(raw.time[i]))
    const nowPos = city.nowIdx - start

    // AQI bars: past solid, forecast (CAMS) lighter
    const aqiVals = idx.map((i) => city.aqiSeries[i])
    const aqiColors = idx.map((i, k) => {
      const c = categoryFor(city.aqiSeries[i])?.color || '#ccd'
      return k > nowPos ? c + '80' : c
    })

    // PM2.5: observed (past), CAMS forecast (future), our model (future 24h)
    const observed = idx.map((i, k) => (k <= nowPos ? raw.pm25[i] : null))
    const cams = idx.map((i, k) => (k >= nowPos ? raw.pm25[i] : null))
    const ours = idx.map(() => null)
    if (fc.data) {
      ours[nowPos] = raw.pm25[city.nowIdx]
      fc.data.forEach((p, h) => {
        if (nowPos + h + 1 < ours.length) ours[nowPos + h + 1] = p.pm25
      })
    }
    // AQI if we swap in our PM2.5 forecast (other pollutants stay CAMS)
    let oursAqiPeak = null
    if (fc.data) {
      const pm = raw.pm25.slice()
      fc.data.forEach((p, h) => (pm[city.nowIdx + h + 1] = p.pm25))
      const series = aqiSeries({ pm25: pm, pm10: raw.pm10, no2: raw.no2, so2: raw.so2, o3: raw.o3, co: raw.co })
      const next = series.slice(city.nowIdx + 1, city.nowIdx + 25).filter((v) => v != null)
      oursAqiPeak = next.length ? Math.max(...next) : null
    }

    const weatherIdx = idx
    return {
      labels,
      nowPos,
      oursAqiPeak,
      aqi: {
        labels,
        datasets: [{ type: 'bar', label: 'AQI', data: aqiVals, backgroundColor: aqiColors, borderRadius: 3, barPercentage: 1, categoryPercentage: 0.92 }],
      },
      pm: {
        labels,
        datasets: [
          { label: 'Past hours', data: observed, borderColor: '#0e1a2b', backgroundColor: 'rgba(14,26,43,0.06)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.35 },
          { label: 'CAMS forecast', data: cams, borderColor: '#18a7c9', borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: 0.35 },
          { label: 'Our forecast', data: ours, borderColor: '#3563f0', backgroundColor: 'rgba(53,99,240,0.10)', fill: false, borderWidth: 3, pointRadius: 0, tension: 0.35 },
        ],
      },
      weather: {
        labels,
        datasets: [
          { label: 'PM2.5 (µg/m³)', data: weatherIdx.map((i) => raw.pm25[i]), borderColor: '#0e1a2b', borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'y' },
          { label: 'Wind (km/h)', data: weatherIdx.map((i) => raw.wind[i]), borderColor: '#2fa36b', borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'y1' },
          { label: 'Humidity (%)', data: weatherIdx.map((i) => raw.rh[i]), borderColor: '#9b8cf2', borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'y1', borderDash: [3, 3] },
          { type: 'bar', label: 'Rain (mm)', data: weatherIdx.map((i) => raw.rain[i]), backgroundColor: 'rgba(24,167,201,0.35)', yAxisID: 'y1', barPercentage: 1 },
        ],
      },
    }
  }, [city, fc.data, range])

  const tickOpts = useMemo(
    () => ({
      autoSkip: true,
      maxRotation: 0,
      maxTicksLimit: 8,
    }),
    []
  )

  if (!city) {
    if (cities.length === 0) {
      return (
        <div className="page container">
          <StatusBanner />
          <div className="card"><Skeleton h={40} w="30%" /><Skeleton h={220} style={{ marginTop: 18 }} /></div>
        </div>
      )
    }
    return (
      <div className="page container">
        <div className="card">
          <h1>City not found</h1>
          <p>We don&apos;t track a city called “{id}”. <Link to="/">Back to the overview</Link></p>
        </div>
      </div>
    )
  }

  const watching = alerts.cities.includes(city.id)
  const toggleWatch = () =>
    setAlerts((a) => ({ ...a, cities: watching ? a.cities.filter((c) => c !== city.id) : [...a.cities, city.id] }))
  const ourNext24 = fc.data ? fc.data.reduce((s, p) => s + p.pm25, 0) / fc.data.length : null
  const camsNext24 = (() => {
    const v = city.raw.pm25.slice(city.nowIdx + 1, city.nowIdx + 25).filter((x) => x != null)
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  })()

  return (
    <div className="page container">
      <StatusBanner />
      <nav className="crumbs small" aria-label="Breadcrumb"><Link to="/">Overview</Link> <span aria-hidden="true">/</span> {city.name}</nav>

      <section className="city-hero card" style={{ '--cat': city.category?.color || '#ccd' }}>
        <div className="city-hero-main">
          <AqiRing aqi={city.aqi} size={200} stroke={14} />
          <div className="city-hero-text">
            <p className="eyebrow">{city.state}</p>
            <h1>{city.name}</h1>
            <div className="city-meta">
              <AqiBadge aqi={city.aqi} />
              {city.dominant && <span className="muted small">Main pollutant <b style={{ color: 'var(--ink)' }}>{POLLUTANTS[city.dominant].label}</b></span>}
              {city.change24h != null && (
                <span className={`small delta ${city.change24h > 0 ? 'up' : 'down'}`}>
                  {city.change24h > 0 ? '▲' : city.change24h < 0 ? '▼' : '•'} {Math.abs(city.change24h)} vs yesterday
                </span>
              )}
            </div>
            {city.category && (
              <div className="advice">
                <b>What it means</b>
                <p>{city.category.impact}</p>
                <p className="advice-tip">{city.category.advice}</p>
              </div>
            )}
            <div className="city-actions">
              <button className={`btn ${myCity === city.id ? 'primary' : ''}`} onClick={() => setMyCity(city.id)} aria-pressed={myCity === city.id}>
                <Icon.star width={16} height={16} /> {myCity === city.id ? 'My city' : 'Set as my city'}
              </button>
              <button className={`btn ${watching ? 'primary' : ''}`} onClick={toggleWatch} aria-pressed={watching}>
                <Icon.bell width={16} height={16} /> {watching ? 'Alerts on' : 'Alert me'}
              </button>
              <Link className="btn" to={`/compare?c=${city.id}`}><Icon.compare width={16} height={16} /> Compare</Link>
            </div>
          </div>
        </div>
        <WeatherTiles w={city.weather} />
      </section>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h2>PM2.5: our forecast vs CAMS</h2>
            <p className="card-sub">Past {range} h (solid) and what comes next. Our line is my ridge + LightGBM model running in your browser (24 h ahead), the dashed one is CAMS.</p>
          </div>
          <div className="seg" role="group" aria-label="History range">
            <button className={range === '24' ? 'on' : ''} onClick={() => setRange('24')} aria-pressed={range === '24'}>24 h</button>
            <button className={range === '72' ? 'on' : ''} onClick={() => setRange('72')} aria-pressed={range === '72'}>72 h</button>
          </div>
        </div>
        <ChartView
          type="line"
          data={charts.pm}
          height={300}
          label={`PM2.5 history and forecast for ${city.name}`}
          options={{
            spanGaps: false,
            scales: { x: { ticks: tickOpts, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'µg/m³' } } },
            plugins: { nowLine: { index: charts.nowPos } },
          }}
        />
        <div className="fc-compare">
          <div>
            <span className="muted small">Next 24 h average, our model</span>
            <b className="num" style={{ color: '#3563f0' }}>{fc.status === 'ok' ? <><AnimatedNumber value={ourNext24} decimals={1} /> µg/m³</> : fc.status === 'loading' ? '…' : 'n/a'}</b>
          </div>
          <div>
            <span className="muted small">Next 24 h average, CAMS</span>
            <b className="num" style={{ color: '#138aa6' }}>{camsNext24 == null ? 'n/a' : <><AnimatedNumber value={camsNext24} decimals={1} /> µg/m³</>}</b>
          </div>
          <div>
            <span className="muted small">Peak AQI next 24 h (ours / CAMS)</span>
            <b className="num">{charts.oursAqiPeak ?? '–'} / {city.peakNext24 ?? '–'}</b>
          </div>
        </div>
        {fc.status === 'error' && <p className="small muted">The forecast model could not be loaded, only the CAMS forecast is shown.</p>}
        {fc.status === 'nodata' && <p className="small muted">Not enough recent data for our model right now.</p>}
      </Reveal>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <h2>AQI hour by hour</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Rolling CPCB AQI. Faded bars are the forecast (CAMS).</p>
          <ChartView
            type="bar"
            data={charts.aqi}
            height={260}
            label={`Hourly AQI for ${city.name}`}
            options={{
              plugins: { legend: { display: false }, nowLine: { index: charts.nowPos } },
              scales: { x: { ticks: tickOpts, grid: { display: false } }, y: { beginAtZero: true, suggestedMax: 150 } },
            }}
          />
        </Reveal>
        <Reveal className="card" delay={60}>
          <h2>Pollutant breakdown</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>CPCB averages and sub-indices right now. The highest one is the AQI.</p>
          <PollutantGrid city={city} />
        </Reveal>
      </div>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <h2>Weather vs pollution</h2>
        <p className="card-sub" style={{ marginBottom: 12 }}>
          Windy hours usually clear the air, calm humid nights trap it. Same window as above, {hourLabel(city.raw.time[city.nowIdx])} is now.
        </p>
        <ChartView
          type="line"
          data={charts.weather}
          height={300}
          label={`PM2.5 with wind, humidity and rain for ${city.name}`}
          options={{
            scales: {
              x: { ticks: tickOpts, grid: { display: false } },
              y: { position: 'left', beginAtZero: true, title: { display: true, text: 'PM2.5 µg/m³' } },
              y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'wind / humidity / rain' } },
            },
            plugins: { nowLine: { index: charts.nowPos } },
          }}
        />
      </Reveal>

      <p className="small muted" style={{ marginTop: 16 }}>
        PM2.5 breakpoints used: {BREAKPOINTS.pm25.join(' / ')} µg/m³ (24 h). Grid cell for this city: {city.raw ? `${city.lat.toFixed(2)}°N, ${city.lon.toFixed(2)}°E` : ''}.{' '}
        <Link to="/model">How the AQI and forecast are calculated →</Link>
      </p>
    </div>
  )
}
