# Bootstrap Owner Card

## Role

`src/bootstrap/` owns durable node identity and monotonic `bootIncarnation`
reservation (`src/bootstrap/boot-incarnation-owner.js`), seed startup and cold
retained-seed continuation, node join, startup authority establishment,
system-table creation, bootstrap readiness, one-time migration from legacy
rejoin hints (`src/bootstrap/rejoin-hints.js`), and startup-to-runtime handoff.

## Primary Owners

- `src/bootstrap/boot-incarnation-owner.js` (`reserveBootIncarnation`) is the
  canonical owner of durable node identity and monotonic `bootIncarnation` per
  data directory before any lifecycle side effect; `BootstrapService` and
  `NodeJoiningService` require the reserved `bootIncarnation` option, and legacy
  rejoin hints (`src/bootstrap/rejoin-hints.js`) are a one-time migration source
  only.
- `BootstrapService` owns seed startup composition, including cold
  retained-seed continuation (`src/bootstrap/seed-retained-foundation.js`,
  `src/bootstrap/seed-retained-effects.js`).
- `BootstrapAPI` owns seed-side bootstrap and join API behavior.
- `NodeJoiningService` owns joining-node startup and seed contact flow.
- `JoinCoordinator` and join readiness owners coordinate join progression.
- `ControlPlaneWriteHealth` owns startup control-plane write-health
  classification.
- `StartupRecoveryCoordinator` owns startup recovery sequencing.

## First Files

- `src/bootstrap/boot-incarnation-owner.js` and
  `src/bootstrap/boot-incarnation-contract.js` for durable identity and
  `bootIncarnation` reservation.
- `src/bootstrap/bootstrap-service.js`,
  `src/bootstrap/seed-retained-foundation.js`, and
  `src/bootstrap/seed-retained-effects.js` for seed startup and retained-seed
  continuation.
- `src/bootstrap/bootstrap-api.js` for seed API behavior.
- `src/bootstrap/node-joining-service.js` for joiner behavior.
- `src/bootstrap/join-readiness-evaluator.js` for join readiness decisions.
- `src/bootstrap/control-plane-write-health-owner.js` for write-health
  classification.
- `src/bootstrap/rejoin-hints.js` for one-time legacy rejoin-hint migration
  only.
- `src/bootstrap/system-table-schemas-constants.js` before changing
  system-table shape.

## Do Not

- Do not mint or persist node identity or `bootIncarnation` outside
  `src/bootstrap/boot-incarnation-owner.js`, and do not treat
  `src/bootstrap/rejoin-hints.js` as a live identity authority beyond one-time
  migration.
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
