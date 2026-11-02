// Indian National Air Quality Index (NAQI), CPCB 2014.
//
// Sub-index for each pollutant = linear interpolation inside its breakpoint band,
// overall AQI = the highest sub-index, and that pollutant is the "dominant" one.
// Averaging periods follow CPCB:
//   PM2.5, PM10, NO2, SO2 -> 24 hour average
//   CO, O3               -> 8 hour average (for a live AQI CPCB uses the max of the
//                           8-hour running averages in the last 24 hours)
// CPCB also says the AQI is only valid when at least 3 pollutants are available
// and one of them is PM2.5 or PM10.

// upper concentration of each band: Good, Satisfactory, Moderate, Poor, Very Poor
// (anything above the last value is Severe). Units ug/m3 except CO in mg/m3.
export const BREAKPOINTS = {
  pm25: [30, 60, 90, 120, 250],
  pm10: [50, 100, 250, 350, 430],
  no2: [40, 80, 180, 280, 400],
  so2: [40, 80, 380, 800, 1600],
  o3: [50, 100, 168, 208, 748],
  co: [1, 2, 10, 17, 34],
}

const INDEX_BANDS = [0, 50, 100, 200, 300, 400, 500]

export const POLLUTANTS = {
  pm25: { label: 'PM2.5', unit: 'µg/m³', avg: '24 h' },
  pm10: { label: 'PM10', unit: 'µg/m³', avg: '24 h' },
  no2: { label: 'NO₂', unit: 'µg/m³', avg: '24 h' },
  so2: { label: 'SO₂', unit: 'µg/m³', avg: '24 h' },
  o3: { label: 'O₃', unit: 'µg/m³', avg: '8 h' },
  co: { label: 'CO', unit: 'mg/m³', avg: '8 h' },
}

export const CATEGORIES = [
  { key: 'good', name: 'Good', min: 0, max: 50, color: '#2fa36b', text: '#ffffff',
    impact: 'Minimal impact.',
    advice: 'Great day to be outside. Open the windows.' },
  { key: 'satisfactory', name: 'Satisfactory', min: 51, max: 100, color: '#8cc63f', text: '#14320a',
    impact: 'Minor breathing discomfort to sensitive people.',
    advice: 'Fine for most people. Sensitive people can keep long outdoor workouts shorter.' },
  { key: 'moderate', name: 'Moderate', min: 101, max: 200, color: '#f2c94c', text: '#3d2f00',
    impact: 'Breathing discomfort to people with lung disease like asthma, and discomfort to people with heart disease, children and older adults.',
    advice: 'Children, elders and people with asthma should limit long or heavy outdoor activity.' },
  { key: 'poor', name: 'Poor', min: 201, max: 300, color: '#f2994a', text: '#3d1c00',
    impact: 'Breathing discomfort to most people on prolonged exposure.',
    advice: 'Cut down outdoor exercise. A mask (N95) helps if you are out for long.' },
  { key: 'very-poor', name: 'Very Poor', min: 301, max: 400, color: '#e5484d', text: '#ffffff',
    impact: 'Respiratory illness on prolonged exposure.',
    advice: 'Avoid outdoor activity, keep windows closed, use an air purifier if you have one.' },
  { key: 'severe', name: 'Severe', min: 401, max: 500, color: '#8e2a3b', text: '#ffffff',
    impact: 'Affects healthy people and seriously impacts those with existing diseases.',
    advice: 'Stay indoors as much as possible. People with heart or lung problems should take extra care.' },
]

export function subIndex(pollutant, conc) {
  const bp = BREAKPOINTS[pollutant]
  if (!bp || conc == null || Number.isNaN(conc) || conc < 0) return null
  let lo = 0
  for (let i = 0; i < bp.length; i++) {
    const hi = bp[i]
    if (conc <= hi) {
      return INDEX_BANDS[i] + ((conc - lo) * (INDEX_BANDS[i + 1] - INDEX_BANDS[i])) / (hi - lo)
    }
    lo = hi
  }
  // Severe band: CPCB gives no upper limit, so keep the slope of the
  // Very Poor band and cap the index at 500
  const n = bp.length
  const width = bp[n - 1] - bp[n - 2]
  return Math.min(500, 400 + ((conc - bp[n - 1]) * 100) / width)
}

export function categoryFor(aqi) {
  if (aqi == null) return null
  const v = Math.round(aqi)
  return CATEGORIES.find((c) => v <= c.max) || CATEGORIES[CATEGORIES.length - 1]
}

// concentrations = already averaged values, e.g. { pm25: 74, pm10: 120, co: 1.4 }
export function computeAqi(concentrations) {
  const subs = {}
  for (const p of Object.keys(BREAKPOINTS)) {
    const s = subIndex(p, concentrations[p])
    if (s != null) subs[p] = s
  }
  const keys = Object.keys(subs)
  const hasPm = 'pm25' in subs || 'pm10' in subs
  if (keys.length < 3 || !hasPm) {
    return { aqi: null, dominant: null, subIndices: subs, category: null, valid: false }
  }
  let dominant = keys[0]
  for (const k of keys) if (subs[k] > subs[dominant]) dominant = k
  const aqi = Math.round(subs[dominant])
  return { aqi, dominant, subIndices: subs, category: categoryFor(aqi), valid: true }
}

function mean(values, minCount) {
  let sum = 0
  let n = 0
  for (const v of values) {
    if (v != null && !Number.isNaN(v)) {
      sum += v
      n++
    }
  }
  return n >= minCount ? sum / n : null
}

// average of the 24 hours ending at index i (needs 16 of 24 like CPCB)
export function avg24(series, i) {
  if (i < 0) return null
  return mean(series.slice(Math.max(0, i - 23), i + 1), 16)
}

// max of the 8-hour running averages over the last 24 hours ending at i
export function max8hIn24(series, i) {
  let best = null
  for (let end = Math.max(7, i - 23); end <= i; end++) {
    const m = mean(series.slice(end - 7, end + 1), 6)
    if (m != null && (best == null || m > best)) best = m
  }
  return best
}

// hourly = { pm25: [], pm10: [], no2: [], so2: [], o3: [], co: [] } in ug/m3 (CO too,
// Open-Meteo gives CO in ug/m3 so we convert to mg/m3 here)
export function aqiAt(hourly, i) {
  const conc = {
    pm25: avg24(hourly.pm25, i),
    pm10: avg24(hourly.pm10, i),
    no2: avg24(hourly.no2, i),
    so2: avg24(hourly.so2, i),
    o3: max8hIn24(hourly.o3, i),
    co: hourly.co ? max8hIn24(hourly.co, i) : null,
  }
  if (conc.co != null) conc.co = conc.co / 1000
  return { ...computeAqi(conc), concentrations: conc }
}

// AQI for every hour of a series (null where there isn't enough history yet)
export function aqiSeries(hourly) {
  const n = hourly.pm25.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = i < 15 ? null : aqiAt(hourly, i).aqi
  return out
}
