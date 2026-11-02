import { describe, it, expect } from 'vitest'
import { subIndex, computeAqi, categoryFor, avg24, max8hIn24, aqiAt } from './aqi.js'

describe('subIndex', () => {
  it('is 0 at zero and hits the band edges exactly', () => {
    expect(subIndex('pm25', 0)).toBe(0)
    expect(subIndex('pm25', 30)).toBe(50)
    expect(subIndex('pm25', 60)).toBe(100)
    expect(subIndex('pm25', 90)).toBe(200)
    expect(subIndex('pm25', 120)).toBe(300)
    expect(subIndex('pm25', 250)).toBe(400)
    expect(subIndex('pm10', 100)).toBe(100)
    expect(subIndex('co', 2)).toBe(100)
    expect(subIndex('o3', 168)).toBe(200)
  })

  it('interpolates inside a band', () => {
    // PM2.5 45 is halfway between 30 and 60 -> 75
    expect(subIndex('pm25', 45)).toBeCloseTo(75)
    // PM10 175 is halfway between 100 and 250 -> 150
    expect(subIndex('pm10', 175)).toBeCloseTo(150)
    // NO2 230 is halfway between 180 and 280 -> 250
    expect(subIndex('no2', 230)).toBeCloseTo(250)
    // CO 6 mg/m3 is halfway between 2 and 10 -> 150
    expect(subIndex('co', 6)).toBeCloseTo(150)
    // SO2 20 -> 25
    expect(subIndex('so2', 20)).toBeCloseTo(25)
  })

  it('keeps going in the severe band but caps at 500', () => {
    expect(subIndex('pm25', 315)).toBeCloseTo(450)
    expect(subIndex('pm25', 2000)).toBe(500)
  })

  it('returns null for missing or bad values', () => {
    expect(subIndex('pm25', null)).toBeNull()
    expect(subIndex('pm25', -3)).toBeNull()
    expect(subIndex('nh3', 10)).toBeNull()
  })
})

describe('computeAqi', () => {
  it('takes the max sub-index and reports the dominant pollutant', () => {
    const r = computeAqi({ pm25: 45, pm10: 80, no2: 30, o3: 40, co: 0.5, so2: 10 })
    expect(r.valid).toBe(true)
    expect(r.aqi).toBe(80) // pm10 80 -> 80 beats pm25 45 -> 75
    expect(r.dominant).toBe('pm10')
    expect(r.category.name).toBe('Satisfactory')
  })

  it('needs at least 3 pollutants including a PM', () => {
    expect(computeAqi({ pm25: 50, no2: 20 }).valid).toBe(false)
    expect(computeAqi({ no2: 20, so2: 5, o3: 30 }).valid).toBe(false)
    expect(computeAqi({ pm25: 50, no2: 20, so2: 5 }).valid).toBe(true)
  })

  it('a typical Delhi winter day lands in Very Poor', () => {
    const r = computeAqi({ pm25: 180, pm10: 300, no2: 70, so2: 15, o3: 30, co: 2.4 })
    expect(r.dominant).toBe('pm25')
    expect(r.aqi).toBe(346)
    expect(r.category.name).toBe('Very Poor')
  })
})

describe('categoryFor', () => {
  it('uses the CPCB ranges', () => {
    expect(categoryFor(50).name).toBe('Good')
    expect(categoryFor(51).name).toBe('Satisfactory')
    expect(categoryFor(100.4).name).toBe('Satisfactory')
    expect(categoryFor(150).name).toBe('Moderate')
    expect(categoryFor(201).name).toBe('Poor')
    expect(categoryFor(399).name).toBe('Very Poor')
    expect(categoryFor(480).name).toBe('Severe')
  })
})

describe('averaging', () => {
  it('avg24 averages the last 24 hours and needs 16 values', () => {
    const s = Array.from({ length: 48 }, (_, i) => i)
    expect(avg24(s, 47)).toBeCloseTo((24 + 47) / 2)
    const gappy = Array(24).fill(null)
    for (let i = 0; i < 15; i++) gappy[i] = 10
    expect(avg24(gappy, 23)).toBeNull()
  })

  it('max8hIn24 picks the worst 8 hour window', () => {
    const s = Array(30).fill(10)
    for (let i = 20; i < 28; i++) s[i] = 90
    expect(max8hIn24(s, 29)).toBeCloseTo(90)
  })

  it('aqiAt converts CO from ug/m3 to mg/m3', () => {
    const n = 30
    const hourly = {
      pm25: Array(n).fill(20), pm10: Array(n).fill(40), no2: Array(n).fill(10),
      so2: Array(n).fill(5), o3: Array(n).fill(30), co: Array(n).fill(6000),
    }
    const r = aqiAt(hourly, n - 1)
    expect(r.concentrations.co).toBeCloseTo(6)
    expect(r.dominant).toBe('co')
    expect(r.aqi).toBe(150)
  })
})
