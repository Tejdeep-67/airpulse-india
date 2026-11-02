import { useEffect, useMemo, useState } from 'react'
import { useAir } from '../state/AirData.jsx'
import insights from '../data/insights.json'
import ChartView from '../components/ChartView.jsx'
import { Reveal, AnimatedNumber } from '../components/ui.jsx'
import { CATEGORIES } from '../lib/aqi.js'

const REGIONS = {
  north: { label: 'North (Delhi, UP, Punjab, Bihar, Rajasthan)', color: '#e5484d' },
  ap_ts: { label: 'Andhra Pradesh + Telangana', color: '#3563f0' },
  south: { label: 'South (TN, Kerala, Bengaluru)', color: '#2fa36b' },
}
const NORTH = ['delhi', 'noida', 'lucknow', 'kanpur', 'patna', 'amritsar', 'chandigarh', 'jaipur', 'agra', 'varanasi']
const SOUTH = ['chennai', 'bengaluru', 'kochi', 'thiruvananthapuram', 'coimbatore', 'madurai']
const AP_TS = ['guntur', 'vijayawada', 'visakhapatnam', 'tirupati', 'nellore', 'hyderabad', 'warangal']
const PROFILE_COLORS = ['#e5484d', '#d98a1c', '#18a7c9', '#3563f0', '#2fa36b', '#9b8cf2']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function LiveSnapshot() {
  const { cities } = useAir()
  const avg = (ids) => {
    const v = cities.filter((c) => ids.includes(c.id) && c.aqi != null).map((c) => c.aqi)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const groups = [
    { key: 'north', value: avg(NORTH) },
    { key: 'ap_ts', value: avg(AP_TS) },
    { key: 'south', value: avg(SOUTH) },
  ]
  const max = Math.max(1, ...groups.map((g) => g.value || 0))
  // spearman would be overkill for 37 points, a simple pearson on current values
  const pts = cities.filter((c) => c.pm25Now != null && c.weather.wind != null)
  const r = pearson(pts.map((c) => c.weather.wind), pts.map((c) => c.pm25Now))
  return (
    <div className="card">
      <p className="eyebrow">Live, recalculated every refresh</p>
      <h2>Right now by region</h2>
      <p className="card-sub" style={{ marginBottom: 16 }}>Average current AQI of the cities in each group</p>
      <div className="region-bars">
        {groups.map((g) => (
          <div key={g.key} className="region-row">
            <span className="small">{REGIONS[g.key].label}</span>
            <div className="region-track">
              <span style={{ width: `${((g.value || 0) / max) * 100}%`, background: REGIONS[g.key].color }} />
            </div>
            <b className="num"><AnimatedNumber value={g.value} /></b>
          </div>
        ))}
      </div>
      {r != null && (
        <p className="small muted" style={{ marginTop: 14 }}>
          Across all {pts.length} cities this hour, the correlation between wind speed and PM2.5 is{' '}
          <b style={{ color: 'var(--ink)' }}>{r.toFixed(2)}</b>. One hour across cities is noisy, the long-term numbers below are more reliable.
        </p>
      )}
    </div>
  )
}

function pearson(x, y) {
  const n = x.length
  if (n < 5) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

function CategoryDays() {
  const [all, setAll] = useState(false)
  const rows = all ? insights.category_days : insights.category_days.slice(0, 12)
  return (
    <div className="card">
      <h2>How many days in each AQI category</h2>
      <p className="card-sub" style={{ marginBottom: 14 }}>Daily CPCB AQI, {insights.period}, sorted by average AQI</p>
      <div className="stack-list">
        {rows.map((r) => (
          <div className="stack-row" key={r.city}>
            <span className="stack-name">{r.city}</span>
            <div className="stack-bar" role="img" aria-label={`${r.city}: ` + CATEGORIES.map((c) => `${r.days[c.name]} ${c.name}`).join(', ')}>
              {CATEGORIES.map((c) => r.days[c.name] > 0 && (
                <span key={c.key} style={{ flexGrow: r.days[c.name], background: c.color }} title={`${c.name}: ${r.days[c.name]} days`} />
              ))}
            </div>
            <span className="num small muted stack-avg">{Math.round(r.mean_aqi)}</span>
          </div>
        ))}
      </div>
      <div className="stack-foot">
        <ul className="catlegend">
          {CATEGORIES.map((c) => <li key={c.key}><span className="dot" style={{ background: c.color }} />{c.name}</li>)}
        </ul>
        <button className="btn" onClick={() => setAll((v) => !v)}>{all ? 'Show top 12' : `Show all ${insights.category_days.length}`}</button>
      </div>
    </div>
  )
}

export default function Insights() {
  useEffect(() => {
    document.title = 'Insights · AirPulse India'
  }, [])
  const med = insights.correlation_median

  const charts = useMemo(() => {
    const nd = insights.night_vs_day.slice(0, 15)
    const months = insights.monthly_region.north.map((m) => {
      const [y, mo] = m.month.split('-')
      return `${MONTHS[+mo - 1]} ${y.slice(2)}`
    })
    const we = insights.weekday_vs_weekend
    return {
      wind: {
        labels: insights.wind_bins.map((b) => `${b.bin} km/h`),
        datasets: [{
          label: 'PM2.5 as % of the city average',
          data: insights.wind_bins.map((b) => b.pm_rel),
          backgroundColor: ['#e5484d', '#f2994a', '#f2c94c', '#8cc63f', '#2fa36b', '#18a7c9'],
          borderRadius: 8,
        }],
      },
      night: {
        labels: nd.map((d) => d.city),
        datasets: [
          { label: 'Night (10 PM - 6 AM)', data: nd.map((d) => d.night), backgroundColor: '#2b3a67', borderRadius: 4 },
          { label: 'Afternoon (12 - 6 PM)', data: nd.map((d) => d.afternoon), backgroundColor: '#f2c94c', borderRadius: 4 },
        ],
      },
      monthly: {
        labels: months,
        datasets: Object.entries(REGIONS).map(([k, r]) => ({
          label: r.label,
          data: insights.monthly_region[k].map((m) => m.aqi),
          borderColor: r.color,
          backgroundColor: r.color + '1f',
          fill: k === 'north',
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 2,
        })),
      },
      hours: {
        labels: Array.from({ length: 24 }, (_, h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`),
        datasets: Object.entries(insights.hour_profiles).map(([city, vals], k) => ({
          label: city[0].toUpperCase() + city.slice(1),
          data: vals.map((v) => Math.round(v * 100)),
          borderColor: PROFILE_COLORS[k],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
        })),
      },
      weekend: {
        labels: we.map((d) => d.city),
        datasets: [{
          label: 'Weekend vs weekday PM2.5 (%)',
          data: we.map((d) => d.diff_pct),
          backgroundColor: we.map((d) => (d.diff_pct > 0 ? '#e5484d' : '#2fa36b')),
          borderRadius: 3,
        }],
      },
      corr: {
        labels: ['Wind speed', 'Rain', 'Temperature', 'Humidity'],
        datasets: [{
          label: 'Median Spearman correlation with PM2.5',
          data: [med.wind, med.rain, med.temp, med.rh],
          backgroundColor: ['#18a7c9', '#3563f0', '#f2994a', '#9b8cf2'],
          borderRadius: 8,
        }],
      },
    }
  }, [med])

  const topNight = insights.night_vs_day[0]
  const windDrop = insights.wind_bins[0].pm_rel - insights.wind_bins[insights.wind_bins.length - 1].pm_rel
  const season = insights.winter_vs_monsoon[0]
  const we = insights.weekday_vs_weekend
  const weRange = [we[0].diff_pct, we[we.length - 1].diff_pct]

  return (
    <div className="page container">
      <p className="eyebrow">Insights</p>
      <h1 className="section-title">What the data says</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
        Patterns from {insights.hours.toLocaleString('en-IN')} hourly records ({insights.cities} cities, {insights.period}),
        computed with pandas in <code>model/insights.py</code>. The data is the CAMS model, so these are patterns in modelled
        air quality, not station readings.
      </p>

      <div className="grid g-3 insight-kpis" style={{ marginTop: 16 }}>
        <Reveal className="card kpi">
          <span className="kpi-n num">−<AnimatedNumber value={windDrop} decimals={0} />%</span>
          <p>PM2.5 drop from calm hours (under 5 km/h) to windy hours (25+ km/h), relative to each city&apos;s average.</p>
        </Reveal>
        <Reveal className="card kpi" delay={60}>
          <span className="kpi-n num"><AnimatedNumber value={topNight.ratio} decimals={1} />×</span>
          <p>{topNight.city} has the biggest night effect: PM2.5 at night is {topNight.ratio}× the afternoon level.</p>
        </Reveal>
        <Reveal className="card kpi" delay={120}>
          <span className="kpi-n num"><AnimatedNumber value={season.ratio} decimals={1} />×</span>
          <p>{season.city}: winter (Nov-Feb) PM2.5 vs monsoon (Jun-Sep), the biggest seasonal swing of all cities.</p>
        </Reveal>
      </div>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal><LiveSnapshot /></Reveal>
        <Reveal className="card" delay={60}>
          <h2>Wind cleans the air</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Average PM2.5 by wind speed, as % of each city&apos;s own average</p>
          <ChartView type="bar" data={charts.wind} height={250} label="PM2.5 by wind speed band"
            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + '%' } }, x: { grid: { display: false } } } }} />
        </Reveal>
      </div>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <h2>Which weather matters most?</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Median Spearman correlation with hourly PM2.5 across the {insights.cities} cities</p>
          <ChartView type="bar" data={charts.corr} height={230} label="Correlation of PM2.5 with weather"
            options={{ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: -0.6, max: 0.2 }, y: { grid: { display: false } } } }} />
          <p className="small muted">
            Wind ({med.wind}) and rain ({med.rain}) are the strongest. Humidity is close to zero overall ({med.rh}) because it
            pulls both ways: humid winter nights trap smog, but the most humid months are the monsoon, when rain washes it out.
          </p>
        </Reveal>
        <Reveal className="card" delay={60}>
          <h2>Daily rhythm</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Average PM2.5 by hour of day, 100 = the city&apos;s daily average</p>
          <ChartView type="line" data={charts.hours} height={250} label="PM2.5 by hour of day"
            options={{ scales: { x: { ticks: { maxTicksLimit: 12, maxRotation: 0 }, grid: { display: false } } } }} />
          <p className="small muted">Most cities peak late evening into the night, when the boundary layer gets shallow and the air stops mixing, and are cleanest mid-afternoon.</p>
        </Reveal>
      </div>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <h2>The winter problem</h2>
        <p className="card-sub" style={{ marginBottom: 12 }}>Monthly average of the daily AQI, by region</p>
        <ChartView type="line" data={charts.monthly} height={300} label="Monthly AQI by region"
          options={{ scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }, y: { beginAtZero: true } } }} />
      </Reveal>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <h2>Worse at night</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Top 15 cities by night / afternoon PM2.5 ratio (µg/m³)</p>
          <ChartView type="bar" data={charts.night} height={420} label="Night vs afternoon PM2.5"
            options={{ indexAxis: 'y', scales: { x: { beginAtZero: true }, y: { grid: { display: false }, ticks: { autoSkip: false } } } }} />
        </Reveal>
        <Reveal className="card" delay={60}>
          <h2>Weekday vs weekend</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>Weekend PM2.5 compared to weekdays (%)</p>
          <ChartView type="bar" data={charts.weekend} height={420} label="Weekend vs weekday PM2.5"
            options={{ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 } } } } }} />
          <p className="small muted">
            Honest result: the difference is small, from {weRange[0]}% to +{weRange[1]}%. The CAMS model&apos;s emission data
            doesn&apos;t have a strong weekly traffic cycle, so this is mostly weather noise. Station data would be needed to
            test the weekend effect properly.
          </p>
        </Reveal>
      </div>

      <Reveal style={{ marginTop: 18 }}><CategoryDays /></Reveal>
    </div>
  )
}
