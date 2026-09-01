import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Shield, Users, AlertOctagon, Navigation, PhoneCall, Radio, Eye } from 'lucide-react';

export default function RakshakApp() {
  const [viewMode, setViewMode] = useState('authority'); // 'authority' | 'citizen'
  const [nodes, setNodes] = useState({});
  const [shelters, setShelters] = useState([]);
  const [smsLog, setSmsLog] = useState([]);

  useEffect(() => {
    // Initial State Fetch
    fetch("http://localhost:8000/api/state")
      .then(res => res.json())
      .then(data => {
        const initialNodes = {};
        data.nodes.forEach(n => { initialNodes[n.telemetry.node_id] = n; });
        setNodes(initialNodes);
        setShelters(data.shelters);
      })
      .catch(err => console.log("Init fetch:", err));

    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const { telemetry, analysis, shelters: sh } = payload;

      setNodes(prev => ({ ...prev, [telemetry.node_id]: payload }));
      if (sh) setShelters(sh);

      if (analysis.threat_level === "CRITICAL") {
        setSmsLog(prev => [
          {
            id: Date.now(),
            text: `[EMERGENCY SMS] Critical threat at ${telemetry.node_id}. Evacuate immediately!`,
            time: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 4)
        ]);
      }
    };

    return () => ws.close();
  }, []);

  const getThreatColor = (level) => {
    if (level === 'CRITICAL') return '#ef4444';
    if (level === 'WARNING') return '#f59e0b';
    return '#10b981';
  };

  const getGoogleMapsNavUrl = (destLat, destLng) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Control & Triage Sidebar */}
      <div className="w-[440px] p-4 border-r border-slate-800 flex flex-col gap-4 overflow-y-auto">
        {/* Header & Mode Switcher */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" /> RakshakNet
            </h1>
            <p className="text-xs text-slate-400">Multi-Hazard Monitoring Network</p>
          </div>
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1 text-xs">
            <button
              onClick={() => setViewMode('authority')}
              className={`px-3 py-1 rounded font-semibold transition ${viewMode === 'authority' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
            >
              Authority
            </button>
            <button
              onClick={() => setViewMode('citizen')}
              className={`px-3 py-1 rounded font-semibold transition ${viewMode === 'citizen' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
            >
              Citizen
            </button>
          </div>
        </div>

        {/* SMS Broadcast Feed (Authority & Citizen) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> Automated SMS Alert Gateway
          </h2>
          <div className="flex flex-col gap-1.5">
            {smsLog.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No automated emergency dispatches active.</p>
            ) : (
              smsLog.map(s => (
                <div key={s.id} className="p-2 bg-red-950/40 border border-red-800 rounded text-xs">
                  <span className="text-[10px] text-red-400 font-mono">{s.time}</span>
                  <p className="text-slate-200 mt-0.5">{s.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* View-Specific Cards */}
        {viewMode === 'authority' ? (
          /* AUTHORITY VIEW: Technical Breakdown + Camera Triage */
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" /> Authority Sector Intel & Edge-AI Triage
            </h2>
            {Object.values(nodes).map(({ telemetry: t, analysis: a }) => (
              <div key={t.node_id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">{t.node_id} ({t.node_type})</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${a.threat_level === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {a.threat_level} ({a.risk_pct}%)
                  </span>
                </div>

                {/* Camera Detection Box */}
                {a.people_trapped > 0 && (
                  <div className="p-2 rounded bg-amber-950/40 border border-amber-600/60 flex items-center justify-between text-amber-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Eye className="w-4 h-4" /> Camera Detected: {a.people_trapped} Persons Trapped
                    </span>
                    <span className="text-[10px] font-mono">Rescue Req.</span>
                  </div>
                )}

                {/* ML Root Cause Predictions */}
                <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                  <p className="text-[11px] font-semibold text-slate-400 mb-1">ML Root-Cause Analysis:</p>
                  <ul className="list-disc list-inside text-[11px] text-slate-300">
                    {a.possible_causes.map((c, idx) => <li key={idx}>{c}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* CITIZEN VIEW: Plain Language + Safe Zone Navigation */
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" /> Citizen Safety & Evacuation Points
            </h2>

            {/* Area Threat Summary */}
            {Object.values(nodes).map(({ telemetry: t, analysis: a }) => (
              <div key={t.node_id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-200">Zone: {t.node_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.threat_level === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'}`}>
                    {a.threat_level === 'CRITICAL' ? 'EVACUATE' : 'SAFE'}
                  </span>
                </div>
                {a.people_trapped > 0 && (
                  <p className="text-red-400 font-semibold text-[11px] mt-1">
                    ⚠️ {a.people_trapped} people spotted needing assistance at this sector.
                  </p>
                )}
              </div>
            ))}

            {/* Designated Safe Shelters with Direct Google Maps Route Link */}
            <div className="flex flex-col gap-2 mt-2">
              <h3 className="text-xs font-bold text-slate-300">Nearest Certified Safe Shelters</h3>
              {shelters.map(s => (
                <div key={s.id} className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-xs flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-100">{s.name}</p>
                    <p className="text-[11px] text-slate-400">Capacity: {s.occupied}/{s.capacity} occupied</p>
                  </div>
                  <a
                    href={getGoogleMapsNavUrl(s.lat, s.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold text-[11px] transition"
                  >
                    <Navigation className="w-3 h-3" /> Navigate
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map View */}
      <div className="flex-1 h-full">
        <MapContainer center={[12.9716, 77.5946]} zoom={13} className="h-full w-full">
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          />

          {/* Render Threat Nodes */}
          {Object.values(nodes).map(({ telemetry: t, analysis: a }) => (
            <CircleMarker
              key={t.node_id}
              center={[t.lat, t.lng]}
              radius={a.threat_level === 'CRITICAL' ? 22 : 14}
              fillColor={getThreatColor(a.threat_level)}
              color="#ffffff"
              weight={2}
              fillOpacity={0.8}
            >
              <Popup>
                <div className="text-slate-900 text-xs font-sans">
                  <b className="text-sm">{t.node_id}</b><br/>
                  Threat: <b>{a.threat_level} ({a.risk_pct}%)</b><br/>
                  {a.people_trapped > 0 && <span className="text-red-600 font-bold">People Trapped: {a.people_trapped}<br/></span>}
                  {viewMode === 'authority' && (
                    <div className="mt-1 border-t pt-1">
                      Causes: {a.possible_causes.join(', ')}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Render Safe Shelters on Map */}
          {shelters.map(s => (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              radius={10}
              fillColor="#3b82f6"
              color="#ffffff"
              weight={2}
              fillOpacity={0.9}
            >
              <Popup>
                <div className="text-slate-900 text-xs">
                  <b>{s.name}</b> (Safe Zone)<br/>
                  Occupancy: {s.occupied}/{s.capacity}<br/>
                  <a
                    href={getGoogleMapsNavUrl(s.lat, s.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 font-bold underline mt-1 block"
                  >
                    Open Google Maps Navigation
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}