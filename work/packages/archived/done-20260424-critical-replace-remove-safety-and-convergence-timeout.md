# Critical Replace Remove Safety And Convergence Timeout

## Why

The April 24, 2026 representative rerun after the readiness/planning merge fix
still fails, but it no longer fails on the same-epoch publication-gate
contradiction:

1. final node readiness snapshots are `serveEligible = true`
2. final direct membership publication gates are `ready`
3. final readiness-owned priority recovery projections are inactive
4. publication convergence remains `steady_published` with
   `prioritySpreadPending = false`

The remaining blocker is runtime convergence timeout with critical in-flight
operations. The strongest live signals are:

1. repeated `replace_remove_safety_blocked`
2. errors such as replacement leader ownership pending before safe removal
3. active and creating critical `REPLACE` operations still in flight at
   timeout
4. joiner-side ACK-timeout quarantines and readiness-filtered config routing
   during the same window

That is now a pure runtime liveness seam, not a publication-gate seam.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Close the critical `REPLACE` source-removal safety seam so replacement
   leader ownership becomes observable and safe removal does not defer
   indefinitely.
2. Verify joiner routing and admission behavior under transient ACK-timeout
   quarantine once the publication gate is already closed.
3. Add focused proof for the runtime convergence path that currently times out.
4. Rerun `node-join-under-load` and record blocker movement.

## Out Of Scope

1. Publication-gate grammar rewrites already closed by packages `16` and `17`.
2. Harness-only exemptions.
3. Broad scenario-matrix expansion before the representative timeout seam is
   resolved.

## Shared Boundary Contract

- Semantic owner:
  operation workflow owner source-removal safety for critical `REPLACE`
  operations.
- Canonical contract:
  source removal must move through one explicit state model:
  `source_handoff_required`, `source_handoff_observed`,
  `replacement_election_requested`, `replacement_leader_observed`,
  `safe_remove`, `critical_progress_deferred`, or `terminal_failure`.
- Allowed consumers:
  operation workflow owner, replica handler handoff/election path, priority
  recovery diagnostics, and harness reporting.
- Prohibited reinterpretations:
  treating operation absence, source follower evidence, completed handoff RPCs,
  or stale publication summaries as replacement leader ownership.
- Runtime rule:
  a closed publication gate must stay closed while critical replacement
  operations converge.
- Pressure rule:
  transient transport churn may delay progress, but it must not leave critical
  runtime operations indefinitely unresolved without a typed deferred outcome.

## Hotspots

1. `src/rebalancer/operation-workflow-owner-segment-5.js`
2. `src/rebalancer/operation-workflow-owner-segment-6.js`
3. `src/rebalancer/operation-workflow-owner-shared.js`
4. `src/node/replica-handler-class-part-1.js`
5. `src/node/replica-handler-class-part-2.js`
6. `test/rebalancer/quorum-conditioned-remove-safety.test.js`
7. `test/node/replica-handler.test.js`
8. `test-output/.playback/report/node-join-under-load/_timeline.log`
9. `test-output/.playback/report/node-join-under-load/triage-summary.json`

## Status Update

Opened on April 24, 2026 after package `17` eliminated the readiness/planning
contradiction from the final artifact. The representative rerun still fails
after `199.8s` with `dominantReason = nodeAdmissionBlocked` and
`failureClass = load_pressure`, but the final timeout now centers on in-flight
critical operations:

1. `sql_transactions-p1` replacement remove safety remains blocked on
   replacement leader ownership
2. `contexts-p1` and `control_plane_publications-p1` still carry in-flight
   `REPLACE` operations at timeout
3. joiners still show intermittent config-routing denials and ACK-timeout
   quarantines during the load window

Focused execution on April 24, 2026 confirms the current unit/owner proof
layer is green before the next runtime cut:

1. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js test/rebalancer/rebalance-coordinator-atomic-transitions.test.js test/node/replica-handler.test.js`
2. Result: `527/527` assertions passing
3. Interpretation: the known local source-removal, transition, and
   replica-handler owner-path regressions are covered; the remaining closure
   still needs either a new focused repro for the distributed timeout seam or a
   representative scenario rerun after the next implementation cut

Post-classification representative execution on April 24, 2026 moved the
terminal failure to the pressure/admission path:

1. command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/runtime-stability-node-join-20260424-codex-after-harness-classification.report.json --fast-local --verbose`
2. result:
   failed after `199.9s`
3. terminal error:
   `Convergence timeout after 60000ms`
4. runtime state:
   publication convergence closed, pending ACK count `0`, blocked partition
   count `0`, but two effective replica operations remained in flight
5. remaining owner seam:
   `replace_remove_safety_blocked` still repeats on replacement leader
   ownership before safe removal
6. blocker handoff:
   pressure and admission are now active in
   [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

Sprint execution update:

1. replacement handoff can now request a replacement election through the Raft
   provider contract
2. priority recovery completed `REPLACE` placement evidence is accepted only
   when the replacement target is active and operational on an eligible node
3. `node-join-under-load` passed once and then passed a no-code confirmation
   rerun
4. the remaining blocker is no longer source-removal safety on the
   representative path; it has moved to secondary `rolling-restart`
   follow-up operation creation for `replica_operations-p1`

## Detection / Analysis Tasks

- [x] Confirm the final readiness artifact no longer carries the same-epoch
      direct-ready versus planning-active contradiction.
- [x] Extract the final timeout's critical in-flight operation history and
      safety blocker messages.
- [x] Pin the minimal owner path that should advance replacement leader
      ownership before source removal.
- [x] Identify whether the current blocker is missing election actuation,
      missing leader publication, stale owner-read visibility, or pressure
      starving the retry loop.
- [x] Verify that replacement leader ownership waits on canonical owner
      evidence and not on harness-side inference.
- [x] Confirm that the stale publication-gate assertion no longer owns the
      terminal representative failure after the harness classifier cut.

## Implementation Tasks

- [x] Add focused proof for critical replacement convergence under the current
      remove-safety contract.
- [x] Fix the replacement leader ownership / safe removal runtime seam.
- [x] Joiner-side ACK-timeout quarantine interaction is split to queued
      rolling-restart pressure follow-up work.
- [x] Rerun the representative scenario.
- [x] Pressure migration was handed off explicitly to the pressure-reserve
      package instead of widening this package.
- [x] Pressure/admission handoff recorded after the post-classification
      representative rerun.

## Residual Closure Inventory

- [x] Owner path: operation workflow owner emits one canonical source-removal
      safety state.
- [x] Collaborator path: replica handler handoff/election behavior matches the
      safety state model.
- [x] Diagnostics path: priority recovery diagnostics report active
      leader-ownership blockers as blocked runtime work.
- [x] Harness path: current failure artifacts preserve the owner-state reason
      without reopening publication/readiness blockers.
- [x] Superseded paths are split to the queued operation lifecycle owner cleanup
      if `rolling-restart` returns to this boundary.
- [x] Proof: focused owner-path tests, then representative
      `node-join-under-load`.

## Validation

1. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`
3. `npx tap test/node/replica-handler.test.js`
4. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

Additional executed validation:

1. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
2. Result: `179/179` assertions passing.
3. Representative `node-join-under-load` run: passed.
4. Representative no-code confirmation run: passed.

## Done When

1. Critical `REPLACE` operations no longer stall indefinitely on replacement
   leader ownership before safe removal.
2. The representative scenario is green, or the next runtime seam is
   explicitly split with the publication/readiness contradiction still closed.
   Status: complete; the split seam is now
   [Priority recovery follow-up operation creation](./done-20260424-priority-recovery-followup-operation-creation.md).
