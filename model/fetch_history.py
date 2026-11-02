"""
Download hourly air quality + weather history for every city in src/data/cities.json
from Open-Meteo (free, no key). Output: model/data/raw/<city>.csv

Air quality  -> air-quality-api.open-meteo.com (CAMS global model, ~0.4 deg grid)
Weather      -> historical-forecast-api.open-meteo.com (same kind of data the live
                forecast API gives, so training and live features match better)

One city per request with a pause in between so we stay well inside the free
fair-use limits. Re-running skips cities that are already downloaded.

usage: python model/fetch_history.py --start 2025-01-01 --end 2026-10-31
"""
import argparse
import json
import os
import time

import pandas as pd
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CITIES = os.path.join(HERE, "..", "src", "data", "cities.json")
RAW = os.path.join(HERE, "data", "raw")

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"

AQ_VARS = ["pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "ozone", "carbon_monoxide"]
WX_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m",
           "wind_direction_10m", "precipitation", "cloud_cover", "surface_pressure"]


def get(url, params, tries=5):
    for i in range(tries):
        r = requests.get(url, params=params, timeout=120)
        if r.status_code == 200:
            return r.json()
        # 429 = rate limited, back off and try again
        wait = 30 * (i + 1) if r.status_code == 429 else 5 * (i + 1)
        print(f"  {r.status_code} {r.text[:120]} -> waiting {wait}s")
        time.sleep(wait)
    raise RuntimeError(f"failed after {tries} tries: {url}")


def fetch_city(c, start, end):
    common = dict(latitude=c["lat"], longitude=c["lon"], start_date=start,
                  end_date=end, timezone="Asia/Kolkata")
    aq = get(AQ_URL, {**common, "hourly": ",".join(AQ_VARS)})["hourly"]
    time.sleep(3)
    wx = get(WX_URL, {**common, "hourly": ",".join(WX_VARS), "wind_speed_unit": "kmh"})["hourly"]
    a = pd.DataFrame(aq).rename(columns={"nitrogen_dioxide": "no2", "sulphur_dioxide": "so2",
                                         "ozone": "o3", "carbon_monoxide": "co"})
    w = pd.DataFrame(wx).rename(columns={"temperature_2m": "temp", "relative_humidity_2m": "rh",
                                         "wind_speed_10m": "wind", "wind_direction_10m": "wind_dir",
                                         "precipitation": "rain", "cloud_cover": "cloud",
                                         "surface_pressure": "pressure"})
    df = a.merge(w, on="time", how="left")
    df.insert(0, "city", c["id"])
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-01-01")
    ap.add_argument("--end", default="2026-10-31")
    args = ap.parse_args()

    os.makedirs(RAW, exist_ok=True)
    cities = json.load(open(CITIES))
    for i, c in enumerate(cities, 1):
        out = os.path.join(RAW, f"{c['id']}.csv")
        if os.path.exists(out):
            continue
        print(f"[{i}/{len(cities)}] {c['name']}")
        df = fetch_city(c, args.start, args.end)
        df.to_csv(out, index=False)
        time.sleep(8)
    print("done")


if __name__ == "__main__":
    main()
