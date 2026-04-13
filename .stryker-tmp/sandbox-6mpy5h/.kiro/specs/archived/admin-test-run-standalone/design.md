# Design Document: Standalone Test Dashboard Server

## Overview

This design introduces a standalone launcher that reuses the existing test-run management backend and HTTP routes, but runs independently of node lifecycle startup and disables the admin compatibility WebSocket stream.

## Components

### StandaloneTestRunServer (`src/admin/standalone-test-run-server.js`)

- Wraps `AdminWebSocketAPI`
- Injects `AdminTestRunService`
- Forces `enableAdminStream: false`
- Provides `start()`, `stop()`, and route-access for testing

### Launcher Script (`scripts/start-test-run-dashboard.js`)

- Parses `--host`, `--port`, `--workspace`
- Starts `StandaloneTestRunServer`
- Prints URLs
- Handles `SIGINT`/`SIGTERM` for graceful stop

## Route Surface

Standalone mode uses the same HTTP routes as admin ingress:

- `/`, `/ui/tests`
- `/api/admin/tests`
- `/api/admin/test-runs*`
- `/ui/playback-viewer`
- `/ui/test-output/*`
- `/api/admin/test-runs/:runId/stream`

`/api/admin/stream` is intentionally disabled.

## Testing

- Unit tests for standalone server helper and route availability
- Assertion that `/api/admin/stream` returns `404` in standalone mode
