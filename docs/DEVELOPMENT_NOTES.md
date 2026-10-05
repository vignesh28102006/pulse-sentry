# PulseSentry Developer Study Notes

> **Interview Study & Concept Guide for PulseSentry**  
> *Use this guide to master the concepts, architecture, and code details before technical interviews.*

---

## 1. The Core Problem Statement

### What problem are we solving?
In traditional acute home care or "hospital-at-home" programs:
- Patients are discharged early to recover at home with family or visiting nurses.
- Vital monitoring is intermittent: a nurse visits once or twice a day with a pulse oximeter and cuff.
- Deterioration in chronic conditions (COPD, Congestive Heart Failure, Sepsis, Pneumonia) happens gradually over 12–24 hours before a sudden emergency room collapse.
- Conventional medical alarms use static thresholds (e.g., alarm only when $\text{SpO}_2 < 90\%$). By the time an absolute threshold is breached, the patient is already in acute respiratory failure.

### How PulseSentry solves it:
1. **Continuous Telemetry:** Streams vitals every 2 seconds from simulated wearables and medical oxygen equipment.
2. **Early-Warning Deterioration (NEWS2):** Evaluates multi-parameter velocity (rate of change) across a sliding window, detecting deterioration at **~23%** along the deterioration curve rather than at **~90%**.
3. **Zero False Alarms on Stable Patients:** Uses median filtering across 3 consecutive readings to eliminate transient motion artifacts and sensor noise.
4. **Resilient Edge Hub:** If the home loses internet or power, the edge hub buffers data locally, sounds an audible buzzer for dangerous vitals, and automatically synchronizes without duplicates upon reconnection.
5. **Caregiver Escalation:** Real-time push notifications (WebSocket + Telegram interactive buttons). If an assigned caregiver is checked out or fails to acknowledge a HIGH alert in 60s, the system automatically escalates.

---

## 2. Codebase Mental Model: Walking Through the Code

When an interviewer asks: *"Walk me through the lifecycle of a vital sign reading in your codebase"*:

```
[IoT Wearable]
      │ (1) Generates HR, SpO2, Temp, RR, BP + equipment data
      ▼
[apps/sensor-simulator/src/uplink.js]
      │ (2) Assigns sequence_number, writes to local FileStore buffer
      │ (3) Attempts HTTP POST to /api/vitals with X-Device-Key
      ▼
[apps/backend/src/services/vitalService.js]
      │ (4) Validates Zod schema: vitalReadingSchema
      │ (5) Inserts into PostgreSQL with ON CONFLICT (device_id, sequence_number) DO NOTHING
      │ (6) Updates sensor_devices.last_seen_at and status = 'ONLINE'
      │ (7) Emits 'vital:new' via Socket.IO to connected React dashboards
      │ (8) Enqueues 'risk:assess' job (BullMQ or inline fallback)
      ▼
[apps/backend/src/workers/jobs.js & riskService.js]
      │ (9) Gathers last 30 readings + conditions + active note signals
      │ (10) Makes internal HTTP POST to Risk Engine at http://localhost:8000/v1/assess
      ▼
[apps/risk-engine/app/engine/model.py]
      │ (11) Computes current vital score (median of last 3)
      │ (12) Computes trend velocity (first 3 vs last 3 of window)
      │ (13) Incorporates clinical conditions + caregiver note signals
      │ (14) Applies deterministic safety floors (e.g. SpO2 <= 88 -> Floor 70)
      │ (15) Returns { riskLevel, riskScore, explanation, reasons, factors, prediction }
      ▼
[apps/backend/src/services/alertService.js]
      │ (16) Checks if alert already active (Postgres partial unique index)
      │ (17) Upgrades existing alert if severity increased; suppresses if in cooldown
      │ (18) Checks caregiver check-in status: if absent, escalates immediately
      │ (19) Emits 'risk:update' and 'alert:new' via Socket.IO
      │ (20) If Telegram bot configured, sends phone alert with interactive buttons
      ▼
[apps/frontend/src/pages/PatientPage.jsx]
      │ (21) React UI receives WebSocket event, updates live charts and risk badge
```

---

## 3. Key Clinical & Mathematical Concepts

### A. The National Early Warning Score (NEWS2) Principle
In real hospitals (NHS UK and global ICUs), nurses use the NEWS2 protocol. Each abnormal vital sign receives 1, 2, or 3 points depending on how far it deviates from physiological normalcy:
- Example: Respiration rate 12–20 breaths/min is normal (0 pts). 21–24 is elevated (2 pts). $\ge 25$ is severe distress (3 pts).
- PulseSentry adapts this logic by calculating points per vital, scaling by $5$, and evaluating compounding risks.

### B. Why Physiological Velocity (Trends) Beats Static Thresholds
- A patient whose $\text{SpO}_2$ drops from $98\% \to 92\%$ over 40 seconds with a respiration rate rising from $16 \to 28$ is in acute distress even though $92\%$ is technically above the traditional $90\%$ emergency threshold.
- PulseSentry computes the velocity $\frac{\Delta V}{\Delta t}$. A rapid jump in risk velocity triggers an early warning alert long before the patient becomes cyanotic.

### C. Negation-Aware Clinical Note NLP
- Caregivers frequently write notes such as: *"Patient reports no chest pain, no shortness of breath, but appears dizzy."*
- A naive keyword matcher triggers on "chest pain" and "shortness of breath".
- PulseSentry's `apps/risk-engine/app/engine/notes.py` detects negation prefixes (`no`, `denies`, `negative for`, `without`) within a 3-word window and suppresses negated signals, only extracting true clinical symptoms.

---

## 4. Key Architectural Decisions & Why We Made Them

### Q: Why a hybrid polyglot stack (Node.js backend + Python risk service)?
- **Node.js (Express & Socket.IO):** Superior for asynchronous I/O, handling thousands of concurrent WebSocket connections, device streaming, and low-latency API routing.
- **Python (FastAPI & Pydantic):** The industry standard for scientific computing, statistical modeling, and ML inference. Isolating risk assessment in an independent service enables pluggable machine learning models (`RiskModel` interface) without destabilizing core web server transactions.

### Q: How is database idempotency guaranteed?
- Edge devices assign a persistent, monotonically increasing `sequence_number` to every reading.
- PostgreSQL enforces:
  ```sql
  CONSTRAINT uq_reading_device_sequence UNIQUE (device_id, sequence_number)
  ```
- If network instability causes an uplink retry, the server executes `ON CONFLICT DO NOTHING`. Duplicates are counted in the HTTP response and discarded without generating duplicate rows or repeated alert evaluations.

### Q: How is alert fatigue prevented?
- **Alert Fatigue** is the #1 killer in clinical monitoring (nurses turn alarms off because of too many false alarms).
- PulseSentry prevents this via:
  1. **Partial Unique Index:** `WHERE status <> 'RESOLVED'` guarantees at most one active clinical alert per patient.
  2. **Upgrades Instead of Duplicates:** When risk increases (MEDIUM $\to$ HIGH), the existing alert is updated and appended to the audit log rather than creating a second alert.
  3. **Cooldown Period:** `ALERT_COOLDOWN_SECONDS` (60s) suppresses re-triggering for resolved issues of the same severity.
  4. **Noise Filtering:** Median of last 3 samples filters single bad sensor readings.

---

## 5. Failure Modes & Self-Healing (How the System Handles Disaster)

| Disaster Scenario | System Response & Mitigation |
|---|---|
| **Internet dies at patient's home** | Edge hub writes to local disk buffer (`FileStore`), displays "OFFLINE BUFFERING". Local audio buzzer checks critical vitals locally. When internet returns, uploads in order; backend marks device ONLINE and auto-resolves connectivity alerts. |
| **Python Risk Engine crashes** | The backend health checker catches the outage. Ingestion continues uninterrupted, and `fallbackRisk.js` runs in-memory deterministic safety rules so patients are never left unmonitored. |
| **Redis crashes / unavailable** | BullMQ task queue automatically switches to an in-memory event emitter queue (`lib/queue.js`). Zero downtime. |
| **Home power outage** | Oxygen concentrator automatically switches to internal battery (`power_source: BATTERY`). The system logs an informational event but does NOT fire a false clinical hypoxia alarm unless flow rate drops below 50% of prescription. |
| **Caregiver doesn't answer HIGH alert** | After 60 seconds without acknowledgment, the watchdog elevates `escalation_level` to 1, re-alerts the primary caregiver, and dispatches to the secondary on-call clinical nurse / family escalation Telegram channel. |

---

## 6. Top 5 Questions Interviewers Will Ask & Winning Answers

### 1. "How do you handle race conditions when two caregivers acknowledge the same alert simultaneously?"
> *"We use row-level locking via PostgreSQL `SELECT ... FOR UPDATE` inside an ACID transaction (`alertRepository.findByIdForUpdate`). The first caregiver acquires the lock, changes status from `OPEN` to `ACKNOWLEDGED`, and appends an audit action. When the second transaction acquires the row, the status check fails with a 409 Conflict error, preventing duplicate states."*

### 2. "Why use PostgreSQL partial unique indexes instead of just checking in application code?"
> *"Application-level checks suffer from time-of-check to time-of-use (TOCTOU) race conditions. If two readings arrive concurrently on two server processes, both could see zero active alerts and insert two conflicting alerts. A PostgreSQL partial unique index (`WHERE status <> 'RESOLVED'`) enforces this invariant at the database engine level, making duplicate active alerts physically impossible."*

### 3. "How did you design for intermittent IoT network connectivity?"
> *"We built an edge store-and-forward architecture. The edge hub maintains a local disk-backed FIFO queue with atomic file writes. When an HTTP uplink fails, it buffers readings and enters an exponential backoff loop with randomized jitter ($1\text{s} \to 30\text{s}$) to prevent network saturation. Because every reading has a persistent sequence number, reconnection syncing is completely idempotent."*

### 4. "How do you explain the AI risk score to a non-technical doctor or nurse?"
> *"Black-box AI is dangerous in healthcare. Our risk engine returns not just a number, but a structured breakdown: the primary natural language explanation, a list of contributing factors categorized by physiological source (VITAL_VALUE, TREND, NOTE, COMBINED, or SAFETY_FLOOR), the mathematical points contributed by each factor, and a 24–48 hour trajectory projection. Clinicians can verify exactly why the score was given."*

### 5. "What was a major performance bottleneck you identified and how did you resolve it?"
> *"During edge reconnection, a hub could flush up to 500 buffered readings at once. The initial code executed 500 individual sequential database transactions in a loop, causing 500 network round trips and threatening connection pool starvation. We refactored telemetry ingestion to execute single-transaction bulk multi-row operations, drastically cutting latency and freeing database resources."*
