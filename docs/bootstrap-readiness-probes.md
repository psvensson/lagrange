# Bootstrap Readiness Probes

This document defines the runtime probe contract for seed nodes and deployment
guidance for Kubernetes and NGINX. The bootstrap phases these probes report on
are described in [../architecture/bootstrap.md](../architecture/bootstrap.md).

## Endpoint Contract

### `GET /livez`

- Meaning: process liveness only.
- Success: `200`.
- Failure: unrecoverable process failure.
- Notes: does not evaluate bootstrap or join dependencies.

### `GET /startupz`

- Meaning: one-time startup handoff completion.
- Success: `200` when seed or join startup has completed cache hydration,
  established required subscriptions, and handed steady-state ownership to the
  canonical lifecycle/reconciliation paths.
- Failure: `503` before startup handoff completes.
- Notes: should be monotonic within one process lifetime.

### `GET /readyz`

- Meaning: node is safe to serve join/admin traffic.
- Success: `200` when the node's readiness dimensions are healthy enough to
  serve traffic. Operationally this means the control plane is
  `repairEligible`, self/ingress serving requirements are satisfied, and no
  blocking readiness reason remains active.
- Failure: `503` with `reasons` and optional `retryAfterMs`.

Readiness is a projection over canonical owner rows, cache state, and bounded
health evidence. It is not an alternate ownership path.

### `GET /bootstrap/ready`

- Meaning: seed is ready to accept `POST /bootstrap`.
- Success: `200` when the seed can safely process join/bootstrap traffic using
  the current canonical readiness state.
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

## Operator Interpretation Rules

1. Treat `/startupz` as a monotonic startup-complete signal, not as proof that
  every steady-state dependency is still healthy.
2. Treat `/readyz` as the authoritative probe for ongoing admission and load
  balancing decisions.
3. Treat `/bootstrap/ready` as a seed-specific readiness view for join intake,
  not as a substitute for general readiness.
4. When `/readyz` disagrees with cached topology expectations, prefer the
  readiness reason codes and diagnostics endpoints over ad-hoc cache
  interpretation.
