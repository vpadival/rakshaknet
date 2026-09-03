// Sensor operating ranges and alert thresholds. Every value here is labeled
// with its source so it's clear what's backed by the uploaded datasets and
// what's a literature default that should be recalibrated once real hardware
// is deployed (especially MQ2 — none of the provided data includes gas
// sensor readings, so that one is not data-derived).

const SENSOR_LIMITS = {
  waterLevelM: {
    unit: "m",
    plausibleMax: 10, // derived: 99th pct of flood_risk_dataset_india.xlsx (~9.9m). Dataset's
                       // FLOOD LABEL is not usable (see README), but the raw sensor RANGE is a
                       // reasonable real-world ceiling for a river/drain gauge.
    moderateAt: 3,
    severeAt: 6,
    source: "data-derived (range only, not the flood label)",
  },
  rainfallMmHr: {
    unit: "mm/hr",
    plausibleMax: 300,
    moderateAt: 15,
    severeAt: 40,
    source: "data-derived range (flood_risk_dataset_india.xlsx); moderate/severe cutoffs are "
            + "standard IMD heavy/very-heavy rainfall categories, not learned from the dataset",
  },
  soilMoisturePct: {
    unit: "%",
    plausibleMax: 100,
    moderateAt: 70,
    severeAt: 90,
    source: "literature default — not present in any uploaded dataset",
  },
  humidityPct: {
    unit: "%",
    plausibleMin: 10,
    plausibleMax: 100,
    lowFireRiskAt: 30, // below this, fire danger rises sharply per the trained fire model
    source: "data-derived range (forest.xlsx Sirsi station)",
  },
  tempC: {
    unit: "°C",
    plausibleMin: -10,
    plausibleMax: 55,
    extremeHeatAt: 40,
    extremeColdAt: 2,
    source: "range from forest.xlsx (10-39.1°C observed); extreme thresholds are IMD heatwave "
            + "convention, not learned from the dataset",
  },
  mq2Ppm: {
    unit: "ppm",
    plausibleMax: 10000,
    moderateAt: 200,
    severeAt: 400,
    source: "literature default (typical MQ2 smoke-detection guidance) — NOT data-derived. "
            + "No uploaded dataset includes gas sensor readings. Recalibrate against your actual "
            + "MQ2 unit's datasheet and a controlled burn test before trusting these numbers.",
  },
  aqi: {
    unit: "AQI (CPCB scale, 0-500)",
    // Official CPCB bucket boundaries — see aqiFormula.js. Not a threshold we invented.
    moderateAt: 101,
    severeAt: 301,
    source: "official CPCB National AQI standard",
  },
};

// Returns { inRange, note } — used to flag physically implausible sensor
// readings (wiring faults, disconnected sensors, corrupted transmission)
// before they're fed into any classifier.
function checkSensorRange(key, value) {
  const limit = SENSOR_LIMITS[key];
  if (!limit || typeof value !== "number" || Number.isNaN(value)) {
    return { inRange: true, note: null };
  }
  if (limit.plausibleMin !== undefined && value < limit.plausibleMin) {
    return { inRange: false, note: `${key}=${value} below plausible minimum (${limit.plausibleMin}${limit.unit})` };
  }
  if (limit.plausibleMax !== undefined && value > limit.plausibleMax) {
    return { inRange: false, note: `${key}=${value} above plausible maximum (${limit.plausibleMax}${limit.unit})` };
  }
  return { inRange: true, note: null };
}

module.exports = { SENSOR_LIMITS, checkSensorRange };
