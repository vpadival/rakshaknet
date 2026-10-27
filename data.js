// UI-only lookup tables. Zone data itself now comes from the backend
// (see backend/server.js) via the API_BASE endpoints in app.js — this file
// no longer holds a hardcoded ZONES array.

// Same-origin API. A separately hosted frontend can replace this with the
// deployed backend URL at build/deployment time.
const API_BASE = "";

const HAZARD_LABEL = {
  flood: "Flood",
  fire: "Forest fire",
  pollution: "Air pollution",
  earthquake: "Earthquake",
};

const LEVEL_COLOR = {
  unknown: "#8993A4",
  safe: "#3FA796",
  moderate: "#E3B341",
  severe: "#C24A2B",
};

// Presentation fixtures, isolated from telemetry and trained classifications.
const DEMO_CAMPUS = {
  name: "BNMIT",
  // Centre from the map embedded on https://www.bnmit.org/contact/.
  center: [12.921951, 77.567138],
  // Illustrative line only: these are not surveyed gate/road waypoints.
  exitPath: [[12.921951, 77.567138], [12.921951, 77.56765], [12.92248, 77.56765]],
};
const DEMO_SCENARIOS = {
  homeFire: {
    name: "Smoke / building fire", readings: { tempC: 58, mq2Raw: 2800, mq2Ratio: 3.8 },
    alert: "Simulated smoke/fire alert at BNMIT. Two people are in the demo risk area. Please evacuate as soon as possible via a clear exit and follow campus authority instructions.",
    destination: "Demo assembly point outside the building (illustrative; not a verified safe location)",
    guidance: "Rehearsal: show the building exit and designated outdoor assembly point. A real incident requires a clear exit and local emergency instructions.",
  },
  forestFire: {
    name: "Forest fire", readings: { tempC: 43, humidityPct: 18, mq2Raw: 2600, mq2Ratio: 3.2 },
    alert: "Simulated vegetation-fire alert near BNMIT. Two people are in the demo risk area. Follow campus authority evacuation instructions.",
    destination: "Demo assembly point away from the affected vegetation and smoke",
    guidance: "Rehearsal: display relocation away from the simulated fire. The outdoor area beside a building is not automatically safe from a forest fire.",
  },
  flood: {
    name: "Flood", readings: { waterLevelM: 6.8, rainfallMmHr: 55, soilMoisturePct: 95 },
    alert: "Simulated alert at BNMIT: flood threshold exceeded. Two people are in the demo risk area. Relocate to a designated elevated shelter when instructed.",
    destination: "Demo elevated shelter / higher ground (illustrative)",
    guidance: "Rehearsal: show an elevated destination rather than assuming anywhere outside the building is safe. No real route is assessed by this demo.",
  },
  flashFlood: {
    name: "Flash flood", readings: { waterLevelM: 7.2, rainfallMmHr: 110 },
    alert: "Simulated flash-flood warning at BNMIT: rapid water rise and possible flash flooding. Two people are in the demo risk area. Follow campus authority instructions toward higher ground.",
    destination: "Demo higher-ground assembly point away from the simulated flow",
    guidance: "Rehearsal: show urgent relocation to higher ground. These fixed values do not measure a real rate of water rise.",
  },
  rainfall: {
    name: "Heavy rainfall", readings: { rainfallMmHr: 85, rainIntensityPct: 98, humidityPct: 96 },
    alert: "Simulated heavy-rainfall alert at BNMIT. Two people are in the demo risk area. Check campus shelter instructions and local flood conditions.",
    destination: "Demo sturdy shelter outside the simulated flood-prone area",
    guidance: "Rehearsal: show a shelter advisory. Heavy rainfall alone does not establish that evacuation outdoors is safer.",
  },
  climate: {
    name: "Climate risk / extreme heat", readings: { tempC: 46, humidityPct: 60 },
    alert: "Simulated extreme-weather / heat advisory at BNMIT for two occupants. Climate change is not detected from one reading.",
    destination: "Demo cooling shelter (illustrative)",
    guidance: "This scenario illustrates a heat response. Long-term climate trends need historical observations; this prototype does not attribute an event to climate change.",
  },
};
