"""
Pre-compute the numbers for the Insights page from the downloaded history
(model/data/raw, see fetch_history.py). Output: src/data/insights.json

Everything here is plain pandas: group-bys, means and Spearman correlations.
Note: the data is the CAMS model (Open-Meteo), not CPCB station readings, so
these are patterns in modelled air quality.
"""
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "data", "raw")
CITIES = json.load(open(os.path.join(HERE, "..", "src", "data", "cities.json")))
OUT = os.path.join(HERE, "..", "src", "data", "insights.json")

BREAKPOINTS = {
    "pm25": [30, 60, 90, 120, 250], "pm10": [50, 100, 250, 350, 430],
    "no2": [40, 80, 180, 280, 400], "so2": [40, 80, 380, 800, 1600],
    "o3": [50, 100, 168, 208, 748], "co": [1, 2, 10, 17, 34],
}
BANDS = [0, 50, 100, 200, 300, 400, 500]
CATS = ["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"]

NORTH = ["delhi", "noida", "lucknow", "kanpur", "patna", "amritsar", "chandigarh", "jaipur", "agra", "varanasi"]
SOUTH = ["chennai", "bengaluru", "kochi", "thiruvananthapuram", "coimbatore", "madurai"]
AP_TS = ["guntur", "vijayawada", "visakhapatnam", "tirupati", "nellore", "hyderabad", "warangal"]


def sub_index(p, c):
    """same piecewise linear formula as src/lib/aqi.js"""
    bp = BREAKPOINTS[p]
    c = np.asarray(c, dtype=float)
    out = np.full(c.shape, np.nan)
    lo = 0.0
    for i, hi in enumerate(bp):
        m = np.isnan(out) & (c <= hi)
        out[m] = BANDS[i] + (c[m] - lo) * (BANDS[i + 1] - BANDS[i]) / (hi - lo)
        lo = hi
    m = np.isnan(out) & ~np.isnan(c)
    out[m] = np.minimum(500, 400 + (c[m] - bp[-1]) * 100 / (bp[-1] - bp[-2]))
    return out


def daily_aqi(df):
    d = df.set_index("time")
    day = d.index.floor("D")
    means = d[["pm2_5", "pm10", "no2", "so2"]].groupby(day).mean()
    roll8 = d[["o3", "co"]].rolling(8, min_periods=6).mean()
    max8 = roll8.groupby(day).max()
    subs = pd.DataFrame({
        "pm25": sub_index("pm25", means["pm2_5"]), "pm10": sub_index("pm10", means["pm10"]),
        "no2": sub_index("no2", means["no2"]), "so2": sub_index("so2", means["so2"]),
        "o3": sub_index("o3", max8["o3"]), "co": sub_index("co", max8["co"] / 1000),
    }, index=means.index)
    res = pd.DataFrame({"aqi": subs.max(axis=1).round(), "dominant": subs.idxmax(axis=1), "pm25": means["pm2_5"]})
    return res


def category(aqi):
    for i, top in enumerate([50, 100, 200, 300, 400]):
        if aqi <= top:
            return CATS[i]
    return CATS[-1]


def main():
    names = {c["id"]: c["name"] for c in CITIES}
    frames = {c["id"]: pd.read_csv(os.path.join(RAW, f"{c['id']}.csv"), parse_dates=["time"]) for c in CITIES}
    start = min(f["time"].min() for f in frames.values())
    end = max(f["time"].max() for f in frames.values())

    night_day, weekend, corr, cat_days, season, dominant = [], [], [], [], [], {}
    hour_profiles = {}
    wind_bins = []
    monthly = {"north": [], "south": [], "ap_ts": []}
    monthly_frames = {}

    for cid, df in frames.items():
        df = df.copy()
        hr = df["time"].dt.hour
        night = df.loc[(hr >= 22) | (hr <= 5), "pm2_5"].mean()
        aft = df.loc[(hr >= 12) & (hr <= 17), "pm2_5"].mean()
        night_day.append({"city": names[cid], "night": round(night, 1), "afternoon": round(aft, 1),
                          "ratio": round(night / aft, 2)})

        prof = df.groupby(hr)["pm2_5"].mean()
        hour_profiles[cid] = (prof / prof.mean()).round(3).tolist()

        daily = daily_aqi(df)
        dow = daily.index.dayofweek
        wd = daily.loc[dow < 5, "pm25"].mean()
        we = daily.loc[dow >= 5, "pm25"].mean()
        weekend.append({"city": names[cid], "weekday": round(wd, 1), "weekend": round(we, 1),
                        "diff_pct": round((we - wd) / wd * 100, 1)})

        counts = daily["aqi"].dropna().map(category).value_counts()
        cat_days.append({"city": names[cid], "days": {c: int(counts.get(c, 0)) for c in CATS},
                         "total": int(counts.sum()), "mean_aqi": round(float(daily["aqi"].mean()), 1)})
        dom = daily["dominant"].value_counts(normalize=True)
        dominant[names[cid]] = {k: round(float(v), 3) for k, v in dom.items()}

        mon = df["time"].dt.month
        winter = df.loc[mon.isin([11, 12, 1, 2]), "pm2_5"].mean()
        monsoon = df.loc[mon.isin([6, 7, 8, 9]), "pm2_5"].mean()
        season.append({"city": names[cid], "winter": round(winter, 1), "monsoon": round(monsoon, 1),
                       "ratio": round(winter / monsoon, 2)})

        sp = df[["pm2_5", "wind", "rh", "temp", "rain"]].corr(method="spearman")["pm2_5"]
        corr.append({"city": names[cid], **{k: round(float(sp[k]), 2) for k in ["wind", "rh", "temp", "rain"]}})

        # wind bins with pm2.5 as % of the city's own average, so cities are comparable
        rel = df["pm2_5"] / df["pm2_5"].mean() * 100
        bins = pd.cut(df["wind"], [0, 5, 10, 15, 20, 25, 200], right=False,
                      labels=["0-5", "5-10", "10-15", "15-20", "20-25", "25+"])
        wind_bins.append(rel.groupby(bins, observed=False).mean())

        monthly_frames[cid] = daily["aqi"].groupby(daily.index.to_period("M")).mean()

    for region, ids in [("north", NORTH), ("south", SOUTH), ("ap_ts", AP_TS)]:
        m = pd.concat([monthly_frames[i] for i in ids], axis=1).mean(axis=1)
        monthly[region] = [{"month": str(p), "aqi": round(float(v), 1)} for p, v in m.items()]

    wb = pd.concat(wind_bins, axis=1).mean(axis=1)
    med = pd.DataFrame(corr)[["wind", "rh", "temp", "rain"]].median()

    out = {
        "period": f"{start:%d %b %Y} to {end:%d %b %Y}",
        "hours": int(sum(len(f) for f in frames.values())),
        "cities": len(frames),
        "night_vs_day": sorted(night_day, key=lambda x: -x["ratio"]),
        "weekday_vs_weekend": sorted(weekend, key=lambda x: x["diff_pct"]),
        "correlation": sorted(corr, key=lambda x: x["wind"]),
        "correlation_median": {k: round(float(v), 2) for k, v in med.items()},
        "wind_bins": [{"bin": str(k), "pm_rel": round(float(v), 1)} for k, v in wb.items()],
        "category_days": sorted(cat_days, key=lambda x: -x["mean_aqi"]),
        "winter_vs_monsoon": sorted(season, key=lambda x: -x["ratio"]),
        "monthly_region": monthly,
        "hour_profiles": {k: hour_profiles[k] for k in ["delhi", "kolkata", "mumbai", "hyderabad", "guntur", "bengaluru"]},
        "dominant_share": dominant,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")
    print("median spearman with pm2.5:", out["correlation_median"])
    print("night/afternoon ratio top 5:", [(x["city"], x["ratio"]) for x in out["night_vs_day"][:5]])
    print("weekend diff range:", out["weekday_vs_weekend"][0], out["weekday_vs_weekend"][-1])
    print("wind bins:", out["wind_bins"])


if __name__ == "__main__":
    main()
