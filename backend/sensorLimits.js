// backend/sensorLimits.js

const DEMO_MODE = process.env.DEMO_MODE === "true";

const SENSOR_LIMITS = {
  waterLevelM: {
    unit: "m",
    plausibleMin: 0,
    plausibleMax: 10,

    // Real deployment vs tabletop prototype
    moderateAt: DEMO_MODE ? 0.10 : 3,
    severeAt: DEMO_MODE ? 0.18 : 6,

    source: DEMO_MODE
      ? "tabletop prototype thresholds"
      : "real-world deployment thresholds",
  },

  rainfallMmHr: {
    unit: "mm/hr",
    plausibleMin: 0,
    plausibleMax: 300,
    moderateAt: 15,
    severeAt: 40,
    source: "quantitative rain-gauge input only",
  },

  // Your present rain plate should use this instead of pretending to be mm/hr
  rainIntensityPct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
    moderateAt: 40,
    severeAt: 80,
    source: "prototype rain/wetness sensor — relative intensity only",
  },

  soilMoisturePct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
    moderateAt: 70,
    severeAt: 90,
    source: "calibrated soil-moisture sensor",
  },

  humidityPct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
    lowFireRiskAt: 30,
    source: "DHT22",
  },

  tempC: {
    unit: "°C",
    plausibleMin: -10,
    plausibleMax: 60,
    extremeHeatAt: 40,
    extremeColdAt: 2,
    source: "DHT22",
  },

  // Keep this only if you later calibrate MQ-2 properly to ppm.
  mq2Ppm: {
    unit: "ppm",
    plausibleMin: 0,
    plausibleMax: 10000,
    moderateAt: 200,
    severeAt: 400,
    source: "requires MQ-2 Rs/R0 calibration",
  },

  // Current hardware-friendly representation.
  mq2Raw: {
    unit: "ADC",
    plausibleMin: 0,
    plausibleMax: 4095,
    source: "ESP32 ADC reading",
  },

  // Better than a fixed raw threshold:
  // current ADC / clean-air baseline.
  mq2Ratio: {
    unit: "x baseline",
    plausibleMin: 0,
    plausibleMax: 20,
    moderateAt: 1.5,
    severeAt: 2.0,
    source: "prototype baseline-relative smoke indication",
  },

  aqi: {
    unit: "AQI",
    plausibleMin: 0,
    plausibleMax: 500,
    moderateAt: 101,
    severeAt: 301,
    source: "CPCB National AQI scale",
  },
};

function checkSensorRange(key, value) {
  const limit = SENSOR_LIMITS[key];

  // Objects such as pollutants are validated elsewhere.
  if (!limit) {
    return { inRange: true, note: null };
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return {
      inRange: false,
      note: `${key} must be a finite number`,
    };
  }

  if (
    limit.plausibleMin !== undefined &&
    value < limit.plausibleMin
  ) {
    return {
      inRange: false,
      note: `${key}=${value} below plausible minimum (${limit.plausibleMin}${limit.unit})`,
    };
  }

  if (
    limit.plausibleMax !== undefined &&
    value > limit.plausibleMax
  ) {
    return {
      inRange: false,
      note: `${key}=${value} above plausible maximum (${limit.plausibleMax}${limit.unit})`,
    };
  }

  return { inRange: true, note: null };
}

module.exports = {
  SENSOR_LIMITS,
  checkSensorRange,
};