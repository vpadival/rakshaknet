// UI-only lookup tables. Zone data itself now comes from the backend
// (see backend/server.js) via the API_BASE endpoints in app.js — this file
// no longer holds a hardcoded ZONES array.

// Relative so it works whether the dashboard is served by the backend itself
// (http://localhost:4000) or hosted elsewhere. Falls back to localhost:4000
// only when opened directly as a file:// URL, where relative fetches can't work.
const API_BASE = window.location.protocol === "file:" ? "http://localhost:4000" : "";

const HAZARD_LABEL = {
  flood: "Flood",
  fire: "Forest fire",
  pollution: "Air pollution",
};

const LEVEL_COLOR = {
  safe: "#3FA796",
  moderate: "#E3B341",
  severe: "#C24A2B",
};