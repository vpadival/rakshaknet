// Seed state for the aggregation server. Mirrors the shape edge nodes will
// eventually push via POST /api/zones/:id/telemetry — this is the "before
// hardware exists" stand-in for that feed.

const HAZARD_LABEL = {
  flood: "Flood",
  fire: "Forest fire",
  pollution: "Air pollution",
};

const seedZones = [
  {
    id: "z1",
    name: "Yamuna Ghat — Zone 4",
    hazard: "flood",
    lat: 28.667, lng: 77.245,
    sensors: { waterLevelM: 6.8, rainfallMmHr: 42, soilMoisturePct: 91, tempC: 27, humidityPct: 88 },
    peopleDetected: { count: 3, note: "Camera 4B — riverbank footpath, partially submerged" },
    safeZone: { name: "Community Hall, MG Road", lat: 28.671, lng: 77.230, distanceKm: 1.4 },
  },
  {
    id: "z2",
    name: "Bandipur Fringe — Zone 7",
    hazard: "fire",
    lat: 11.672, lng: 76.633,
    sensors: { mq2Ppm: 310, tempC: 34, humidityPct: 21 },
    peopleDetected: { count: 0, note: "No persons detected in camera frame" },
    safeZone: { name: "Forest Checkpost Rd, Sector 2", lat: 11.680, lng: 76.640, distanceKm: 2.1 },
  },
  {
    id: "z3",
    name: "Industrial Belt — Zone 2",
    hazard: "pollution",
    lat: 19.076, lng: 72.882,
    sensors: { aqi: 268, tempC: 31, humidityPct: 55 },
    peopleDetected: { count: 0, note: "Not applicable for this hazard type" },
    safeZone: { name: "Central Park, Sector 5", lat: 19.082, lng: 72.870, distanceKm: 3.0 },
  },
  {
    id: "z4",
    name: "RakshakNet Hardware Node",
    hazard: "flood",
    lat: 12.935, lng: 77.614,
    sensors: {},
    peopleDetected: { count: 0, note: "Awaiting camera analysis" },
    safeZone: { name: "Emergency Assembly Point", lat: 12.936, lng: 77.615, distanceKm: 0.2 },
  },
  {
    id: "z5",
    name: "Sundarbans Edge — Zone 9",
    hazard: "flood",
    lat: 21.947, lng: 88.895,
    sensors: { waterLevelM: 4.1, rainfallMmHr: 18, soilMoisturePct: 74, tempC: 29, humidityPct: 82 },
    peopleDetected: { count: 1, note: "Camera 9A — single person near embankment" },
    safeZone: { name: "Relief Shelter, Gosaba Rd", lat: 21.955, lng: 88.905, distanceKm: 2.6 },
  },
];

module.exports = { seedZones, HAZARD_LABEL };
