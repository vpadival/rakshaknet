# Model training & data audit

Scripts used to produce (and justify) what's in `backend/classify.js` and
`backend/models/`. Run these yourself if you get better/more data, want to
verify the findings, or need to explain the methodology to judges.

## `audit_flood_dataset.py`

Run this against ANY dataset before training a flood model on it. It checks
raw feature-target correlation, a random forest's AUC, and whether the
sensor columns look like real measurements (skewed, clustered) or synthetic
noise (perfectly uniform). `flood_risk_dataset_india.xlsx` failed this audit
— AUC ~0.51, max correlation 0.03, every sensor column uniformly random —
which is why `classify.js`'s flood classifier is rule-based, not ML.

```bash
python3 audit_flood_dataset.py /path/to/dataset.xlsx
```

## `train_fire.py`

Reproduces `backend/models/fire_model.json`: joins Sirsi (Western Ghats)
weather station data against nearby MODIS fire-hotspot detections by date,
trains a logistic regression, cross-validates (AUC ~0.90), and exports
`{mean, scale, weights, bias}` — plain numbers, no Python/sklearn runtime
needed at inference time, so `classify.js` can score it in a few lines of
JS (see `scoreLogisticModel` there).

```bash
python3 train_fire.py
```

Caveat carried into the export's `caveats` field: this is one location over
~14 months. Before trusting it in another state, retrain against that
region's weather + hotspot data the same way.

## Why there's no `train_pollution.py`

Air quality classification isn't a model to train — it's the CPCB National
AQI formula (published government breakpoints), implemented directly in
`backend/aqiFormula.js`. We checked `air_quality.xlsx` against the real
formula and found it doesn't match consistently (some rows fit the official
max-sub-index rule exactly, many don't), so treat that dataset as unreliable
for validation too — but the formula itself is correct regardless of what's
in that file.

## Why there's no earthquake model

No sensor described for this project (humidity/temp/gas/water-level) can
predict a seismic event — that's not a data-availability problem, it's a
different kind of sensor (accelerometer/geophone) and a different kind of
problem (millisecond P-wave detection, not day-ahead prediction). See the
comment above `classifyEarthquake` in `classify.js`.
