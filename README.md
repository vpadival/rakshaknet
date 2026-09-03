# RakshakNet / Aegis-Grid

Software solution for **SIH26178 (Qualcomm)** — a resilient, AI-powered environmental monitoring network for early detection, localized intelligence, and actionable alerts for floods, forest fires, pollution events, and other environmental hazards.

## Architecture

![RakshakNet system architecture](assets/architecture.svg)

Field nodes run inference locally (edge AI) and only forward classified threat events upstream. The aggregation server correlates zone-level signals and drives two dashboards (Authority, Citizen) plus an SMS alert gateway that fires automatically once a zone crosses a severity threshold.

## Project layout

```
rakshaknet/
├── index.html, style.css, app.js, data.js   # frontend dashboard (this is the demo UI)
├── assets/architecture.svg                  # diagram above
└── backend/
    ├── server.js       # Express API — the "aggregation server"
    ├── classify.js      # rule-based threat classifier (stand-in for the trained edge ML model)
    ├── smsGateway.js     # stubbed SMS sender — swap in Twilio when ready
    └── seedData.js       # starting zone data, in place of real edge telemetry
```

## Running it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser — the same Express server now serves the dashboard *and* the API, so there's nothing else to start. The dashboard polls the backend every 5 seconds; the status dot next to the clock turns red if it loses the connection.

(If you ever open `index.html` directly as a `file://` URL instead — e.g. for a quick static-only preview — `data.js` falls back to hitting `http://localhost:4000` explicitly, so that still works as long as the backend is running.)

## Dashboard

- **Authority view** — per-zone sensor readings, ML-predicted cause with confidence, camera-based stranded-people detection, manual SMS dispatch.
- **Citizen view** — simplified threat level, safe-zone guidance, one-tap navigation to the nearest safe area (real Google Maps directions), and the same stranded-people alert (framed for community assistance).
- **SMS log** — reflects real dispatches from the backend, whether triggered manually or automatically on escalation.
- **"Simulate escalation"** button posts real telemetry to the backend (`POST /api/zones/:id/telemetry`) rather than faking it client-side — useful for demos before real sensors exist, and it exercises the same code path hardware will eventually hit.

## Backend API

| Method | Path                          | Purpose                                                                 |
|--------|-------------------------------|--------------------------------------------------------------------------|
| GET    | `/api/zones`                  | List all zones with current status                                       |
| GET    | `/api/zones/:id`               | Single zone detail                                                       |
| POST   | `/api/zones/:id/telemetry`     | **Edge devices push readings here.** Body: `{ sensors?, peopleDetected? }` — partial updates are merged, then re-classified |
| POST   | `/api/zones/:id/sms`           | Manually dispatch an SMS for a zone. Body: `{ message? }` (defaults to the zone's current citizen message) |
| GET    | `/api/sms-log`                 | Recent SMS dispatch history                                              |
| GET    | `/api/health`                  | Liveness check                                                           |

This is the contract the hardware team can target once real sensors are ready — `POST /api/zones/:id/telemetry` with real readings is a drop-in replacement for the seeded mock data and the "Simulate escalation" button.

### Classification logic
`backend/classify.js` currently uses simple thresholds per hazard type (e.g. water level + rainfall for floods, MQ2 ppm for fire, AQI for pollution) to produce `{ level, cause, confidence }`. This keeps the same output contract a trained model would use, so swapping in real ML later shouldn't require frontend or API changes.

### SMS gateway
`backend/smsGateway.js` currently logs and stores dispatches in memory instead of sending a real text. Replace the body of `sendSms()` with a real provider call (Twilio is stubbed as a comment in the file) once credentials are available. Auto-dispatch on escalation to "severe" is controlled by the `SEVERE_AUTO_SMS` flag in `server.js`.

## Not yet wired up
- Real sensor/edge ingestion (backend currently seeds from `seedData.js`; point real hardware at `POST /api/zones/:id/telemetry`)
- Real SMS provider (Twilio or a local telecom API) — see `smsGateway.js`
- Persistent storage (everything is in-memory and resets on server restart)
- Trained ML models on the edge nodes (currently rule-based in `classify.js`)