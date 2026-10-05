# Project Audit: Smart Home-Care Patient Monitoring System

**Audit Date:** October 6, 2026  
**Auditor Mode:** Lazy Senior Developer (Root-Cause, Minimal Bloat, Maximum Engineering Rigor)  
**Target Repository:** PulseSentry Monorepo  

---

## 1. What the Project Does

The application is a full-stack, edge-to-cloud remote patient monitoring (RPM) platform designed to track elderly and chronic-disease patients receiving hospital-level home care.

The system executes a continuous 5-stage closed loop:
1. **Sense:** Simulated wearable medical IoT sensors collect vital signs (Heart Rate, SpO₂, Respiration Rate, Body Temperature, Systolic & Diastolic Blood Pressure) and smart medical equipment telemetry (Home Oxygen Concentrator flow rate in L/min, power source: mains vs. battery).
2. **Understand:** The backend validates telemetry against clinical boundaries, enforces sequence-number idempotency to eliminate replay duplicates, detects device disconnections, and extracts structured clinical signals (e.g., dyspnea, fatigue, chest pain) from unstructured caregiver progress notes.
3. **Predict:** A dedicated Python FastAPI risk service computes explainable deterioration scores (0–100 mapped to LOW, MEDIUM, HIGH) combining baseline vital deviations, multi-parameter velocity/trends, patient comorbidities (COPD, heart failure), caregiver clinical note observations, and deterministic safety floors.
4. **Alert:** A stateful alert manager enforces de-duplication (strictly one active clinical alert per patient), prevents alert fatigue via cooldown timers, triggers automatic caregiver absence escalations, and dispatches interactive notifications to Telegram bots.
5. **Respond:** Caregivers interact with a real-time web dashboard (or Telegram interactive buttons) to check in/out, log visits, acknowledge alerts, record interventions, and resolve incidents. Edge hubs feature local store-and-forward offline buffers and edge buzzer alarms that sync automatically upon reconnection.

---

## 2. Architecture & Data Flow

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
│  ├─► Vital Ingestion Service (Idempotent, Sequence Validation)         │
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

## 3. Technologies Used

| Domain | Technology / Library | Purpose |
|---|---|---|
| **Runtime & Language** | Node.js v20+, Python 3.10+, SQL | Multi-language polyglot architecture |
| **Monorepo Management** | npm Workspaces (`packages/*`, `apps/*`) | Unified dependency graph and shared types |
| **Backend API** | Express.js 4.21, ES Modules | High-performance HTTP server |
| **Validation & Security** | Zod 3.24, Helmet 8.0, CORS, bcryptjs, jsonwebtoken | Input contracts, token auth, OWASP hygiene |
| **Database & ORM** | PostgreSQL (v14+ / `embedded-postgres`), `pg` pool | ACID relational store, partial unique indexes |
| **Messaging & Background** | BullMQ 5.34, ioredis 5.4, in-memory queue fallback | Asynchronous risk evaluation & watchdog tasks |
| **Real-time Gateway** | Socket.IO 4.8 (Server & Client) | Instant push notifications to caregiver dashboard |
| **AI / Risk Service** | Python 3.10+, FastAPI, Pydantic v2, Uvicorn | Explainable hybrid clinical decision support |
| **Frontend Framework** | React 19, React Router 7, Vite 6, Tailwind CSS 4 | Responsive, low-latency clinical dashboard |
| **Data Visualization** | Recharts 2.15 | Real-time vital sign charts and risk trajectory |
| **Testing** | Node test runner (`node:test`), supertest, pytest | Backend integration, edge buffer & ML testing |

---

## 4. Important Modules & File Map

- **Shared Domain Definitions:** `packages/shared/src/index.js` (clinical threshold definitions, vital ranges, socket events, disclaimer).
- **Backend Entry & Server:** `apps/backend/src/server.js`, `apps/backend/src/app.js`.
- **Telemetry Ingestion & Idempotency:** `apps/backend/src/services/vitalService.js`, `equipmentService.js`.
- **Alert State Machine & Escalation:** `apps/backend/src/services/alertService.js`.
- **Background Watchdog & Offline Detection:** `apps/backend/src/services/monitorService.js`.
- **External Notifications (Telegram):** `apps/backend/src/services/notificationService.js`.
- **Risk Calculation Model:** `apps/risk-engine/app/engine/model.py`, `vitals.py`, `trends.py`, `notes.py`.
- **Edge Simulator & Hub Buffer:** `apps/sensor-simulator/src/simulator.js`, `uplink.js`, `hubAlarms.js`.
- **Caregiver Dashboard:** `apps/frontend/src/pages/DashboardPage.jsx`, `PatientPage.jsx`, `AuditPage.jsx`.

---

## 5. How to Run the Project

### Prerequisites
- Node.js 20+ installed
- Python 3.10+ installed with `pip`
- Git

### Step-by-Step Setup
1. **Install dependencies:**
   ```bash
   npm install
   pip install -r apps/risk-engine/requirements.txt
   ```
2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
3. **Start local database:**
   ```bash
   # Terminal 1: starts embedded PostgreSQL on port 5433
   npm run db:start
   ```
4. **Apply schema migrations & seed data:**
   ```bash
   npm run db:migrate
   ```
5. **Run all services concurrently:**
   ```bash
   # Terminal 2: launches risk-engine (8000), backend (4000), simulator (4100), and frontend (5173)
   npm run dev
   ```
6. **Execute Automated Tests:**
   ```bash
   npm test
   ```

---

## 6. Current Problems, Flaws & Bottlenecks

1. **Directory Structure Organization:**
   - Monorepo packages required clean workspace alignment across `apps/backend`, `apps/frontend`, `apps/risk-engine`, and `apps/sensor-simulator`.
2. **Missing Git Repository:**
   - No `.git` metadata was included in the download. Development history, branches, and origin remotes must be properly initialized from scratch without fake history.
3. **Database Telemetry Ingestion Bottleneck (N-Transaction Loop):**
   - In `apps/backend/src/services/vitalService.js` (`ingestOne`), batch uploads of up to 500 buffered readings execute a separate database transaction per reading sequentially (`withTransaction`). This causes 500 individual round trips to Postgres, creating high latency and potential connection pool exhaustion during edge reconnection syncs.
4. **Token Exposure on Edge Hub:**
   - In `apps/sensor-simulator/src/index.js`, the `/token.js` endpoint serves `window.CONTROL_TOKEN` in plain text to any unauthenticated GET request, allowing unauthorized actors on the local network to control simulation states.
5. **Single Shared Device Key:**
   - All IoT sensors authenticate via a single global static `DEVICE_API_KEY` header rather than device-specific credentials or signed tokens.
6. **Frontend Error Resilience:**
   - The React frontend lacks an `ErrorBoundary`. If an unhandled exception occurs in chart rendering or during parsing of malformed websocket payloads, the entire UI crashes to a blank screen.
   - Frontend lacks automated test coverage (no unit tests for components or hooks).
7. **Production Configuration & Hardening:**
   - Production deployment targets required environment variable decoupling, cloud configuration profiles, and environment-driven URL mappings.

---

## 7. Recommended Improvements

- **Milestone 1 — Structural & Project Identity:**
  - Flatten directory hierarchy to root.
  - Rebrand project with a distinct, interview-ready name, logo/styling, and professional package naming.
  - Establish a clean Git repository with genuine milestone commits.
- **Milestone 2 — Database Ingestion Performance Optimization:**
  - Refactor `vitalService.js` and `equipmentService.js` to perform single-transaction bulk multi-row inserts with `ON CONFLICT (device_id, sequence_number) DO NOTHING`, turning O(N) database transactions into a single O(1) query.
- **Milestone 3 — Security Hardening:**
  - Replace unauthenticated `/token.js` exposure with secure session tokens or protected control routes.
  - Enforce stricter input validation boundaries on vital reading timestamps to prevent future-dated or stale timestamps beyond tolerance.
  - Sanitize configuration defaults and establish complete `.env.example`.
- **Milestone 4 — Frontend Reliability & UX:**
  - Add React Error Boundary with graceful fallback UI and reload actions.
  - Implement toast notifications for network reconnection and socket status.
  - Add accessible ARIA attributes across alert action buttons and vital trend badges.
- **Milestone 5 — Automated Frontend Testing:**
  - Add component tests for key UI flows (Patient Card, Risk Badge, Alert Acknowledge) to prove stability.

---

## 8. High-Value Features That Can Be Added

1. **Vital Drift & EWMA Anomaly Detection:**
   - Implement Exponentially Weighted Moving Average (EWMA) or rolling statistical z-score calculations in the risk engine to detect subtle baseline shifts before vital signs breach absolute thresholds.
2. **Clinical Shift Handover & Export Service:**
   - Add an automated shift summary generator (CSV / printable clinical summary) synthesizing a patient's 24-hour vital trends, peak risk scores, active alerts, and caregiver notes for doctor review.
3. **Customized Patient Threshold Overrides:**
   - Allow clinicians to set patient-specific baseline targets (e.g., target SpO₂ of 88–92% for severe COPD patients to prevent false positive hypoxia alarms).
4. **Caregiver Activity Verification Check:**
   - Audit trail verification ensuring high-risk alerts cannot be closed without mandatory intervention documentation.

---

## 9. Interview Preparation Roadmap (What to Master)

To confidently discuss this project in high-stakes technical interviews:
1. **Clinical Early Warning Systems (NEWS2):**
   - Understand how the National Early Warning Score works in clinical practice, why physiological trend velocity matters more than single static readings, and how deterministic safety floors prevent false negatives.
2. **IoT Ingestion Architecture & Idempotency:**
   - Be ready to explain the `(device_id, sequence_number)` unique constraint, why store-and-forward at the edge is necessary for intermittent connectivity, and how exponential backoff with jitter prevents thundering herd problems.
3. **Database Concurrency & ACID Boundaries:**
   - Discuss why partial unique indexes (`WHERE status <> 'RESOLVED'`) prevent duplicate active alerts, how `SELECT ... FOR UPDATE` prevents race conditions during alert acknowledgment, and how bulk inserts prevent connection pool starvation.
4. **WebSocket vs. Polling Trade-offs:**
   - Explain how Socket.IO provides sub-second vital distribution while fallback REST APIs handle client reconnections and historical time-series queries.
5. **System Failure Modes:**
   - Explain how the architecture behaves when: (a) the network drops entirely, (b) the risk engine goes down (fallback rule engine), (c) Redis is unavailable (in-memory job fallback), and (d) power cuts occur (concentrator switches to battery without false alarms).
