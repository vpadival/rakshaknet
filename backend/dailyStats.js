// The trained fire model (models/fire_model.json) was fit on DAILY aggregates
// (min humidity, max temp, total rain, max wind gust for the day) because
// that's the granularity of the weather-station data it was trained on. Real
// sensors report instantaneous readings, so this module keeps a running
// per-zone daily rollup that telemetry updates incrementally, and resets at
// local midnight.

const dailyStats = new Map(); // zoneId -> { date, minRh, sumRh, countRh, maxTemp, totalPrecip, maxWind }

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function updateDailyStats(zoneId, sensors) {
  const today = todayKey();
  let stats = dailyStats.get(zoneId);
  if (!stats || stats.date !== today) {
    stats = { date: today, minRh: Infinity, sumRh: 0, countRh: 0, maxTemp: -Infinity, totalPrecip: 0, maxWind: 0 };
  }

  if (typeof sensors.humidityPct === "number") {
    stats.minRh = Math.min(stats.minRh, sensors.humidityPct);
    stats.sumRh += sensors.humidityPct;
    stats.countRh += 1;
  }
  if (typeof sensors.tempC === "number") {
    stats.maxTemp = Math.max(stats.maxTemp, sensors.tempC);
  }
  if (typeof sensors.rainfallMmHr === "number") {
    // Telemetry gives an instantaneous rate; approximate this reading's
    // contribution to the day's total assuming it held since the last update.
    stats.totalPrecip += sensors.rainfallMmHr;
  }
  if (typeof sensors.windGustKmh === "number") {
    stats.maxWind = Math.max(stats.maxWind, sensors.windGustKmh);
  }

  dailyStats.set(zoneId, stats);
  return getDailyFeatures(zoneId);
}

function getDailyFeatures(zoneId) {
  const stats = dailyStats.get(zoneId);
  if (!stats) return null;
  return {
    min_rh: stats.minRh === Infinity ? 60 : stats.minRh, // fall back to a neutral default before first reading
    mean_rh: stats.countRh > 0 ? stats.sumRh / stats.countRh : 60,
    max_temp: stats.maxTemp === -Infinity ? 25 : stats.maxTemp,
    total_precip: stats.totalPrecip,
    max_wind: stats.maxWind,
  };
}

module.exports = { updateDailyStats, getDailyFeatures };
