const path = require("path");
const express = require("express");
const cors = require("cors");
const { seedZones } = require("./seedData");
const { classify, citizenMessage } = require("./classify");
const smsGateway = require("./smsGateway");

const PORT = process.env.PORT || 4000;
const SEVERE_AUTO_SMS = true; // fire an SMS automatically the moment a zone crosses into "severe"
const FRONTEND_DIR = path.join(__dirname, ".."); // index.html, style.css, app.js, data.js live one level up

const app = express();
app.use(cors());
app.use(express.json());

// Serve the dashboard from the same server/port as the API, so opening
// http://localhost:4000 in a browser works with no separate static server
// and no CORS/relative-path issues. API routes below take priority.
app.use(express.static(FRONTEND_DIR));

// ---------- In-memory zone store, seeded once at boot ----------
const zones = new Map();
seedZones.forEach((z) => {
  const result = classify(z.hazard, z.sensors);
  zones.set(z.id, {
    ...z,
    level: result.level,
    mlCause: result.cause,
    confidence: result.confidence,
    citizenMessage: citizenMessage(z.hazard, result.level),
    updatedAt: new Date().toISOString(),
  });
});

function serializeZone(z) {
  const { id, name, hazard, lat, lng, sensors, level, mlCause, confidence, peopleDetected, safeZone, citizenMessage, updatedAt } = z;
  return { id, name, hazard, lat, lng, sensors, level, mlCause, confidence, peopleDetected, safeZone, citizenMessage, updatedAt };
}

// ---------- Routes ----------

app.get("/api/zones", (req, res) => {
  res.json(Array.from(zones.values()).map(serializeZone));
});

app.get("/api/zones/:id", (req, res) => {
  const zone = zones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  res.json(serializeZone(zone));
});

// Edge nodes (or, for now, the "Simulate escalation" button) push telemetry here.
// Body can include a partial `sensors` object and/or `peopleDetected`.
app.post("/api/zones/:id/telemetry", async (req, res) => {
  const zone = zones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: "Zone not found" });

  const { sensors, peopleDetected } = req.body || {};
  const previousLevel = zone.level;

  if (sensors) zone.sensors = { ...zone.sensors, ...sensors };
  if (peopleDetected) zone.peopleDetected = { ...zone.peopleDetected, ...peopleDetected };

  const result = classify(zone.hazard, zone.sensors);
  zone.level = result.level;
  zone.mlCause = result.cause;
  zone.confidence = result.confidence;
  zone.citizenMessage = citizenMessage(zone.hazard, result.level);
  zone.updatedAt = new Date().toISOString();

  let smsSent = null;
  if (SEVERE_AUTO_SMS && zone.level === "severe" && previousLevel !== "severe") {
    smsSent = await smsGateway.sendSms({ zoneId: zone.id, zoneName: zone.name, message: zone.citizenMessage });
  }

  res.json({ zone: serializeZone(zone), smsSent });
});

// Manual SMS dispatch (authority "Send SMS alert" button).
app.post("/api/zones/:id/sms", async (req, res) => {
  const zone = zones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  const message = (req.body && req.body.message) || zone.citizenMessage;
  const entry = await smsGateway.sendSms({ zoneId: zone.id, zoneName: zone.name, message });
  res.json(entry);
});

app.get("/api/sms-log", (req, res) => {
  res.json(smsGateway.getLog());
});

app.get("/api/health", (req, res) => res.json({ status: "ok", zones: zones.size }));

// Anything else that isn't an API route falls back to index.html (simple SPA-style routing).
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`RakshakNet server listening on http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api/zones`);
});