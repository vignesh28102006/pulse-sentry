# Changelog

All notable changes to the **PulseSentry** platform are documented in this file.

---

## [1.0.0] - 2026-10-06

### Initial PulseSentry Release
- **Platform Identity & Structure:**
  - Rebranded project as **PulseSentry** with distinctive clinical aesthetic and standardized naming.
  - Flattened nested archive folder structure into canonical root monorepo.
  - Established initial Git version control and clean commit history.
- **Architectural & Security Documentation:**
  - Created comprehensive `PROJECT_AUDIT.md` covering all 4 tiers, data flow, failure modes, and interview preparation.
  - Authored `docs/ARCHITECTURE.md` detailing end-to-end data pipelines, NEWS2 hybrid risk scoring, and state machine transitions.
  - Authored `docs/DEVELOPMENT_NOTES.md` providing a thorough engineering study guide.
  - Authored `docs/BASELINE.md` recording 47 baseline test executions and production builds.
- **Security Hardening:**
  - Restricted simulator `/token.js` endpoint to local loopback interfaces with fallback session token authentication.
  - Hardened `.gitignore` against accidental credential leaks, environment secrets, and IDE caches.
  - Updated `.env.example` with documented variables and secure placeholder defaults.
- **Performance Optimizations:**
  - Refactored `vitalService.js` and `equipmentService.js` to execute telemetry ingestion in single atomic database transactions, cutting batch round-trips from $O(N)$ sequential operations to $O(1)$.
  - Accelerated backend integration test suite execution from 47.8s to 23.4s.
- **Frontend Reliability:**
  - Implemented React 19 `ErrorBoundary` component to safeguard clinical telemetry dashboards against component unmounts during unexpected rendering exceptions.
- **Clinical Feature Enhancements:**
  - Added `GET /api/patients/:id/summary` endpoint providing 24-hour aggregated vital statistics, risk peaks, active alert metrics, and recent caregiver clinical notes for nurse shift handovers.
  - Added automated integration tests for the handover summary endpoint.
