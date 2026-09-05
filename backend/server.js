const path = require("path");
const express = require("express");
const cors = require("cors");
const { seedZones } = require("./seedData");
const { classify, citizenMessage, computeFlags } = require("./classify");
const { checkSensorRange } = require("./sensorLimits");
const smsGateway = require("./smsGateway");
const { getEvacuationGuidance, buildEmergencySms } = require("./evacuationGuidance");

const PORT = process.env.PORT || 4000;
const SEVERE_AUTO_SMS = true; // fire an SMS automatically the moment a zone crosses into "severe"
const MASS_EVENT_ZONE_THRESHOLD = 3; // if this many zones are severe at once, escalate to authorities separately
const CHECKIN_RADIUS_KM = 25; // how far a citizen's phone location can be from a zone and still match it
const FRONTEND_DIR = path.join(__dirname, ".."); // index.html, style.css, app.js, data.js live one level up

const app = express();
app.use(cors());
app.use(express.json());

// Serve the dashboard from the same server/port as the API, so opening
// http://localhost:4000 in a browser works with no separate static server
// and no CORS/relative-path issues. API routes below take priority.
for (const file of ["index.html", "style.css", "app.js", "data.js"]) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(FRONTEND_DIR, file)));
}
app.use("/assets", express.static(path.join(FRONTEND_DIR, "assets")));

// ---------- In-memory zone store, seeded once at boot ----------
const zones = new Map();
const cameraFrames = new Map();
seedZones.forEach((z) => {
  const result = classify(z.hazard, z.sensors, { zoneId: z.id, freshSensors: z.sensors });
  zones.set(z.id, {
    ...z,
    level: result.level,
    mlCause: result.cause,
    confidence: result.confidence,
    modelType: result.modelType,
    flags: computeFlags(z.sensors),
    citizenMessage: citizenMessage(z.hazard, result.level),
    updatedAt: new Date().toISOString(),
    nodeStatus: {
      nodeId: null,
      lastSeen: null,
      online: false,
    },
    cameraStatus: {
      cameraId: null,
      lastSeen: null,
      available: false,
    },
  });
});

let lastMassEventZoneCount = 0;

function serializeZone(z) {
  const {
    id,
    name,
    hazard,
    lat,
    lng,
    sensors,
    level,
    mlCause,
    confidence,
    modelType,
    flags,
    peopleDetected,
    safeZone,
    citizenMessage,
    updatedAt,
    cameraStatus,
  } = z;

  let nodeStatus = z.nodeStatus || {
    nodeId: null,
    lastSeen: null,
    online: false,
  };

  if (nodeStatus.lastSeen) {
    const lastSeenMs = new Date(nodeStatus.lastSeen).getTime();
    nodeStatus = {
      ...nodeStatus,
      online: Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < 60000,
    };
  }

  return {
    id,
    name,
    hazard,
    lat,
    lng,
    sensors,
    level,
    mlCause,
    confidence,
    modelType,
    flags,
    peopleDetected,
    safeZone,
    citizenMessage,
    updatedAt,
    nodeStatus,
    cameraStatus,
    evacuationGuidance: getEvacuationGuidance(hazard),
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Checks whether escalating one zone just pushed the total count of severe
// zones past the threshold, and if so, fires a distinct "mass event" alert
// rather than treating it as just another single-zone SMS.
async function checkMassEvent() {
  const severeCount = Array.from(zones.values()).filter((z) => z.level === "severe").length;
  let massEventSms = null;
  if (severeCount >= MASS_EVENT_ZONE_THRESHOLD && lastMassEventZoneCount < MASS_EVENT_ZONE_THRESHOLD) {
    const severeZoneNames = Array.from(zones.values())
      .filter((z) => z.level === "severe")
      .map((z) => z.name)
      .join(", ");
    massEventSms = await smsGateway.sendSms({
      zoneId: "MASS_EVENT",
      zoneName: "Multiple zones",
      message: `${severeCount} zones are simultaneously severe (${severeZoneNames}). Possible large-scale event — coordinate response.`,
      recipients: "district authority escalation list",
    });
  }
  lastMassEventZoneCount = severeCount;
  return massEventSms;
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
// Body can include a partial `sensors` object, `peopleDetected`, and
// `cameraFireConfirmed` (boolean — set by a camera-side fire-detection model
// once one exists; not inferred here).
app.post(
  "/api/zones/:id/telemetry",
  async (req, res) => {
    const zone =
      zones.get(req.params.id);

    if (!zone) {
      return res.status(404).json({
        error: "Zone not found",
      });
    }

    const {
      nodeId,
      timestamp,
      sensors,
      peopleDetected,
      cameraFireConfirmed,
    } = req.body || {};

    if (typeof nodeId !== "string" || !nodeId.trim()) {
      return res.status(400).json({
        error: "nodeId is required",
      });
    }

    const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (sensors !== undefined && !isObject(sensors)) return res.status(400).json({ error: "sensors must be an object" });
    if (cameraFireConfirmed !== undefined && typeof cameraFireConfirmed !== "boolean") return res.status(400).json({ error: "cameraFireConfirmed must be boolean" });
    if (peopleDetected !== undefined && (!isObject(peopleDetected) ||
        !Number.isInteger(peopleDetected.count) || peopleDetected.count < 0 ||
        (peopleDetected.note !== undefined && typeof peopleDetected.note !== "string"))) {
      return res.status(400).json({ error: "peopleDetected requires a non-negative integer count and optional text note" });
    }
    const timestampMs = timestamp === undefined ? Date.now() : timestamp;
    if (!Number.isFinite(timestampMs) || !Number.isFinite(new Date(timestampMs).getTime()) || timestampMs > Date.now() + 60000 || timestampMs < Date.now() - 86400000) {
      return res.status(400).json({ error: "timestamp must be Unix milliseconds within the last day (at most 60 seconds ahead)" });
    }
    if (zone.lastTelemetryTimestampMs !== undefined && timestampMs < zone.lastTelemetryTimestampMs) {
      return res.status(409).json({ error: "Telemetry is older than the latest accepted reading" });
    }

    const previousLevel = zone.level;

    const rangeWarnings = [];
    const validSensors = {};

    if (sensors && typeof sensors === "object") {
      for (
        const [key, value]
        of Object.entries(sensors)
      ) {
        // CPCB pollutant object is handled
        // by classifyPollution.
        if (key === "pollutants") {
          if (!isObject(value)) { rangeWarnings.push("pollutants must be an object"); continue; }
          const pollutants = {};
          for (const [name, concentration] of Object.entries(value)) {
            if (!["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3"].includes(name) || !Number.isFinite(concentration) || concentration < 0) {
              rangeWarnings.push(`Invalid pollutant concentration: ${name}`);
            } else pollutants[name] = concentration;
          }
          if (Object.keys(pollutants).length) validSensors[key] = { ...zone.sensors.pollutants, ...pollutants };
          continue;
        }

        const check =
          checkSensorRange(
            key,
            value
          );

        if (!check.inRange) {
          rangeWarnings.push(
            check.note
          );

          // IMPORTANT:
          // bad hardware data is rejected.
          continue;
        }

        validSensors[key] = value;
      }

      zone.sensors = {
        ...zone.sensors,
        ...validSensors,
      };
    }

    if (peopleDetected && typeof peopleDetected === "object") {
      zone.peopleDetected = {
        ...zone.peopleDetected,
        ...peopleDetected,
      };
    }

    zone.nodeStatus = {
      nodeId,
      lastSeen: new Date().toISOString(),
      online: true,
    };
    zone.lastTelemetryTimestampMs = timestampMs;
    if (cameraFireConfirmed !== undefined) zone.cameraFireConfirmed = cameraFireConfirmed;

    const result = classify(
      zone.hazard,
      zone.sensors,
      {
        zoneId: zone.id,

        cameraFireConfirmed: zone.cameraFireConfirmed,
        reportedMagnitude: zone.reportedMagnitude,

        // Only genuinely new sensor values
        // enter rolling aggregators.
        freshSensors:
          validSensors,

        timestampMs,
      }
    );

    zone.level = result.level;
    zone.mlCause = result.cause;
    zone.confidence =
      result.confidence;

    zone.modelType =
      result.modelType;

    zone.flags =
      computeFlags(
        zone.sensors
      );

    zone.citizenMessage =
      citizenMessage(
        zone.hazard,
        result.level
      );

    zone.updatedAt =
      new Date().toISOString();

    let smsSent = null;

    if (
      SEVERE_AUTO_SMS &&
      zone.level === "severe" &&
      previousLevel !== "severe"
    ) {
      smsSent =
        await smsGateway.sendSms({
          zoneId: zone.id,
          zoneName: zone.name,
          message: buildEmergencySms({ hazard: zone.hazard, level: zone.level, zoneName: zone.name, safeZone: zone.safeZone }),
          type: "automatic-severe-alert",
        });
    }

    const massEventSms =
      await checkMassEvent();

    res.json({
      ok: true,
      zone:
        serializeZone(zone),
      smsSent,
      massEventSms,
      rangeWarnings,
    });
  }
);

// ---------- ESP32-CAM ----------

// ESP32-CAM uploads a raw JPEG body here.
app.post(
  "/api/zones/:id/camera/frame",
  express.raw({
    type: ["image/jpeg", "image/jpg"],
    limit: "2mb",
  }),
  (req, res) => {
    const zone = zones.get(req.params.id);

    if (!zone) {
      return res.status(404).json({ error: "Zone not found" });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "JPEG frame is required" });
    }

    const cameraId = req.header("X-Camera-ID") || "ESP32-CAM";
    cameraFrames.set(zone.id, Buffer.from(req.body));
    zone.cameraStatus = {
      cameraId,
      available: true,
      lastSeen: new Date().toISOString(),
    };

    res.json({ ok: true, bytes: req.body.length, cameraId });
  }
);

// Dashboard fetches the latest camera frame here.
app.get("/api/zones/:id/camera/latest.jpg", (req, res) => {
  const frame = cameraFrames.get(req.params.id);

  if (!frame) {
    return res.status(404).send("No camera frame available");
  }

  res.set({
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
  res.send(frame);
});

// Manually report (or relay from real accelerometer/geophone hardware
// later) a seismic event for a zone. Deliberately NOT ML-predicted — see
// classify.js's classifyEarthquake for why.
app.post("/api/zones/:id/earthquake", async (req, res) => {
  const zone = zones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  const { magnitude } = req.body || {};
  if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > 10) return res.status(400).json({ error: "magnitude must be between 0 and 10" });
  const previousLevel = zone.level;
  zone.reportedMagnitude = magnitude;

  const result = classify("earthquake", {}, { reportedMagnitude: magnitude });
  zone.hazard = "earthquake";
  zone.level = result.level;
  zone.mlCause = result.cause;
  zone.confidence = result.confidence;
  zone.modelType = result.modelType;
  zone.citizenMessage = citizenMessage("earthquake", result.level);
  zone.updatedAt = new Date().toISOString();

  let smsSent = null;
  if (zone.level === "severe" && previousLevel !== "severe") {
    smsSent = await smsGateway.sendSms({ zoneId: zone.id, zoneName: zone.name, message: buildEmergencySms({ hazard: zone.hazard, level: zone.level, zoneName: zone.name, safeZone: zone.safeZone }), type: "automatic-severe-alert" });
  }
  const massEventSms = await checkMassEvent();
  res.json({ zone: serializeZone(zone), smsSent, massEventSms });
});

// Citizen phone-geolocation check-in: no GPS module on the hardware, so this
// matches a browser/phone location to the nearest zone within
// CHECKIN_RADIUS_KM. Returns null zone (with a generic caution message) if
// nothing is close enough to be meaningful.
app.post("/api/checkin", (req, res) => {
  const { lat, lng } = req.body || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "lat and lng (numbers) are required" });
  }

  let nearest = null;
  let nearestDistanceKm = Infinity;
  zones.forEach((zone) => {
    const d = haversineKm(lat, lng, zone.lat, zone.lng);
    if (d < nearestDistanceKm) {
      nearestDistanceKm = d;
      nearest = zone;
    }
  });

  if (!nearest || nearestDistanceKm > CHECKIN_RADIUS_KM) {
    return res.json({
      matched: false,
      distanceKm: nearest ? Math.round(nearestDistanceKm * 10) / 10 : null,
      message: "You're outside any monitored zone right now. No known hazards reported near you.",
    });
  }

  res.json({ matched: true, distanceKm: Math.round(nearestDistanceKm * 10) / 10, zone: serializeZone(nearest) });
});

// Manual SMS dispatch (authority "Send SMS alert" button).
app.post("/api/zones/:id/sms", async (req, res) => {
  const zone = zones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  const message = (req.body && req.body.message) || buildEmergencySms({ hazard: zone.hazard, level: zone.level, zoneName: zone.name, safeZone: zone.safeZone });
  if (typeof message !== "string" || message.length > 1600) return res.status(400).json({ error: "message must be text of at most 1600 characters" });
  const entry = await smsGateway.sendSms({ zoneId: zone.id, zoneName: zone.name, message, type: "manual-alert" });
  res.json(entry);
});

app.get("/api/sms-log", (req, res) => {
  res.json(smsGateway.getLog());
});

app.get("/api/health", (req, res) => res.json({ status: "ok", zones: zones.size }));

// Anything else that isn't an API route falls back to index.html (simple SPA-style routing).
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

if (require.main === module) app.listen(PORT, "0.0.0.0", () => {
  console.log(`RakshakNet listening on port ${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api/zones`);
});
module.exports = app;
