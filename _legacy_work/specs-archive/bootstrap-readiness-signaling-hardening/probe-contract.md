# Probe Contract and Deployment Profile

## Purpose

This document provides implementation-grade details for runtime probe behavior
and deployment integration.

## Endpoint Definitions

## `GET /livez`

Meaning:

1. process is alive and event loop is responsive.

Rules:

1. returns `200` unless process is in unrecoverable fatal state.
2. does not evaluate bootstrap or routing dependencies.

Example response:

```json
{
  "alive": true,
  "state": "running",
  "timestamp": 1771708629000
}
```

## `GET /startupz`

Meaning:

1. one-time bootstrap initialization has completed successfully.

Rules:

1. returns `503` before bootstrap complete.
2. returns `200` after bootstrap complete.
3. intended to be monotonic per process lifetime.

Example response:

```json
{
  "started": false,
  "state": "bootstrapping",
  "reasons": ["bootstrap_phase_incomplete"],
  "timestamp": 1771708629000
}
```

## `GET /readyz`

Meaning:

1. node is ready to serve join/admin traffic safely.

Rules:

1. returns `200` only when join-critical dependencies are healthy and stable.
2. returns `503` with explicit blockers otherwise.
3. includes `retryAfterMs` when fast retry is discouraged.

Example response:

```json
{
  "ready": false,
  "state": "warming",
  "reasons": ["sql_engine_missing", "leader_metadata_incomplete"],
  "retryAfterMs": 500,
  "timestamp": 1771708629000
}
```

## `GET /bootstrap/ready`

Meaning:

1. seed is ready to accept `POST /bootstrap` operations.

Rules:

1. must be lightweight and side-effect free.
2. must use same readiness owner as `/readyz`.
3. may be same implementation as `/readyz` with narrowed meaning field.

Example response:

```json
{
  "ready": true,
  "scope": "bootstrap_join",
  "state": "join_ready",
  "timestamp": 1771708629000
}
```

## `POST /bootstrap`

Meaning:

1. operational request to bootstrap a joining node.

Not-ready response:

1. status `503`.
2. includes `code`, `phase`/`reasons`, and retry hint.

Example:

```json
{
  "success": false,
  "code": "BOOTSTRAP_NOT_READY",
  "phase": "cache_hydration",
  "retryAfterMs": 500
}
```

## Kubernetes Profile

Recommended baseline:

```yaml
startupProbe:
  httpGet:
    path: /startupz
    port: 8080
  periodSeconds: 2
  timeoutSeconds: 1
  failureThreshold: 60
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  periodSeconds: 2
  timeoutSeconds: 1
  failureThreshold: 3
livenessProbe:
  httpGet:
    path: /livez
    port: 8080
  periodSeconds: 5
  timeoutSeconds: 1
  failureThreshold: 5
```

Notes:

1. tune thresholds with real startup data per environment.
2. keep readiness stricter than liveness to avoid restart loops.

## NGINX/Ingress Profile

Guidance:

1. use active upstream health checks against `/readyz`.
2. avoid automatic replay of `POST /bootstrap` unless idempotency by `nodeId`
   is guaranteed end-to-end.
3. prefer retrying readiness probes, not operational bootstrap requests.
4. surface upstream 503s directly for observability instead of masking.

## Error Code Registry (Initial)

1. `BOOTSTRAP_NOT_READY`
2. `LEADER_METADATA_INCOMPLETE`
3. `SQL_ENGINE_UNAVAILABLE`
4. `BOOTSTRAP_PHASE_INCOMPLETE`
5. `READINESS_STABLE_WINDOW_PENDING`

## Rollout Checklist

1. Deploy additive probe endpoints (`/livez`, `/startupz`, `/readyz`,
   `/bootstrap/ready`) while keeping `/health` available.
2. Update harness/startup gates to probe `/bootstrap/ready` instead of
   `POST /bootstrap`.
3. Verify readiness diagnostics include status histograms and reason codes in
   timeout errors.
4. Run targeted test suites:
   - `test/bootstrap/bootstrap-api.test.js`
   - `test/bootstrap/node-joining-service.test.js`
   - `test/distributed/harness/__tests__/cluster.test.js`
   - `test/integration/node-join-convergence-slo.integration.test.js`
5. Run distributed baseline scenario with playback capture enabled.
6. Promote rollout only if startup gate failures are diagnosable and join paths
   converge under baseline load.

## Rollback Triggers

1. Repeated startup-gate failures where seed never reaches `/bootstrap/ready`
   within configured timeout budgets.
2. Readiness reason telemetry missing or inconsistent with observed runtime
   behavior.
3. Join success regressions for existing clients that previously succeeded
   against `POST /bootstrap`.
4. Orchestrator instability caused by probe flapping (rapid 200/503 oscillation
   without sustained readiness).

## Readiness SLO Baseline (Rollout Candidate)

### Run Metadata

- Date: February 22, 2026
- Command:
  `node test/distributed/run.js --config test/distributed/config/local-benchmark-3node.json --scenario postgres-baseline-comparison --no-fast-local --output test-output/postgres-baseline-size3-readiness-contract.report.json --verbose`
- Report:
  `test-output/postgres-baseline-size3-readiness-contract.report.json`

### Result

- Status: failed
- Failure mode:
  `Seed node bootstrap API did not become join-ready within 60000ms`
- Key diagnostics:
  - `attempts=18`
  - `statusCounts=-1:7, 503:11`
  - `reasonCounts=BOOTSTRAP_PHASE_INCOMPLETE:10, SQL_ENGINE_UNAVAILABLE:10, LEADER_METADATA_INCOMPLETE:10, READINESS_STABLE_WINDOW_PENDING:1`
  - `lastState=unknown`
  - `elapsedMs=63120`

### Comparison With Prior Baseline

- Prior (February 21, 2026, `postgres-baseline-size3-unify-stage-20260221T222200Z.report.json`):
  startup-gate timeout diagnostics primarily exposed attempt/status counts.
- Current (February 22, 2026):
  timeout diagnostics additionally include blocker reason histograms and
  readiness state context, improving triage quality even though startup
  stabilization is still failing under this baseline run.
