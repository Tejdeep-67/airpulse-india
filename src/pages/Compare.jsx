import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { POLLUTANTS } from '../lib/aqi.js'
import ChartView from '../components/ChartView.jsx'
import { AqiBadge, Reveal, Skeleton, dayHourLabel } from '../components/ui.jsx'
import { Icon } from '../components/Icon.jsx'
import StatusBanner from '../components/StatusBanner.jsx'

const PALETTE = ['#3563f0', '#e5484d', '#2fa36b', '#d98a1c']
const DEFAULT = ['delhi', 'hyderabad', 'vijayawada']
const MAX = 4

export default function Compare() {
  const { cities, byId } = useAir()
  const [params, setParams] = useSearchParams()
  const fromUrl = (params.get('c') || '').split(',').filter((id) => byId[id] || cities.length === 0)
  const [picked, setPicked] = useState(() => {
    const start = fromUrl.length ? fromUrl : DEFAULT
    return [...new Set(start.length === 1 ? [...start, ...DEFAULT.filter((d) => d !== start[0])] : start)].slice(0, MAX)
  })
  const [metric, setMetric] = useState('aqi')
  const [adding, setAdding] = useState('')

  const update = (next) => {
    setPicked(next)
    setParams({ c: next.join(',') }, { replace: true })
  }

  const selected = picked.map((id) => byId[id]).filter(Boolean)

  const chart = useMemo(() => {
    if (!selected.length) return null
    const ref = selected[0]
    const start = Math.max(0, ref.nowIdx - 72)
    const end = Math.min(ref.raw.time.length - 1, ref.nowIdx + 24)
    const times = ref.raw.time.slice(start, end + 1)
    return {
      nowPos: ref.nowIdx - start,
      data: {
        labels: times.map(dayHourLabel),
        datasets: selected.map((c, k) => ({
          label: c.name,
          data: times.map((t) => {
            const i = c.raw.time.indexOf(t)
            if (i === -1) return null
            return metric === 'aqi' ? c.aqiSeries[i] : metric === 'pm25' ? c.raw.pm25[i] : c.raw.temp[i]
          }),
          borderColor: PALETTE[k],
          backgroundColor: PALETTE[k] + '22',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.35,
          segment: { borderDash: (ctx) => (ctx.p0DataIndex >= ref.nowIdx - start ? [6, 5] : undefined) },
        })),
      },
    }
  }, [selected, metric])

  const available = [...cities].filter((c) => !picked.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="page container">
      <StatusBanner />
      <p className="eyebrow">Compare</p>
      <h1 className="section-title">Side by side</h1>
      <p className="muted" style={{ marginTop: 0 }}>Pick up to four cities. Dashed part of each line is the forecast.</p>

      <div className="compare-picker">
        {selected.map((c, k) => (
          <span key={c.id} className="chip on" style={{ background: PALETTE[k], borderColor: PALETTE[k] }}>
            {c.name}
            <button
              className="chip-x"
              onClick={() => update(picked.filter((id) => id !== c.id))}
              aria-label={`Remove ${c.name}`}
            >
              <Icon.close width={14} height={14} />
            </button>
          </span>
        ))}
        {picked.length < MAX && (
          <>
            <label className="sr-only" htmlFor="add-city">Add a city</label>
            <select
              id="add-city"
              className="select select-inline"
              value={adding}
              onChange={(e) => {
                if (e.target.value) update([...picked, e.target.value])
                setAdding('')
              }}
            >
              <option value="">+ Add city</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
      </div>

      {cities.length === 0 ? (
        <div className="card"><Skeleton h={320} /></div>
      ) : selected.length === 0 ? (
        <div className="card"><p>Add a city to start comparing.</p></div>
      ) : (
        <>
          <Reveal className="card">
            <div className="card-head">
              <h2>Last 3 days + next 24 h</h2>
              <div className="seg" role="group" aria-label="Metric">
                {[['aqi', 'AQI'], ['pm25', 'PM2.5'], ['temp', 'Temp']].map(([k, l]) => (
                  <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)} aria-pressed={metric === k}>{l}</button>
                ))}
              </div>
            </div>
            <ChartView
              type="line"
              data={chart.data}
              height={320}
              label="Comparison chart"
              options={{
                scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { beginAtZero: metric !== 'temp' } },
                plugins: { nowLine: { index: chart.nowPos } },
              }}
            />
          </Reveal>

          <Reveal className="compare-cards" delay={60}>
            {selected.map((c, k) => (
              <div key={c.id} className="card compare-card" style={{ borderTop: `4px solid ${PALETTE[k]}` }}>
                <div className="card-head" style={{ marginBottom: 6 }}>
                  <div>
                    <h3><Link to={`/city/${c.id}`}>{c.name}</Link></h3>
                    <p className="card-sub">{c.state}</p>
                  </div>
                  <AqiBadge aqi={c.aqi} />
                </div>
                <div className="compare-aqi num">{c.aqi ?? '–'}</div>
                <dl className="kv">
                  <div><dt>Main pollutant</dt><dd>{c.dominant ? POLLUTANTS[c.dominant].label : '–'}</dd></div>
                  <div><dt>PM2.5 (24 h avg)</dt><dd className="num">{c.concentrations.pm25 != null ? Math.round(c.concentrations.pm25) : '–'} µg/m³</dd></div>
                  <div><dt>PM10 (24 h avg)</dt><dd className="num">{c.concentrations.pm10 != null ? Math.round(c.concentrations.pm10) : '–'} µg/m³</dd></div>
                  <div><dt>Peak next 24 h</dt><dd className="num">{c.peakNext24 ?? '–'}</dd></div>
                  <div><dt>Temp / humidity</dt><dd className="num">{Math.round(c.weather.temp)}°C / {Math.round(c.weather.rh)}%</dd></div>
                  <div><dt>Wind</dt><dd className="num">{Math.round(c.weather.wind)} km/h</dd></div>
                </dl>
              </div>
            ))}
          </Reveal>
        </>
      )}
    </div>
  )
}
