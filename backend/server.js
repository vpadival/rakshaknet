const path = require("path");
const express = require("express");
const cors = require("cors");
const { seedZones } = require("./seedData");
const { classify, citizenMessage, computeFlags } = require("./classify");
const { checkSensorRange } = require("./sensorLimits");
const smsGateway = require("./smsGateway");

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
app.use(express.static(FRONTEND_DIR));

// ---------- In-memory zone store, seeded once at boot ----------
const zones = new Map();
const cameraFrames = new Map();
seedZones.forEach((z) => {
  const result = classify(z.hazard, z.sensors, { zoneId: z.id });
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
    nodeStatus,
    cameraStatus,
  } = z;

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

    const timestampMs =
      typeof timestamp === "number" &&
      Number.isFinite(timestamp)
        ? timestamp
        : Date.now();

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
          validSensors[key] = value;
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

    const result = classify(
      zone.hazard,
      zone.sensors,
      {
        zoneId: zone.id,

        cameraFireConfirmed,

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
          message:
            zone.citizenMessage,
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
  if (typeof magnitude !== "number") return res.status(400).json({ error: "magnitude (number) is required" });

  const result = classify("earthquake", {}, { reportedMagnitude: magnitude });
  zone.hazard = "earthquake";
  zone.level = result.level;
  zone.mlCause = result.cause;
  zone.confidence = result.confidence;
  zone.modelType = result.modelType;
  zone.citizenMessage = citizenMessage("earthquake", result.level);
  zone.updatedAt = new Date().toISOString();

  let smsSent = null;
  if (zone.level === "severe") {
    smsSent = await smsGateway.sendSms({ zoneId: zone.id, zoneName: zone.name, message: zone.citizenMessage });
  }
  res.json({ zone: serializeZone(zone), smsSent });
});

// Citizen phone-geolocation check-in: no GPS module on the hardware, so this
// matches a browser/phone location to the nearest zone within
// CHECKIN_RADIUS_KM. Returns null zone (with a generic caution message) if
// nothing is close enough to be meaningful.
app.post("/api/checkin", (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RakshakNet listening on port ${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api/zones`);
});