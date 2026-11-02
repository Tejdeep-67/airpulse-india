import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { predictTrees, predictRidge, predictRow, buildFeatures } from './forecast.js'

const model = JSON.parse(readFileSync(new URL('../../public/model/pm25_model.json', import.meta.url)))
const check = JSON.parse(readFileSync(new URL('../../model/js_check.json', import.meta.url)))

describe('forecast model port', () => {
  it('has the same feature order as the python export', () => {
    expect(model.features).toEqual(check.features)
    expect(model.ridge).toHaveLength(24)
    expect(model.blend_weights).toHaveLength(24)
  })

  it('matches python predictions on sample rows', () => {
    const hIdx = check.features.indexOf('h')
    check.rows.forEach((row, i) => {
      const h = row[hIdx]
      expect(predictTrees(model, row)).toBeCloseTo(check.gbm[i], 4)
      expect(predictRidge(model, row, h)).toBeCloseTo(check.ridge[i], 4)
      expect(predictRow(model, row, h)).toBeCloseTo(check.blend[i], 4)
    })
  })

  it('builds every feature the model expects', () => {
    const n = 80
    const times = Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2026, 10, 1, 0) + i * 3600000)
      return d.toISOString().slice(0, 13) + ':00'
    })
    const raw = {
      time: times,
      pm25: Array(n).fill(40), pm10: Array(n).fill(60), no2: Array(n).fill(20), co: Array(n).fill(500),
      temp: Array(n).fill(25), rh: Array(n).fill(60), wind: Array(n).fill(8), wdir: Array(n).fill(90),
      rain: Array(n).fill(0), cloud: Array(n).fill(20), pressure: Array(n).fill(1005),
    }
    const f = buildFeatures(raw, { lat: 16.3, lon: 80.4 }, 30, 5)
    for (const name of model.features) expect(f[name], name).toBeTypeOf('number')
    expect(f.dow).toBe(0) // 2 Nov 2026 is a Monday
    expect(f.pm_trend3).toBe(0)
  })
})
