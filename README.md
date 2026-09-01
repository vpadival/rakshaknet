# RakshakNet: Multi-Hazard Environmental Sensing & Early-Warning Network

> **Smart India Hackathon 2026**
> **Problem Statement ID:** SIH26178
> **Organization:** Qualcomm Inc.
> **Category:** Hardware / Disaster Management
> **Theme:** Disaster Management

---

## 📌 Executive Summary

**RakshakNet** is a distributed, Edge-AI environmental monitoring and disaster mitigation ecosystem designed to shift disaster management from reactive response to proactive risk prevention.

By combining specialized on-field IoT sensing nodes for **forest fires, flash floods, and air quality monitoring** with on-device intelligence using **ESP32, TinyML, and ESP32-CAM**, RakshakNet provides continuous real-time hazard detection and triage.

The system uses a resilient failover communication architecture consisting of **LoRa Mesh, Wi-Fi/4G, and GSM/SMS**, enabling alerts and telemetry to continue even when conventional internet or cellular infrastructure is unavailable.

---

## 🚀 Key Features

### 🔥 Multi-Signal Edge Risk Fusion

RakshakNet dynamically evaluates environmental risk using weighted sensor-fusion algorithms.

Examples include:

* **Flash Flood Risk:** Water Level + Rate of Rise + Soil Moisture
* **Forest Fire Risk:** Temperature + Humidity + Smoke Detection + Visual Confirmation
* **Air Quality Risk:** Environmental gas and particulate indicators combined with contextual sensor data

This approach reduces false alarms by combining multiple independent signals instead of relying on a single sensor threshold.

### 📷 Camera-Based Threat & Victim Triage

The **ESP32-CAM** runs lightweight on-device vision models to:

* Verify active fire and smoke events
* Identify potential victims or trapped individuals
* Estimate victim counts
* Forward relevant information and coordinates to emergency responders

### 📡 Resilient Multi-Tier Alerting Architecture

RakshakNet uses multiple communication and alerting layers:

#### Tier 1 — Zero-Network Alerting

Local safety mechanisms operate without internet or cellular connectivity:

* OLED status display
* Piezo buzzer/siren
* Local hazard indicators
* Immediate threshold-based warnings

#### Tier 2 — Long-Range LoRa Mesh

Sub-GHz **LoRa Mesh** communication relays telemetry between remote nodes and a gateway, allowing data to travel across areas where conventional network infrastructure may be unavailable.

#### Tier 3 — Cellular SMS Failover

When internet-based communication is unavailable, **GSM/SMS** can transmit emergency alerts and coordinates directly to designated responders.

### 🖥️ Dual-View Command & Safety Portal

RakshakNet provides two distinct interfaces.

#### Authority View

Designed for emergency response teams and administrators:

* Real-time geospatial risk heatmaps
* Hazard diagnostics
* Sensor telemetry
* Battery and node health
* Victim/trapped-person coordinates
* Alert and event logs

#### Citizen View

Designed for the general public:

* Plain-language safety levels
* Danger-zone/perimeter warnings
* Evacuation guidance
* Nearest relief-shelter information
* One-click Google Maps navigation

---

## 🏗️ System Architecture

```text
                   +-----------------------------------+
                   |      Physical Environment         |
                   | (Forest / River / Urban Sectors)  |
                   +-----------------+-----------------+
                                     |
                                     v
                   +-----------------------------------+
                   |    Specialized ESP32 Node Layer   |
                   | (HC-SR04, DHT22, MQ-2, ESP32-CAM) |
                   +--------+-----------------+--------+
                            |                 |
          (Zero-Network)    |                 | (Wi-Fi / 4G / LoRa Mesh)
                            v                 v
                 +--------------------+   +-----------------------+
                 | Local OLED + Alarm  |   | Cloud/Gateway Backend |
                 |  (Point of Danger) |   | (FastAPI + AI Engine) |
                 +--------------------+   +-----------+-----------+
                                                      |
                                       +--------------+--------------+
                                       |                             |
                                       v                             v
                          +-----------------------+     +------------------------+
                          | Authority Command UI  |     |  Citizen Safety Portal |
                          | (Triage & Diagnostics)|     |  (Safe Zone Navigation)|
                          +-----------------------+     +------------------------+
```

---

## 🛠️ Tech Stack & Hardware Components

### Software & Cloud

| Component                | Technologies                                                 |
| ------------------------ | ------------------------------------------------------------ |
| **Backend**              | Python, FastAPI, WebSockets, Pydantic, Uvicorn               |
| **Frontend**             | React.js, Tailwind CSS, Leaflet, React-Leaflet, Lucide Icons |
| **Data Processing & ML** | NumPy, Scikit-Learn                                          |
| **Communication**        | REST APIs, WebSockets, LoRa, GSM/SMS                         |
| **SMS Gateway**          | Fast2SMS / Twilio API / GSM AT Commands                      |

### Hardware Suite

| Category                     | Components                                          |
| ---------------------------- | --------------------------------------------------- |
| **Controllers**              | ESP32-WROOM-32, ESP32-CAM (OV2640)                  |
| **Temperature & Humidity**   | DHT22                                               |
| **Smoke / Gas Detection**    | MQ-2                                                |
| **Water-Level Detection**    | HC-SR04 / JSN-SR04T                                 |
| **Rain Detection**           | FC-37 Raindrop Sensor                               |
| **Soil Monitoring**          | Soil Moisture Sensor                                |
| **Long-Range Communication** | LoRa SX1278 (433/868 MHz)                           |
| **Cellular Communication**   | GSM/GPRS SIM800L                                    |
| **Power**                    | Solar Charge Controller + 18650 Li-ion Battery Pack |

---

## 📂 Project Structure

```text
rakshaknet/
│
├── backend/
│   ├── main.py              # FastAPI server, WebSockets, risk fusion & SMS trigger
│   ├── simulate.py          # Multi-node hardware telemetry simulator
│   └── requirements.txt     # Backend dependencies
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Dual-view Authority / Citizen dashboard
│   │   ├── main.jsx         # React application entry point
│   │   └── index.css        # Tailwind styling & Leaflet CSS imports
│   │
│   ├── package.json         # Frontend dependencies
│   └── vite.config.js       # Vite build configuration
│
└── firmware/
    └── esp32_node.ino       # ESP32 sensor reading, edge thresholds & HTTP/LoRa uplink
```

---

## ⚡ Quickstart Guide

### 1. Backend Setup

```bash
cd backend

python -m venv venv

# Linux/macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at:

```text
http://localhost:8000
```

### 2. Frontend Setup

Open a new terminal:

```bash
cd frontend

npm install
npm run dev
```

The Vite development server will provide the local frontend URL in the terminal.

### 3. Run Hardware Telemetry Simulation

Open another terminal:

```bash
cd backend

python simulate.py
```

The simulator generates telemetry representing multiple environmental sensing nodes and can be used to test the backend and dashboard without physical hardware.

---

## 🌐 Live Deployment Guide

### Backend Deployment — Render / Railway

1. Push the repository to GitHub.

2. Log into [Render](https://render.com/?utm_source=chatgpt.com) or [Railway](https://railway.app/?utm_source=chatgpt.com) and create a new **Web Service**.

3. Set the **Root Directory** to:

   ```text
   backend
   ```

4. Set the runtime to **Python 3**.

5. Set the **Build Command** to:

   ```bash
   pip install -r requirements.txt
   ```

6. Set the **Start Command** to:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

### Frontend Deployment — Vercel

1. Log into [Vercel](https://vercel.com/?utm_source=chatgpt.com) and import the GitHub repository.

2. Set the **Root Directory** to:

   ```text
   frontend
   ```

3. Select the **Vite** build preset.

4. Configure the following environment variable:

   ```text
   VITE_API_URL=https://<YOUR-RENDER-BACKEND-URL>
   ```

5. Deploy the application.

---

## 🔌 API & Communication Flow

At a high level, the system follows this data flow:

```text
Sensors
   │
   ▼
ESP32 Edge Node
   │
   ├── Local Risk Analysis
   │       │
   │       └── OLED + Buzzer
   │
   └── Telemetry Uplink
           │
           ├── LoRa Mesh
           ├── Wi-Fi / 4G
           └── GSM / SMS Failover
                    │
                    ▼
             FastAPI Backend
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Authority Dashboard   Citizen Portal
```

---

## 🛡️ Disaster Management Workflow

```text
Environmental Change
        │
        ▼
Sensor Data Collection
        │
        ▼
Edge-Level Risk Assessment
        │
        ├── Low Risk ───────────────► Continue Monitoring
        │
        ├── Medium Risk ────────────► Warning / Increased Sampling
        │
        └── High Risk
                │
                ▼
        Local Alarm Activation
                │
                ▼
        Multi-Channel Alert
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
      LoRa     4G      GSM/SMS
        │       │        │
        └───────┼────────┘
                ▼
        Emergency Dashboard
                │
        ┌───────┴────────┐
        ▼                ▼
   Authorities        Citizens
        │                │
        ▼                ▼
   Response &       Evacuation /
   Triage           Safety Guidance
```

---

## 🎯 Project Objectives

RakshakNet is designed to:

* Detect environmental hazards at an early stage.
* Reduce dependence on centralized internet infrastructure.
* Perform preliminary risk assessment directly at the edge.
* Reduce false positives through multi-sensor fusion.
* Provide reliable communication during infrastructure failures.
* Assist authorities with real-time situational awareness.
* Provide citizens with clear and actionable safety information.
* Support scalable deployment across forests, river basins, and urban areas.

---

## 👥 Team & Submission Details

| Field                    | Details                        |
| ------------------------ | ------------------------------ |
| **Project Name**         | RakshakNet                     |
| **Hackathon**            | Smart India Hackathon 2026     |
| **Problem Statement ID** | SIH26178                       |
| **Organization**         | Qualcomm Inc.                  |
| **Category**             | Hardware / Disaster Management |
| **Theme**                | Disaster Management            |

---

## 📄 License

This project is developed as part of **Smart India Hackathon 2026**.

Add your preferred open-source license here if the repository is intended for public distribution.

```
```
