# Control-Plane Leader Service-Gap Recovery Owner Collapse

## Why

The next seven-node rerun after the benchmark timeout-budget fix moved again.

The scenario now reaches benchmark load, then stalls under recovery pressure
with repeated:

1. `Canonical partition leader metadata missing`
2. `No leader service found for partition`
3. `Transient CDC SQL error, retrying`
4. `In-flight operation owner query indicates control-plane pressure`

The most important shape is not one sharp write bug. It is one owner mismatch:

`canonical leader owner row -> active service visibility -> routed recovery write / local node-state ingress`

Today the routed write path fails closed when `leader_node_id` is known but the
corresponding service row is missing, even on `controlPlaneRecoveryEligible`
system-table traffic where other active replicas can still redirect to the
current leader or help re-establish canonical visibility. That leaves the
system stuck between two truths:

1. readiness still allows critical recovery traffic
2. routing still refuses to issue that traffic because canonical leader service
   visibility is stale

This package exists to collapse that gap onto one explicit recovery-owned
routing contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one bounded recovery outcome for canonical leader/service gaps on
   system-table writes using `controlPlaneRecoveryEligible`.
2. Reuse the existing redirect/recovery candidate path instead of creating a
   parallel routing framework.
3. Make local `NODE_STATE_UPDATE` ingress selection consume that same
   recovery-owned contract instead of re-interpreting leader gaps.
4. Keep steady-state write routing fail-closed outside that bounded recovery
   contract.
5. Add focused unit coverage for the widened recovery behavior and the
   preserved fail-closed behavior.
6. Record the owner-path change in architecture docs.
7. Validate unit gate first, seven-node harness second.

## Out Of Scope

1. Broadening all partition writes to use non-canonical fallback routing.
2. Changing read-path semantics in this slice.
3. Reworking control-plane readiness dimensions.
4. Retuning benchmark thresholds or harness timings as a substitute for owner
   repair.

## Invariants

1. Steady-state writes still fail closed on canonical leader/service gaps.
2. Only recovery-owned system-table writes on
   `controlPlaneRecoveryEligible` may widen to live recovery candidates.
3. The widened path must use the existing redirect/recovery mechanism rather
   than inventing a second execution path.
4. Unit gate must be green before the next seven-node rerun.

## Hotspots

1. `src/query/query-executor.js`
2. `src/control-plane/control-plane-kernel-ingress.js`
3. `test/query/query-executor.test.js`
4. `test/control-plane/control-plane-kernel-ingress.test.js`
5. `test/bootstrap/node-joining-service.test.js`
6. `architecture/current-owner-maps.md`
7. `architecture.md`

## Analysis Tasks

- [x] Confirm the remaining failure is a leader/service-gap routing mismatch
  under recovery-owned system-table traffic.
- [x] Confirm the write path already supports redirect/recovery candidate
  execution after runtime leader disproval.
- [x] Identify the bounded cutover: allow canonical leader/service-gap widening
  only for recovery-owned system-table writes.

## Implementation Tasks

- [x] Add an explicit canonical leader/service-gap recovery routing decision.
- [x] Route bounded recovery-owned system-table writes through existing leader
  recovery candidates on that decision.
- [x] Make local `NODE_STATE_UPDATE` ingress selection consume that same
  recovery-owned contract.
- [x] Add focused unit tests for widened recovery behavior and preserved
  fail-closed steady-state behavior.
- [ ] Run focused unit tests and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [x] Record the owner-path change in architecture docs.

## Validation

1. `node test/query/query-executor.test.js`
2. `node test/query/sql-query-engine.test.js`
3. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
4. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Recovery-owned system-table writes have one explicit canonical leader/service
   gap outcome.
2. That outcome widens only to the existing redirect/recovery candidate path.
3. Steady-state write routing remains fail-closed.
4. The unit-only gate is green.
5. The seven-node rerun either passes or fails at a later, clearly different
   boundary.
