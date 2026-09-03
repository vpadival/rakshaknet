// backend/sensorLimits.js

const DEMO_MODE = process.env.DEMO_MODE === "true";

const SENSOR_LIMITS = {
  waterLevelM: {
    unit: "m",
    plausibleMin: 0,
    plausibleMax: 10,

    // Tabletop prototype vs actual deployment.
    moderateAt: DEMO_MODE ? 0.10 : 3.0,
    severeAt: DEMO_MODE ? 0.18 : 6.0,

    source: DEMO_MODE
      ? "RakshakNet tabletop prototype calibration"
      : "deployment threshold - recalibrate per installation",
  },

  rainfallMmHr: {
    unit: "mm/hr",
    plausibleMin: 0,
    plausibleMax: 300,
    moderateAt: 15,
    severeAt: 40,
    source: "quantitative rainfall gauge only",
  },

  // Current rain plate gives relative wetness, not actual rainfall in mm/hr.
  rainIntensityPct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
    moderateAt: 40,
    severeAt: 80,
    source: "prototype rain/wetness plate",
  },

  soilMoisturePct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
    moderateAt: 70,
    severeAt: 90,
    source: "calibrated soil sensor",
  },

  humidityPct: {
    unit: "%",
    plausibleMin: 0,
    plausibleMax: 100,
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

  // Keep calibrated ppm support for the future.
  mq2Ppm: {
    unit: "ppm",
    plausibleMin: 0,
    plausibleMax: 10000,
    moderateAt: 200,
    severeAt: 400,
    source: "requires proper MQ-2 Rs/R0 calibration",
  },

  // Current prototype can safely transmit ADC.
  mq2Raw: {
    unit: "ADC",
    plausibleMin: 0,
    plausibleMax: 4095,
    source: "ESP32 ADC reading",
  },

  // Current reading divided by clean-air baseline.
  mq2Ratio: {
    unit: "x baseline",
    plausibleMin: 0,
    plausibleMax: 20,
    moderateAt: 1.5,
    severeAt: 2.0,
    source: "prototype MQ-2 baseline-relative reading",
  },

  aqi: {
    unit: "AQI",
    plausibleMin: 0,
    plausibleMax: 500,
    moderateAt: 101,
    severeAt: 301,
    source: "CPCB National AQI",
  },
};

function checkSensorRange(key, value) {
  const limits = SENSOR_LIMITS[key];

  // Some compound values such as pollutants are validated separately.
  if (!limits) {
    return {
      inRange: true,
      note: null,
    };
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

  if (limits.plausibleMin !== undefined && value < limits.plausibleMin) {
    return {
      inRange: false,
      note:
        `${key}=${value} is below plausible minimum ` +
        `${limits.plausibleMin} ${limits.unit}`,
    };
  }

  if (limits.plausibleMax !== undefined && value > limits.plausibleMax) {
    return {
      inRange: false,
      note:
        `${key}=${value} exceeds plausible maximum ` +
        `${limits.plausibleMax} ${limits.unit}`,
    };
  }

  return {
    inRange: true,
    note: null,
  };
}

module.exports = {
  SENSOR_LIMITS,
  checkSensorRange,
};