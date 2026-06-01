# Recovery Write Candidate Selection Owner Collapse

## Why

The priority-recovery overflow fix moved the seven-node failure later again,
but the next rerun exposed a new shared-owner split:

1. recovery-owned system-table writes widen when canonical leader identity is
   unresolved
2. widened candidates still inherit cache-row order as their first target
3. all nodes therefore pile onto the same `sql_write_operations-p1` replica
4. backpressured deferred outcomes pause the whole partition attempt instead of
   falling through to the next live recovery candidate
5. benchmark write load stalls before partition growth can trigger

This is not a benchmark split-policy bug. It is one owner-path gap in recovery
write candidate selection and backpressure handling.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Make recovery-owned system-table writes derive one explicit candidate order
   for `owner_missing` or `service_missing` routing gaps instead of raw cache
   row order.
2. Spread first-choice recovery candidates stably across live replicas so one
   missing-leader partition does not collapse onto a single target node.
3. Make deferred/backpressured outcomes advance to the next recovery candidate
   when alternates already exist, while preserving same-address retry for
   session-bound transactional ownership.
4. Add focused unit coverage for recovery-candidate spreading and candidate-
   local backpressure fallback.
5. Revalidate unit tests first, then rerun the seven-node harness.

## Out Of Scope

1. Retuning benchmark split thresholds or timing budgets.
2. Broadening steady-state/user-table writes to non-canonical leader routing.
3. Reworking message-router queue sizing or transport scheduler policy.
4. Reopening the previous canonical leader-gap or priority-recovery packages.

## Invariants

1. Steady-state writes remain fail-closed when canonical leader identity is not
   established.
2. Session-bound transactional control-plane writes still keep same-address
   ownership.
3. Recovery-candidate ordering and backpressure fallback must come from one
   explicit state owner, not scattered local `if` branches.
4. Unit validation must be green before the next harness rerun.

## Hotspots

1. `src/query/query-executor.js`
2. `test/query/query-executor.test.js`
3. `architecture/current-owner-maps.md`
4. `architecture.md`

## Analysis Tasks

- [x] Confirm the new harness failure is a benchmark partition-growth symptom,
  not the split-policy owner itself.
- [x] Confirm recovery-owned `sql_write_operations-p1` traffic still
  concentrates on one widened recovery candidate.
- [x] Confirm candidate-local deferred pressure currently restarts the same
  partition attempt instead of advancing to another live recovery candidate.

## Implementation Tasks

- [ ] Add one explicit recovery candidate ordering owner for widened
  control-plane writes.
- [ ] Allow candidate-local deferred pressure to fall through to the next live
  recovery candidate when alternates already exist.
- [ ] Add focused unit tests.
- [ ] Run focused suites and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [ ] Record architecture/package outcomes.

## Validation

1. `node test/query/query-executor.test.js`
2. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
3. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Recovery-owned widened writes no longer inherit a single global first target
   from cache row order.
2. Candidate-local deferred pressure can consume already-known alternate
   recovery candidates before pausing the whole partition attempt.
3. Unit validation is green.
4. The next seven-node rerun either passes or moves to a later, clearly
   different boundary.
