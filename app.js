(function () {
  let currentView = "authority";
  let selectedZoneId = null;
  let ZONES = [];
  const markers = {};
  const POLL_MS = 5000;
  let zonesLoading = false;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  // Escape server-controlled strings before interpolating them into HTML.
  function escapeData(value) {
    if (typeof value === "string") return escapeHtml(value);
    if (Array.isArray(value)) return value.map(escapeData);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeData(item)]));
    return value;
  }

  // ---------- Map setup ----------
  const map = L.map("map", { zoomControl: true }).setView([21.5, 82.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  function markerIcon(level) {
    return L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:${LEVEL_COLOR[level]};border:2px solid #12161C;box-shadow:0 0 0 3px ${LEVEL_COLOR[level]}33;"></div>`,
      iconSize: [16, 16],
    });
  }

  // ---------- API layer ----------
  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  }
  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
  }

  function setConnectionStatus(connected) {
    const dot = document.querySelector(".dot-live");
    dot.style.background = connected ? "var(--safe)" : "var(--severe)";
    dot.title = connected ? "Connected to aggregation server" : "Backend unreachable — is the server running on :4000?";
  }

  async function loadZones({ isFirstLoad = false } = {}) {
    if (zonesLoading) return;
    zonesLoading = true;
    try {
      const data = await apiGet("/api/zones");
      ZONES = data;
      setConnectionStatus(true);

      ZONES.forEach((zone) => {
        if (!markers[zone.id]) {
          const marker = L.marker([zone.lat, zone.lng], { icon: markerIcon(zone.level) }).addTo(map);
          marker.on("click", () => selectZone(zone.id));
          markers[zone.id] = marker;
        } else markers[zone.id].setIcon(markerIcon(zone.level));
      });
      if (!ZONES.some((zone) => zone.id === selectedZoneId)) {
        selectedZoneId = (ZONES.find((zone) => zone.id === "z4") || ZONES[0])?.id;
      }

      renderZoneList();
      renderDetail();
    } catch (err) {
      console.error(err);
      setConnectionStatus(false);
      if (isFirstLoad) {
        document.getElementById("zoneItems").innerHTML =
          `<p style="color:var(--text-muted);font-size:12px;">Can't reach the backend at ${API_BASE}. Start it with <code>npm start</code> in /backend, then reload.</p>`;
      }
    } finally { zonesLoading = false; }
  }

  // ---------- Zone list ----------
  function renderZoneList() {
    const container = document.getElementById("zoneItems");
    container.innerHTML = "";
    ZONES.forEach((zone) => {
      const card = document.createElement("div");
      card.className = "zone-card" + (zone.id === selectedZoneId ? " selected" : "");
      card.innerHTML = `
        <div class="zone-card-top">
          <span class="zone-card-name">${escapeHtml(zone.name)}</span>
          <span class="badge badge-${zone.level}">${zone.level}</span>
        </div>
        <div class="zone-card-meta">${HAZARD_LABEL[zone.hazard]}${zone.peopleDetected.count > 0 ? ` · ${zone.peopleDetected.count} detected` : ""}</div>
      `;
      card.addEventListener("click", () => selectZone(zone.id));
      container.appendChild(card);
    });
  }

  function selectZone(id) {
    selectedZoneId = id;
    const zone = ZONES.find((z) => z.id === id);
    if (zone) map.flyTo([zone.lat, zone.lng], 8, { duration: 0.6 });
    renderZoneList();
    renderDetail();
  }

  // ---------- Detail panel ----------
  function renderDetail() {
    const zone = ZONES.find((z) => z.id === selectedZoneId);
    const panel = document.getElementById("detailPanel");
    if (!zone) {
      panel.innerHTML = `<div class="detail-empty">Select a zone to view details</div>`;
      return;
    }
    const displayZone = escapeData(zone);
    panel.innerHTML = currentView === "authority" ? authorityDetail(displayZone) : citizenDetail(displayZone);
    if (zone.nodeStatus?.lastSeen && !zone.nodeStatus.online) {
      panel.insertAdjacentHTML("afterbegin", '<div class="people-box">Sensor node offline. Readings and assessment below are from its last report.</div>');
    }
  }

  function authorityDetail(zone) {
    const readings = Object.entries(zone.sensors)
      .map(([key, value]) => `
        <div class="reading">
          <div class="reading-label">${readingLabel(key)}</div>
          <div class="reading-value">${typeof value === "object" ? Object.entries(value).map(([pollutant, concentration]) => `${escapeHtml(pollutant)}: ${concentration}`).join("<br>") : value}${readingUnit(key)}</div>
        </div>
      `)
      .join("");

    const peopleBox = zone.peopleDetected.count > 0
      ? `<div class="people-box"><span class="people-count">${zone.peopleDetected.count} ${zone.peopleDetected.count === 1 ? "person" : "people"} detected</span><br>${zone.peopleDetected.note}</div>`
      : `<div class="people-box none">${zone.peopleDetected.note}</div>`;

    const nodeOnline = Boolean(zone.nodeStatus?.online);
    const nodeBox = `
      <div class="people-box ${nodeOnline ? "" : "none"}">
        <strong>Sensor node: ${nodeOnline ? "ONLINE" : "OFFLINE"}</strong><br>
        ${zone.nodeStatus?.nodeId || "No physical node connected"}
        ${zone.nodeStatus?.lastSeen ? `<br>Last seen: ${new Date(zone.nodeStatus.lastSeen).toLocaleTimeString()}` : ""}
      </div>
    `;

    const cameraBox = zone.cameraStatus?.available
      ? `
        <div class="camera-frame-wrap">
          <img class="camera-frame" src="${API_BASE}/api/zones/${zone.id}/camera/latest.jpg?t=${Date.now()}" alt="Live ESP32-CAM frame" onerror="this.style.display='none'">
          <div class="camera-meta">
            ${zone.cameraStatus.cameraId || "ESP32-CAM"} · last frame ${zone.cameraStatus.lastSeen ? new Date(zone.cameraStatus.lastSeen).toLocaleTimeString() : "unknown"}
          </div>
        </div>
      `
      : `<div class="people-box none">Waiting for ESP32-CAM frame</div>`;

    return `
      <div class="detail-head"><h2>${zone.name}</h2><span class="badge badge-${zone.level}">${zone.level}</span></div>
      <p class="detail-hazard">${HAZARD_LABEL[zone.hazard]} hazard · updated ${new Date(zone.updatedAt).toLocaleTimeString()}</p>

      <div class="detail-section">
        <h3>Live sensor readings</h3>
        <div class="reading-grid">${readings || "Waiting for sensor readings"}</div>
      </div>

      <div class="detail-section">
        <h3>Hazard assessment</h3>
        <div class="ml-box">
          ${zone.mlCause}
          <div class="ml-confidence">${zone.modelType}</div>
          <div class="ml-confidence">confidence: ${(zone.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>Hardware node</h3>
        ${nodeBox}
      </div>

      <div class="detail-section">
        <h3>ESP32-CAM live view</h3>
        ${cameraBox}
      </div>

      <div class="detail-section">
        <h3>Camera intelligence</h3>
        ${peopleBox}
      </div>

      <div class="detail-section">
        <h3>Dispatch</h3>
        <button class="nav-btn" id="dispatchSmsBtn" style="border:none;">Send SMS alert to this zone</button>
      </div>
    `;
  }

  function citizenDetail(zone) {
    const levelCopy = { unknown: "Awaiting sensor data", safe: "All clear", moderate: "Elevated risk", severe: "Severe threat" };
    const guidance = zone.evacuationGuidance;
    const peopleBox = zone.peopleDetected.count > 0
      ? `<div class="people-box"><span class="people-count">${zone.peopleDetected.count} ${zone.peopleDetected.count === 1 ? "person" : "people"} may need help nearby</span><br>If it's safe to do so, assist or alert responders.</div>`
      : "";

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${zone.safeZone.lat},${zone.safeZone.lng}`;
    const list = (items, className = "") => `<ul class="safety-list ${className}">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    const emergencyBag = guidance
      ? `<div class="emergency-bag-card"><div class="emergency-bag-title">Emergency go-bag</div><div class="emergency-bag-items">${guidance.carry.slice(0, 7).map((item) => `<span>${item}</span>`).join("")}</div></div>`
      : "";
    const evacuationGuide = guidance
      ? `<div class="detail-section evacuation-guide"><h3>${guidance.title}</h3><h4>Take with you</h4>${list(guidance.carry)}<h4>Before leaving</h4>${list(guidance.beforeLeaving)}<h4>While moving</h4>${list(guidance.whileMoving)}<h4>Avoid</h4>${list(guidance.avoid, "safety-list-danger")}<h4>Before I leave</h4>${list(guidance.steps)}</div>`
      : "";

    return `
      <div class="citizen-status" style="background:${LEVEL_COLOR[zone.level]}22; border:1px solid ${LEVEL_COLOR[zone.level]};">
        <h2 style="color:${LEVEL_COLOR[zone.level]}">${levelCopy[zone.level]}</h2>
        <p>${zone.citizenMessage}</p>
      </div>

      ${peopleBox}

      <div class="detail-section" style="margin-top:20px;">
        <h3>Nearest safe area</h3>
        <div class="safe-zone-name">${zone.safeZone.name}${zone.safeZone.distanceKm ? ` · ${zone.safeZone.distanceKm} km away` : ""}</div>
        ${zone.level !== "safe" ? `<a class="nav-btn" href="${mapsUrl}" target="_blank" rel="noopener">Navigate to safe area</a>` : ""}
        ${emergencyBag}
      </div>
      ${evacuationGuide}
    `;
  }

  function readingLabel(key) {
    const labels = {
      waterLevelM: "Water level (m)",
      rainfallMmHr: "Rainfall (mm/hr)",
      soilMoisturePct: "Soil moisture",
      tempC: "Temperature",
      humidityPct: "Humidity",
      mq2Ppm: "MQ2 gas (ppm)",
      mq2Raw: "MQ2 raw (ADC)",
      mq2Ratio: "MQ2 / clean-air baseline",
      rainIntensityPct: "Rain plate wetness",
      windGustKmh: "Wind gust (km/h)",
      pollutants: "Pollutant concentrations",
      aqi: "Air Quality Index",
    };
    return labels[key] || key;
  }
  function readingUnit(key) {
    if (key === "tempC") return "°C";
    if (key === "mq2Ratio") return "×";
    if (key.endsWith("Pct")) return "%";
    return "";
  }

  // ---------- SMS log (rendered from backend, refreshed alongside zones) ----------
  async function refreshSmsLog() {
    try {
      const log = await apiGet("/api/sms-log");
      const container = document.getElementById("smsEntries");
      container.innerHTML = log
        .slice(0, 20)
        .map(
          (entry) => `
            <div class="sms-entry">
              <span class="sms-time">${new Date(entry.sentAt || entry.timestamp).toLocaleTimeString()}</span>
              <span class="sms-zone">${escapeHtml(entry.zoneName)} · ${escapeHtml(entry.status)}</span>
              <span>"${escapeHtml(entry.message)}"</span>
            </div>`
        )
        .join("");
    } catch (err) {
      // backend unreachable — leave whatever was last rendered
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function smsOutcome(result) {
    const entries = Array.isArray(result) ? result : [result];
    return entries.filter(Boolean).map((entry) => entry.status).join(", ") || "no dispatch";
  }

  // ---------- View toggle ----------
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentView = btn.dataset.view;
      document.getElementById("smsLog").style.display = currentView === "authority" ? "block" : "none";
      renderDetail();
    });
  });

  // ---------- Escalation simulation (demo aid — posts real telemetry to the backend) ----------
  document.getElementById("simulateBtn").addEventListener("click", async () => {
    const zone = ZONES.find((z) => z.id !== "z4" && !z.nodeStatus?.lastSeen && z.level !== "severe");
    if (!zone) return;

    const bump = {};
    if (zone.sensors.waterLevelM !== undefined) bump.waterLevelM = zone.sensors.waterLevelM + 2.5;
    if (zone.sensors.rainfallMmHr !== undefined) bump.rainfallMmHr = zone.sensors.rainfallMmHr + 20;
    if (zone.sensors.mq2Ppm !== undefined) bump.mq2Ppm = zone.sensors.mq2Ppm + 150;
    if (zone.sensors.aqi !== undefined) bump.aqi = zone.sensors.aqi + 100;

    try {
      const { smsSent } = await apiPost(`/api/zones/${zone.id}/telemetry`, { nodeId: "SIMULATION", sensors: bump });
      await loadZones();
      await refreshSmsLog();
      showToast(`${zone.name} updated · SMS: ${smsOutcome(smsSent)}`);
      if (zone.id === selectedZoneId) renderDetail();
    } catch (err) {
      showToast("Backend unreachable — start the server on :4000");
    }
  });

  // Delegate the authority "send SMS" button (re-rendered each time)
  document.getElementById("detailPanel").addEventListener("click", async (e) => {
    if (e.target && e.target.id === "dispatchSmsBtn") {
      const zone = ZONES.find((z) => z.id === selectedZoneId);
      if (!zone) return;
      try {
        const result = await apiPost(`/api/zones/${zone.id}/sms`, {});
        await refreshSmsLog();
        showToast(`SMS: ${smsOutcome(result)} — ${zone.name}`);
      } catch (err) {
        showToast("Backend unreachable — start the server on :4000");
      }
    }
  });

  // ---------- Clock ----------
  function tickClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString();
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------- Init ----------
  loadZones({ isFirstLoad: true });
  refreshSmsLog();
  setInterval(() => loadZones(), POLL_MS);
  setInterval(refreshSmsLog, POLL_MS);
})();
