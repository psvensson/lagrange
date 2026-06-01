# Benchmark Partitioning Dispatch Contribution Owner Collapse

## Why

The fresh April 15, 2026 seven-node rerun moved the failure boundary again.

The harness now exposes one later systemic split:

1. partitioning bootstrap starts from a `ready_replica` quorum
2. steady dispatch later widens from that local contributor set to every
   `admissionReady` node
3. `routed_admission_only` nodes then consume benchmark load budget even
   though they do not add local partition pressure
4. the run shows real load plus immediate queue/control-plane pressure, but
   `benchmark_events` never grows beyond the first partition

This is not another split-threshold or timeout bug. It is one owner-path gap
between benchmark partition convergence and the nodes that should count as
live partitioning-load contributors.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Reuse `BenchmarkPartitionConvergence` to derive one explicit steady-dispatch
   mode for partitioning load.
2. Keep steady dispatch on `ready_replica` contributors once the local quorum
   already satisfies bootstrap requirements.
3. Preserve the existing bootstrap backfill behavior while the ready local
   contributor quorum is still missing.
4. Add focused harness tests for the new dispatch contribution rule.
5. Record the owner-path update in architecture docs.

## Out Of Scope

1. Retuning benchmark ops/sec or timeout budgets.
2. Reworking runtime control-plane routing in this slice.
3. Reclassifying failure bundles as a substitute for the owner-path fix.
4. Broadening routed-only nodes into local contributors by heuristic.

## Invariants

1. Benchmark admission and partition convergence still originate from the
   shared harness snapshot owners.
2. `routed_admission_only` must stay visible in diagnostics, but it must not
   count as a steady partition-growth contributor once a ready local quorum
   already exists.
3. Bootstrap must still be able to backfill from replica-bearing selections
   before the ready local quorum is available.
4. Unit gate must be green before the next seven-node rerun.

## Hotspots

1. `test/distributed/harness/benchmark-partition-convergence.js`
2. `test/distributed/scenarios/table-distribution-helpers.js`
3. `test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
4. `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
5. `architecture/current-owner-maps.md`
6. `architecture.md`

## Analysis Tasks

- [x] Confirm the fresh rerun still fails after real load begins rather than
  at bootstrap table creation or benchmark admission.
- [x] Confirm steady dispatch can widen from `ready_replica` to
  `routed_admission_only` once bootstrap is satisfied.
- [x] Confirm the missing owner boundary is partitioning load contribution,
  not only generic load-slot capacity.

## Implementation Tasks

- [x] Add one explicit partitioning dispatch mode derived from the shared
  convergence snapshot.
- [x] Route steady dispatch through that owner so ready local contributors stay
  active while routed-only admission remains diagnostic-only.
- [x] Preserve bootstrap backfill when the ready local quorum is still missing.
- [x] Add focused regression coverage.
- [ ] Run focused suites, the unit-only gate, and rerun the seven-node harness.
- [x] Record the owner-path change in architecture docs.

## Documentation Decision

1. `architecture/current-owner-maps.md` and `architecture.md` are the right
   records because this slice adds one new shared harness owner path.
2. No `.kiro/steering` or doctrine change is needed. The existing repository
   rules already require one explicit state model and one canonical decision
   outcome; this package applies that rule to partitioning dispatch
   contribution.

## Validation

1. `node test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
2. `node test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
3. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
4. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery`

## Done When

1. Partitioning steady dispatch consumes one explicit contribution mode from
   the shared convergence owner.
2. Ready local contributors remain the active dispatch set once bootstrap
   quorum already exists.
3. Routed-only admission stays visible in diagnostics without diluting the
   split-driving dispatch set.
4. The unit-only gate is green.
5. The next seven-node rerun either passes or moves to a later, clearly
   different boundary.
