"""
Train the PM2.5 forecast model used on the site.

Goal: at hour t, predict PM2.5 for each of the next 24 hours (t+1 ... t+24) for a city.

Inputs (all known at time t):
  - recent PM2.5 (lags, 6h / 24h means, 3h trend), PM10 / NO2 / CO right now
  - PM2.5 at the same hour yesterday (t+h-24)
  - weather at the target hour + wind/rain in between (on the site this comes from
    the Open-Meteo weather forecast; for training it is the historical forecast data)
  - hour of day, day of week, season, horizon h, city lat/lon

Target: change in log(PM2.5) from now to t+h. Working in log space keeps clean
cities and Delhi on a similar scale and a tree model then only has to learn
"how much will it go up or down".

Time based split (no shuffling, no future data in training):
  train : forecast origins before 2026-07-01 (and the target hour too)
  valid : July - August 2026 (used only to pick the number of trees)
  test  : 1 Sep - 31 Oct 2026, never touched until the end
After picking settings the final model is refit on train+valid and scored on test.

Models:
  ridge            one ridge regression per horizon (24 small linear models)
  lightgbm         one gradient boosted tree model for all horizons (h is a feature)
  blend (final)    w[h] * lightgbm + (1 - w[h]) * ridge, w[h] picked on the validation
                   months. Ridge is better for the first few hours, trees win later.

Baselines on the same test rows:
  persistence      PM2.5(t+h) = PM2.5(t)
  same hour yday   PM2.5(t+h) = PM2.5(t+h-24)

usage: python model/train_forecast.py
outputs: public/model/pm25_model.json (ridge + trees + blend weights for the browser), model/metrics.json,
         model/js_check.json (a few rows to check the JS port gives the same numbers)
"""
import json
import os
import time

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "data", "raw")
CITIES = json.load(open(os.path.join(HERE, "..", "src", "data", "cities.json")))
OUT_MODEL = os.path.join(HERE, "..", "public", "model", "pm25_model.json")

VALID_START = pd.Timestamp("2026-07-01")
TEST_START = pd.Timestamp("2026-09-01")
HORIZON = 24
RNG = np.random.default_rng(42)

FEATURES = [
    "h", "pm0", "pm1", "pm2", "pm3", "pm6", "pm12", "pm24", "pm_yday", "pm_mean6", "pm_mean24",
    "pm_trend3", "pm10_0", "no2_0", "co_0",
    "temp", "rh", "wind", "rain", "cloud", "pressure", "wdir_sin", "wdir_cos",
    "wind_0", "rh_0", "temp_0", "wind_mean_ahead", "rain_sum_ahead",
    "hour_sin", "hour_cos", "dow", "weekend", "doy_sin", "doy_cos", "lat", "lon",
]


def load():
    frames = []
    for c in CITIES:
        df = pd.read_csv(os.path.join(RAW, f"{c['id']}.csv"), parse_dates=["time"])
        df = df.sort_values("time").reset_index(drop=True)
        # the series should be a complete hourly index already, check it
        assert df["time"].diff().dropna().eq(pd.Timedelta("1h")).all(), c["id"]
        df[["pm2_5", "pm10", "no2", "co"]] = df[["pm2_5", "pm10", "no2", "co"]].interpolate(limit=3)
        df["lat"], df["lon"] = c["lat"], c["lon"]
        frames.append(df)
    return frames


def build_rows(df, origins):
    """features for every (origin, horizon) pair, vectorised with numpy"""
    pm = np.log1p(df["pm2_5"].to_numpy())
    pm10 = np.log1p(df["pm10"].to_numpy())
    no2 = np.log1p(df["no2"].to_numpy())
    co = np.log1p(df["co"].to_numpy())
    wind = df["wind"].to_numpy()
    rain = df["rain"].to_numpy()
    t = df["time"]
    csum_pm = np.concatenate([[0], np.cumsum(pm)])
    csum_wind = np.concatenate([[0], np.cumsum(wind)])
    csum_rain = np.concatenate([[0], np.cumsum(rain)])

    out = []
    o = origins
    for h in range(1, HORIZON + 1):
        tg = o + h
        f = {
            "h": np.full(len(o), h),
            "pm0": pm[o], "pm1": pm[o - 1], "pm2": pm[o - 2], "pm3": pm[o - 3],
            "pm6": pm[o - 6], "pm12": pm[o - 12], "pm24": pm[o - 24],
            "pm_yday": pm[tg - 24],
            "pm_mean6": (csum_pm[o + 1] - csum_pm[o - 5]) / 6,
            "pm_mean24": (csum_pm[o + 1] - csum_pm[o - 23]) / 24,
            "pm_trend3": pm[o] - pm[o - 3],
            "pm10_0": pm10[o], "no2_0": no2[o], "co_0": co[o],
            "temp": df["temp"].to_numpy()[tg], "rh": df["rh"].to_numpy()[tg],
            "wind": wind[tg], "rain": rain[tg], "cloud": df["cloud"].to_numpy()[tg],
            "pressure": df["pressure"].to_numpy()[tg],
            "wdir_sin": np.sin(np.radians(df["wind_dir"].to_numpy()[tg])),
            "wdir_cos": np.cos(np.radians(df["wind_dir"].to_numpy()[tg])),
            "wind_0": wind[o], "rh_0": df["rh"].to_numpy()[o], "temp_0": df["temp"].to_numpy()[o],
            "wind_mean_ahead": (csum_wind[tg + 1] - csum_wind[o + 1]) / h,
            "rain_sum_ahead": csum_rain[tg + 1] - csum_rain[o + 1],
            "hour_sin": np.sin(2 * np.pi * t.dt.hour.to_numpy()[tg] / 24),
            "hour_cos": np.cos(2 * np.pi * t.dt.hour.to_numpy()[tg] / 24),
            "dow": t.dt.day_of_week.to_numpy()[tg],
            "weekend": (t.dt.day_of_week.to_numpy()[tg] >= 5).astype(int),
            "doy_sin": np.sin(2 * np.pi * t.dt.day_of_year.to_numpy()[tg] / 365.25),
            "doy_cos": np.cos(2 * np.pi * t.dt.day_of_year.to_numpy()[tg] / 365.25),
            "lat": df["lat"].to_numpy()[tg], "lon": df["lon"].to_numpy()[tg],
        }
        part = pd.DataFrame(f)
        part["y"] = pm[tg] - pm[o]          # target: change in log pm2.5
        part["pm_now"] = df["pm2_5"].to_numpy()[o]
        part["pm_true"] = df["pm2_5"].to_numpy()[tg]
        part["pm_yday_raw"] = df["pm2_5"].to_numpy()[tg - 24]
        part["origin"] = t.to_numpy()[o]
        part["target_time"] = t.to_numpy()[tg]
        part["city"] = df["city"].iloc[0]
        out.append(part)
    return pd.concat(out, ignore_index=True)


def make_dataset(frames, stride):
    parts = []
    for df in frames:
        idx = np.arange(24, len(df) - HORIZON)
        # random offset so every origin hour of the day shows up
        idx = idx[(idx + RNG.integers(stride)) % stride == 0]
        parts.append(build_rows(df, idx))
    d = pd.concat(parts, ignore_index=True)
    return d.dropna(subset=FEATURES + ["y"])


def scores(true, pred):
    err = pred - true
    return {"mae": round(float(np.mean(np.abs(err))), 2), "rmse": round(float(np.sqrt(np.mean(err ** 2))), 2)}


def evaluate(test, preds):
    """overall, by horizon bucket, and on the next-24h mean (what the 24h AQI uses)"""
    res = {}
    buckets = {"1-6h": (1, 6), "7-12h": (7, 12), "13-24h": (13, 24)}
    for name, p in preds.items():
        r = {"all": scores(test["pm_true"].to_numpy(), p)}
        for b, (a, z) in buckets.items():
            m = test["h"].between(a, z).to_numpy()
            r[b] = scores(test["pm_true"].to_numpy()[m], p[m])
        tmp = pd.DataFrame({"key": test["city"] + test["origin"].astype(str), "t": test["pm_true"], "p": p})
        g = tmp.groupby("key").agg(t=("t", "mean"), p=("p", "mean"), n=("t", "size"))
        g = g[g["n"] == HORIZON]
        r["next24h_mean"] = scores(g["t"].to_numpy(), g["p"].to_numpy())
        res[name] = r
    return res


def tree_to_arrays(tree):
    """flatten a LightGBM tree into arrays the browser can walk:
    feature, threshold, left, right for split nodes (child < 0 means leaf ~child)"""
    feat, thr, left, right, leaves = [], [], [], [], []

    def walk(node):
        if "leaf_index" in node or "leaf_value" in node and "split_feature" not in node:
            leaves.append(round(node["leaf_value"], 7))
            return ~(len(leaves) - 1)
        i = len(feat)
        feat.append(node["split_feature"])
        thr.append(float(node["threshold"]))
        left.append(0)
        right.append(0)
        assert node["decision_type"] == "<="
        left[i] = walk(node["left_child"])
        right[i] = walk(node["right_child"])
        return i

    root = tree["tree_structure"]
    if "split_feature" not in root:  # a tree that is just one leaf
        return {"f": [], "t": [], "l": [], "r": [], "v": [round(root["leaf_value"], 7)]}
    walk(root)
    return {"f": feat, "t": thr, "l": left, "r": right, "v": leaves}


def main():
    t0 = time.time()
    frames = load()
    data = make_dataset(frames, stride=3)
    train = data[data["target_time"] < VALID_START]
    valid = data[(data["origin"] >= VALID_START) & (data["target_time"] < TEST_START)]
    trainval = data[data["target_time"] < TEST_START]
    # test uses every 2nd origin hour so it is a big, fair sample of Sep-Oct
    test = make_dataset(frames, stride=2)
    test = test[test["origin"] >= TEST_START].reset_index(drop=True)
    print(f"rows train {len(train):,} valid {len(valid):,} test {len(test):,}")

    params = dict(objective="l2", learning_rate=0.05, num_leaves=127, min_data_in_leaf=100,
                  feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0,
                  verbose=-1, seed=7)

    # --- step 1: fit on train, tune on valid ---
    m = lgb.train(params, lgb.Dataset(train[FEATURES], train["y"]), num_boost_round=3000,
                  valid_sets=[lgb.Dataset(valid[FEATURES], valid["y"])],
                  callbacks=[lgb.early_stopping(50, verbose=False)])
    best = m.best_iteration
    print("best iteration on valid:", best)
    gbm_valid = m.predict(valid[FEATURES])
    ridge_valid = fit_ridges(train).predict(valid)

    # blend weight per horizon, chosen on the validation months only
    weights = []
    for h in range(1, HORIZON + 1):
        mk = (valid["h"] == h).to_numpy()
        log_now = np.log1p(valid["pm_now"].to_numpy()[mk])
        truth = valid["pm_true"].to_numpy()[mk]
        errs = []
        for w in np.linspace(0, 1, 11):
            p = np.expm1(log_now + w * gbm_valid[mk] + (1 - w) * ridge_valid[mk])
            errs.append(np.mean(np.abs(p - truth)))
        weights.append(round(float(np.linspace(0, 1, 11)[int(np.argmin(errs))]), 1))
    print("blend weight for lightgbm by horizon:", weights)

    # --- step 2: refit on train+valid with those settings, score once on test ---
    final = lgb.train(params, lgb.Dataset(trainval[FEATURES], trainval["y"]), num_boost_round=best)
    ridges = fit_ridges(trainval)

    log_now = np.log1p(test["pm_now"].to_numpy())
    gbm_delta = final.predict(test[FEATURES])
    ridge_delta = ridges.predict(test)
    w_row = np.array(weights)[test["h"].to_numpy() - 1]
    preds = {
        "persistence": test["pm_now"].to_numpy(),
        "same_hour_yesterday": test["pm_yday_raw"].to_numpy(),
        "ridge": np.expm1(log_now + ridge_delta),
        "lightgbm": np.expm1(log_now + gbm_delta),
        "blend": np.expm1(log_now + w_row * gbm_delta + (1 - w_row) * ridge_delta),
    }

    metrics = evaluate(test, preds)
    by_h = {}
    for h in range(1, HORIZON + 1):
        mk = (test["h"] == h).to_numpy()
        by_h[h] = {k: scores(test["pm_true"].to_numpy()[mk], v[mk])["mae"] for k, v in preds.items()}

    per_city = {}
    for c, g in test.groupby("city"):
        ix = g.index.to_numpy()
        per_city[c] = {k: scores(g["pm_true"].to_numpy(), v[ix])["mae"] for k, v in preds.items()
                       if k in ("persistence", "blend")}

    gain = final.feature_importance("gain")
    importance = sorted(zip(FEATURES, (gain / gain.sum()).round(4).tolist()), key=lambda x: -x[1])

    out = {
        "trained_on": f"{str(data['origin'].min())[:10]} to 2026-08-31",
        "valid_period": "2026-07-01 to 2026-08-31 (only for early stopping and blend weights)",
        "test_period": "2026-09-01 to 2026-10-31",
        "cities": len(frames),
        "rows": {"train": int(len(train)), "valid": int(len(valid)), "trainval": int(len(trainval)), "test": int(len(test))},
        "trees": int(best),
        "blend_weights": weights,
        "metrics_ug_m3": metrics,
        "mae_by_horizon": by_h,
        "mae_per_city": per_city,
        "feature_importance_gain": importance,
    }
    json.dump(out, open(os.path.join(HERE, "metrics.json"), "w"), indent=2)

    dump = final.dump_model()
    model = {
        "name": "pm25-24h-ridge-lightgbm-blend",
        "features": FEATURES,
        "target": "log1p(pm25[t+h]) - log1p(pm25[t])",
        "ridge": ridges.export(),
        "blend_weights": weights,
        "trees": [tree_to_arrays(t) for t in dump["tree_info"]],
        "test_mae": {k: metrics[k]["all"]["mae"] for k in metrics},
        "trained_until": "2026-08-31",
    }
    os.makedirs(os.path.dirname(OUT_MODEL), exist_ok=True)
    with open(OUT_MODEL, "w") as f:
        json.dump(model, f, separators=(",", ":"))

    # a few rows so the JS version can be checked against python
    sample = test.sample(60, random_state=1)
    xs = sample[FEATURES].round(8)
    sw = np.array(weights)[sample["h"].to_numpy() - 1]
    check = {"features": FEATURES, "rows": xs.values.tolist(),
             "gbm": final.predict(xs).round(8).tolist(),
             "ridge": ridges.predict(xs).round(8).tolist(),
             "blend": (sw * final.predict(xs) + (1 - sw) * ridges.predict(xs)).round(8).tolist()}
    json.dump(check, open(os.path.join(HERE, "js_check.json"), "w"))

    print(json.dumps({k: v["all"] for k, v in metrics.items()}, indent=1))
    print(json.dumps({k: v["next24h_mean"] for k, v in metrics.items()}, indent=1))
    print("top features:", importance[:8])
    print(f"model json {os.path.getsize(OUT_MODEL) / 1e6:.2f} MB, took {time.time() - t0:.0f}s")


class Ridges:
    """24 ridge models, one per horizon"""

    def __init__(self, models):
        self.models = models

    def predict(self, df):
        out = np.zeros(len(df))
        hs = df["h"].to_numpy()
        for h, m in self.models.items():
            mk = hs == h
            if mk.any():
                out[mk] = m.predict(df.loc[mk, FEATURES])
        return out

    def export(self):
        # fold the scaler into the weights: w_raw = w / std, b_raw = b - sum(w * mean / std)
        res = []
        for h in range(1, HORIZON + 1):
            sc, rg = self.models[h].named_steps["standardscaler"], self.models[h].named_steps["ridge"]
            w = rg.coef_ / sc.scale_
            b = rg.intercept_ - np.sum(rg.coef_ * sc.mean_ / sc.scale_)
            res.append({"w": [round(float(v), 9) for v in w], "b": round(float(b), 9)})
        return res


def fit_ridges(df):
    models = {}
    for h in range(1, HORIZON + 1):
        part = df[df["h"] == h]
        models[h] = make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(part[FEATURES], part["y"])
    return Ridges(models)


if __name__ == "__main__":
    main()
