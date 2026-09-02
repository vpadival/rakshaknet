(function () {
  let currentView = "authority";
  let selectedZoneId = ZONES[0].id;
  const markers = {};

  // ---------- Map setup ----------
  const map = L.map("map", { zoomControl: true }).setView([21.5, 82.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    className: "dark-tiles",
  }).addTo(map);

  function markerIcon(level) {
    return L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:${LEVEL_COLOR[level]};border:2px solid #12161C;box-shadow:0 0 0 3px ${LEVEL_COLOR[level]}33;"></div>`,
      iconSize: [16, 16],
    });
  }

  ZONES.forEach((zone) => {
    const marker = L.marker([zone.lat, zone.lng], { icon: markerIcon(zone.level) }).addTo(map);
    marker.on("click", () => selectZone(zone.id));
    markers[zone.id] = marker;
  });

  // ---------- Zone list ----------
  function renderZoneList() {
    const container = document.getElementById("zoneItems");
    container.innerHTML = "";
    ZONES.forEach((zone) => {
      const card = document.createElement("div");
      card.className = "zone-card" + (zone.id === selectedZoneId ? " selected" : "");
      card.innerHTML = `
        <div class="zone-card-top">
          <span class="zone-card-name">${zone.name}</span>
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
    map.flyTo([zone.lat, zone.lng], 8, { duration: 0.6 });
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
    panel.innerHTML = currentView === "authority" ? authorityDetail(zone) : citizenDetail(zone);
  }

  function authorityDetail(zone) {
    const readings = Object.entries(zone.sensors)
      .map(([key, value]) => `
        <div class="reading">
          <div class="reading-label">${readingLabel(key)}</div>
          <div class="reading-value">${value}${readingUnit(key)}</div>
        </div>
      `)
      .join("");

    const peopleBox = zone.peopleDetected.count > 0
      ? `<div class="people-box"><span class="people-count">${zone.peopleDetected.count} ${zone.peopleDetected.count === 1 ? "person" : "people"} detected</span><br>${zone.peopleDetected.note}</div>`
      : `<div class="people-box none">${zone.peopleDetected.note}</div>`;

    return `
      <div class="detail-head"><h2>${zone.name}</h2><span class="badge badge-${zone.level}">${zone.level}</span></div>
      <p class="detail-hazard">${HAZARD_LABEL[zone.hazard]} hazard</p>

      <div class="detail-section">
        <h3>Live sensor readings</h3>
        <div class="reading-grid">${readings}</div>
      </div>

      <div class="detail-section">
        <h3>ML-predicted cause</h3>
        <div class="ml-box">
          ${zone.mlCause}
          <div class="ml-confidence">confidence: ${(zone.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>Camera — stranded people</h3>
        ${peopleBox}
      </div>

      <div class="detail-section">
        <h3>Dispatch</h3>
        <button class="nav-btn" id="dispatchSmsBtn" style="border:none;">Send SMS alert to this zone</button>
      </div>
    `;
  }

  function citizenDetail(zone) {
    const levelCopy = { safe: "All clear", moderate: "Elevated risk", severe: "Severe threat" };
    const peopleBox = zone.peopleDetected.count > 0
      ? `<div class="people-box"><span class="people-count">${zone.peopleDetected.count} ${zone.peopleDetected.count === 1 ? "person" : "people"} may need help nearby</span><br>If it's safe to do so, assist or alert responders.</div>`
      : "";

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${zone.safeZone.lat},${zone.safeZone.lng}`;

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
      </div>
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
      aqi: "Air Quality Index",
    };
    return labels[key] || key;
  }
  function readingUnit(key) {
    if (key === "tempC") return "°C";
    if (key.endsWith("Pct")) return "%";
    return "";
  }

  // ---------- SMS log ----------
  function logSms(zone) {
    const container = document.getElementById("smsEntries");
    const entry = document.createElement("div");
    entry.className = "sms-entry";
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="sms-time">${time}</span><span class="sms-zone">${zone.name}</span><span>"${zone.citizenMessage}"</span>`;
    container.prepend(entry);
    showToast(`SMS alert dispatched — ${zone.name}`);
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
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

  // ---------- Escalation simulation (demo aid) ----------
  document.getElementById("simulateBtn").addEventListener("click", () => {
    const zone = ZONES.find((z) => z.level !== "severe") || ZONES[0];
    zone.level = "severe";
    if (zone.sensors.waterLevelM !== undefined) zone.sensors.waterLevelM = (zone.sensors.waterLevelM + 2.5).toFixed(1) * 1;
    zone.confidence = Math.min(0.97, zone.confidence + 0.15);
    markers[zone.id].setIcon(markerIcon(zone.level));
    renderZoneList();
    if (zone.id === selectedZoneId) renderDetail();
    logSms(zone);
  });

  // Delegate the authority "send SMS" button (re-rendered each time)
  document.getElementById("detailPanel").addEventListener("click", (e) => {
    if (e.target && e.target.id === "dispatchSmsBtn") {
      const zone = ZONES.find((z) => z.id === selectedZoneId);
      logSms(zone);
    }
  });

  // ---------- Clock ----------
  function tickClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString();
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------- Init ----------
  renderZoneList();
  renderDetail();
})();