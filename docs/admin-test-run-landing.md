---
audience: development
---

# Admin Test Run Landing

A browser dashboard for starting, watching, and browsing distributed test
runs: scenario selection, run start/stop controls, live log streaming, and
links to reports and playback artifacts. Every cluster node serves it from the
admin ingress (`:8081`); the artifacts it exposes are the same `test-output/`
files described in
[distributed-playback-viewer.md](distributed-playback-viewer.md).

For local development where cluster nodes are short-lived, use the standalone userland server instead:

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
- examples summary and artifact links when scenario output includes
  `exampleResults`

## Example Results Visibility

When a scenario returns examples payload details (for example,
`examples-catalog`), the dashboard surfaces:

1. Summary counters (`total`, `passed`, `failed`, `requiredFailed`)
2. Artifact JSON link for the detailed per-example report
3. A per-run `Examples` button in the runs table when artifact URL is available

The run API payload now carries:

- `examplesSummary`
- `examplesArtifactPath`
- `examplesArtifactUrl`

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
  - includes example summary/artifact fields when present
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
- `/ui/test-output/examples/examples-catalog-<timestamp>.json`
