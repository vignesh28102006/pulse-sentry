# PulseSentry Baseline Verification Report

**Verification Date:** October 6, 2026  
**Operating System:** Windows (PowerShell)  
**Node.js Version:** v20+  
**Python Version:** 3.12.6  
**PostgreSQL:** Embedded PostgreSQL 14+ (Port 5433)  

---

## 1. Summary of Baseline Results

| Test Suite / Step | Target | Status | Passing / Total | Duration |
|---|---|---|---|---|
| **Python Risk Engine** | `apps/risk-engine` | **PASS** | 13 / 13 | 0.71s |
| **Edge Sensor Simulator** | `apps/sensor-simulator` | **PASS** | 12 / 12 | 150ms |
| **Backend Integration Suite** | `apps/backend` | **PASS** | 22 / 22 | 47.8s |
| **Frontend Production Build** | `apps/frontend` | **PASS** | Vite 6.4.3 build | 16.29s |
| **Database Migrations** | `database/migrations` | **PASS** | 2 migrations + 2 seeds | ~150ms |

**Total Automated Baseline Tests:** 47 passed, 0 failed, 0 skipped.

---

## 2. Test Execution Details

### A. Risk Engine (`apps/risk-engine`)
Command: `cd apps/risk-engine && python -m pytest -q`
```
.............                                                            [100%]
13 passed in 0.71s
```
- Validated baseline tests:
  - `test_stable_patient_is_low_with_explanation`
  - `test_gradual_deterioration_reaches_high_and_explains_trends`
  - `test_risk_transitions_low_medium_high`
  - `test_critical_value_safety_floor`
  - `test_notes_raise_contextual_risk_but_only_structured_signals`
  - `test_red_flag_note_requires_attention`
  - `test_recovery_reduces_risk`
  - `test_context_increases_risk_for_respiratory_patient`
  - `test_prediction_velocity_and_projection`
  - Plus edge tests for equipment failure and confidence degradation.

### B. Sensor Simulator & Edge Hub (`apps/sensor-simulator`)
Command: `npm test -w apps/sensor-simulator`
```
TAP version 13
ok 1 - readings are delivered immediately when online
ok 2 - offline mode buffers locally and syncs everything after reconnection
ok 3 - backend failure triggers exponential backoff, then recovery
ok 4 - retransmitting the same readings does not create duplicates
ok 5 - large buffers upload in batches
ok 6 - gradual deterioration follows the expected direction
ok 7 - sensor failure stops readings; network failure keeps measuring
ok 8 - sequence numbers continue after a restart
ok 9 - oxygen concentrator failure: 0 L/min, SpO2 falls, local alarm sounds even with the cloud offline
ok 10 - hub alarm clears only after several normal readings
ok 11 - http sender routes each kind to its endpoint and strips internal fields
ok 12 - calm demo start: everyone NORMAL with healthy vitals
1..12
# pass 12
# fail 0
```

### C. Backend API & Ingestion Engine (`apps/backend`)
Command: `npm test -w apps/backend`
- Executed against local embedded PostgreSQL (`homecare_test` / `pulsesentry_test`) and an active spawned instance of the Python FastAPI risk engine on port 8711.
```
1..11
# tests 22
# suites 11
# pass 22
# fail 0
```
- Test Suites Covered:
  1. `authentication & authorisation`: Password checking, unauthorized rejections, role boundaries.
  2. `vital validation`: Implausible vital rejection, batch isolation (bad reading does not block good ones).
  3. `idempotent ingestion`: Duplicate sequence number suppression.
  4. `risk calculation and transitions`: End-to-end integration with real FastAPI service.
  5. `alerts`: Full lifecycle (Open $\to$ Acknowledge $\to$ Respond $\to$ Resolve), deduplication, cooldown suppression, escalation timeouts, and immediate escalation for absent caregivers.
  6. `sensor failure and offline recovery`: Silent watchdog connectivity alerts vs. physiological deterioration.
  7. `caregiver notes and attendance`: Structured signal extraction and check-in status transitions.
  8. `graceful degradation`: In-memory safety threshold fallback when risk engine is terminated.
  9. `medical equipment monitoring`: Oxygen concentrator flow failures, battery transitions, replay idempotency.
  10. `home hub local alarms`: Offline buzzer events synced to database audit trail.
  11. `Telegram phone alerts`: Outbound mock webhook dispatch and callback query authorization.

### D. Frontend Build (`apps/frontend`)
Command: `npm run build -w apps/frontend`
```
vite v6.4.3 building for production...
✓ 705 modules transformed.
dist/index.html                   0.45 kB │ gzip:   0.31 kB
dist/assets/index-BpQX-E3g.css   24.23 kB │ gzip:   5.33 kB
dist/assets/index-CREZ6XtK.js   742.24 kB │ gzip: 218.52 kB
✓ built in 16.29s
```

---

## 3. Baseline Verification Assessment

The system is fully functional across all four tiers:
- The edge simulator successfully buffers and transmits readings with sequence numbers.
- The backend validates, writes idempotently to PostgreSQL, and drives Socket.IO and BullMQ.
- The Python risk engine accurately computes early-warning scores and trends.
- The frontend builds without compilation or bundling errors.

The verified baseline is stable and ready for genuine engineering enhancements in Phase 6.
