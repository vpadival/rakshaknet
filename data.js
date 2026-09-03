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
  safe: "#3FA796",
  moderate: "#E3B341",
  severe: "#C24A2B",
};