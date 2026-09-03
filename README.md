# RakshakNet / Aegis-Grid

Software solution for **SIH26178 (Qualcomm)** — a resilient, AI-powered environmental monitoring network for early detection, localized intelligence, and actionable alerts for floods, forest fires, pollution events, earthquakes, and other environmental hazards.

## Architecture

![RakshakNet system architecture](assets/architecture.svg)

Field nodes run inference locally (edge AI) and only forward classified threat events upstream. The aggregation server correlates zone-level signals and drives two dashboards (Authority, Citizen) plus an SMS alert gateway that fires automatically once a zone crosses a severity threshold, or when several zones go severe at once (mass-event escalation).

## Data audit — read this before presenting the ML claims

Four datasets were provided; each hazard's approach below was decided by what the data actually supports, not by what would look best in a pitch:

| Hazard | Dataset | Verdict | Approach used |
|---|---|---|---|
| Flood | `flood_risk_dataset_india.xlsx` | **No real signal.** AUC ~0.51 (logistic regression and random forest both at chance), correlations under 0.03, sensor columns are perfectly uniform random — the label was assigned independently of the inputs. | Physically-motivated threshold rules (water level + rainfall), not ML. Retrain if you find a real historical flood dataset. |
| Forest fire | `forest.xlsx` (Sirsi weather) + `forest2.xlsx` (MODIS hotspots) | **Real, joinable signal.** Matched fire hotspots near Sirsi to the weather station by date; cross-validated AUC 0.90. | Trained logistic regression, layered with an MQ2 smoke override and camera-confirmation override for real-time detection. |
| Air pollution | `air_quality.xlsx` | Dataset's AQI doesn't consistently follow the real CPCB formula (partially synthetic/noisy) — not reliable for training OR validation. | Implemented the actual official CPCB National AQI formula directly. Deterministic, matches the real government standard regardless of the dataset. |
| Earthquake | *(none provided)* | **No sensor described for this project can predict a seismic event.** Real early-warning systems detect the P-wave with accelerometers/geophones seconds before the S-wave — a different sensor and problem entirely. | Manual/relay-only alert path. No ML prediction claim. |
| Heavy rainfall / extreme temperature | Derived from the same datasets | Not independent outcomes to predict — they aggravate flood/fire risk. | Percentile-derived threshold flags layered onto whichever zone they occur in. |

Full methodology and reproducible scripts are in `backend/training/`.

## Project layout

```
rakshaknet/
├── index.html, style.css, app.js, data.js   # frontend dashboard
├── assets/architecture.svg                  # diagram above
└── backend/
    ├── server.js          # Express API — the "aggregation server"
    ├── classify.js         # per-hazard classification (see data audit above for what backs each one)
    ├── dailyStats.js        # rolling per-zone daily weather aggregator (the fire model needs daily stats;
    │                         sensors report instantaneous readings, so this bridges the gap)
    ├── aqiFormula.js         # official CPCB National AQI formula
    ├── sensorLimits.js       # per-sensor thresholds, each labeled data-derived vs. literature-default
    ├── smsGateway.js         # stubbed SMS sender — swap in Twilio when ready
    ├── seedData.js           # starting zone data, in place of real edge telemetry
    ├── models/
    │   └── fire_model.json   # trained logistic regression (mean/scale/weights/bias — portable to plain JS)
    └── training/
        ├── audit_flood_dataset.py   # run this against any new dataset before training on it
        ├── train_fire.py             # reproduces fire_model.json from the raw Excel files
        └── README.md                 # methodology notes
```

## Running it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser — the same Express server serves the dashboard *and* the API. The dashboard polls the backend every 5 seconds; the status dot next to the clock turns red if it loses the connection.

(If you ever open `index.html` directly as a `file://` URL instead — e.g. for a quick static-only preview — `data.js` falls back to hitting `http://localhost:4000` explicitly, so that still works as long as the backend is running.)

## Dashboard

- **Authority view** — per-zone sensor readings, predicted cause with confidence and which model produced it (`modelType`), camera-based stranded-people detection, manual SMS dispatch.
- **Citizen view** — simplified threat level, safe-zone guidance, one-tap navigation to the nearest safe area (real Google Maps directions), the same stranded-people alert (framed for community assistance), and a **"Use my location"** button that checks the phone's browser location against monitored zones (no GPS module needed on the hardware).
- **SMS log** — reflects real dispatches from the backend, including a distinct entry when a mass event fires.
- **"Simulate escalation"** button posts real telemetry to the backend rather than faking it client-side.

## Backend API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/zones` | List all zones with current status |
| GET | `/api/zones/:id` | Single zone detail |
| POST | `/api/zones/:id/telemetry` | **Edge devices push readings here.** Body: `{ sensors?, peopleDetected?, cameraFireConfirmed? }` |
| POST | `/api/zones/:id/earthquake` | Manually report (or later, relay from real accelerometer hardware) a seismic event. Body: `{ magnitude }`. Not ML-predicted. |
| POST | `/api/checkin` | Phone-geolocation check-in. Body: `{ lat, lng }` — matches to the nearest zone within 25km, or returns a generic "no known hazard" response |
| POST | `/api/zones/:id/sms` | Manually dispatch an SMS for a zone. Body: `{ message? }` |
| GET | `/api/sms-log` | Recent SMS dispatch history, including mass-event entries |
| GET | `/api/health` | Liveness check |

`POST /api/zones/:id/telemetry` is the contract real edge hardware should target. `sensors` accepts: `waterLevelM`, `rainfallMmHr`, `soilMoisturePct`, `humidityPct`, `tempC`, `mq2Ppm`, `windGustKmh`, `aqi`, or `pollutants: { "PM2.5", PM10, NO2, SO2, CO, O3, NH3 }` for the full CPCB formula.

### Classification logic
See the data audit table above for what backs each hazard. `classify.js` is heavily commented with the reasoning and caveats for each — read it before presenting any specific accuracy number.

### Sensor limits
`sensorLimits.js` documents every threshold's source. Most are data-derived (real percentiles from the uploaded datasets); **MQ2 gas thresholds are literature defaults, not data-derived** — no uploaded dataset includes gas sensor readings, so recalibrate against your actual sensor's datasheet and a controlled test before trusting those numbers.

### SMS gateway
`smsGateway.js` currently logs and stores dispatches in memory instead of sending a real text. Replace the body of `sendSms()` with a real provider call (Twilio is stubbed as a comment) once credentials are available. Auto-dispatch on escalation to "severe" is controlled by `SEVERE_AUTO_SMS`; mass-event clustering (multiple zones severe at once) is controlled by `MASS_EVENT_ZONE_THRESHOLD`, both in `server.js`.

## Not yet wired up
- **Person detection** — no image dataset was provided, so nothing is trained. The `peopleDetected` telemetry field and dashboard display already exist as the integration point; the recommended path is a pretrained model (e.g. YOLOv8n's "person" class) running on the edge camera device, posting `{ count, note }` to the existing telemetry endpoint.
- Real sensor/edge ingestion (backend currently seeds from `seedData.js`)
- Real SMS provider (Twilio or a local telecom API)
- Persistent storage (everything is in-memory and resets on server restart)
- Multi-region fire model (currently trained on one location, ~14 months)