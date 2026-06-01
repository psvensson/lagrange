# Control-Plane Critical Traffic Isolation And Observability Backlog Containment

## Why

The latest seven-node checkpoint no longer fails first on bootstrap or usable
spread. It now stalls later while control-plane partitions amplify pressure
under load:

1. background observability backlog and generic CDC pressure accumulate
2. critical control-plane work still has a reserved path in transport
3. bootstrap/readiness currently degrades that reserved path anyway because
   control-plane write health is still inferred from repeated heartbeat
   failures without checking whether critical capacity is actually exhausted
4. split, rebalance, and benchmark admission then consume an overly broad
   unhealthy signal and collapse too early

This package closes that mismatch at the shared owner boundary.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Reuse `PressureGovernor` and router queue partition evidence to classify
   control-plane write health.
2. Distinguish contained background backlog from true critical control-plane
   write exhaustion.
3. Let bootstrap/readiness treat contained background backlog as degraded soft
   context instead of a hard readiness blocker.
4. Record the owner-map and package impact of the new write-health contract.

## Out Of Scope

1. Coalescing node-state publications.
2. Reworking replica-operation visibility under pressure.
3. Benchmark throttling or control-partition prerequisite gates.
4. Transport queue redesign beyond the existing critical-reserve model.

## Invariants

1. Control-plane write health must be owned once and consumed as one explicit
   contract.
2. Background backlog must not degrade the same hard dependency as true loss of
   critical control-plane write capacity.
3. Critical control-plane exhaustion must remain a hard readiness blocker.

## Hotspots

1. `src/bootstrap/control-plane-write-health-owner.js`
2. `src/bootstrap/owners/bootstrap-readiness-owner.js`
3. `src/index.js`
4. `test/bootstrap/`
5. `test/control-plane/pressure-governor.test.js`

## Analysis Tasks

- [x] Confirm the current provider still maps repeated heartbeat failures
  directly to one hard unhealthy outcome.
- [x] Confirm transport already distinguishes control-plane reserve from
  background saturation.
- [x] Confirm readiness is consuming the provider as a hard blocker today.

## Implementation Tasks

- [x] Add a shared control-plane write-health owner that reuses the pressure
  governor and heartbeat publication evidence.
- [x] Emit one explicit write-health state model with soft versus hard
  dependency classification.
- [x] Cut bootstrap/readiness over to that classification.
- [x] Add focused tests for contained background backlog and true critical
  exhaustion.
- [x] Update owner maps, architecture notes, and package progress.

## Progress Notes

1. Added `src/bootstrap/control-plane-write-health-owner.js` so control-plane
   write health now reuses heartbeat publication evidence plus transport
   pressure partitions instead of mapping every repeated heartbeat failure to
   one hard unhealthy state.
2. Bootstrap readiness now consumes the owner-provided dependency
   classification, so `background_backlog_contained` remains visible as
   degraded soft context while `critical_write_unhealthy` stays a hard
   blocker.
3. Focused coverage is green in
   `test/bootstrap/control-plane-write-health-owner.test.js` and
   `test/control-plane/pressure-governor.test.js`.

## Validation

1. Focused bootstrap/control-plane unit tests for the write-health owner.
2. Relevant readiness and bootstrap API tests.
3. Boundary-transition scenarios only after the focused owner slice is green.

## Done When

1. Control-plane write health is no longer inferred solely from repeated
   background heartbeat failures.
2. Contained observability backlog is visible as degraded context without
   flipping readiness hard red.
3. True critical control-plane exhaustion still degrades readiness hard.
