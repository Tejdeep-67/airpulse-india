// Fetches live air quality + weather for all cities from Open-Meteo.
// Both APIs accept many coordinates in one request, so a full refresh is just
// 2 requests for all 37 cities. Results are cached in localStorage so the page
// opens instantly and still works (with old data) if the API is down.
import cities from '../data/cities.json'

const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const WX_URL = 'https://api.open-meteo.com/v1/forecast'
const CACHE_KEY = 'airpulse:data:v1'
export const REFRESH_MS = 15 * 60 * 1000

const AQ_VARS = ['pm2_5', 'pm10', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone', 'carbon_monoxide']
const WX_VARS = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m',
  'precipitation', 'cloud_cover', 'surface_pressure']
const WX_CURRENT = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'wind_speed_10m',
  'wind_direction_10m', 'precipitation', 'weather_code', 'is_day']

function buildUrl(base, params) {
  const q = new URLSearchParams({
    latitude: cities.map((c) => c.lat).join(','),
    longitude: cities.map((c) => c.lon).join(','),
    timezone: 'Asia/Kolkata',
    past_days: '3',
    forecast_days: '3',
    ...params,
  })
  return `${base}?${q}`
}

async function fetchJson(url, { tries = 3, timeout = 20000 } = {}) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      // wait 1s, then 3s before trying again
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, attempt === 0 ? 1000 : 3000))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

// "2026-11-02T21:00" for the current hour in IST, matching Open-Meteo's local times
export function istHourString(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 13) + ':00'
}

// keep only what we need, as plain arrays (also what goes into the cache)
function compact(aqList, wxList) {
  return cities.map((c, i) => {
    const a = aqList[i].hourly
    const w = wxList[i].hourly
    // both APIs should give the same hourly time axis, but line them up by time to be safe
    const wIndex = new Map(w.time.map((t, j) => [t, j]))
    const pick = (arr) => a.time.map((t) => {
      const j = wIndex.get(t)
      return j == null ? null : arr[j]
    })
    return {
      id: c.id,
      time: a.time,
      pm25: a.pm2_5,
      pm10: a.pm10,
      no2: a.nitrogen_dioxide,
      so2: a.sulphur_dioxide,
      o3: a.ozone,
      co: a.carbon_monoxide,
      temp: pick(w.temperature_2m),
      rh: pick(w.relative_humidity_2m),
      wind: pick(w.wind_speed_10m),
      wdir: pick(w.wind_direction_10m),
      rain: pick(w.precipitation),
      cloud: pick(w.cloud_cover),
      pressure: pick(w.surface_pressure),
      current: wxList[i].current || null,
    }
  })
}

export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.cities) || data.cities.length !== cities.length) return null
    return data
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // storage full or blocked (private mode) - not a big deal, just skip caching
  }
}

export async function fetchAll() {
  const [aq, wx] = await Promise.all([
    fetchJson(buildUrl(AQ_URL, { hourly: AQ_VARS.join(','), domains: 'cams_global' })),
    fetchJson(buildUrl(WX_URL, { hourly: WX_VARS.join(','), current: WX_CURRENT.join(','), wind_speed_unit: 'kmh' })),
  ])
  // with a single location the API returns an object instead of a list
  const aqList = Array.isArray(aq) ? aq : [aq]
  const wxList = Array.isArray(wx) ? wx : [wx]
  if (aqList.length !== cities.length || wxList.length !== cities.length) {
    throw new Error('unexpected response size')
  }
  const data = { fetchedAt: Date.now(), cities: compact(aqList, wxList) }
  writeCache(data)
  return data
}
