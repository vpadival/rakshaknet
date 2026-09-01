import datetime
from typing import Any, Dict, List, Optional, TypedDict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="RakshakNet Early Warning & Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ShelterInfo(TypedDict):
    id: str
    name: str
    lat: float
    lng: float
    capacity: int
    occupied: int

# Active safe shelters for citizen routing
SAFE_SHELTERS: List[ShelterInfo] = [
    {"id": "SHELTER_NORTH", "name": "Community Hall North", "lat": 12.9850, "lng": 77.6050, "capacity": 350, "occupied": 110},
    {"id": "SHELTER_SOUTH", "name": "Govt High School Grounds", "lat": 12.9450, "lng": 77.5750, "capacity": 500, "occupied": 80},
    {"id": "SHELTER_CENTRAL", "name": "Stadium Safe Camp", "lat": 12.9700, "lng": 77.6200, "capacity": 600, "occupied": 240}
]

class SensorData(BaseModel):
    node_id: str
    node_type: str  # "FLOOD", "FOREST_FIRE", "AIR_QUALITY"
    lat: float
    lng: float
    battery_pct: float
    # Flood parameters (HC-SR04, FC-37 Rain, Soil)
    water_level_cm: Optional[float] = None
    rate_of_rise_cm_min: Optional[float] = 0.0
    rain_intensity_pct: Optional[float] = 0.0
    soil_moisture_pct: Optional[float] = 0.0
    # Fire & Air parameters (DHT22, MQ-2, MQ-135)
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    smoke_raw: Optional[float] = 0.0
    gas_ppm: Optional[float] = 0.0
    # ESP32-CAM Edge AI Vision outputs
    camera_fire_detected: Optional[bool] = False
    camera_fire_conf: Optional[float] = 0.0
    camera_people_count: Optional[int] = 0
    trapped_persons_detected: Optional[bool] = False
    timestamp: Optional[str] = None

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()
latest_telemetry: Dict[str, Dict[str, Any]] = {}

def send_emergency_sms(phone: str, message: str) -> None:
    """Fallback SMS Dispatcher for GSM/Fast2SMS/Twilio."""
    print(f"\n[SMS GATEWAY DISPATCH -> {phone}]")
    print(f"Content: {message}\n")

def evaluate_edge_fusion(data: SensorData) -> Dict[str, Any]:
    """Runs weighted risk scoring and root-cause analysis."""
    risk_score: float = 0.0
    causes: List[str] = []

    if data.node_type == "FLOOD":
        if data.water_level_cm is not None and data.water_level_cm > 80:
            risk_score += 40
            causes.append(f"Critical water surge ({data.water_level_cm} cm)")
        if data.rain_intensity_pct is not None and data.rain_intensity_pct > 60:
            risk_score += 30
            causes.append(f"Heavy precipitation ({data.rain_intensity_pct}%)")
        if data.soil_moisture_pct is not None and data.soil_moisture_pct > 70:
            risk_score += 30
            causes.append("Ground saturation threshold exceeded")

    elif data.node_type == "FOREST_FIRE":
        if data.temperature_c is not None and data.temperature_c > 42:
            risk_score += 25
            causes.append(f"Thermal spike ({data.temperature_c}°C)")
        if data.humidity_pct is not None and data.humidity_pct < 20:
            risk_score += 20
            causes.append(f"Arid conditions ({data.humidity_pct}% RH)")
        if data.smoke_raw is not None and data.smoke_raw > 400:
            risk_score += 25
            causes.append(f"Combustion gases detected (MQ-2: {data.smoke_raw})")
        if data.camera_fire_detected:
            risk_score += (data.camera_fire_conf or 0.8) * 30
            causes.append(f"Visual fire confirmed by ESP32-CAM ({int((data.camera_fire_conf or 0.8)*100)}% conf)")

    risk_score = min(100.0, round(risk_score, 1))
    status = "CRITICAL" if risk_score >= 70 else "WARNING" if risk_score >= 35 else "SAFE"

    return {
        "threat_level": status,
        "risk_pct": risk_score,
        "possible_causes": causes if len(causes) > 0 else ["Normal environmental variations"],
        "people_trapped": data.camera_people_count or 0
    }

@app.post("/api/telemetry")
async def ingest_telemetry(payload: SensorData) -> Dict[str, Any]:
    if not payload.timestamp:
        payload.timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    analysis = evaluate_edge_fusion(payload)
    event: Dict[str, Any] = {
        "telemetry": payload.model_dump(),
        "analysis": analysis,
        "shelters": SAFE_SHELTERS
    }

    latest_telemetry[payload.node_id] = event

    if analysis["threat_level"] == "CRITICAL":
        alert_msg = (
            f"ALERT: CRITICAL {payload.node_type} at {payload.node_id}. "
            f"Threat: {analysis['risk_pct']}%. "
            f"People trapped: {analysis['people_trapped']}. Move to safe shelters."
        )
        send_emergency_sms("+919876543210", alert_msg)

    await manager.broadcast(event)
    return {"status": "success", "event": event}

@app.get("/api/state")
async def get_current_state() -> Dict[str, Any]:
    return {"nodes": list(latest_telemetry.values()), "shelters": SAFE_SHELTERS}

@app.websocket("/ws/telemetry")
async def websocket_stream(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)