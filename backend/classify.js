const fs = require("fs");
const path = require("path");
const { computeAqi } = require("./aqiFormula");
const { SENSOR_LIMITS } = require("./sensorLimits");
const { updateDailyStats, getDailyFeatures } = require("./dailyStats");

const fireModel = JSON.parse(fs.readFileSync(path.join(__dirname, "models", "fire_model.json"), "utf8"));

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Scores a trained logistic regression model (mean/scale/weights/bias, all
// exported from sklearn — see backend/models/ and the train_*.py scripts
// used to produce them) against a feature object.
function scoreLogisticModel(model, featureValues) {
  const z = model.features.reduce((sum, name, i) => {
    const raw = featureValues[name] ?? model.mean[i]; // impute at the mean if a feature is missing
    const scaled = (raw - model.mean[i]) / model.scale[i];
    return sum + scaled * model.weights[i];
  }, model.bias);
  return sigmoid(z);
}

function levelFromProbability(p) {
  if (p >= 0.66) return "severe";
  if (p >= 0.33) return "moderate";
  return "safe";
}

// ---------------------------------------------------------------------------
// FLOOD — rule-based on purpose. flood_risk_dataset_india.xlsx was audited
// and found to carry no real signal (AUC ~0.50 with both logistic regression
// and random forest; every feature's correlation with the label is under
// 0.03, and the sensor columns are uniform-random, not real historical
// readings). Training on it would produce a model that looks legitimate but
// performs at chance. These thresholds are physically motivated instead
// (water level relative to typical bank height, IMD heavy/very-heavy
// rainfall categories) — see sensorLimits.js for sourcing on each number.
// Revisit with a real historical flood dataset if one becomes available.
// ---------------------------------------------------------------------------
function classifyFlood(sensors) {
  const {
    waterLevelM = 0,
    rainfallMmHr,
    rainIntensityPct,
    soilMoisturePct = 0,
  } = sensors;

  const water = SENSOR_LIMITS.waterLevelM;

  const quantitativeRainSevere =
    typeof rainfallMmHr === "number" &&
    rainfallMmHr >=
      SENSOR_LIMITS.rainfallMmHr.severeAt;

  const quantitativeRainModerate =
    typeof rainfallMmHr === "number" &&
    rainfallMmHr >=
      SENSOR_LIMITS.rainfallMmHr.moderateAt;

  const rainPlateSevere =
    typeof rainIntensityPct === "number" &&
    rainIntensityPct >=
      SENSOR_LIMITS.rainIntensityPct.severeAt;

  const rainPlateModerate =
    typeof rainIntensityPct === "number" &&
    rainIntensityPct >=
      SENSOR_LIMITS.rainIntensityPct.moderateAt;

  const soilSevere =
    soilMoisturePct >=
    SENSOR_LIMITS.soilMoisturePct.severeAt;

  const soilModerate =
    soilMoisturePct >=
    SENSOR_LIMITS.soilMoisturePct.moderateAt;

  if (
    waterLevelM >= water.severeAt ||
    (
      waterLevelM >= water.moderateAt &&
      (quantitativeRainSevere || rainPlateSevere || soilSevere)
    ) ||
    (quantitativeRainSevere && soilSevere)
  ) {
    return {
      level: "severe",
      cause:
        "Multiple flood indicators show rising water, heavy rain and/or saturated soil",
      confidence: 0.9,
      modelType:
        "multi-sensor rule fusion",
    };
  }

  if (
    waterLevelM >= water.moderateAt ||
    quantitativeRainModerate ||
    rainPlateModerate ||
    soilModerate
  ) {
    return {
      level: "moderate",
      cause:
        "Flood indicators are elevated; continued monitoring is required",
      confidence: 0.7,
      modelType:
        "multi-sensor rule fusion",
    };
  }

  return {
    level: "safe",
    cause:
      "Flood-monitoring sensors are within normal range",
    confidence: 0.9,
    modelType:
      "multi-sensor rule fusion",
  };
}

// ---------------------------------------------------------------------------
// FIRE — layered: a trained logistic regression estimates ambient fire
// DANGER from rolling daily weather (cross-validated AUC 0.90 on the
// Sirsi/MODIS join — see models/fire_model.json for provenance and
// caveats), but real-time smoke (MQ2) or a camera-confirmed flame override
// it immediately, since direct detection is stronger evidence than a
// weather-based danger estimate.
// ---------------------------------------------------------------------------
function classifyFire(
  sensors,
  zoneId,
  cameraFireConfirmed,
  freshSensors = {},
  timestampMs = Date.now()
) {
  const {
    mq2Ppm,
    mq2Ratio,
  } = sensors;

  // Only fresh readings enter today's
  // rolling statistics.
  const dailyFeatures =
    updateDailyStats(
      zoneId,
      freshSensors,
      timestampMs
    ) ||
    getDailyFeatures(zoneId);

  const dangerProbability =
    dailyFeatures
      ? scoreLogisticModel(
          fireModel,
          dailyFeatures
        )
      : 0;

  const dangerLevel =
    levelFromProbability(
      dangerProbability
    );

  if (cameraFireConfirmed === true) {
    return {
      level: "severe",
      cause:
        "Camera has visually confirmed an active flame",
      confidence: 0.95,
      modelType:
        "camera-confirmed + fire-risk model",
      fireDangerProbability:
        Math.round(
          dangerProbability * 100
        ) / 100,
    };
  }

  // Use calibrated ppm when available.
  if (
    typeof mq2Ppm === "number"
  ) {
    if (
      mq2Ppm >=
      SENSOR_LIMITS.mq2Ppm.severeAt
    ) {
      return {
        level: "severe",
        cause:
          "Calibrated MQ-2 gas/smoke level crossed the critical threshold",
        confidence: 0.85,
        modelType:
          "MQ-2 sensor override",
        fireDangerProbability:
          Math.round(
            dangerProbability * 100
          ) / 100,
      };
    }

    if (
      mq2Ppm >=
      SENSOR_LIMITS.mq2Ppm.moderateAt
    ) {
      return {
        level: "moderate",
        cause:
          "Elevated smoke/gas concentration detected",
        confidence: 0.7,
        modelType:
          "MQ-2 sensor override",
        fireDangerProbability:
          Math.round(
            dangerProbability * 100
          ) / 100,
      };
    }
  }

  // Prototype MQ-2 mode.
  if (
    typeof mq2Ratio === "number"
  ) {
    if (
      mq2Ratio >=
      SENSOR_LIMITS.mq2Ratio.severeAt
    ) {
      return {
        level: "severe",
        cause:
          "MQ-2 reading is significantly above its clean-air baseline",
        confidence: 0.8,
        modelType:
          "MQ-2 baseline override",
        fireDangerProbability:
          Math.round(
            dangerProbability * 100
          ) / 100,
      };
    }

    if (
      mq2Ratio >=
      SENSOR_LIMITS.mq2Ratio.moderateAt
    ) {
      return {
        level: "moderate",
        cause:
          "MQ-2 reading is elevated above its clean-air baseline",
        confidence: 0.65,
        modelType:
          "MQ-2 baseline override",
        fireDangerProbability:
          Math.round(
            dangerProbability * 100
          ) / 100,
      };
    }
  }

  const causeByLevel = {
    severe:
      "Trained weather model indicates high forest-fire danger",
    moderate:
      "Trained weather model indicates elevated forest-fire danger",
    safe:
      "Fire-danger model and local sensors indicate low risk",
  };

  return {
    level: dangerLevel,
    cause: causeByLevel[dangerLevel],
    confidence:
      Math.round(
        Math.max(
          dangerProbability,
          1 - dangerProbability
        ) * 100
      ) / 100,

    modelType:
      "trained logistic regression",

    fireDangerProbability:
      Math.round(
        dangerProbability * 100
      ) / 100,
  };
}

// ---------------------------------------------------------------------------
// POLLUTION — the official CPCB National AQI formula (see aqiFormula.js),
// not a fitted model. sensors.pollutants is an object of raw concentrations;
// sensors.aqi is used as a fallback if only a pre-computed AQI is available.
// ---------------------------------------------------------------------------
function classifyPollution(sensors) {
  if (sensors.pollutants) {
    const result = computeAqi(sensors.pollutants);
    if (result) {
      return {
        level: result.level,
        cause: `AQI ${result.aqi} (${result.bucket}), driven by ${result.drivenBy}`,
        confidence: 0.9,
        modelType: "CPCB official formula",
        aqi: result.aqi,
      };
    }
  }
  const aqi = sensors.aqi ?? 0;
  if (aqi >= SENSOR_LIMITS.aqi.severeAt) {
    return { level: "severe", cause: "AQI in the hazardous range for extended exposure", confidence: 0.9, modelType: "CPCB bucket (precomputed AQI)", aqi };
  }
  if (aqi >= SENSOR_LIMITS.aqi.moderateAt) {
    return { level: "moderate", cause: "AQI unhealthy for sensitive groups", confidence: 0.7, modelType: "CPCB bucket (precomputed AQI)", aqi };
  }
  return { level: "safe", cause: "AQI within acceptable range", confidence: 0.9, modelType: "CPCB bucket (precomputed AQI)", aqi };
}

// ---------------------------------------------------------------------------
// EARTHQUAKE — deliberately NOT a predictive model. No sensor set described
// for this project (humidity/temp/gas/water-level) can predict a seismic
// event; real early-warning systems detect the P-wave with accelerometers
// seconds before the S-wave arrives. This function only exists so the rest
// of the pipeline (level/cause/confidence shape) has somewhere to put a
// MANUALLY reported or hardware-relayed event — see server.js's
// /api/zones/:id/earthquake route, which is authority- or accelerometer-
// triggered, never ML-inferred.
// ---------------------------------------------------------------------------
function classifyEarthquake(reportedMagnitude) {
  if (!reportedMagnitude) {
    return { level: "safe", cause: "No seismic event reported", confidence: 1, modelType: "manual/relay only" };
  }
  const level = reportedMagnitude >= 5 ? "severe" : reportedMagnitude >= 3.5 ? "moderate" : "safe";
  return {
    level,
    cause: `Reported seismic event, magnitude ${reportedMagnitude}`,
    confidence: 1,
    modelType: "manual/relay only — not ML-predicted",
  };
}

const CLASSIFIERS = { flood: classifyFlood, pollution: classifyPollution };

function classify(hazard, sensors, opts = {}) {
  if (hazard === "fire") {
    const result = classifyFire(
      sensors,
      opts.zoneId,
      opts.cameraFireConfirmed,
      opts.freshSensors || {},
      opts.timestampMs || Date.now()
    );
    return { ...result, confidence: Math.round(Math.min(0.99, result.confidence) * 100) / 100 };
  }
  if (hazard === "earthquake") {
    return classifyEarthquake(opts.reportedMagnitude);
  }
  const fn = CLASSIFIERS[hazard];
  if (!fn) return { level: "safe", cause: "Unknown hazard type", confidence: 0, modelType: "n/a" };
  const result = fn(sensors);
  return { ...result, confidence: Math.round(Math.min(0.99, result.confidence) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Auxiliary flags — heavy rainfall and extreme temperature are not
// standalone hazards with their own ML model; they're threshold flags
// (percentile-derived, see sensorLimits.js) layered onto whichever primary
// hazard a zone is tracking, since both directly aggravate flood and fire
// risk rather than being independent outcomes to predict.
// ---------------------------------------------------------------------------
function computeFlags(sensors) {
  const flags = {};
  if (typeof sensors.rainfallMmHr === "number") {
    flags.heavyRainfall = sensors.rainfallMmHr >= SENSOR_LIMITS.rainfallMmHr.severeAt;
  }
  if (typeof sensors.rainIntensityPct === "number") {
    flags.heavyRainDetected = sensors.rainIntensityPct >= SENSOR_LIMITS.rainIntensityPct.severeAt;
  }
  if (typeof sensors.tempC === "number") {
    flags.extremeHeat = sensors.tempC >= SENSOR_LIMITS.tempC.extremeHeatAt;
    flags.extremeCold = sensors.tempC <= SENSOR_LIMITS.tempC.extremeColdAt;
  }
  return flags;
}

const CITIZEN_MESSAGE = {
  flood: {
    severe: "Water is rising fast near you. Move to higher ground now.",
    moderate: "Water levels are rising. Be ready to move to a safe area.",
    safe: "Conditions are normal in your area right now.",
  },
  fire: {
    severe: "Fire risk confirmed nearby. Evacuate the area immediately.",
    moderate: "Fire danger is elevated nearby. Avoid this area until further notice.",
    safe: "No fire risk detected in your area right now.",
  },
  pollution: {
    severe: "Air quality is hazardous. Stay indoors with windows closed.",
    moderate: "Air quality is poor. Limit outdoor activity, especially for children and the elderly.",
    safe: "Air quality is normal in your area right now.",
  },
  earthquake: {
    severe: "A significant earthquake has been reported near you. Move away from buildings and take cover.",
    moderate: "A moderate earthquake has been reported nearby. Stay alert for aftershocks.",
    safe: "No seismic event reported in your area.",
  },
};

function citizenMessage(hazard, level) {
  return (CITIZEN_MESSAGE[hazard] && CITIZEN_MESSAGE[hazard][level]) || "Check the dashboard for the latest status.";
}

module.exports = { classify, citizenMessage, computeFlags };