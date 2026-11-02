import { describe, it, expect } from 'vitest'
import { checkAlerts, COOLDOWN_MS } from './alerts.js'

function city(id, aqi, forecast = []) {
  const series = [aqi, ...forecast]
  return {
    id, name: id, aqi, nowIdx: 0, aqiSeries: series,
    peakNext24: forecast.length ? Math.max(...forecast) : null,
    raw: { time: series.map((_, i) => `2026-11-02T${String(10 + i).padStart(2, '0')}:00`) },
  }
}

describe('checkAlerts', () => {
  const rules = { cities: ['delhi', 'guntur'], threshold: 200, forecast: true }

  it('fires when a watched city is at or above the threshold', () => {
    const { fired } = checkAlerts([city('delhi', 250), city('guntur', 60)], rules, {})
    expect(fired).toHaveLength(1)
    expect(fired[0].kind).toBe('now')
    expect(fired[0].city.id).toBe('delhi')
  })

  it('warns about a forecast crossing with the hour it happens', () => {
    const { fired } = checkAlerts([city('guntur', 120, [150, 190, 210, 180])], { ...rules, cities: ['guntur'] }, {})
    expect(fired[0].kind).toBe('forecast')
    expect(fired[0].when).toBe('2026-11-02T13:00')
    expect(fired[0].body).toContain('1 PM')
  })

  it('ignores forecast crossings when that option is off', () => {
    const { fired } = checkAlerts([city('guntur', 120, [250])], { ...rules, forecast: false }, {})
    expect(fired).toHaveLength(0)
  })

  it('does not repeat the same alert inside the cooldown', () => {
    const now = 1_000_000_000
    const first = checkAlerts([city('delhi', 300)], rules, {}, now)
    const again = checkAlerts([city('delhi', 310)], rules, first.log, now + 60_000)
    const later = checkAlerts([city('delhi', 310)], rules, first.log, now + COOLDOWN_MS + 1)
    expect(again.fired).toHaveLength(0)
    expect(later.fired).toHaveLength(1)
  })

  it('does nothing without rules', () => {
    expect(checkAlerts([city('delhi', 400)], null, {}).fired).toHaveLength(0)
  })
})
