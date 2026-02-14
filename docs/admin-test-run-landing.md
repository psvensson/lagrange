# Admin Test Run Landing

The node admin ingress (`:8081`) now serves a browser landing page for distributed test administration.

For local development where cluster nodes are short-lived, use the standalone userland server:

- `npm run start:test-dashboard`
- `node scripts/start-test-run-dashboard.js --port 8181 --host 127.0.0.1`

## Landing Page

- `http://<node-host>:8081/`
- `http://<node-host>:8081/ui/tests`

Standalone mode:

- `http://127.0.0.1:8181/`

The page provides:

- scenario + config selection
- run start/stop controls
- saved run list (with timestamp and git hash when available)
- live log streaming for active runs
- report and playback links

## HTTP API

- `GET /api/admin/tests`
  - lists available scenarios (`test/distributed/scenarios`) and configs (`test/distributed/config`)
- `GET /api/admin/test-runs`
  - lists active and saved runs
- `POST /api/admin/test-runs`
  - starts a run
  - request body: `{"scenario":"sustained-write-throughput","config":"local.json","verbose":true}`
- `GET /api/admin/test-runs/:runId`
  - returns details for one run
- `POST /api/admin/test-runs/:runId/stop`
  - requests stop on an active run
- `GET /api/admin/test-runs/:runId/stream`
  - SSE stream for live logs and status events
  - for completed runs, emits archived timeline backlog from local disk and closes

The same API surface is available in both node-admin and standalone modes.

## Artifact Routes

- `GET /ui/playback-viewer`
  - shared playback viewer HTML
- `GET /ui/test-output/*`
  - serves report and playback files from `test-output/`

Example:

- `/ui/test-output/sustained-write-throughput.live-stream.report.json`
- `/ui/test-output/sustained-write-throughput/playback-manifest.json`
