// Runs our PM2.5 forecast model in the browser.
// The model was trained in Python (model/train_forecast.py) and exported to JSON:
//  - 24 ridge regressions (one per hour ahead), scaler already folded into the weights
//  - one LightGBM model, every tree stored as flat arrays (feature, threshold, left,
//    right, leaf values). Tree prediction = sum of the leaf each tree lands in.
//  - a blend weight per hour ahead: final = w * trees + (1 - w) * ridge
// Both models predict the change in log(PM2.5) from now.

let modelPromise = null

export function loadModel() {
  if (!modelPromise) {
    // bundled as its own lazy chunk, so it only downloads when a city page needs it
    modelPromise = import('../data/pm25_model.json')
      .then((m) => m.default)
      .catch((err) => {
        modelPromise = null // allow a retry later
        throw err
      })
  }
  return modelPromise
}

export function predictTrees(model, x) {
  let sum = 0
  for (const tree of model.trees) {
    if (tree.f.length === 0) {
      sum += tree.v[0]
      continue
    }
    let node = 0
    while (node >= 0) {
      node = x[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node]
    }
    sum += tree.v[~node]
  }
  return sum
}

export function predictRidge(model, x, h) {
  const { w, b } = model.ridge[h - 1]
  let sum = b
  for (let i = 0; i < w.length; i++) sum += w[i] * x[i]
  return sum
}

// blended change in log(PM2.5) for horizon h
export function predictRow(model, x, h) {
  const wt = model.blend_weights[h - 1]
  return wt * predictTrees(model, x) + (1 - wt) * predictRidge(model, x, h)
}

// "2026-11-02T21:00" -> parts without going through the browser timezone
function timeParts(str) {
  const y = +str.slice(0, 4)
  const m = +str.slice(5, 7)
  const d = +str.slice(8, 10)
  const hour = +str.slice(11, 13)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = (date.getUTCDay() + 6) % 7 // monday = 0 like pandas
  const doy = Math.round((date - Date.UTC(y, 0, 1)) / 86400000) + 1
  return { hour, dow, doy }
}

const log1p = (v) => Math.log1p(Math.max(0, v))
const rad = (deg) => (deg * Math.PI) / 180

// features for origin index o and horizon h, in the same order as model.features
export function buildFeatures(raw, meta, o, h) {
  const pm = (i) => log1p(raw.pm25[i])
  const tg = o + h
  let mean6 = 0
  for (let i = o - 5; i <= o; i++) mean6 += pm(i)
  let mean24 = 0
  for (let i = o - 23; i <= o; i++) mean24 += pm(i)
  let windAhead = 0
  let rainAhead = 0
  for (let i = o + 1; i <= tg; i++) {
    windAhead += raw.wind[i]
    rainAhead += raw.rain[i]
  }
  const tp = timeParts(raw.time[tg])
  return {
    h,
    pm0: pm(o), pm1: pm(o - 1), pm2: pm(o - 2), pm3: pm(o - 3), pm6: pm(o - 6), pm12: pm(o - 12), pm24: pm(o - 24),
    pm_yday: pm(tg - 24),
    pm_mean6: mean6 / 6,
    pm_mean24: mean24 / 24,
    pm_trend3: pm(o) - pm(o - 3),
    pm10_0: log1p(raw.pm10[o]), no2_0: log1p(raw.no2[o]), co_0: log1p(raw.co[o]),
    temp: raw.temp[tg], rh: raw.rh[tg], wind: raw.wind[tg], rain: raw.rain[tg], cloud: raw.cloud[tg],
    pressure: raw.pressure[tg],
    wdir_sin: Math.sin(rad(raw.wdir[tg])), wdir_cos: Math.cos(rad(raw.wdir[tg])),
    wind_0: raw.wind[o], rh_0: raw.rh[o], temp_0: raw.temp[o],
    wind_mean_ahead: windAhead / h,
    rain_sum_ahead: rainAhead,
    hour_sin: Math.sin((2 * Math.PI * tp.hour) / 24), hour_cos: Math.cos((2 * Math.PI * tp.hour) / 24),
    dow: tp.dow, weekend: tp.dow >= 5 ? 1 : 0,
    doy_sin: Math.sin((2 * Math.PI * tp.doy) / 365.25), doy_cos: Math.cos((2 * Math.PI * tp.doy) / 365.25),
    lat: meta.lat, lon: meta.lon,
  }
}

// next 24 hours of PM2.5 from origin index o. Returns null if there is not
// enough history/forecast weather around o.
export function forecastPm25(model, raw, meta, o) {
  if (o < 24 || o + 24 >= raw.time.length) return null
  const needed = ['pm25', 'pm10', 'no2', 'co']
  for (const k of needed) if (raw[k][o] == null) return null
  for (let i = o - 24; i <= o; i++) if (raw.pm25[i] == null) return null
  const out = []
  for (let h = 1; h <= 24; h++) {
    const f = buildFeatures(raw, meta, o, h)
    const x = model.features.map((name) => f[name])
    if (x.some((v) => v == null || Number.isNaN(v))) return null
    const delta = predictRow(model, x, h)
    out.push({ time: raw.time[o + h], pm25: Math.expm1(log1p(raw.pm25[o]) + delta) })
  }
  return out
}
