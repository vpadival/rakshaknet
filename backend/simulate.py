import datetime
import random
import time
from typing import Any, Dict, List, TypedDict
import requests

API_URL = "http://localhost:8000/api/telemetry"

class NodeConfig(TypedDict):
    node_id: str
    node_type: str
    lat: float
    lng: float

NODES: List[NodeConfig] = [
    {"node_id": "NODE_RIVER_01", "node_type": "FLOOD", "lat": 12.9610, "lng": 77.5850},
    {"node_id": "NODE_FOREST_02", "node_type": "FOREST_FIRE", "lat": 12.9810, "lng": 77.5950},
    {"node_id": "NODE_URBAN_03", "node_type": "FLOOD", "lat": 12.9550, "lng": 77.5750}
]

print("Simulating RakshakNet multi-node live telemetry stream...")
while True:
    node: NodeConfig = random.choice(NODES)
    spike: bool = random.random() < 0.35  # 35% probability of hazard trigger

    payload: Dict[str, Any] = {
        "node_id": node["node_id"],
        "node_type": node["node_type"],
        "lat": node["lat"],
        "lng": node["lng"],
        "battery_pct": round(random.uniform(70.0, 99.0), 1),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    if node["node_type"] == "FLOOD":
        flood_data: Dict[str, Any] = {
            "water_level_cm": round(random.uniform(95.0, 180.0) if spike else random.uniform(15.0, 45.0), 1),
            "rain_intensity_pct": round(random.uniform(70.0, 95.0) if spike else random.uniform(5.0, 20.0), 1),
            "soil_moisture_pct": round(random.uniform(75.0, 90.0) if spike else random.uniform(25.0, 45.0), 1),
            "camera_people_count": random.randint(2, 6) if spike else 0,
            "trapped_persons_detected": spike
        }
        payload.update(flood_data)
    else:
        fire_data: Dict[str, Any] = {
            "temperature_c": round(random.uniform(43.0, 52.0) if spike else random.uniform(26.0, 32.0), 1),
            "humidity_pct": round(random.uniform(11.0, 19.0) if spike else random.uniform(55.0, 75.0), 1),
            "smoke_raw": round(random.uniform(480.0, 850.0) if spike else random.uniform(50.0, 150.0), 1),
            "camera_fire_detected": spike,
            "camera_fire_conf": round(random.uniform(0.85, 0.98), 2) if spike else 0.0,
            "camera_people_count": random.randint(1, 4) if spike else 0,
            "trapped_persons_detected": spike
        }
        payload.update(fire_data)

    try:
        res = requests.post(API_URL, json=payload)
        print(f"Sent: {node['node_id']} [{node['node_type']}] -> HTTP {res.status_code}")
    except Exception as e:
        print(f"Connection failed: {e}")

    time.sleep(2.5)