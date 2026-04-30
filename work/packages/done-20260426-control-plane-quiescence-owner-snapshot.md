# Control Plane Quiescence Owner Snapshot

April 29 successor package: the frozen-publication visibility rerun reached
`waitForControlPlaneQuiescence` again with publication and restart-recovery
gates closed. This original owner-snapshot package remains done; the fresh
active boundary is the stable-window contract in
[Control plane quiescence stable window after publication closure](./active-20260429-control-plane-quiescence-stable-window-after-publication-closure.md).

April 29 re-entry: the latest `rolling-restart --fast-local` report reaches
`waitForControlPlaneQuiescence` again:

1. `test-output/reports/runtime-stability-rolling-restart-20260428-codex-after-follower-source-removal.report.json`
2. failover, convergence, restart recovery, publication ACK, and priority
   recovery are closed
3. the timeout is now a quiescence stable-window failure after `120000ms`
4. the final owner sample is `quiescence_candidate`, `canonicalBlocker=null`,
   `stableElapsedMs=0`, `leaderQuietElapsedMs=110077`, and raw
   `inFlightCount=3`
5. earlier samples still report `replica_operations_in_flight`, but the final
   discounted owner sample hides whether the raw operation evidence was stale
   or cache-visible satisfied
6. failure-bundle classification falls back to `unknown` because
   `quiescence_candidate` is not mapped as a topology/stability owner state

The April 29 continuation keeps the timeout and quiescence semantics unchanged:
`quiescence_candidate` still means no current blocker is present but the stable
window has not elapsed. The repair is diagnostic and classification-only: carry
effective/stale in-flight evidence into timeout diagnostics, and classify a
terminal candidate timeout as `topology_unstable` instead of `unknown`.

The representative rerun after this repair did not reach quiescence. It failed
earlier at restart-recovery readiness for node
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, with bootstrap health reachable but
admin readiness unavailable and
`bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`. That
result moves active runtime investigation back to restart-recovery
startup/admin readiness; the quiescence owner repair remains covered by focused
tests and static guardrails.

April 29 direct-pressure execution: the residual owner-input item is now
implemented. Quiescence snapshots preserve runtime-authority repair errors and
normalize discovery repair timeouts plus node-state publication write pressure
from owner diagnostics into `control_plane_pressure` with direct reasons
`discovery_repair_timeout` and `node_state_publication_pressure`.

The representative rerun after this direct-pressure repair did not reach
`waitForControlPlaneQuiescence`. It failed at `waitForConvergence` after
`404.4s`; `test-output/report.json` has publication epoch `13` in
`ACK_PENDING`, pending ACK node
`8be8d30f-4499-5eed-865c-71b4d529a67a`, blocked publication node count `5`,
and failure-bundle classification `publication_convergence_blocked` /
`control_plane_publication_pending`. Priority recovery has blocked and
unresolved counts `0`; `control_plane_publications-p1` remains
`spread_satisfied_in_flight`. Active runtime ownership moves back to the
publication-visible trim and operation-transition package.

April 26 pause: this package is implemented enough to classify the prior
quiescence failure, but it is not the current execution owner. The latest
`rolling-restart` rerun did not reach `waitForControlPlaneQuiescence`; it
failed earlier in startup active-gate publication recovery, then migrated to
missing published membership from a stale stopped node-state row, then closed
publication recovery and moved to restart-recovery admin reachability and
control-plane pressure. Re-enter this package after that restart-recovery
pressure / admin-reachability package closes or migrates and the representative
path reaches quiescence again.

April 26 activation: the latest `rolling-restart` continuation moved past the
stale completed-operation evidence and failed in the post-restart quiescence
gate.

Latest representative evidence:

1. `test-output/report.json`
2. failure point: `waitForControlPlaneQuiescence`
3. timeout: `120000ms`
4. attempts: `10`
5. stable window: `15000ms`
6. stable elapsed: `0ms`
7. failover, convergence, and restart-recovery gates are closed
8. publication epoch `4` is `PUBLISHED` with pending ACK count `0`
9. priority recovery blocked and unresolved counts are `0`
10. `control_plane_publications-p1`, `replica_operations-p1`,
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1` remain `spread_satisfied_in_flight`
11. instability summary includes `replica_operations_in_flight`,
    `leadership_unstable`, and one snapshot query timeout on
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`
12. logs show node-state publication pressure, authoritative discovery repair
    timeouts, and message-group leadership churn

The existing harness gate observes useful facts, but it still assembles
quiescence from independent probe checks. This package makes quiescence an
explicit owner snapshot with one canonical state, blocker, and reason set.

April 26 continuation: the resolver now separates progressing operation drain
from stalled operation drain, names snapshot/admin timeout pressure as
`control_plane_pressure`, and carries the quiescence owner state through
timeout errors, runner diagnostics, failure bundle summaries, and
classification signals.

The continuation rerun did not reach the quiescence gate. It failed earlier at
`waitForConvergence` with publication epoch `11` still `OPEN`, pending ACK
count `0`, blocked node count `5`, and failure-bundle classification
`publication_convergence_blocked` / `control_plane_publication_pending`.
That result moves active execution back to the operation transition and
publication-visible trim package before this quiescence owner can be re-entered.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
2. [Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)
3. [MOVE_ASSIGNMENT liveness proof hardening](./done-20260426-move-assignment-liveness-proof-hardening.md)

## In Scope

1. Add one quiescence snapshot model that collects observation, operation,
   leadership, critical-spread, pressure, and stable-window evidence.
2. Resolve one canonical quiescence state and blocker from that snapshot.
3. Preserve existing wait-loop behavior while moving reason construction into
   the state resolver.
4. Extend failure diagnostics so timeout and no-progress paths carry the
   quiescence state, canonical blocker, and reason codes.
5. Add focused coverage for quiescent, observation-unavailable,
   operation-drain, leadership, and critical-spread outcomes.
6. Rerun `rolling-restart` after the model can classify the current terminal
   blocker without relying on the legacy instability string alone.

## Out Of Scope

1. Increasing quiescence, readiness, or convergence timeout budgets.
2. Treating operation drain as closed while current non-terminal operation
   evidence remains.
3. Hiding snapshot/admin pressure as a successful stable window.
4. Broad matrix execution before the 5-node representative path stabilizes.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  control-plane quiescence snapshot resolver, fed by control snapshot,
  operation liveness, leadership, critical-system spread, and pressure
  evidence.
- Canonical contract:
  one snapshot emits `state`, `canonicalBlocker`, `reasonCodes`,
  `stableElapsedMs`, `leaderQuietElapsedMs`, and structured operation /
  pressure evidence.
- Allowed consumers:
  `waitForControlPlaneQuiescence`, rolling-restart recovery barriers,
  benchmark pre-load quiescence gates, failure bundles, and sprint triage.
- Prohibited reinterpretations:
  rebuilding quiescence from independent in-flight, leader, spread, and
  snapshot-error checks after the owner snapshot has emitted a canonical state.

## Progress Grammar

1. `observation_unavailable` means the gate cannot obtain an authoritative
   control snapshot.
2. `control_plane_pressure` means owner reads, snapshot probes, discovery
   repair, or node-state writes are failing under explicit pressure.
3. `operation_drain_progressing` means current operation evidence remains, but
   the operation count or timeline still changes.
4. `operation_drain_stalled` means current operation evidence remains without
   progress and without a pressure explanation.
5. `leadership_churn` means the leader signature has not held for the required
   stable window.
6. `critical_spread_open` means critical system tables have not reached the
   required distinct-node spread.
7. `quiescence_candidate` means no blocker is present but the stable window has
   not elapsed.
8. `quiescent` means the candidate state held for the stable window.

## Residual Closure Inventory

- [x] Create a pure quiescence snapshot resolver and state vocabulary.
- [x] Wire `waitForControlPlaneQuiescence` through the snapshot resolver while
      preserving existing timeout behavior.
- [x] Add focused tests for quiescent, operation-drain, observation, and
      critical-spread states.
- [x] Add progress/stalled separation for operation drain using timeline
      signature and lowest in-flight evidence.
- [x] Add pressure-specific state resolution for snapshot/admin timeout.
- [x] Add direct owner inputs for discovery repair timeout and node-state
      publication write pressure.
- [x] Include quiescence state and canonical blocker in failure bundle
      summaries.
- [x] Classify `quiescence_candidate` timeout diagnostics as topology
      stability evidence instead of `unknown`.
- [x] Carry effective, stale, and stale-discounted operation counts through
      quiescence timeout diagnostics.
- [x] Rerun `rolling-restart` and record whether the blocker is
      `control_plane_pressure`, `operation_drain_stalled`, `leadership_churn`,
      or a newly named owner boundary.

## Validation

1. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
2. `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
3. `npm test -- test/rebalancer/replica-operation-liveness.test.js`
4. `npm run audit:guideline:literals`
5. `npm run audit:guideline:decision-boundaries`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

Executed on April 26, 2026:

1. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
2. Result: passed, `6/6`.
3. `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
4. Result: passed, `22/22` skipped by the existing harness skip gate.
5. `node --check test/distributed/harness/control-plane-quiescence-snapshot.js`
6. Result: passed.
7. `node --check test/distributed/harness/cluster-segment-7-class-3.js`
8. Result: passed.
9. `node --check test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
10. Result: passed.
11. `npm run audit:guideline:literals`
12. Result: passed with 0 new violations and 6219 inherited baseline
    violations.
13. `npm run audit:guideline:decision-boundaries`
14. Result: passed.
15. `git diff --check`
16. Result: passed.
17. `node --check test/distributed/run-runtime-helpers.js`
18. Result: passed.
19. `node --check test/distributed/harness/failure-bundle-segment-4.js`
20. Result: passed.
21. `node --check test/distributed/harness/failure-bundle-segment-5.js`
22. Result: passed.
23. `node --check test/distributed/harness/failure-bundle-segment-6.js`
24. Result: passed.
25. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
26. Result: passed.
27. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
28. Result: passed, `48/48`.
29. `node --test test/distributed/harness/__tests__/run.test.js`
30. Result: passed, `68/68`.
31. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
32. Result: failed, `0/1` passed after `389.5s`. The scenario did not reach
    `waitForControlPlaneQuiescence`; it failed at `waitForConvergence` with
    `publication_convergence_blocked` / `control_plane_publication_pending`.

Executed on April 29, 2026:

1. `node --check test/distributed/harness/cluster-segment-7-class-3.js`
2. `node --check test/distributed/harness/failure-bundle-segment-4.js`
3. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
4. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`
5. Result: all passed.
6. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
7. Result: passed, `60/60`.
8. `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
9. Result: passed under the existing harness skip gate, `24/24` skipped.
10. `npm run audit:guideline:literals`
11. Result: passed with `0` new literal-guideline violations and `0`
    inherited baseline matches.
12. `npm run audit:guideline:decision-boundaries`
13. Result: passed with `0` decision-boundary guideline violations.
14. `npm run audit:runtime-grammar`
15. Result: passed with `0` runtime-grammar-contract violations and
    state-machine pressure `issues=0`.
16. `npm run test:metadata-gateway:audit`
17. Result: passed.
18. `git diff --check`
19. Result: passed.
20. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
21. Result: failed, `0/1` passed after `273.6s`. The run did not reach
    `waitForControlPlaneQuiescence`; it migrated back to restart-recovery
    readiness with `adminReady=false`, `controlPlaneRecoveryReady=false`, and
    `control_snapshot_authority_unavailable` for node
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

Executed on April 29, 2026, direct-pressure continuation:

1. `node --check test/distributed/harness/control-plane-quiescence-snapshot.js`
2. `node --check test/distributed/harness/cluster-segment-7-class-5.js`
3. `node --check test/distributed/harness/cluster-segment-7-class-3.js`
4. `node --check test/distributed/harness/failure-bundle-segment-4.js`
5. `node --check src/control-plane/control-plane-readiness-service-segment-3.js`
6. `node --check test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
7. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`
8. `node --check test/control-plane/control-plane-readiness-service.test.js`
9. Result: all passed.
10. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
11. Result: passed, `10/10`.
12. `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
13. Result: passed under the existing harness skip gate, `25/25` skipped.
14. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
15. Result: passed, `53/53`.
16. `npm test -- test/control-plane/control-plane-readiness-service.test.js`
17. Result: passed, `101/101`.
18. `npm run audit:guideline:literals`
19. Result: passed with `0` new literal-guideline violations and `0`
    inherited baseline matches.
20. `npm run audit:guideline:decision-boundaries`
21. Result: passed with `0` decision-boundary guideline violations.
22. `npm run audit:runtime-grammar`
23. Result: passed with `0` runtime-grammar-contract violations and
    state-machine pressure `issues=0`.
24. `git diff --check`
25. Result: passed.
26. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
27. Result: failed, `0/1` passed after `404.4s`. The run did not reach
    `waitForControlPlaneQuiescence`; it failed at publication convergence with
    publication epoch `13` in `ACK_PENDING`, pending ACK node
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, blocked publication node count
    `5`, and dominant reason `control_plane_publication_pending`.

## Done When

1. Quiescence failures carry one canonical owner state and blocker.
2. The latest `rolling-restart` blocker is classified as pressure, stalled
   operation drain, leadership churn, critical spread, or a new owner boundary.
3. The legacy instability summary remains supporting evidence rather than the
   only executable classification.
