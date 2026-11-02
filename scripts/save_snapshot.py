"""
Save a snapshot of the live Open-Meteo data (same requests the site makes) to
src/data/snapshot.json. The site only uses it as a last resort: when the API
can't be reached and there is nothing cached in the browser yet, it shows this
snapshot with a clear "saved snapshot" banner instead of an empty page.

usage: python scripts/save_snapshot.py
"""
import json
import os
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CITIES = json.load(open(os.path.join(HERE, "..", "src", "data", "cities.json")))
OUT = os.path.join(HERE, "..", "src", "data", "snapshot.json")

common = {
    "latitude": ",".join(str(c["lat"]) for c in CITIES),
    "longitude": ",".join(str(c["lon"]) for c in CITIES),
    "timezone": "Asia/Kolkata", "past_days": 3, "forecast_days": 3,
}
aq = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", params={
    **common, "domains": "cams_global",
    "hourly": "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide"}, timeout=60).json()
wx = requests.get("https://api.open-meteo.com/v1/forecast", params={
    **common, "wind_speed_unit": "kmh",
    "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,surface_pressure",
    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day"},
    timeout=60).json()

cities = []
for c, a, w in zip(CITIES, aq, wx):
    ah, wh = a["hourly"], w["hourly"]
    idx = {t: i for i, t in enumerate(wh["time"])}
    pick = lambda k: [wh[k][idx[t]] if t in idx else None for t in ah["time"]]
    cities.append({
        "id": c["id"], "time": ah["time"],
        "pm25": ah["pm2_5"], "pm10": ah["pm10"], "no2": ah["nitrogen_dioxide"], "so2": ah["sulphur_dioxide"],
        "o3": ah["ozone"], "co": ah["carbon_monoxide"],
        "temp": pick("temperature_2m"), "rh": pick("relative_humidity_2m"), "wind": pick("wind_speed_10m"),
        "wdir": pick("wind_direction_10m"), "rain": pick("precipitation"), "cloud": pick("cloud_cover"),
        "pressure": pick("surface_pressure"), "current": w.get("current"),
    })

with open(OUT, "w") as f:
    json.dump({"fetchedAt": int(time.time() * 1000), "snapshot": True, "cities": cities}, f, separators=(",", ":"))
print("saved", OUT, os.path.getsize(OUT) // 1024, "KB")
