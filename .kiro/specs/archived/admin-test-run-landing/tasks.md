# Implementation Plan: Admin Test Run Landing

## Tasks

- [x] 1. Add admin test-run ownership service
  - [x] 1.1 Create `src/admin/admin-test-run-service.js`
  - [x] 1.2 Implement scenario/config discovery
  - [x] 1.3 Implement run start/stop and live log subscription
  - [x] 1.4 Implement saved-run synthesis and metadata persistence

- [x] 2. Extend admin ingress HTTP routes
  - [x] 2.1 Add landing page and catalog routes in `AdminWebSocketAPI`
  - [x] 2.2 Add run control routes (list/start/get/stop)
  - [x] 2.3 Add SSE stream route for live run logs
  - [x] 2.4 Add playback and test-output file serving routes

- [x] 3. Add landing UI
  - [x] 3.1 Create `src/admin/static/test-run-dashboard.html`
  - [x] 3.2 Wire UI actions to API and SSE endpoints
  - [x] 3.3 Include report/playback links from run metadata

- [x] 4. Add targeted tests
  - [x] 4.1 Add `test/admin/admin-test-run-service.test.js`
  - [x] 4.2 Extend `test/admin/admin-websocket-api.test.js` for new routes
  - [x] 4.3 Run targeted test suite for new functionality

- [x] 5. Update docs
  - [x] 5.1 Update architecture notes for admin ingress capabilities
  - [x] 5.2 Add operator doc for new landing page and API usage
