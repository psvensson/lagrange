# Critical Topology Convergence Grammar Contract

## Why

The April 24, 2026 `rolling-restart` strict restart rerun moved the blocker
again:

1. `activeGate` reached `ready`.
2. publication was `PUBLISHED` with pending ACK count `0`.
3. priority recovery unresolved counts were `0`.
4. the scenario then failed in `waitForConvergence` after `120000ms`.
5. the failure bundle still let retained active-gate readiness-delay evidence
   dominate as `startup_recovery_blocked`.

That is the current bug-cluster signal. The system has enough evidence, but
too many local grammars decide what the evidence means.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Define one small barrier grammar for post-load and post-restart recovery.
2. Wire the active sprint to the package sequence that shrinks the boundary.
3. Make harness classification preserve the actual failing barrier before
   contributing snapshot/readiness observations.
4. Queue the runtime owner packages that collapse replacement lifecycle,
   over-target voters, learner promotion, pressure, and observation repair into
   explicit owner contracts.

## Out Of Scope

1. Increasing scenario timeouts.
2. Treating diagnostics reachability failures as the runtime root cause when
   the failing barrier is already later.
3. Broad matrix reruns before the representative `rolling-restart` path has a
   named convergence owner outcome.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  the runtime owner of the current blocked entity remains the operation,
  partition, pressure, or observation owner. This package owns only the shared
  post-restart barrier grammar and package sequencing.
- Canonical contract:
  raw evidence is normalized into one barrier snapshot, then one canonical
  state and reason. Presentation consumers may summarize that result, but must
  not let stale retained evidence outrank the barrier that actually threw.
- Operational authority:
  runtime owners emit operation lifecycle, voter convergence, pressure, and
  observation outcomes.
- Diagnostics-only observation:
  admin snapshots, playback snapshots, and active-gate readiness delays
  contribute supporting evidence.
- Prohibited reinterpretations:
  `snapshot_reachability_timeout` must not become the dominant failure when
  `active_gate` is ready and the thrown barrier is `convergence`; priority
  spread satisfaction must not be treated as operation lifecycle closure.
- Primary diagnostics:
  failure bundle classification, triage summary, active-gate progress,
  convergence timeout diagnostics, replica operation history, over-target voter
  durations, and owner-path regression tests.

## Progress Grammar

1. `active_gate` means all required nodes are admitted to the strict ACTIVE
   view.
2. `convergence` means topology has closed voter count, leader, and operation
   lifecycle requirements after the active gate.
3. `quiescence` means owner queues and recovery work have stopped making
   semantic changes.
4. `consistency` means final observer views agree after the owner barriers.

Within a barrier, the canonical states are:

1. `ready`
2. `pending`
3. `blocked`
4. `deferred`
5. `failed`
6. `closed`

The canonical reason vocabulary for the current slice is:

1. `membership_pending`
2. `publication_pending`
3. `leader_authority_pending`
4. `promotion_blocked`
5. `remove_safety_blocked`
6. `over_target_voters`
7. `operation_visibility_lag`
8. `pressure_deferred`
9. `observation_deferred`
10. `terminal_error`

## Package Sequence

1. Execute the harness barrier-precedence fix inside
   [Harness canonical owner-state classification](./done-20260424-harness-canonical-owner-state-classification.md).
2. Continue the current scenario package as
   [Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).
3. Queue the runtime convergence owner package:
   [Critical replace operation lifecycle convergence owner](./todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md).
4. Queue the observation owner cutover package:
   [Admin observation owner cutover and repair fencing](./todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md).
5. Queue the pressure taxonomy audit package:
   [Critical pressure workload taxonomy audit](./todo-20260424-critical-pressure-workload-taxonomy-audit.md).
6. Continue the migrated runtime split as
   [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
7. Continue the post-over-target runtime split as
   [Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md).

## Residual Closure Inventory

- [x] Latest blocker migration recorded from `inactive_nodes=1` to
      post-active `convergence` timeout.
- [x] Harness failure bundles report the thrown barrier before retained
      readiness-delay evidence.
- [x] Runtime owner package names the over-target replacement lifecycle loop.
- [x] Admin observation repair paths are split to
      [Admin observation owner cutover and repair fencing](./todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md).
- [x] Pressure workload classes are split to
      [Critical pressure workload taxonomy audit](./todo-20260424-critical-pressure-workload-taxonomy-audit.md).
- [x] Architecture owner map names the harness barrier-precedence role.
- [x] `rolling-restart` rerun records whether the next blocker remains the same
      convergence lifecycle loop or migrates.
- [x] Post-STOPPING rerun records migration from over-target voters to
      placement-converged operation drain.

## Validation

1. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
2. `node --check test/distributed/harness/failure-bundle-segment-4.js`
3. `node --check test/distributed/harness/failure-bundle-segment-5.js`
4. Regenerate or rerun the latest `rolling-restart` artifact after the first
   harness cut.

Executed:

1. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
2. Result: passed, `44/44`.
3. Latest report replay:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
4. Result: failure bundles now preserve the thrown convergence barrier as
   `topology_unstable` / `convergence_timeout`; runtime closure remains owned
   by the replace operation lifecycle package.
5. April 25 operation-lifecycle rerun:
   `test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
6. Result: the barrier remains post-active `convergence_timeout`, but runtime
   ownership migrated to operation transition pressure and over-target trim.
7. April 25 STOPPING visibility-pressure rerun:
   `test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json`
8. Result: the barrier remains post-active `convergence_timeout`, but all voter
   counts are target and runtime ownership migrated to in-flight operation
   drain under CDC/control-plane pressure.

## Done When

1. The active sprint has one package sequence for the convergence grammar.
2. Harness artifacts classify the latest blocker as the actual post-active
   convergence barrier.
3. The remaining runtime fixes are queued as owner-contract packages rather
   than local symptom patches.
