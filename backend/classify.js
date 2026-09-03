// Rule-based stand-in for the edge ML model. Each edge node will eventually
// ship its own trained classifier; until then, this reproduces the same
// {level, cause, confidence} contract so the rest of the system doesn't
// need to change when real models are swapped in.

function classifyFlood(sensors) {
  const { waterLevelM = 0, rainfallMmHr = 0, soilMoisturePct = 0 } = sensors;
  if (waterLevelM >= 6 || rainfallMmHr >= 40) {
    return {
      level: "severe",
      cause: "Rapid water-level rise combined with heavy rainfall matches a flash-flood signature",
      confidence: 0.85 + Math.min(0.1, (waterLevelM - 6) * 0.02),
    };
  }
  if (waterLevelM >= 3 || rainfallMmHr >= 15 || soilMoisturePct >= 70) {
    return {
      level: "moderate",
      cause: "Water level and soil saturation trending upward; monitor for escalation",
      confidence: 0.6 + Math.min(0.15, soilMoisturePct / 1000),
    };
  }
  return { level: "safe", cause: "Readings within normal seasonal range", confidence: 0.9 };
}

function classifyFire(sensors) {
  const { mq2Ppm = 0, humidityPct = 100 } = sensors;
  if (mq2Ppm >= 400) {
    return {
      level: "severe",
      cause: "High smoke particulate concentration with low humidity — consistent with an active fire",
      confidence: 0.88,
    };
  }
  if (mq2Ppm >= 200) {
    return {
      level: "moderate",
      cause: "Elevated smoke particulate reading; camera has not yet confirmed open flame",
      confidence: 0.55 + Math.min(0.2, (mq2Ppm - 200) / 1000),
    };
  }
  return { level: "safe", cause: "No smoke signature detected", confidence: 0.92 };
}

function classifyPollution(sensors) {
  const { aqi = 0 } = sensors;
  if (aqi >= 300) {
    return { level: "severe", cause: "AQI in the hazardous range for extended exposure", confidence: 0.9 };
  }
  if (aqi >= 150) {
    return { level: "moderate", cause: "AQI unhealthy for sensitive groups; sustained industrial-hours pattern", confidence: 0.7 };
  }
  return { level: "safe", cause: "AQI within acceptable range", confidence: 0.9 };
}

const CLASSIFIERS = { flood: classifyFlood, fire: classifyFire, pollution: classifyPollution };

function classify(hazard, sensors) {
  const fn = CLASSIFIERS[hazard];
  if (!fn) return { level: "safe", cause: "Unknown hazard type", confidence: 0 };
  const result = fn(sensors);
  return { ...result, confidence: Math.round(Math.min(0.99, result.confidence) * 100) / 100 };
}

const CITIZEN_MESSAGE = {
  flood: {
    severe: "Water is rising fast near you. Move to higher ground now.",
    moderate: "Water levels are rising. Be ready to move to a safe area.",
    safe: "Conditions are normal in your area right now.",
  },
  fire: {
    severe: "Fire risk confirmed nearby. Evacuate the area immediately.",
    moderate: "Smoke detected nearby. Avoid this area until further notice.",
    safe: "No fire risk detected in your area right now.",
  },
  pollution: {
    severe: "Air quality is hazardous. Stay indoors with windows closed.",
    moderate: "Air quality is poor. Limit outdoor activity, especially for children and the elderly.",
    safe: "Air quality is normal in your area right now.",
  },
};

function citizenMessage(hazard, level) {
  return (CITIZEN_MESSAGE[hazard] && CITIZEN_MESSAGE[hazard][level]) || "Check the dashboard for the latest status.";
}

module.exports = { classify, citizenMessage };
