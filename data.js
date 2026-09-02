// Mock edge-node data for the RakshakNet / Aegis-Grid demo.
// In production this arrives from the aggregation server (see architecture.svg),
// which receives already-classified events from edge devices — not raw sensor streams.

const ZONES = [
  {
    id: "z1",
    name: "Yamuna Ghat — Zone 4",
    hazard: "flood",
    level: "severe",
    lat: 28.667, lng: 77.245,
    sensors: {
      waterLevelM: 6.8,
      rainfallMmHr: 42,
      soilMoisturePct: 91,
      tempC: 27,
      humidityPct: 88,
    },
    mlCause: "Rapid water-level rise + saturated soil moisture matches upstream flash-flood signature",
    confidence: 0.89,
    peopleDetected: { count: 3, note: "Camera 4B — riverbank footpath, partially submerged" },
    safeZone: { name: "Community Hall, MG Road", lat: 28.671, lng: 77.230, distanceKm: 1.4 },
    citizenMessage: "Water is rising fast near you. Move to higher ground now.",
  },
  {
    id: "z2",
    name: "Bandipur Fringe — Zone 7",
    hazard: "fire",
    level: "moderate",
    lat: 11.672, lng: 76.633,
    sensors: {
      mq2Ppm: 310,
      tempC: 34,
      humidityPct: 21,
    },
    mlCause: "Smoke particulate rise with low humidity; camera has not yet confirmed open flame",
    confidence: 0.61,
    peopleDetected: { count: 0, note: "No persons detected in camera frame" },
    safeZone: { name: "Forest Checkpost Rd, Sector 2", lat: 11.680, lng: 76.640, distanceKm: 2.1 },
    citizenMessage: "Smoke detected nearby. Avoid the forest fringe road until further notice.",
  },
  {
    id: "z3",
    name: "Industrial Belt — Zone 2",
    hazard: "pollution",
    level: "moderate",
    lat: 19.076, lng: 72.882,
    sensors: {
      aqi: 268,
      tempC: 31,
      humidityPct: 55,
    },
    mlCause: "Sustained PM2.5 spike correlated with low wind speed and industrial-hours traffic",
    confidence: 0.72,
    peopleDetected: { count: 0, note: "Not applicable for this hazard type" },
    safeZone: { name: "Central Park, Sector 5", lat: 19.082, lng: 72.870, distanceKm: 3.0 },
    citizenMessage: "Air quality is poor in your area. Limit outdoor activity, especially for children and the elderly.",
  },
  {
    id: "z4",
    name: "Koramangala Drain — Zone 1",
    hazard: "flood",
    level: "safe",
    lat: 12.935, lng: 77.614,
    sensors: {
      waterLevelM: 1.2,
      rainfallMmHr: 4,
      soilMoisturePct: 38,
      tempC: 24,
      humidityPct: 60,
    },
    mlCause: "Readings within normal seasonal range",
    confidence: 0.95,
    peopleDetected: { count: 0, note: "No persons detected" },
    safeZone: { name: "N/A — zone currently safe", lat: 12.935, lng: 77.614, distanceKm: 0 },
    citizenMessage: "Conditions are normal in your area right now.",
  },
  {
    id: "z5",
    name: "Sundarbans Edge — Zone 9",
    hazard: "flood",
    level: "moderate",
    lat: 21.947, lng: 88.895,
    sensors: {
      waterLevelM: 4.1,
      rainfallMmHr: 18,
      soilMoisturePct: 74,
      tempC: 29,
      humidityPct: 82,
    },
    mlCause: "Tidal surge plus moderate rainfall; trending toward severe over next 3 hours",
    confidence: 0.68,
    peopleDetected: { count: 1, note: "Camera 9A — single person near embankment" },
    safeZone: { name: "Relief Shelter, Gosaba Rd", lat: 21.955, lng: 88.905, distanceKm: 2.6 },
    citizenMessage: "Water levels are rising with the tide. Be ready to move to the relief shelter.",
  },
];

const HAZARD_LABEL = {
  flood: "Flood",
  fire: "Forest fire",
  pollution: "Air pollution",
};

const LEVEL_COLOR = {
  safe: "#3FA796",
  moderate: "#E3B341",
  severe: "#C24A2B",
};