// A small "live scoreboard": every time a city page opens, we save our forecast and
// the CAMS forecast for the next 24 hours. Later, when those hours have happened,
// we compare both against what the data actually showed. It lives in localStorage,
// so it only knows about forecasts made in this browser.
import { load, save, KEYS } from './prefs.js'

const MAX_ENTRIES = 400

export function recordForecast(city, ours) {
  const log = load(KEYS.scoreboard, [])
  const issued = city.raw.time[city.nowIdx]
  // one entry per city per issue hour is enough
  if (log.some((e) => e.city === city.id && e.issued === issued)) return
  const cams = ours.map((p, h) => city.raw.pm25[city.nowIdx + h + 1])
  log.push({ city: city.id, issued, times: ours.map((p) => p.time), ours: ours.map((p) => +p.pm25.toFixed(1)), cams })
  save(KEYS.scoreboard, log.slice(-MAX_ENTRIES))
}

// compare against the latest data for hours that are now in the past
export function scoreForecasts(cities) {
  const log = load(KEYS.scoreboard, [])
  const byId = Object.fromEntries(cities.map((c) => [c.id, c]))
  let n = 0
  let errOurs = 0
  let errCams = 0
  let issues = 0
  for (const e of log) {
    const c = byId[e.city]
    if (!c) continue
    let used = false
    e.times.forEach((t, k) => {
      const i = c.raw.time.indexOf(t)
      if (i === -1 || i > c.nowIdx) return
      const truth = c.raw.pm25[i]
      if (truth == null || e.cams[k] == null) return
      errOurs += Math.abs(e.ours[k] - truth)
      errCams += Math.abs(e.cams[k] - truth)
      n++
      used = true
    })
    if (used) issues++
  }
  return {
    hours: n,
    forecasts: issues,
    logged: log.length,
    maeOurs: n ? errOurs / n : null,
    maeCams: n ? errCams / n : null,
  }
}
