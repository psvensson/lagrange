# Bootstrap Readiness Probes

This document defines the runtime probe contract for seed nodes and deployment
guidance for Kubernetes and NGINX.

## Endpoint Contract

### `GET /livez`

- Meaning: process liveness only.
- Success: `200`.
- Failure: unrecoverable process failure.
- Notes: does not evaluate bootstrap or join dependencies.

### `GET /startupz`

- Meaning: one-time bootstrap completion.
- Success: `200` when bootstrap phase is complete.
- Failure: `503` before bootstrap completes.
- Notes: should be monotonic within one process lifetime.

### `GET /readyz`

- Meaning: node is safe to serve join/admin traffic.
- Success: `200` when join dependencies are healthy and stable.
- Failure: `503` with `reasons` and optional `retryAfterMs`.

### `GET /bootstrap/ready`

- Meaning: seed is ready to accept `POST /bootstrap`.
- Success: `200`.
- Failure: `503` with readiness reason codes and retry guidance.
- Notes: lightweight and side-effect free.

### `GET /health` (compatibility endpoint)

- Meaning: legacy compatibility endpoint.
- Behavior: remains available during migration window.
- Notes: non-authoritative for join readiness; use `/readyz` for readiness.

## Kubernetes Baseline Profile

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

Tune these values with observed startup latency in each environment.

## NGINX and Ingress Guidance

- Configure active upstream health checks against `GET /readyz`.
- Do not automatically replay `POST /bootstrap` unless idempotency by `nodeId`
  is guaranteed end-to-end.
- Prefer retries against readiness probes instead of bootstrap operations.
- Preserve upstream `503` responses for visibility instead of masking failures.

## `/health` Migration Guidance

1. Keep `/health` during rollout for existing tooling that only checks process
   liveness.
2. Move readiness gating to `/readyz` for orchestrators and load balancers.
3. Use `/startupz` for startup probes to avoid readiness flapping on boot.
4. Update dashboards and alerts to track `/readyz` status and reason codes.
5. Remove `/health` readiness assumptions from clients before deprecation.
