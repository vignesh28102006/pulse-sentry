# PulseSentry Technical Interview Preparation Guide

> **Comprehensive Interview Guide for PulseSentry**  
> *Every answer below is derived directly from the real implementation in this repository.*

---

## 1. 60-Second Elevator Pitch

> "PulseSentry is an edge-to-cloud remote patient monitoring and deterioration alerting platform built for acute hospital-at-home care. We stream continuous vital signs and medical oxygen equipment telemetry every 2 seconds from simulated home IoT devices. 
> 
> Rather than relying on traditional static threshold alarms that fire dangerously late, our Python FastAPI risk engine adapts the clinical NEWS2 protocol to evaluate physiological velocity across sliding windows, catching patient deterioration at roughly 23% along the deterioration path compared to 90% for conventional monitors.
> 
> The platform is designed for resilience: if a home loses power or internet, the local edge hub buffers telemetry to disk and sounds a local audible buzzer. When reconnected, our backend ingests up to 500 buffered readings in a single atomic database transaction with idempotent sequence deduplication, driving live updates to a React dashboard and interactive Telegram phone alerts for caregivers."

---

## 2. 2-Minute Detailed Project Explanation

> "PulseSentry was designed to solve one of the most critical challenges in modern healthcare: hospital-at-home safety. When high-acuity patients recover at home, deterioration happens gradually over 12 to 24 hours, but intermittent nurse spot-checks often miss the window of opportunity for early intervention.
> 
> To solve this, PulseSentry operates an end-to-end 5-stage loop:
> 
> 1. **Sense:** Simulated wearable biosensors collect 5 core vitals—Heart Rate, $\text{SpO}_2$, Respiration Rate, Temperature, and Blood Pressure—alongside equipment telemetry from smart home oxygen concentrators.
> 2. **Understand:** The Express ingestion gateway validates inputs using strict Zod schemas, enforces sequence-number idempotency to prevent duplicate replay packets, and extracts structured clinical symptom signals from unstructured caregiver progress notes using negation-aware NLP.
> 3. **Predict:** An asynchronous task queue triggers our Python FastAPI risk engine. The engine computes an explainable 0–100 risk score combining current vital bands (median-filtered over 3 readings to eliminate motion artifacts), multi-vital trend velocity, chronic patient conditions, and caregiver notes, guarded by non-negotiable deterministic safety floors.
> 4. **Alert:** A stateful alert manager enforces de-duplication via PostgreSQL partial unique indexes—guaranteeing at most one active alert per patient—and applies 60-second cooldown windows to eliminate alarm fatigue. Unacknowledged HIGH alerts automatically escalate to secondary on-call channels, or escalate immediately if the assigned caregiver is not checked in.
> 5. **Respond:** Caregivers monitor patients in real time via a React 19 web dashboard connected over WebSockets, or interact directly via Telegram callback buttons on their phones.
> 
> Crucially, the edge layer features a store-and-forward architecture with exponential backoff and local buzzer alarms, ensuring patient safety even when the home is completely offline."

---

## 3. Architecture Deep-Dive

- **Edge Layer:** Simulated IoT wearables + Home Hub gateway. Maintains an atomic disk-backed FIFO queue (`FileStore`) and evaluates critical vital limits locally for edge audio alarms.
- **Ingestion & Application Gateway (Express 4):** Validates payloads, checks pre-shared device keys with constant-time equality, and writes telemetry to PostgreSQL. Emits WebSocket events via Socket.IO.
- **Asynchronous Task Queue:** BullMQ backed by Redis, featuring an automatic in-memory queue fallback if Redis is absent.
- **Risk Decision Support Engine (FastAPI):** Stateless microservice evaluating multi-vital linear regression trends, symptom weights, and clinical safety floors.
- **Persistence Layer (PostgreSQL):** Relational schema with 13 tables, partial unique indexes, check constraints, cascade deletions, and append-only audit logging.
- **Presentation Layer (React 19 + Vite 6):** Real-time caregiver dashboard with Recharts time-series graphs, Error Boundary protection, and attendance check-in.

---

## 4. Why Each Technology Was Selected

| Technology | Selection Rationale |
|---|---|
| **Node.js / Express** | Optimal for high-concurrency asynchronous I/O, device streaming, and low-latency WebSocket distribution. |
| **Python / FastAPI / Pydantic** | Industry standard for data science and clinical algorithms; Pydantic enforces strict type safety, and FastAPI offers microsecond JSON serialization and automatic OpenAPI documentation. |
| **PostgreSQL** | Essential for healthcare data integrity (ACID compliance, relational integrity, partial unique indexes, and row-level locking). |
| **BullMQ + Redis** | Decouples heavy mathematical risk evaluation from HTTP ingestion threads, preventing ingestion delays during sudden traffic bursts. |
| **React 19 + Tailwind 4** | Component-driven reactivity for instant telemetry chart updates without full DOM re-renders. |
| **Socket.IO** | Bi-directional, low-latency event pushing with automatic fallback to long-polling under restricted clinical firewalls. |

---

## 5. Most Difficult Technical Problem

**The Problem:**
During edge network reconnection, home hubs flush large buffers of accumulated telemetry (up to 500 readings per device). The initial prototype executed a separate database transaction for every individual reading in a sequential loop. This resulted in 500 individual round-trips to PostgreSQL per sync, causing significant ingestion latency, lock contention, and connection pool starvation.

---

## 6. How It Was Solved

*Modified/implemented during this development.*

We refactored `vitalService.js` and `equipmentService.js` into a two-phase bulk pipeline:
1. **In-Memory Validation & Device Authorization:** Validated all items upfront using Zod schemas and resolved device assignments using an in-memory Map cache.
2. **Single Atomic Database Transaction:** Executed all valid inserts within a single `withTransaction` block using PostgreSQL `ON CONFLICT (device_id, sequence_number) DO NOTHING RETURNING ...`. Device state and online events are updated once per device in the batch.
3. **Result:** Reduced database round-trips from $O(N)$ sequential transactions to a single $O(1)$ transaction. The entire backend integration test suite execution time dropped from **47.8s down to 23.4s**—a more than 2x performance acceleration.

---

## 7. Database Architecture & Schema Design

- **Idempotency Guarantee:**
  ```sql
  CONSTRAINT uq_reading_device_sequence UNIQUE (device_id, sequence_number)
  ```
  *(Existing implementation — understand before interview.)*
- **Alert Deduplication:**
  ```sql
  CREATE UNIQUE INDEX uq_alerts_one_active ON alerts (patient_id, category) 
  WHERE status <> 'RESOLVED';
  ```
  *(Existing implementation — understand before interview.)*
- **Concurrency & Locking:**
  Caregiver alert actions (`acknowledge`, `respond`, `resolve`) execute `SELECT ... FOR UPDATE` (`alertRepository.findByIdForUpdate`), preventing double-acknowledgments and race conditions.
  *(Existing implementation — understand before interview.)*
- **Shift Handover Aggregation:**
  `patientRepository.get24HourSummary(patientId)` computes 24-hour min/max/avg vitals, peak risk scores, and alert tallies in parallel queries.
  *(Modified/implemented during this development.)*

---

## 8. API Architecture

- **Gateway Authentication:** Edge devices authenticate via `X-Device-Key`. User endpoints require `Authorization: Bearer <JWT>`.
- **Status Codes:**
  - `201 Created`: Telemetry successfully stored or note created.
  - `200 OK`: Duplicate reading safely ignored (idempotent), or successful query.
  - `400 Bad Request`: Zod validation error with field-level details.
  - `401 Unauthorized`: Missing/invalid token or device key.
  - `403 Forbidden`: Role permission failure (e.g., caregiver attempting demo reset).
  - `409 Conflict`: Alert already in a conflicting state.

---

## 9. Security Considerations

1. **Constant-Time Comparison:** Device API keys compared via `crypto.timingSafeEqual` to prevent side-channel timing attacks.
   *(Existing implementation — understand before interview.)*
2. **Simulator Token Hardening:** The simulator's `/token.js` endpoint was restricted to loopback/local interfaces with a secure session prompt fallback, preventing local network token extraction.
   *(Modified/implemented during this development.)*
3. **Data Sanitization & Privacy:** PII (patient name, contact numbers) is completely stripped before invoking the risk engine. Only numerical vectors, age, and condition categories are sent.
   *(Existing implementation — understand before interview.)*
4. **Environment Isolation:** Hardened `.gitignore` and `.env.example` ensure secrets, passwords, and `.local/` databases are never committed.
   *(Modified/implemented during this development.)*

---

## 10. Testing Strategy

1. **Risk Engine Tests (pytest):** 13 unit tests validating NEWS2 bands, multi-vital trend velocity, critical safety floors, red-flag notes, and recovery logic.
2. **Sensor Simulator Tests (node:test):** 12 tests verifying store-and-forward disk buffers, sequence persistence across restarts, exponential backoff, and local buzzer triggers.
3. **Backend Integration Tests (node:test + supertest):** 23 tests executed against a real local PostgreSQL cluster and a spawned Python FastAPI process, testing end-to-end flows, Telegram webhook mocks, and the new 24-hour summary endpoint.
4. **Frontend Production Build:** Verified using Vite 6.4.3 bundler with zero errors.

---

## 11. Performance Considerations

- **Median Filtering:** Taking the median of the last 3 samples filters single-point motion artifacts without introducing lagging moving average latency.
- **Single-Transaction Batching:** Bulk inserts prevent database connection exhaustion during edge buffer synchronization.
- **WebSocket Throttling:** Live vitals are pushed via WebSockets only on changes, while charts maintain a bounded sliding window (`slice(-MAX_POINTS)`).

---

## 12. Future Improvements

1. **EWMA Anomaly Detection:** Implement Exponentially Weighted Moving Average models to detect subtle vital drift prior to threshold crossing.
2. **FHIR / EHR Clinical Export:** Export shift summaries into standard HL7 FHIR Observation and DiagnosticReport JSON resources.
3. **Hardware Gateway:** Interface edge hubs with physical Bluetooth Low Energy (BLE) pulse oximeters and blood pressure cuffs.

---

## 13. Top 20 Interview Questions & Implementation Answers

### Q1: What is the core business problem PulseSentry solves?
> *"It solves late deterioration detection in hospital-at-home care by replacing intermittent nurse spot-checks and late threshold alarms with continuous telemetry and early-warning trend scoring."*

### Q2: What is the difference between a threshold alarm and physiological velocity?
> *"A threshold alarm fires only when a vital crosses an arbitrary limit, like SpO2 < 90%. Physiological velocity measures the rate of change over time (e.g. SpO2 dropping 6% in 40s while RR doubles). This flags clinical decline hours before absolute thresholds breach."*

### Q3: How do you guarantee telemetry ingestion is idempotent?
> *(Existing implementation — understand before interview.)*  
> *"Every reading has a monotonic, per-device `sequence_number`. PostgreSQL enforces `UNIQUE (device_id, sequence_number)`. Re-sent packets hit `ON CONFLICT DO NOTHING` and return a 200 duplicate status without inserting duplicate rows."*

### Q4: What happens when the patient's home loses internet connection?
> *(Existing implementation — understand before interview.)*  
> *"The edge hub buffers telemetry to a local disk-backed FIFO queue (`FileStore`). If a vital becomes critical or oxygen fails, a local buzzer sounds on the hub. When internet returns, readings upload in order with exponential backoff and jitter."*

### Q5: How do you prevent alarm fatigue among caregivers?
> *(Existing implementation — understand before interview.)*  
> *"Through three mechanisms: (1) PostgreSQL partial unique index ensuring at most one active alert per patient, (2) severity upgrades instead of new alert creation, and (3) a 60-second cooldown window post-resolution."*

### Q6: What was the N-transaction bottleneck in the initial ingestion service and how did you resolve it?
> *(Modified/implemented during this development.)*  
> *"Batch uploads of 500 readings were executing 500 sequential transactions in a loop. We refactored `vitalService.js` to validate in-memory and execute all insertions in a single atomic database transaction, reducing execution time by more than half."*

### Q7: How do you handle race conditions during alert acknowledgment?
> *(Existing implementation — understand before interview.)*  
> *"We use PostgreSQL row-level locks via `SELECT ... FOR UPDATE` inside a transaction. If a second caregiver clicks acknowledge simultaneously, the status check detects it is no longer OPEN and returns a 409 Conflict."*

### Q8: How does the system handle an outage of the Python risk engine?
> *(Existing implementation — understand before interview.)*  
> *"The backend health checker detects the outage. Ingestion continues and the backend automatically switches to `fallbackRisk.js`, an in-memory safety threshold evaluator that guarantees critical vitals still generate HIGH alerts."*

### Q9: Why did you build the risk engine in Python instead of Node.js?
> *"Separation of concerns. Node.js excels at asynchronous I/O and WebSockets. Python is the industry standard for scientific and clinical computing. Placing risk scoring behind an independent microservice allows swapping in trained ML models via the `RiskModel` interface without touching the API gateway."*

### Q10: How does clinical note NLP handle negation?
> *(Existing implementation — understand before interview.)*  
> *"In `notes.py`, regular expressions inspect a 3-word prefix window before symptoms for negation tokens like 'no', 'denies', or 'without'. 'Patient reports no chest pain' extracts zero signals, preventing false positive risk spikes."*

### Q11: What is the deterministic safety floor in your risk engine?
> *(Existing implementation — understand before interview.)*  
> *"Regardless of whether trends or notes are normal, if any vital breaches critical boundaries (SpO2 <= 88, RR >= 30, HR >= 131), the score is clamped to a minimum floor of 70 (HIGH). Deterministic safety floors prevent statistical models from under-scoring acute emergencies."*

### Q12: Why did you choose React 19 and what was the purpose of adding an Error Boundary?
> *(Modified/implemented during this development.)*  
> *"In clinical monitoring, an unhandled JavaScript error in a chart component must never crash the entire page into a blank screen. Our `ErrorBoundary` catches rendering errors, displays a clear fallback card, and keeps background telemetry and navigation alive."*

### Q13: How does caregiver attendance impact alert escalation?
> *(Existing implementation — understand before interview.)*  
> *"If an alert is HIGH risk and the assigned caregiver is not checked in, the system immediately escalates the alert to secondary clinical channels rather than waiting for the 60-second acknowledgment timeout."*

### Q14: How does equipment monitoring interact with clinical risk?
> *(Existing implementation — understand before interview.)*  
> *"When an oxygen concentrator flow drops below 50% of the prescription, an equipment alert is raised and patient risk is automatically re-assessed with an equipment fault penalty. Power switching to battery is logged but does not trigger false alarms."*

### Q15: How does Telegram integration work without a public webhook URL?
> *(Existing implementation — understand before interview.)*  
> *"The backend uses Telegram long-polling (`getUpdates`). It checks for button callbacks and commands (`/start`, `/status`), verifying the sender's Telegram chat ID against authorized IDs in environment variables."*

### Q16: How do you prevent timing attacks during device authentication?
> *(Existing implementation — understand before interview.)*  
> *"We use Node's `crypto.timingSafeEqual` to verify the `X-Device-Key` header, preventing attackers from deducing key characters based on string comparison execution times."*

### Q17: What is the purpose of the 24-hour clinical shift handover endpoint you implemented?
> *(Modified/implemented during this development.)*  
> *(Modified/implemented during this development.)*  
> *"`GET /api/patients/:id/summary` aggregates 24-hour vital ranges (min, max, average), peak risk scores, alert resolution metrics, and recent clinical notes, providing incoming shift nurses with an immediate situational summary."*

### Q18: What security risk was identified in the sensor simulator and how was it fixed?
> *(Modified/implemented during this development.)*  
> *"The simulator served `window.CONTROL_TOKEN` in plain text to any unauthenticated GET request on `/token.js`. We restricted the endpoint to loopback clients and added a secure session prompt fallback on the UI."*

### Q19: Why use BullMQ and Redis for risk evaluation?
> *(Existing implementation — understand before interview.)*  
> *"Under high device concurrency, running complex trend calculations synchronously inside the HTTP ingestion route causes request queueing. BullMQ offloads risk assessment to background worker threads with retry capabilities and rate limiting."*

### Q20: How are audit logs structured and why are they necessary?
> *(Existing implementation — understand before interview.)*  
> *"All logins, telemetry ingestions, alert status changes, and caregiver actions are written to an append-only `audit_logs` table recording timestamp, actor, action, entity, request ID, and metadata. In healthcare, full auditability is mandated by HIPAA and clinical governance."*
