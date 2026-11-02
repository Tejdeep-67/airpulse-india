// Turns the raw hourly arrays into what the UI needs: AQI now, AQI for every
// hour (past + CAMS forecast), trend, dominant pollutant, etc.
import cities from '../data/cities.json'
import { aqiAt, aqiSeries, categoryFor } from './aqi.js'
import { istHourString } from './api.js'

export const cityById = Object.fromEntries(cities.map((c) => [c.id, c]))

export function findNowIndex(time, now = new Date()) {
  const key = istHourString(now)
  const exact = time.indexOf(key)
  if (exact !== -1) return exact
  // cached data from earlier: use the last hour that is not in the future
  let idx = 0
  for (let i = 0; i < time.length; i++) if (time[i] <= key) idx = i
  return idx
}

export function deriveCity(raw, now = new Date()) {
  const meta = cityById[raw.id]
  const nowIdx = findNowIndex(raw.time, now)
  const hourly = { pm25: raw.pm25, pm10: raw.pm10, no2: raw.no2, so2: raw.so2, o3: raw.o3, co: raw.co }
  const aqi = aqiSeries(hourly)
  const current = aqiAt(hourly, nowIdx)
  const dayAgo = nowIdx >= 24 ? aqi[nowIdx - 24] : null
  // forecast part of the AQI series (CAMS based), next 24h
  const next = aqi.slice(nowIdx + 1, nowIdx + 25).filter((v) => v != null)
  const peakNext = next.length ? Math.max(...next) : null
  return {
    ...meta,
    raw,
    nowIdx,
    aqi: current.aqi,
    category: current.category,
    dominant: current.dominant,
    subIndices: current.subIndices,
    concentrations: current.concentrations,
    aqiSeries: aqi,
    change24h: current.aqi != null && dayAgo != null ? current.aqi - dayAgo : null,
    peakNext24: peakNext,
    peakNextCategory: categoryFor(peakNext),
    pm25Now: raw.pm25[nowIdx],
    weather: {
      temp: raw.current?.temperature_2m ?? raw.temp[nowIdx],
      feels: raw.current?.apparent_temperature ?? null,
      rh: raw.current?.relative_humidity_2m ?? raw.rh[nowIdx],
      wind: raw.current?.wind_speed_10m ?? raw.wind[nowIdx],
      wdir: raw.current?.wind_direction_10m ?? raw.wdir[nowIdx],
      rain: raw.current?.precipitation ?? raw.rain[nowIdx],
      code: raw.current?.weather_code ?? null,
      isDay: raw.current?.is_day ?? 1,
    },
  }
}

export function haversineKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function nearestCity(lat, lon) {
  let best = null
  for (const c of cities) {
    const d = haversineKm({ lat, lon }, c)
    if (!best || d < best.distance) best = { city: c, distance: d }
  }
  return best
}
