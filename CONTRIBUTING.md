# Contributing to PulseSentry

Thank you for your interest in contributing to **PulseSentry**! We welcome improvements, bug fixes, and feature additions that uphold our standards for clinical software reliability.

---

## Code of Conduct & Principles
- **Patient Safety First:** Clinical calculation models, alert safety floors, and deterministic thresholds must never be weakened or silenced without explicit rationale and comprehensive test coverage.
- **Idempotency & Resilience:** Telemetry endpoints must strictly enforce sequence-number deduplication.
- **Lean Architecture:** Follow the "Lazy Senior Developer" principle: prioritize standard library solutions, reuse established repository helpers, and avoid unneeded dependencies.

---

## Development Setup

1. **Clone repository & install dependencies:**
   ```bash
   git clone https://github.com/vignesh28102006/pulse-sentry.git
   cd pulse-sentry
   npm install
   pip install -r apps/risk-engine/requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start local PostgreSQL cluster:**
   ```bash
   npm run db:start
   ```

4. **Apply database schema:**
   ```bash
   npm run db:migrate
   ```

5. **Start development services concurrently:**
   ```bash
   npm run dev
   ```

---

## Testing Guidelines

Before submitting a Pull Request, all automated test suites must pass:
```bash
# Run all automated tests
npm test

# Verify frontend production bundle
npm run build
```

---

## Commit Guidelines
We adhere to [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New clinical or platform capability
- `fix:` Bug fix in telemetry, alerting, or UI
- `perf:` Performance optimization (database queries, batching)
- `security:` Security hardening or credential protection
- `docs:` Documentation updates
- `test:` Unit or integration test additions
