import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import metrics from '../../model/metrics.json'
import { useAir } from '../state/AirData.jsx'
import { BREAKPOINTS, CATEGORIES, POLLUTANTS } from '../lib/aqi.js'
import { scoreForecasts } from '../lib/scoreboard.js'
import ChartView from '../components/ChartView.jsx'
import { Reveal } from '../components/ui.jsx'

const NAMES = {
  persistence: 'Persistence (PM2.5 stays the same)',
  same_hour_yesterday: 'Same hour yesterday',
  ridge: 'Ridge regression',
  lightgbm: 'LightGBM',
  blend: 'Blend (shipped)',
}
const COLORS = { persistence: '#b0b9c6', same_hour_yesterday: '#d9b36c', ridge: '#18a7c9', lightgbm: '#9b8cf2', blend: '#3563f0' }

const FEATURE_LABELS = {
  pm_yday: 'PM2.5 same hour yesterday', pm0: 'PM2.5 now', hour_cos: 'hour of day (cos)', hour_sin: 'hour of day (sin)',
  no2_0: 'NO₂ now', h: 'hours ahead', lat: 'latitude', lon: 'longitude', pm1: 'PM2.5 1 h ago', wind: 'wind at target hour',
  pm_mean24: 'PM2.5 24 h mean', pm_mean6: 'PM2.5 6 h mean', co_0: 'CO now', pm10_0: 'PM10 now', temp: 'temperature',
  rh: 'humidity', doy_sin: 'season (sin)', doy_cos: 'season (cos)', pressure: 'pressure', wind_mean_ahead: 'mean wind until target',
  pm24: 'PM2.5 24 h ago', pm_trend3: '3 h trend', rain_sum_ahead: 'rain until target', cloud: 'cloud cover', temp_0: 'temperature now',
  rh_0: 'humidity now', wind_0: 'wind now', pm2: 'PM2.5 2 h ago', pm3: 'PM2.5 3 h ago', pm6: 'PM2.5 6 h ago', pm12: 'PM2.5 12 h ago',
  dow: 'day of week', weekend: 'weekend', rain: 'rain at target hour', wdir_sin: 'wind direction (sin)', wdir_cos: 'wind direction (cos)',
}

function Scoreboard() {
  const { cities } = useAir()
  const [s, setS] = useState(null)
  useEffect(() => {
    if (cities.length) setS(scoreForecasts(cities))
  }, [cities])
  return (
    <div className="card">
      <p className="eyebrow">Live check, this browser</p>
      <h2>Forecast scoreboard</h2>
      <p className="card-sub" style={{ marginBottom: 12 }}>
        Each time you open a city, its forecast from our model and from CAMS is saved here. Once those hours have
        happened, both are scored against the latest data.
      </p>
      {!s || s.hours === 0 ? (
        <p className="muted">
          Nothing to score yet ({s ? s.logged : 0} forecasts saved). Open a few <Link to="/">city pages</Link> and come back in a few hours.
        </p>
      ) : (
        <div className="score">
          <div><span className="muted small">Our model MAE</span><b className="num" style={{ color: '#3563f0' }}>{s.maeOurs.toFixed(1)}</b></div>
          <div><span className="muted small">CAMS forecast MAE</span><b className="num" style={{ color: '#138aa6' }}>{s.maeCams.toFixed(1)}</b></div>
          <div><span className="muted small">Hours scored</span><b className="num">{s.hours}</b></div>
          <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
            µg/m³, from {s.forecasts} saved forecasts. Small sample, and the “truth” here is the CAMS analysis itself, so take it as a sanity check.
          </p>
        </div>
      )}
    </div>
  )
}

export default function Model() {
  useEffect(() => {
    document.title = 'Forecast model & AQI method · AirPulse India'
  }, [])
  const m = metrics.metrics_ug_m3
  const order = ['persistence', 'same_hour_yesterday', 'ridge', 'lightgbm', 'blend']
  const improvement = Math.round((1 - m.blend.all.mae / m.persistence.all.mae) * 100)

  const charts = useMemo(() => {
    const hs = Object.keys(metrics.mae_by_horizon)
    const imp = metrics.feature_importance_gain.slice(0, 12)
    return {
      horizon: {
        labels: hs.map((h) => `+${h}h`),
        datasets: order.map((k) => ({
          label: NAMES[k],
          data: hs.map((h) => metrics.mae_by_horizon[h][k]),
          borderColor: COLORS[k],
          backgroundColor: COLORS[k],
          borderWidth: k === 'blend' ? 3.5 : 2,
          borderDash: k === 'persistence' || k === 'same_hour_yesterday' ? [5, 4] : undefined,
          pointRadius: 0,
          tension: 0.3,
        })),
      },
      importance: {
        labels: imp.map(([f]) => FEATURE_LABELS[f] || f),
        datasets: [{ label: 'share of total gain', data: imp.map(([, v]) => +(v * 100).toFixed(1)), backgroundColor: '#3563f0cc', borderRadius: 6 }],
      },
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page container">
      <p className="eyebrow">Under the hood</p>
      <h1 className="section-title">AQI method and forecast model</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
        Open-Meteo gives raw pollutant concentrations. Everything else (the AQI, the categories, the forecast and the alerts) is
        calculated in this app. Training code is in <a href="https://github.com/Tejdeep-67/airpulse-india/tree/main/model">model/</a>.
      </p>

      <Reveal className="card" style={{ marginTop: 16 }}>
        <h2>1. CPCB National AQI</h2>
        <p className="card-sub">Each pollutant gets a sub-index by linear interpolation inside its band. The AQI is the highest sub-index.</p>
        <div className="formula">
          <div>I = I<sub>lo</sub> + (C − BP<sub>lo</sub>) × (I<sub>hi</sub> − I<sub>lo</sub>) / (BP<sub>hi</sub> − BP<sub>lo</sub>)</div>
          <div className="muted small">AQI = max(I<sub>PM2.5</sub>, I<sub>PM10</sub>, I<sub>NO₂</sub>, I<sub>SO₂</sub>, I<sub>O₃</sub>, I<sub>CO</sub>)</div>
          <div className="muted small">C = averaged concentration, BP = the band&apos;s breakpoints, I = the band&apos;s index range</div>
        </div>
        <div className="table-wrap">
          <table className="data bp-table">
            <thead>
              <tr>
                <th>Pollutant</th>
                <th>Averaging</th>
                {CATEGORIES.map((c) => (
                  <th key={c.key}><span className="dot" style={{ background: c.color }} /> {c.name}<br /><span className="muted">{c.min}–{c.max}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(BREAKPOINTS).map(([p, bp]) => (
                <tr key={p}>
                  <td><b>{POLLUTANTS[p].label}</b> <span className="muted small">{POLLUTANTS[p].unit}</span></td>
                  <td>{p === 'o3' || p === 'co' ? 'max 8 h avg in 24 h' : '24 h avg'}</td>
                  {bp.map((v, i) => <td key={i} className="num">{i === 0 ? 0 : bp[i - 1]}–{v}</td>)}
                  <td className="num">{bp[bp.length - 1]}+</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes small">
          <li>Valid only when at least 3 pollutants are available and one of them is PM2.5 or PM10 (CPCB rule). 24 h averages need 16 of 24 hours.</li>
          <li>Open-Meteo reports CO in µg/m³, it is divided by 1000 to get mg/m³ before the lookup.</li>
          <li>Above the last breakpoint (Severe) CPCB gives no upper limit, so I keep the Very Poor band&apos;s slope and cap at 500.</li>
          <li>NH₃ and lead are part of NAQI but the CAMS global data has no NH₃ for India, so 6 of the 8 pollutants are used.</li>
          <li>Unit tested in <code>src/lib/aqi.test.js</code> (band edges, interpolation, the 3-pollutant rule, CO units).</li>
        </ul>
      </Reveal>

      <Reveal className="card" style={{ marginTop: 18 }}>
        <h2>2. PM2.5 forecast for the next 24 hours</h2>
        <p className="card-sub" style={{ marginBottom: 14 }}>
          Trained on {metrics.rows.trainval.toLocaleString('en-IN')} examples from {metrics.cities} cities ({metrics.trained_on}), tested on
          {' '}{metrics.rows.test.toLocaleString('en-IN')} examples from {metrics.test_period} that the model never saw.
        </p>
        <div className="timeline" aria-label="Time based split">
          <span style={{ flexGrow: 18 }} className="tl-train">Train · Jan 2025 – Jun 2026</span>
          <span style={{ flexGrow: 2 }} className="tl-valid">Valid</span>
          <span style={{ flexGrow: 2 }} className="tl-test">Test</span>
        </div>
        <div className="grid g-2" style={{ marginTop: 18 }}>
          <div>
            <h3 className="h3">How it works</h3>
            <ul className="notes">
              <li><b>Target:</b> change in log(PM2.5) from now to each of the next 24 hours.</li>
              <li><b>Inputs ({metrics.feature_importance_gain.length}):</b> recent PM2.5 (lags, 6 h / 24 h means, trend), PM2.5 at the same hour yesterday, current PM10 / NO₂ / CO, forecast weather for the target hour (wind, humidity, temperature, rain, cloud, pressure), hour, weekday, season and the city&apos;s location.</li>
              <li><b>Models:</b> 24 ridge regressions (one per hour ahead) and one LightGBM model ({metrics.trees} trees). They are blended with a weight per horizon picked on the validation months: ridge does best in the first hours, LightGBM takes over later.</li>
              <li><b>No leakage:</b> split by time, not randomly; every training target ends before July 2026; the test months were used once, at the end.</li>
              <li><b>In the browser:</b> exported to a JSON file (ridge weights + tree arrays) and evaluated in plain JavaScript, checked against Python on sample rows in a unit test.</li>
            </ul>
          </div>
          <div>
            <h3 className="h3">Test results (Sep – Oct 2026)</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>1-6 h</th><th>13-24 h</th></tr></thead>
                <tbody>
                  {order.map((k) => (
                    <tr key={k} className={k === 'blend' ? 'hl' : ''}>
                      <td>{NAMES[k]}</td>
                      <td className="num">{m[k].all.mae}</td>
                      <td className="num">{m[k].all.rmse}</td>
                      <td className="num">{m[k]['1-6h'].mae}</td>
                      <td className="num">{m[k]['13-24h'].mae}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              µg/m³ over all 24 horizons. The blend&apos;s error is {improvement}% lower than persistence. On the next-24 h average
              (what the 24 h AQI uses) the blend&apos;s MAE is {m.blend.next24h_mean.mae} vs {m.persistence.next24h_mean.mae} for persistence.
            </p>
          </div>
        </div>
      </Reveal>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <h2>Error by hours ahead</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>MAE on the test months (lower is better)</p>
          <ChartView type="line" data={charts.horizon} height={300} label="MAE by forecast horizon"
            options={{ scales: { x: { ticks: { maxTicksLimit: 12, maxRotation: 0 }, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'MAE µg/m³' } } } }} />
        </Reveal>
        <Reveal className="card" delay={60}>
          <h2>What the trees rely on</h2>
          <p className="card-sub" style={{ marginBottom: 12 }}>LightGBM feature importance (gain, % of total), top 12</p>
          <ChartView type="bar" data={charts.importance} height={300} label="Feature importance"
            options={{ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } }} />
        </Reveal>
      </div>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal><Scoreboard /></Reveal>
        <Reveal className="card" delay={60}>
          <h2>Limitations</h2>
          <ul className="notes">
            <li>The data is the CAMS global model on a ~40 km grid, not CPCB station readings. It smooths out local hotspots and usually reads lower than stations in north Indian winters.</li>
            <li>So the model learns to forecast CAMS&apos;s own analysis. A fair comparison with the CAMS forecast on past data isn&apos;t possible because old CAMS forecasts are not archived on Open-Meteo, hence the live scoreboard.</li>
            <li>Training uses historical weather in place of the forecast weather the live site uses, so live errors will be a bit higher than the test numbers.</li>
            <li>The test months (Sep-Oct) are not peak smog season. Winter errors in Delhi are larger in absolute µg/m³.</li>
          </ul>
        </Reveal>
      </div>
    </div>
  )
}
