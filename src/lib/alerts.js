// Alert rules: the user picks cities and an AQI threshold. On every data refresh we
// check each watched city. "now" alerts fire when the current AQI is at or above the
// threshold, "forecast" alerts when the CAMS forecast says it will get there within 24 h.
// The same alert is not repeated for 3 hours so people don't get spammed.
import { categoryFor } from './aqi.js'

export const COOLDOWN_MS = 3 * 60 * 60 * 1000

export function checkAlerts(cities, rules, log, now = Date.now()) {
  const fired = []
  if (!rules || !rules.cities?.length) return { fired, log }
  const nextLog = { ...log }
  for (const id of rules.cities) {
    const c = cities.find((x) => x.id === id)
    if (!c || c.aqi == null) continue
    let alert = null
    if (c.aqi >= rules.threshold) {
      alert = { kind: 'now', key: `${id}:now`, aqi: c.aqi }
    } else if (rules.forecast && c.peakNext24 != null && c.peakNext24 >= rules.threshold) {
      // find the first forecast hour that crosses
      let when = null
      for (let i = c.nowIdx + 1; i <= c.nowIdx + 24 && i < c.aqiSeries.length; i++) {
        if (c.aqiSeries[i] != null && c.aqiSeries[i] >= rules.threshold) {
          when = c.raw.time[i]
          break
        }
      }
      alert = { kind: 'forecast', key: `${id}:forecast`, aqi: c.peakNext24, when }
    }
    if (!alert) continue
    const last = log[alert.key]
    if (last && now - last < COOLDOWN_MS) continue
    nextLog[alert.key] = now
    const cat = categoryFor(alert.aqi)
    fired.push({
      ...alert,
      city: c,
      category: cat,
      title: alert.kind === 'now' ? `${c.name}: AQI ${alert.aqi} (${cat.name})` : `${c.name} may reach AQI ${alert.aqi}`,
      body:
        alert.kind === 'now'
          ? `Above your limit of ${rules.threshold}. ${cat.advice}`
          : `Forecast crosses your limit of ${rules.threshold}${alert.when ? ` around ${formatHour(alert.when)}` : ''}. ${cat.advice}`,
    })
  }
  return { fired, log: nextLog }
}

function formatHour(t) {
  const h = +t.slice(11, 13)
  const label = `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`
  return label
}
