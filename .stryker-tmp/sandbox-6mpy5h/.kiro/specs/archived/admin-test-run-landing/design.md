# Design Document: Admin Test Run Landing

## Overview

The implementation adds HTTP test-administration capabilities to the existing `AdminWebSocketAPI` service on port `8081`, without introducing a second ingress service.

Core additions:

1. `AdminTestRunService` owns test discovery, run lifecycle control, metadata persistence, and live log fanout.
2. `AdminWebSocketAPI` registers HTTP routes for landing page, test APIs, SSE stream, and artifact serving.
3. A static dashboard page (`src/admin/static/test-run-dashboard.html`) uses these APIs for operator workflows.

## Architecture

```mermaid
graph TD
    Browser --> AdminIngress[AdminWebSocketAPI :8081]
    AdminIngress --> TestService[AdminTestRunService]
    TestService --> Runner[node test/distributed/run.js]
    TestService --> Artifacts[test-output/*]
    AdminIngress --> Viewer[/ui/playback-viewer]
    AdminIngress --> OutputFiles[/ui/test-output/*]
```

## Components

### AdminWebSocketAPI

- Existing owner of admin ingress
- Extended with HTTP routes:
  - `GET /` and `GET /ui/tests`
  - `GET /api/admin/tests`
  - `GET /api/admin/test-runs`
  - `POST /api/admin/test-runs`
  - `GET /api/admin/test-runs/:runId`
  - `POST /api/admin/test-runs/:runId/stop`
  - `GET /api/admin/test-runs/:runId/stream`
  - `GET /ui/playback-viewer`
  - `GET /ui/test-output/*`
- Keeps existing WebSocket admin stream unchanged at `/api/admin/stream`

### AdminTestRunService

Single owner for test-run management concerns:

- Scenario discovery from `test/distributed/scenarios`
- Config discovery from `test/distributed/config`
- Run process execution (`node test/distributed/run.js ...`)
- Live stdout/stderr line buffering and subscriber fanout
- Metadata persistence in `test-output/.run-metadata/`
- Saved run synthesis by merging metadata and report JSON files
- Output path safety checks for served files

### Dashboard UI

- Served as static HTML from `src/admin/static/test-run-dashboard.html`
- Uses fetch + EventSource only (no external frontend runtime)
- Features:
  - scenario/config selection and run start
  - run list with status/timestamp/git hash
  - stop action for active runs
  - live log panel
  - report and playback deep links

## Data Model

### Run Metadata

Persisted per run in `test-output/.run-metadata/run-{runId}.json`:

```json
{
  "schemaVersion": 1,
  "runId": "scenario-20260214T123456000Z-deadbeef",
  "scenario": "sustained-write-throughput",
  "config": "local.json",
  "gitHash": "deadbeef",
  "startedAt": "2026-02-14T12:34:56.000Z",
  "endedAt": "2026-02-14T12:36:15.000Z",
  "status": "passed",
  "outputReportPath": "test-output/<runId>.report.json",
  "exitCode": 0,
  "signal": null
}
```

### SSE Event Envelope

```json
{
  "type": "log",
  "data": {
    "timestamp": "2026-02-14T12:35:02.100Z",
    "stream": "stderr",
    "line": "Scenario failed: ..."
  }
}
```

Status events use `type: "status"` with serialized run state in `data`.

## Error Handling

- `404` for missing runs and invalid output paths
- `400` for invalid run control operations (for example, stop on inactive run)
- `500` for unexpected backend failures
- SSE connections clean up subscriptions on socket close

## Testing Strategy

- Unit tests for `AdminTestRunService`:
  - discovery and saved-run synthesis
  - start/log streaming/final status transitions
  - stop behavior and signal propagation
- Route tests in `admin-websocket-api.test.js`:
  - landing page and catalog endpoints
  - start/stop control endpoints
  - artifact serving endpoint
  - stream error path for unknown runs
