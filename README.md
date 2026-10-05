# PulseSentry: Clinical Home-Care Monitoring & Deterioration Alerting

> **Autonomous Physiological Telemetry, Explainable Early-Warning Scoring, and Resilient Edge-to-Cloud Alerting for Acute Hospital-at-Home Care.**

[![Tests](https://img.shields.io/badge/tests-48%20passing-brightgreen.svg)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-v20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-14+-blue.svg)](https://www.postgresql.org/)

⚠ **Clinical Disclaimer:** *PulseSentry is an engineering research prototype designed to demonstrate edge-to-cloud remote telemetry, idempotent ingestion, and early deterioration detection algorithms. It is not an FDA-cleared diagnostic medical device and is not a substitute for professional clinical diagnosis.*

---

## Overview

PulseSentry brings hospital-grade continuous vital sign monitoring directly into the patient's home. The system bridges simulated wearable IoT biosensors and smart oxygen concentrators with an explainable AI risk scoring engine, an automated alert state machine, and real-time caregiver collaboration tools.

Even under complete power outages or home ISP internet disconnects, the edge hub continues recording vitals locally, evaluates critical safety floors, and sounds an audible buzzer, later synchronizing without duplicates upon reconnection.

---

## Problem Statement

When acute or chronic patients (e.g., COPD, Congestive Heart Failure, Pneumonia) recover at home:
1. **Intermittent Spot-Checks Miss Deterioration:** Patients are checked once or twice daily by visiting caregivers. Clinical deterioration develops over 12–24 hours before culminating in an emergency hospitalization.
2. **Threshold Alarms Fire Too Late:** Conventional monitors alert only when a vital breaches an absolute limit (e.g., $\text{SpO}_2 < 90\%$). By that point, the patient is already in severe respiratory failure.
3. **Alert Fatigue:** High false-alarm rates cause caregivers to silence or ignore monitors.
4. **Network Fragility:** Most consumer IoT health solutions fail completely when the home Wi-Fi drops, creating dangerous unmonitored blind spots.

---

## Features

- **Continuous 5-Vital Telemetry:** Streams Heart Rate, $\text{SpO}_2$, Respiration Rate, Temperature, and Systolic/Diastolic Blood Pressure every 2 seconds.
- **Medical Equipment Telemetry:** Monitors smart oxygen concentrators (flow rate in L/min and power source: mains vs. battery). Flow drops below 50% of prescription trigger immediate clinical alerts.
- **Explainable Early-Warning Risk Engine (NEWS2 Adaptation):**
  - Scores patient risk from 0–100 (**LOW**, **MEDIUM**, **HIGH**).
  - Evaluates multi-parameter velocity (trend direction and acceleration).
  - Detects deterioration at **~23%** along the physiological deterioration curve (compared to ~90% for conventional threshold alarms).
  - Natural language explanation generation (e.g., *"HIGH RISK because SpO2 dropped from 96% to 89% over 38s while respiratory rate rose from 16 to 28 breaths/min"*).
- **Negation-Aware Clinical Note NLP:** Extracts structured symptom signals (e.g., dyspnea, dizziness, chest discomfort) from caregiver free-text notes while filtering out negated mentions (e.g., *"denies chest pain"*).
- **Stateful Alert Lifecycle & Deduplication:**
  - Database-enforced partial unique index guarantees strictly one active clinical alert per patient.
  - Automatic severity upgrades (MEDIUM $\to$ HIGH) rather than duplicate alert creation.
  - 60-second cooldown windows post-resolution to eliminate alert chatter.
  - Multi-tier escalation if alerts remain unacknowledged or if the assigned caregiver is not checked in.
- **Outbound Interactive Phone Alerts (Telegram):**
  - Dispatches instant alerts to caregiver phones with interactive **Acknowledge**, **Escalate**, and **Resolve** callback buttons.
  - Secondary on-call escalation channels for unacknowledged emergencies.
- **24-Hour Clinical Shift Handover Summary:**
  - Automated endpoint (`/api/patients/:id/summary`) aggregating 24-hour vital ranges (min/max/avg), risk peaks, alert counts, and recent clinical notes for doctor/nurse shift handover.
- **Edge Store-and-Forward Resilience:**
  - Local disk-backed FIFO queue with exponential backoff and randomized jitter ($1\text{s} \to 30\text{s}$).
  - Fully idempotent ingestion (`ON CONFLICT (device_id, sequence_number) DO NOTHING`).
  - Standalone edge buzzer alarm that operates completely offline.
- **Auditable Governance:** Immutable append-only audit trail logging logins, ingestions, risk assessments, and alert actions.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          EDGE LAYER (PATIENT HOME)                     │
│  Simulated Wearables (HR, SpO2, RR, Temp, BP) + Oxygen Concentrator    │
│  └─► Local Hub (Uplink Buffer + SQLite/JSON + Offline Audio Buzzer)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (X-Device-Key)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND APPLICATION LAYER                       │
│  Node.js (Express 4, ES Modules, Helmet, CORS, Zod Validation)         │
│  ├─► Auth Service (JWT + Bcrypt, RBAC: Admin vs. Caregiver)            │
│  ├─► Vital Ingestion Gateway (Atomic Single-Transaction Batching)      │
│  ├─► Watchdog Monitor (Device silence detection & offline grace)       │
│  ├─► Notification Service (Telegram Bot long polling & callbacks)      │
│  ├─► Socket.IO Gateway (Bidirectional real-time event distribution)    │
│  └─► Job Queue (BullMQ + Redis with automatic in-memory fallback)      │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │ Internal REST                            │ SQL Pool
               ▼                                          ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│      RISK ENGINE SERVICE     │        │        PERSISTENCE LAYER       │
│  FastAPI (Python 3.10+)      │        │  PostgreSQL (13 relational     │
│  ├─ Early Warning Scorer     │        │  tables, partial indexes,      │
│  ├─ Trend Velocity Analyzer  │        │  constraints & audit log)      │
│  └─ Clinical Note NLP Regex  │        └────────────────────────────────┘
└──────────────────────────────┘
               ▲
               │ Socket.IO + REST (Bearer JWT)
┌──────────────┴─────────────────────────────────────────────────────────┐
│                          FRONTEND PRESENTATION                         │
│  React 19 + Vite 6 + Tailwind CSS 4 + Recharts                         │
│  (Patient Vitals, Deterioration Trajectory, Live Alerts & Audit Trail) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend API** | Node.js (v20+), Express 4, ES Modules, `pg` (node-postgres), Zod, Helmet, CORS, Pino, Socket.IO |
| **Data Persistence** | PostgreSQL (v14+ / `embedded-postgres`), Redis (BullMQ task queue) |
| **Risk & Analytical Engine** | Python 3.10+, FastAPI, Pydantic v2, Uvicorn, pytest, httpx |
| **Frontend UI** | React 19, Vite 6, Tailwind CSS 4, Recharts, React Router 7, socket.io-client |
| **IoT Sensor Simulator** | Node.js, Express, FileStore local buffer, Web Audio buzzer API |
| **Testing** | Node test runner (`node:test`), supertest, pytest |

---

## Project Structure

```
pulse-sentry/
├── apps/
│   ├── backend/               # Express 4 API, Ingestion, WebSockets, BullMQ
│   │   ├── src/
│   │   │   ├── config/        # Environment and validation configuration
│   │   │   ├── controllers/   # Request-response routing controllers
│   │   │   ├── db/            # Database pool & migration runner
│   │   │   ├── middleware/    # Auth, RBAC, Zod validation, error handlers
│   │   │   ├── repositories/  # Parameterized SQL database access layer
│   │   │   ├── routes/        # Express REST route declarations
│   │   │   ├── services/      # Business logic (vitals, alerts, notifications)
│   │   │   └── workers/       # Asynchronous background job handlers
│   │   └── test/              # 23 automated integration tests
│   ├── frontend/              # React 19 + Vite 6 Caregiver Dashboard
│   │   └── src/
│   │       ├── components/    # Recharts vital graphs, ErrorBoundary, alert cards
│   │       ├── lib/           # Auth provider, Socket.IO client, API client
│   │       └── pages/         # DashboardPage, PatientPage, AuditPage, LoginPage
│   ├── risk-engine/           # Python FastAPI explainable clinical risk service
│   │   ├── app/
│   │   │   ├── engine/        # NEWS2 model, trend velocity, note NLP regex
│   │   │   ├── main.py        # FastAPI entry points (/v1/assess, /v1/notes/extract)
│   │   │   └── schemas.py     # Pydantic v2 request/response models
│   │   └── tests/             # 13 pytest unit & integration tests
│   └── sensor-simulator/      # Simulated wearable sensors & edge hub gateway
│       ├── public/            # Standalone home-hub screen & local buzzer
│       ├── src/               # Telemetry generator, uplink, hub alarms
│       └── test/              # 12 edge buffer & uplink tests
├── database/
│   ├── migrations/            # Relational PostgreSQL DDL migrations
│   └── seeds/                 # Clinical demo patients & caregiver accounts
├── docs/                      # ARCHITECTURE.md, BASELINE.md, DEVELOPMENT_NOTES.md
├── packages/
│   └── shared/                # Shared thresholds, enums, and socket event names
├── scripts/                   # Local embedded database launcher (local-db.js)
├── .env.example               # Secure environment template
├── package.json               # Monorepo npm workspaces configuration
└── render.yaml                # Cloud deployment blueprint
```

---

## Installation

### Prerequisites
- **Node.js**: v20.0.0 or higher
- **Python**: v3.10 or higher with `pip`
- **Git**

### Clone & Install
```bash
# Clone repository
git clone https://github.com/vignesh28102006/pulse-sentry.git
cd pulse-sentry

# Install JavaScript dependencies across all workspaces
npm install

# Install Python risk engine dependencies
pip install -r apps/risk-engine/requirements.txt
```

---

## Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment configurations:
| Variable | Default (Local) | Purpose |
|---|---|---|
| `PORT` | `4000` | Backend API port |
| `DATABASE_URL` | `postgres://homecare:homecare@localhost:5433/homecare` | PostgreSQL connection string |
| `RISK_ENGINE_URL` | `http://localhost:8000` | Python FastAPI risk engine URL |
| `SIMULATOR_URL` | `http://localhost:4100` | Edge simulator URL |
| `JWT_SECRET` | *(string)* | Secret key for signing authentication tokens |
| `DEVICE_API_KEY` | *(string)* | Pre-shared key for IoT device authentication |
| `TELEGRAM_BOT_TOKEN`| *(optional)* | Telegram Bot Father token for phone alerts |
| `TELEGRAM_CHAT_ID`  | *(optional)* | Primary caregiver chat ID for alerts |

---

## Running Locally

### Step 1: Start the Local Database
PulseSentry includes a self-contained local PostgreSQL server (`embedded-postgres`), requiring zero Docker or system installs:
```bash
# Terminal 1: Starts embedded PostgreSQL on port 5433
npm run db:start
```

### Step 2: Apply Migrations & Seed Data
```bash
npm run db:migrate
```

### Step 3: Start All Services Concurrently
```bash
# Terminal 2: Starts Risk Engine (8000), Backend (4000), Simulator (4100), and Frontend (5173)
npm run dev
```

### Access URLs:
- **Caregiver Dashboard:** [http://localhost:5173](http://localhost:5173)
- **Home Hub Edge Screen:** [http://localhost:4100](http://localhost:4100)
- **Backend API & Swagger Health:** [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **Risk Engine OpenAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

**Default Demo Credentials:**
| Role | Email | Password |
|---|---|---|
| **Caregiver (Active)** | `anita@homecare.demo` | `Care@123` |
| **Caregiver (Checked Out)** | `rahul@homecare.demo` | `Care@123` |
| **Clinical Administrator** | `admin@homecare.demo` | `Admin@123` |

---

## Testing

PulseSentry maintains a comprehensive automated testing suite covering all microservices:

```bash
# Run all automated test suites (Risk Engine + Simulator + Backend)
npm test
```

### Individual Service Tests:
```bash
# Python Risk Engine Tests (pytest)
npm run test:risk

# IoT Sensor Simulator Tests (node:test)
npm run test:simulator

# Backend Integration Tests (node:test against real PostgreSQL & FastAPI)
npm run test:backend

# Production Frontend Build
npm run build
```

---

## Screenshots

*(Clinical interface screenshots and video demonstrations)*
- **Demo Video:** [`demo/pulsesentry-demo.mp4`](demo/pulsesentry-demo.mp4) (Walkthrough showing Sensor Simulation $\to$ Backend Ingestion $\to$ AI Risk Engine $\to$ Real-Time Caregiver Dashboard $\to$ Offline Recovery).

---

## API Documentation

All REST endpoints reside under `/api`. Endpoints require `Authorization: Bearer <token>` unless marked otherwise.

### Authentication & Telemetry Ingestion
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | None | Authenticate with `{ email, password }` |
| `GET` | `/api/auth/me` | User | Return current authenticated caregiver/admin session |
| `POST` | `/api/vitals` | `X-Device-Key` | Idempotent vital ingestion (single or batch up to 500 items) |
| `POST` | `/api/equipment` | `X-Device-Key` | Idempotent oxygen concentrator readings |
| `POST` | `/api/hub-events` | `X-Device-Key` | Sync offline edge buzzer alarm events |

### Patient & Clinical Monitoring
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/patients` | User | Overview of all patients with latest vitals and risk scores |
| `GET` | `/api/patients/:id` | User | Comprehensive patient record, medical conditions, and devices |
| `GET` | `/api/patients/:id/vitals` | User | Historical vital telemetry (`?minutes=30`) |
| `GET` | `/api/patients/:id/risk` | User | Latest risk assessment, score velocity, and projection |
| `GET` | `/api/patients/:id/summary` | User | **New:** 24-hour clinical shift handover aggregate summary |
| `GET` | `/api/patients/:id/notes` | User | List caregiver progress notes |
| `POST` | `/api/patients/:id/notes` | User | Submit caregiver progress note (triggers NLP signal extraction) |

### Alert Lifecycle Management
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/alerts` | User | Query active and historical alerts (`?status=active`) |
| `POST` | `/api/alerts/:id/acknowledge` | User | Acknowledge active alert with optional note |
| `POST` | `/api/alerts/:id/response` | User | Document clinical intervention and acknowledge |
| `POST` | `/api/alerts/:id/resolve` | User | Resolve alert and start 60s cooldown timer |
| `POST` | `/api/alerts/:id/escalate` | User | Manually escalate alert to on-call supervisor |

---

## Future Improvements

1. **Vital Drift & Anomaly Forecasting (EWMA):** Implement rolling statistical z-score models to catch chronic vital drift before crossing fixed numerical boundaries.
2. **Clinical Export Service:** Export 24-hour shift summaries as formatted PDF/FHIR bundles for electronic health record (EHR) integration.
3. **Per-Patient Target Overrides:** Enable personalized vital target envelopes (e.g., target $\text{SpO}_2$ 88–92% for severe COPD patients).
4. **Hardware IoT Gateway Bridge:** Provide an MQTT / BLE ingestion adapter to interface with physical commercial Bluetooth pulse oximeters.

---

## Author

**Vignesh Vasala**  
- GitHub: [@vignesh28102006](https://github.com/vignesh28102006)
- Repository: [pulse-sentry](https://github.com/vignesh28102006/pulse-sentry)
