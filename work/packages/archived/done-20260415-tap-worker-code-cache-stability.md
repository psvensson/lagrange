# TAP Worker Code Cache Stability

## Why

The unit-only gate no longer points to one reproducible domain assertion path.
The latest investigation showed a different shared runner boundary:

1. large subsystem bail runs (`control-plane`, `rebalancer`, `node`,
   `partition`) pass in isolation
2. the reduced cross-cutting remainder also passes in isolation
3. the aggregate full unit gate is the only surface that still turns red
4. the workstation currently has swap fully consumed and limited available RAM
   while TAP asks for `jobs: 8`

The repeated signal is not "44 different product bugs". It is shared TAP
parallelism budget under aggregate validation load.

This is still a test-runner stability problem and should be fixed once at the
shared worker boundary.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Stabilize TAP child-worker startup by hardening shared Node worker args.
2. Stabilize aggregate TAP gate concurrency with one shared worker parallelism
   budget.
3. Record the runner-stability boundary in steering/testing guidance.
4. Revalidate the full unit-only gate with the shared runner fix.
5. Only after unit closure, rerun the seven-node harness scenario.

## Out Of Scope

1. Editing unrelated individual test files to chase nondeterministic crash
   attribution.
2. Changing runtime feature logic for migration, raft spike, transport, or
   transaction behavior.
3. Reworking TAP suite topology, file sharding, or harness scenario semantics
   unless the shared worker fix fails.

## Invariants

1. Runner stability must be owned at the shared TAP worker boundary.
2. Unrelated suite crashes must not be closed by per-suite suppressions.
3. Unit validation must be green before the next seven-node rerun.

## Hotspots

1. `.taprc`
2. `.kiro/steering/testing-guidelines.md`

## Analysis Tasks

- [x] Confirm isolated subsystem bail runs pass even though the aggregate unit
  gate fails.
- [x] Confirm the reduced cross-cutting remainder also passes in isolation.
- [x] Confirm shared runner pressure remains the common boundary:
  `jobs: 8`, full swap usage, and aggregate-only failure.
- [x] Confirm `.taprc` already carries the shared `--no-compilation-cache`
  worker arg, so the remaining gap is parallelism budget rather than missing
  worker startup hardening.

## Implementation Tasks

- [x] Keep the shared TAP worker startup hardening in `.taprc`.
- [x] Lower the shared TAP jobs budget to a stable default for this
  workstation boundary.
- [x] Record the durable runner-stability and parallelism-budget policy in
  testing steering.
- [x] Rerun the full unit-only gate.
- [x] Rerun the seven-node harness scenario after unit closure.
- [x] Record package outcomes.

## Progress Notes

1. The shared TAP runner boundary is now stabilized at `jobs: 4` in
   `.taprc` with `--no-compilation-cache` still enforced for workers.
2. The latest full unit-only gate is green at that shared runner budget:
   `28152/28152` passing in about `270.7s`.
3. The remaining distributed rerun now serves as checkpoint truth only after
   unit closure rather than as the normal debugging loop.
4. The checkpoint rerun completed in
   `test-output/reports/seven-node-runtime-owner-collapse-20260416T020251Z.report.json`
   and stayed on the same late distributed boundary instead of creating a new
   debugger loop: `benchmark_events` remained at one partition with
   `convergenceStateHistogram=absent:3|ready_replica:3|routed_admission_only:1`
   while the artifacts still showed `nodeSlotUnavailable`, repeated
   `replica_operations` owner-query timeouts, buffered backlog on
   `sql_transactions-p1`, and spread shortfall on
   `sql_transaction_participants-p1`.

## Validation

1. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
2. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. The unit-only gate is green without unrelated TAP child-worker crashes.
2. The unit-only gate is green at the shared TAP jobs budget without
   aggregate-only suite collapse.
3. Shared runner stability is documented in steering.
4. The seven-node rerun either passes or moves to a later, clearly different
   runtime boundary.
