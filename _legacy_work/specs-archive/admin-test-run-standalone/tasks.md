# Implementation Plan: Standalone Test Dashboard Server

## Tasks

- [x] 1. Add standalone server wrapper
  - [x] 1.1 Create `src/admin/standalone-test-run-server.js`
  - [x] 1.2 Add host/port parsing helpers and server info API
  - [x] 1.3 Configure wrapper to disable legacy admin WebSocket stream

- [x] 2. Add standalone launcher command
  - [x] 2.1 Create `scripts/start-test-run-dashboard.js`
  - [x] 2.2 Add `npm run start:test-dashboard` command
  - [x] 2.3 Add signal-driven graceful shutdown

- [x] 3. Verify behavior
  - [x] 3.1 Add `test/admin/standalone-test-run-server.test.js`
  - [x] 3.2 Confirm HTTP dashboard routes are available
  - [x] 3.3 Confirm `/api/admin/stream` is disabled in standalone mode

- [x] 4. Update documentation
  - [x] 4.1 Update `docs/admin-test-run-landing.md` with standalone usage
  - [x] 4.2 Update architecture notes for standalone launcher
