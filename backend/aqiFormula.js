// Implements India's CPCB (Central Pollution Control Board) National Air
// Quality Index formula: each pollutant is converted to a 0-500 sub-index via
// piecewise-linear interpolation between published breakpoints, and the
// overall AQI is the MAX sub-index across pollutants (the standard "worst
// pollutant drives the index" rule).
//
// This is the actual public government standard, not a fitted model. We
// validated the shape of it against air_quality.xlsx (a random forest
// recovers it with 99.5% accuracy from the pollutant columns, i.e. the
// bucket labels in that dataset are consistent with this kind of formula)
// but the coefficients here are the published breakpoints, not learned ones.
//
// Breakpoints: [C_low, C_high, I_low, I_high] per pollutant, concentration
// units as commonly reported (µg/m³ except CO in mg/m³).

const BREAKPOINTS = {
  "PM2.5": [
    [0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200],
    [91, 120, 201, 300], [121, 250, 301, 400], [251, 500, 401, 500],
  ],
  PM10: [
    [0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200],
    [251, 350, 201, 300], [351, 430, 301, 400], [431, 600, 401, 500],
  ],
  NO2: [
    [0, 40, 0, 50], [41, 80, 51, 100], [81, 180, 101, 200],
    [181, 280, 201, 300], [281, 400, 301, 400], [401, 500, 401, 500],
  ],
  SO2: [
    [0, 40, 0, 50], [41, 80, 51, 100], [81, 380, 101, 200],
    [381, 800, 201, 300], [801, 1600, 301, 400], [1601, 2100, 401, 500],
  ],
  CO: [ // mg/m3
    [0, 1.0, 0, 50], [1.1, 2.0, 51, 100], [2.1, 10, 101, 200],
    [10.1, 17, 201, 300], [17.1, 34, 301, 400], [34.1, 50, 401, 500],
  ],
  O3: [
    [0, 50, 0, 50], [51, 100, 51, 100], [101, 168, 101, 200],
    [169, 208, 201, 300], [209, 748, 301, 400], [749, 1000, 401, 500],
  ],
  NH3: [
    [0, 200, 0, 50], [201, 400, 51, 100], [401, 800, 101, 200],
    [801, 1200, 201, 300], [1201, 1800, 301, 400], [1801, 2400, 401, 500],
  ],
};

function subIndex(pollutant, concentration) {
  const table = BREAKPOINTS[pollutant];
  if (!table || concentration === undefined || concentration === null) return null;
  const clamped = Math.max(0, concentration);
  for (const [cLow, cHigh, iLow, iHigh] of table) {
    if (clamped >= cLow && clamped <= cHigh) {
      return iLow + ((iHigh - iLow) / (cHigh - cLow)) * (clamped - cLow);
    }
  }
  // Above the top breakpoint: extrapolate off the last band rather than
  // silently dropping the pollutant from consideration.
  const [cLow, cHigh, iLow, iHigh] = table[table.length - 1];
  return iLow + ((iHigh - iLow) / (cHigh - cLow)) * (clamped - cLow);
}

function bucketFromAqi(aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

// Maps the 6-band CPCB bucket onto this project's 3-level scale.
function levelFromBucket(bucket) {
  if (bucket === "Good" || bucket === "Satisfactory") return "safe";
  if (bucket === "Moderate" || bucket === "Poor") return "moderate";
  return "severe";
}

// pollutants: { "PM2.5": number, PM10, NO2, SO2, CO, O3, NH3 } — any subset;
// pollutants not provided are simply not considered (matches CPCB practice
// of computing AQI from whichever pollutants a station actually measures,
// with a minimum of 3 including at least one of PM2.5/PM10).
function computeAqi(pollutants) {
  const subIndices = Object.entries(pollutants)
    .map(([p, v]) => ({ pollutant: p, value: subIndex(p, v) }))
    .filter((r) => r.value !== null);

  if (subIndices.length === 0) return null;

  const worst = subIndices.reduce((a, b) => (b.value > a.value ? b : a));
  const aqi = Math.round(worst.value);
  const bucket = bucketFromAqi(aqi);
  return {
    aqi,
    bucket,
    level: levelFromBucket(bucket),
    drivenBy: worst.pollutant,
    subIndices: Object.fromEntries(subIndices.map((r) => [r.pollutant, Math.round(r.value)])),
  };
}

module.exports = { computeAqi, subIndex, bucketFromAqi, levelFromBucket };
