// backend/dailyStats.js

const dailyStats = new Map();

function indiaDateKey(timestampMs = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(
    new Date(timestampMs)
  );

  const year = parts.find(
    (p) => p.type === "year"
  ).value;

  const month = parts.find(
    (p) => p.type === "month"
  ).value;

  const day = parts.find(
    (p) => p.type === "day"
  ).value;

  return `${year}-${month}-${day}`;
}

function updateDailyStats(
  zoneId,
  freshSensors,
  timestampMs = Date.now()
) {
  const today = indiaDateKey(timestampMs);

  let stats = dailyStats.get(zoneId);

  if (!stats || stats.date !== today) {
    stats = {
      date: today,

      minRh: Infinity,
      sumRh: 0,
      countRh: 0,

      maxTemp: -Infinity,
      totalPrecip: 0,
      maxWind: 0,

      lastRainTimestampMs: null,
      lastRainRateMmHr: null,
    };
  }

  if (typeof freshSensors.humidityPct === "number") {
    stats.minRh = Math.min(
      stats.minRh,
      freshSensors.humidityPct
    );

    stats.sumRh += freshSensors.humidityPct;
    stats.countRh += 1;
  }

  if (typeof freshSensors.tempC === "number") {
    stats.maxTemp = Math.max(
      stats.maxTemp,
      freshSensors.tempC
    );
  }

  /*
   * IMPORTANT:
   * rainfallMmHr is a RATE.
   *
   * We integrate it over elapsed time instead
   * of simply adding every reading.
   *
   * The rain plate used in your prototype should
   * send rainIntensityPct, NOT rainfallMmHr, so
   * it will never enter this calculation.
   */
  if (
    typeof freshSensors.rainfallMmHr === "number"
  ) {
    if (
      stats.lastRainTimestampMs !== null &&
      stats.lastRainRateMmHr !== null
    ) {
      const elapsedHours =
        (timestampMs -
          stats.lastRainTimestampMs) /
        3600000;

      // Ignore unreasonable gaps.
      if (
        elapsedHours >= 0 &&
        elapsedHours <= 1
      ) {
        stats.totalPrecip +=
          stats.lastRainRateMmHr *
          elapsedHours;
      }
    }

    stats.lastRainTimestampMs = timestampMs;
    stats.lastRainRateMmHr =
      freshSensors.rainfallMmHr;
  }

  if (
    typeof freshSensors.windGustKmh === "number"
  ) {
    stats.maxWind = Math.max(
      stats.maxWind,
      freshSensors.windGustKmh
    );
  }

  dailyStats.set(zoneId, stats);

  return getDailyFeatures(zoneId);
}

function getDailyFeatures(zoneId) {
  const stats = dailyStats.get(zoneId);

  if (!stats) return null;

  return {
    min_rh:
      stats.minRh === Infinity
        ? 60
        : stats.minRh,

    mean_rh:
      stats.countRh > 0
        ? stats.sumRh / stats.countRh
        : 60,

    max_temp:
      stats.maxTemp === -Infinity
        ? 25
        : stats.maxTemp,

    total_precip: stats.totalPrecip,
    max_wind: stats.maxWind,
  };
}

module.exports = {
  updateDailyStats,
  getDailyFeatures,
};