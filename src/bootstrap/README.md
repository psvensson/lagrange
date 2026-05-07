# Bootstrap Owner Card

## Role

`src/bootstrap/` owns seed startup, node join, startup authority establishment,
system-table creation, bootstrap readiness, rejoin hints, and startup-to-runtime
handoff.

## Primary Owners

- `BootstrapService` owns seed startup composition.
- `BootstrapAPI` owns seed-side bootstrap and join API behavior.
- `NodeJoiningService` owns joining-node startup and seed contact flow.
- `JoinCoordinator` and join readiness owners coordinate join progression.
- `ControlPlaneWriteHealth` owns startup control-plane write-health
  classification.
- `StartupRecoveryCoordinator` owns startup recovery sequencing.

## First Files

- `bootstrap-service.js` for seed startup.
- `bootstrap-api.js` for seed API behavior.
- `node-joining-service.js` for joiner behavior.
- `join-readiness-evaluator.js` for join readiness decisions.
- `control-plane-write-health-owner.js` for write-health classification.
- `system-table-schemas-constants.js` before changing system-table shape.

## Do Not

- Do not let bootstrap-only exceptions leak into steady-state paths.
- Do not leave phase-owned subscribers, bridges, queues, or hydration paths as
  the only live runtime owner after phase completion.
- Do not add ad-hoc startup fallbacks around control-plane readiness; express
  blocked, deferred, retryable, or failed state through the owner contract.
- Do not change system-table schema literals outside their schema owner.

## Proof Surface

- Focused tests under `test/bootstrap/`.
- Startup, join, and control-plane readiness integration tests when handoff
  behavior changes.
- Runtime grammar, literal, and decision-boundary guardrails for startup state
  and readiness changes.
