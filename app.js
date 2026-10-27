(function () {
  let currentView = "authority";
  let selectedZoneId = null;
  let ZONES = [];
  const markers = {};
  const POLL_MS = 5000;
  let zonesLoading = false;
  let citizenLocation = null;
  let locationResult = null;
  let locationPending = false;
  let locationError = "";
  let demoActive = false;
  let demoTriggered = false;
  let presentationClean = true;
  let demoMapLayer = null;
  let demoMapKey = null;
  let demoAlertKey = null;
  const demoMessages = [];
  const requestedScenario = typeof location !== "undefined" ? new URLSearchParams(location.search).get("presentation") : null;
  if (Object.hasOwn(DEMO_SCENARIOS, requestedScenario)) {
    document.getElementById("demoScenario").value = requestedScenario;
    demoActive = true;
    demoTriggered = true;
  }

  function renderDemo() {
    const scenarioId = document.getElementById("demoScenario").value;
    const scenario = DEMO_SCENARIOS[scenarioId] || DEMO_SCENARIOS.homeFire;
    renderDemoMap(scenarioId, scenario);
    if (!demoTriggered) demoAlertKey = null;
    if (demoTriggered && demoAlertKey !== scenarioId) {
      demoAlertKey = scenarioId;
      demoMessages.unshift({ time: new Date().toLocaleTimeString(), message: `SIMULATION — BNMIT authority: two people are in the ${scenario.name.toLowerCase()} demo risk area and need evacuation assistance. Please coordinate rescue. Preview only; not sent.` });
      demoMessages.splice(20);
    }
    document.getElementById("zoneItems").innerHTML = `<div class="zone-card selected"><div class="zone-card-top"><span class="zone-card-name">BNMIT · campus demo</span><span class="badge badge-${demoTriggered ? "severe" : "unknown"}">${demoTriggered ? "demo alert" : "ready"}</span></div><div class="zone-card-meta">${scenario.name} · ${demoTriggered ? "2 simulated occupants" : "Awaiting demo event"}</div></div>`;
    renderDemoMessages();
    const readings = demoTriggered ? Object.entries(scenario.readings).map(([key, value]) =>
      `<div class="reading"><div class="reading-label">${readingLabel(key)} (simulated)</div><div class="reading-value">${value}${readingUnit(key)}</div></div>`).join("") : "Waiting for the presenter to trigger the scripted event.";
    document.getElementById("detailPanel").innerHTML = `
      <div class="demo-banner" role="status"><strong>Demo mode</strong> · Simulated readings and occupancy</div>
      <div class="detail-head"><h2>BNMIT · ${scenario.name}</h2><span class="badge badge-${demoTriggered ? "severe" : "unknown"}">${demoTriggered ? "DEMO ALERT" : "READY"}</span></div>
      ${presentationClean ? "" : '<div class="demo-actions"><button id="demoTriggerBtn" class="nav-btn">Trigger demo event</button><button id="demoResetBtn" class="ghost-btn">Reset rehearsal</button><button id="demoExitBtn" class="ghost-btn">Return to monitoring</button></div>'}
      <div class="people-box"><span class="demo-led ${demoTriggered ? "active" : ""}" aria-hidden="true"></span>On-screen alert LED: ${demoTriggered ? "ON" : "OFF"} (simulated)</div>
      <div class="people-box"><strong>BNMIT prototype: CONNECTED (SIMULATED)</strong><br>Virtual sensor and camera nodes · no physical hardware connection</div>
      <div class="detail-section"><h3>Simulated sensor readings</h3><div class="reading-grid">${readings}</div></div>
      <div class="detail-section"><h3>Scripted camera occupancy</h3><div class="people-box"><strong>${demoTriggered ? "2 people · fixed demo count" : "Occupancy scenario pending"}</strong><br>No image analysis is running. Standing in front of the camera does not change this count.</div><p class="demo-note">The actual ESP32-CAM image remains available in the monitoring view when hardware is connected.</p></div>
      ${demoTriggered ? `<div class="citizen-status" role="alert"><h2>SIMULATED ALERT</h2><p>${scenario.alert}</p></div><div class="detail-section"><h3>Illustrative destination</h3><p>${scenario.destination}</p><p>${scenario.guidance}</p><p class="demo-note">Presentation guidance only. This scenario does not verify a safe destination or evacuation route.</p></div>` : ""}
    `;
  }

  function renderDemoMessages() {
    document.getElementById("smsLogTitle").textContent = "BNMIT authority message previews";
    document.getElementById("smsLogNote").textContent = "Simulation · local previews only · no SMS sent";
    document.getElementById("smsEntries").innerHTML = demoMessages.length ? demoMessages.map(entry => `<div class="sms-entry"><span class="sms-time">${entry.time}</span><span class="sms-zone">BNMIT · NOT SENT</span><span>${entry.message}</span></div>`).join("") : '<div class="sms-entry">Waiting for a simulated BNMIT event.</div>';
  }

  function renderDemoMap(scenarioId, scenario) {
    const key = `${scenarioId}:${demoTriggered}`;
    if (demoMapKey === key) return;
    const entering = demoMapKey === null;
    demoMapKey = key;
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    if (demoMapLayer) map.removeLayer(demoMapLayer);
    demoMapLayer = L.layerGroup().addTo(map);
    L.marker(DEMO_CAMPUS.center, { icon: markerIcon(demoTriggered ? "severe" : "unknown") })
      .bindTooltip(`BNMIT · ${scenario.name} · SIMULATION`).addTo(demoMapLayer);
    if (demoTriggered) {
      L.polyline(DEMO_CAMPUS.exitPath, { color: "#5b8def", weight: 5, dashArray: "8 8" })
        .bindTooltip("Illustrative exit line only — not a verified road or safe route").addTo(demoMapLayer);
      L.marker(DEMO_CAMPUS.exitPath.at(-1), { icon: markerIcon("unknown") })
        .bindTooltip("Outside-road illustration · destination safety unverified").addTo(demoMapLayer);
    }
    document.getElementById("demoMapNote").style.display = "block";
    if (entering) map.flyTo(DEMO_CAMPUS.center, 18, { duration: 0.6 });
  }

  // Older running servers return only { matched, zone, distanceKm }.
  // Normalize both API versions before rendering location guidance.
  function normalizeCheckin(result) {
    const zone = result?.zone;
    const knownLevel = ["safe", "moderate", "severe"].includes(zone?.level);
    const stale = zone?.nodeStatus?.lastSeen && !zone.nodeStatus.online;
    let safety = "unknown";
    if (result?.matched === false || result?.safety === "outside") safety = "outside";
    else if ((result?.matched === true || ["safe", "risk"].includes(result?.safety)) && knownLevel && !stale) {
      safety = zone.level === "safe" ? "safe" : "risk";
    }
    // An explicit unknown assessment must never be upgraded by old zone data.
    if (result?.safety === "unknown") safety = "unknown";
    const messages = {
      safe: "You're already in a safer area. No evacuation is needed.",
      outside: "No monitored risk area near your location. Areas outside monitoring are not verified safe.",
      unknown: "Safety at your location is unknown. Waiting for current sensor readings.",
      risk: `Your location is in the monitored risk area for ${zone?.name || "a nearby zone"}.`,
    };
    const destination = zone?.safeZone;
    const hasDestination = Number.isFinite(destination?.lat) && Math.abs(destination.lat) <= 90
      && Number.isFinite(destination?.lng) && Math.abs(destination.lng) <= 180;
    return { zone, safety, message: messages[safety], evacuationRequired: safety === "risk" && hasDestination };
  }

  async function refreshLocationSafety() {
    if (!citizenLocation) return;
    if (Date.now() - citizenLocation.checkedAt > 300000) {
      citizenLocation = null;
      locationResult = null;
      locationError = "Location check expired. Use my location again for current guidance.";
      return;
    }
    try {
      const location = citizenLocation;
      const result = await apiPost("/api/checkin", location);
      if (location !== citizenLocation) return;
      locationResult = normalizeCheckin(result);
      locationError = "";
    } catch (err) {
      locationResult = null;
      locationError = "Unable to check local risk. Try again when the server is available.";
    }
  }

  async function useMyLocation() {
    if (locationPending) return;
    locationPending = true;
    citizenLocation = null;
    locationResult = null;
    locationError = "";
    renderDetail();
    try {
      if (!navigator.geolocation) throw new Error("Location is unavailable in this browser.");
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      citizenLocation = { lat: position.coords.latitude, lng: position.coords.longitude, checkedAt: Date.now() };
      await refreshLocationSafety();
      if (locationResult) map.flyTo([citizenLocation.lat, citizenLocation.lng], 12, { duration: 0.6 });
    } catch (err) {
      locationError = err.code === 1 ? "Location permission denied. Allow location access and try again." : "Unable to get your location. Enable location access and try again (HTTPS or localhost required).";
    } finally {
      locationPending = false;
      renderDetail();
    }
  }
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
    if (demoActive) { renderDetail(); return; }
    if (zonesLoading) return;
    zonesLoading = true;
    try {
      const data = await apiGet("/api/zones");
      if (demoActive) { renderDetail(); return; }
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

      if (currentView === "citizen") await refreshLocationSafety();
      renderZoneList();
      renderDetail();
    } catch (err) {
      console.error(err);
      setConnectionStatus(false);
      locationResult = null;
      locationError = "Unable to check local risk. Try again when the server is available.";
      if (currentView === "citizen") renderDetail();
      if (isFirstLoad && !demoActive) {
        document.getElementById("zoneItems").innerHTML =
          `<p style="color:var(--text-muted);font-size:12px;">Can't reach the backend at ${API_BASE}. Start it with <code>npm start</code> in /backend, then reload.</p>`;
      }
    } finally { zonesLoading = false; }
  }

  // ---------- Zone list ----------
  function renderZoneList() {
    if (demoActive) return;
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
    const hideControls = demoActive && presentationClean;
    document.getElementById("simulateBtn").style.display = hideControls ? "none" : "";
    document.getElementById("demoControls").style.display = hideControls ? "none" : "";
    if (demoActive) { renderDemo(); return; }
    if (demoMapKey !== null) {
      map.removeLayer(demoMapLayer);
      demoMapLayer = null;
      demoMapKey = null;
      demoAlertKey = null;
      document.getElementById("demoMapNote").style.display = "none";
      Object.values(markers).forEach(marker => marker.addTo(map));
      const selected = ZONES.find(zone => zone.id === selectedZoneId);
      map.flyTo(selected ? [selected.lat, selected.lng] : [21.5, 82.5], selected ? 8 : 5, { duration: 0.6 });
      renderZoneList();
      document.getElementById("smsLogTitle").textContent = "SMS alert log";
      document.getElementById("smsLogNote").textContent = "Templated, zone-targeted dispatch on severity threshold";
      document.getElementById("smsEntries").innerHTML = "";
      refreshSmsLog();
      loadZones();
    }
    const zone = ZONES.find((z) => z.id === selectedZoneId);
    const panel = document.getElementById("detailPanel");
    if (currentView === "citizen") {
      panel.innerHTML = citizenLocationDetail();
      return;
    }
    if (!zone) {
      panel.innerHTML = `<div class="detail-empty">Select a zone to view details</div>`;
      return;
    }
    const displayZone = escapeData(zone);
    panel.innerHTML = authorityDetail(displayZone);
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
          <img class="camera-frame" src="${API_BASE}/api/zones/${zone.id}/camera/latest.jpg?t=${Date.now()}" alt="Latest image from the zone camera" onerror="this.style.display='none';this.parentNode.querySelector('.camera-meta').textContent='Camera image unavailable. Retrying on next refresh.'">
          <div class="camera-meta">
            ${zone.cameraStatus.live ? "LIVE · " : "OFFLINE · Last received image · "}${zone.cameraStatus.cameraId || "ESP32-CAM"} · last frame ${zone.cameraStatus.lastSeen ? new Date(zone.cameraStatus.lastSeen).toLocaleTimeString() : "unknown"}
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
        <h3>Dispatch</h3>
        <button class="nav-btn" id="dispatchSmsBtn" style="border:none;">Send SMS alert to this zone</button>
      </div>
    `;
  }

  function citizenLocationDetail() {
    if (citizenLocation && Date.now() - citizenLocation.checkedAt > 300000) {
      citizenLocation = null;
      locationResult = null;
      locationError = "Location check expired. Use my location again for current guidance.";
    }
    const control = `<button class="nav-btn" id="useLocationBtn" ${locationPending ? "disabled" : ""}>${locationPending ? "Checking location…" : "Use my location"}</button>`;
    if (!locationResult) return `${control}<div class="people-box none" role="status">${escapeHtml(locationError || (locationPending ? "Checking risk at your location…" : "Check your location to see whether you need to move to a safer area."))}</div>`;
    const result = escapeData(locationResult);
    const titles = { safe: "You're already in a safer area", outside: "No monitored risk near you", unknown: "Safety unknown", risk: "Risk near your location" };
    const status = `${control}<div class="citizen-status" role="status"><h2>${titles[result.safety]}</h2><p>${result.message}</p></div>`;
    if (!result.evacuationRequired || result.safety !== "risk") return status;
    return status + citizenDetail(result.zone);
  }

  function citizenDetail(zone) {
    const levelCopy = { unknown: "Awaiting sensor data", safe: "All clear", moderate: "Elevated risk", severe: "Severe threat" };
    const guidance = zone.evacuationGuidance;
    const peopleBox = zone.peopleDetected?.count > 0
      ? `<div class="people-box"><span class="people-count">${zone.peopleDetected.count} ${zone.peopleDetected.count === 1 ? "person" : "people"} may need help nearby</span><br>If it's safe to do so, assist or alert responders.</div>`
      : "";

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${citizenLocation.lat},${citizenLocation.lng}&destination=${zone.safeZone.lat},${zone.safeZone.lng}`;
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
        <p>${zone.citizenMessage || "Follow local authority instructions and monitor official alerts."}</p>
      </div>

      ${peopleBox}

      <div class="detail-section" style="margin-top:20px;">
        <h3>Designated safe area near the affected zone</h3>
        <div class="safe-zone-name">${zone.safeZone.name}${zone.safeZone.distanceKm ? ` · ${zone.safeZone.distanceKm} km away` : ""}</div>
        ${["moderate", "severe"].includes(zone.level) ? `<a class="nav-btn" href="${mapsUrl}" target="_blank" rel="noopener">Navigate to safe area</a>` : ""}
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
    if (demoActive) { renderDemoMessages(); return; }
    try {
      const log = await apiGet("/api/sms-log");
      if (demoActive) { renderDemoMessages(); return; }
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

  // Presentation state stays in this browser; never post it as hardware telemetry.
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey
      || event.target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target?.tagName)) return;
    const scenarios = Object.keys(DEMO_SCENARIOS);
    if (/^[1-6]$/.test(event.key)) {
      document.getElementById("demoScenario").value = scenarios[Number(event.key) - 1];
      demoActive = true;
      demoTriggered = true;
    } else if (demoActive && event.code === "Space") demoTriggered = true;
    else if (demoActive && event.key.toLowerCase() === "r") demoTriggered = false;
    else if (demoActive && event.key.toLowerCase() === "p") presentationClean = !presentationClean;
    else if (demoActive && event.key === "Escape") demoActive = false;
    else return;
    event.preventDefault();
    renderDetail();
  });
  document.getElementById("simulateBtn").addEventListener("click", () => {
    demoActive = true;
    demoTriggered = false;
    presentationClean = true;
    document.getElementById("simulateBtn").blur();
    renderDetail();
  });
  document.getElementById("demoScenario").addEventListener("change", () => {
    demoActive = true;
    demoTriggered = false;
    renderDetail();
  });

  // Delegate the authority "send SMS" button (re-rendered each time)
  document.getElementById("detailPanel").addEventListener("click", async (e) => {
    if (["demoTriggerBtn", "demoResetBtn", "demoExitBtn"].includes(e.target?.id)) {
      if (e.target.id === "demoExitBtn") demoActive = false;
      demoTriggered = e.target.id === "demoTriggerBtn";
      renderDetail();
      return;
    }
    if (e.target && e.target.id === "useLocationBtn") {
      await useMyLocation();
      return;
    }
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
  renderDetail();
  loadZones({ isFirstLoad: true });
  refreshSmsLog();
  setInterval(() => loadZones(), POLL_MS);
  setInterval(refreshSmsLog, POLL_MS);
})();
