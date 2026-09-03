"""
Trains the forest fire logistic regression model shipped as
backend/models/fire_model.json.

Approach: forest.xlsx (10-min weather readings from a Sirsi, Western Ghats
station, Feb 2021-Apr 2022) is aggregated to daily stats and labeled against
forest2.xlsx (MODIS satellite fire-hotspot detections across India,
2004-2025), matched by date wherever a hotspot fell within roughly 150km of
Sirsi (lat 13.5-15.5, lon 74-76).

This is a real supervised join with genuine signal (cross-validated AUC
~0.90) — unlike the flood dataset, which audit_flood_dataset.py shows has
none. Caveat: single location, ~14 months — retrain per-region before
trusting this broadly.

Usage:
    python3 train_fire.py [weather_xlsx_path] [fire_hotspots_xlsx_path]

Defaults to /mnt/user-data/uploads/ paths if no arguments are given; pass
your own paths (e.g. to forest.xlsx / forest2.xlsx in your Downloads folder)
to override.
"""
import sys
import json
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, classification_report

WEATHER_PATH = sys.argv[1] if len(sys.argv) > 1 else "../../forest.xlsx"
FIRE_HOTSPOT_PATH = sys.argv[2] if len(sys.argv) > 2 else "../../forest2.xlsx"
OUTPUT_PATH = "../models/fire_model.json"

# ---- Step 1: daily-aggregate the weather station data ----
weather = pd.read_excel(WEATHER_PATH).dropna(subset=["Date"])
weather["Date"] = pd.to_datetime(weather["Date"]).dt.date
daily = weather.groupby("Date").agg(
    min_rh=("RH %", "min"),
    mean_rh=("RH %", "mean"),
    max_temp=("AirTemp_degC", "max"),
    total_precip=("Precip_mm/10 mins", "sum"),
    max_wind=("WindGust_km/hr", "max"),
).reset_index()

# ---- Step 2: label each day against nearby MODIS fire hotspots ----
fire = pd.read_excel(FIRE_HOTSPOT_PATH)
fire["Date"] = pd.to_datetime(fire["Date"]).dt.date
near_sirsi = fire[(fire["Lat"].between(13.5, 15.5)) & (fire["Lon"].between(74, 76))]
fire_dates = set(near_sirsi["Date"].unique())
daily["fire_occurred"] = daily["Date"].apply(lambda d: 1 if d in fire_dates else 0)
print(f"{len(daily)} daily records, {daily['fire_occurred'].mean()*100:.1f}% fire-occurred days")

# ---- Step 3: train + evaluate ----
FEATURES = ["min_rh", "mean_rh", "max_temp", "total_precip", "max_wind"]
X = daily[FEATURES].fillna(0).values
y = daily["fire_occurred"].values

scaler = StandardScaler()
X_s = scaler.fit_transform(X)
cv_scores = cross_val_score(
    LogisticRegression(max_iter=1000, class_weight="balanced"), X_s, y, cv=5, scoring="roc_auc"
)
print("5-fold CV AUC:", [round(s, 3) for s in cv_scores], "mean:", round(cv_scores.mean(), 4))

Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
scaler_f = StandardScaler().fit(Xtr)
model = LogisticRegression(max_iter=1000, class_weight="balanced").fit(scaler_f.transform(Xtr), ytr)
proba = model.predict_proba(scaler_f.transform(Xte))[:, 1]
print("Holdout AUC:", round(roc_auc_score(yte, proba), 4))
print(classification_report(yte, model.predict(scaler_f.transform(Xte))))

# ---- Step 4: export for backend/classify.js ----
export = {
    "hazard": "fire",
    "features": FEATURES,
    "feature_description": {
        "min_rh": "Minimum relative humidity that day (%)",
        "mean_rh": "Mean relative humidity that day (%)",
        "max_temp": "Maximum air temperature that day (deg C)",
        "total_precip": "Total precipitation that day (mm)",
        "max_wind": "Maximum wind gust that day (km/hr)",
    },
    "mean": scaler_f.mean_.tolist(),
    "scale": scaler_f.scale_.tolist(),
    "weights": model.coef_[0].tolist(),
    "bias": float(model.intercept_[0]),
    "cv_auc_mean": round(float(cv_scores.mean()), 4),
    "cv_auc_folds": [round(float(s), 4) for s in cv_scores],
    "n_samples": len(X),
    "trained_on": "Daily-aggregated Sirsi (Western Ghats) weather (forest.xlsx) labeled against "
                  "nearby MODIS fire-hotspot detections (forest2.xlsx), Feb 2021-Apr 2022.",
    "caveats": "Single location, ~14 months. Retrain per-region before deploying broadly.",
}
with open(OUTPUT_PATH, "w") as f:
    json.dump(export, f, indent=2)
print(f"\nSaved {OUTPUT_PATH}")