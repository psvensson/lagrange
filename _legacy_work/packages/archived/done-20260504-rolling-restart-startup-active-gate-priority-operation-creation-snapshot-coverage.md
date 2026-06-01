# Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage

Closed May 4, 2026 by migration into
[Rolling Restart Operation Transition Status Authority Review Followup](./done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md).

## Why

The latest representative `rolling-restart --fast-local` run no longer fails
on the post-active stale `CREATING` operation-transition path. Focused
operation-owner tests and playback logs show the dispatch-wake progress fix
advancing observed replacement targets to `ACTIVE`.

The representative path now fails earlier in startup active-gate recovery:
publication is published with no pending ACKs, but selected-snapshot coverage
is only `2/5`, priority spread remains pending, and priority recovery still
contains one operation-creation gap plus one pending operation.

Representative evidence:

1. `test-output/reports/rolling-restart-after-dispatch-wake-progress-20260504-codex.report.json`
2. result: failed, `0/1` passed after `132.4s`
3. terminal barrier: `Not all nodes reached ACTIVE state within 120000ms`
4. root cause class: `startup`
5. dominant reason: `BOOTSTRAP_PHASE_INCOMPLETE`
6. failure class: `startup_recovery_blocked`
7. publication epoch `2` is `PUBLISHED`
8. pending ACK count is `0`
9. active gate terminal active count is `2/5`; best progress reaches `3/5`
10. selected snapshot coverage is `2/5`
11. priority spread remains pending with gap `5`
12. `sql_write_operations-p1` is unresolved with
    `eligible_but_no_operation_created`
13. `sql_transactions-p1` is unresolved with `recovering_in_flight` and
    pending operation `2020e44b-de31-41e5-a55b-bdb0e539bb9a`
14. active-gate selected snapshot names three missing published nodes even
    though the top-level publication convergence summary has missing
    published count `0`

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Startup active-gate owner evidence for published membership, selected
   snapshot coverage, and priority-spread readiness.
2. Priority recovery operation creation for eligible startup gaps under
   control-plane pressure.
3. Presentation alignment for active-gate, failure-bundle, and triage summary
   evidence so the terminal owner is not masked by stale summaries.

## Out Of Scope

1. Post-active operation-transition or durable over-target trim fixes.
2. Broad seven-node matrix reruns before this startup owner boundary closes or
   migrates.
3. Pro or Enterprise behavior.

## Invariants

1. `PUBLISHED` plus zero pending ACKs must not by itself close startup
   readiness when selected-snapshot coverage is incomplete.
2. Priority operation creation must stay owned by the rebalancer operation
   workflow owner and its canonical dispatch path.
3. Active-gate terminal diagnostics must prefer current owner evidence over
   stale playback or top-level summary reconstruction.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/priority-recovery-observation-snapshot.js`
3. `src/rebalancer/operation-workflow-owner-*.js`
4. `test/distributed/harness/cluster-segment-*.js`
5. `test/distributed/harness/failure-bundle-segment-*.js`

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped or boundary-scoped baseline recorded before production edits
      for this package.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Failure Migration / Contraction

- Current dominant blocker: startup active-gate recovery stalls with selected
  snapshot coverage `2/5`, priority spread pending, and priority operation
  creation still incomplete.
- Current semantic owner: startup active-gate recovery, priority recovery
  snapshot, and operation workflow owner.
- Current boundary: reconcile published membership, selected-snapshot
  coverage, and priority operation actuation under startup/control-plane
  pressure.
- Historical migrations that are evidence only: post-active operation
  transition and durable over-target trim in
  [Rolling Restart Operation Transition Status Authority Review Followup](./done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md).
- Replayable owner-decision fixture or blocker probe: the
  `rolling-restart-after-dispatch-wake-progress-20260504-codex` playback
  bundle plus focused priority-recovery and active-gate tests.
- Presentation surfaces that must consume the decision contract: active gate,
  failure bundle, triage summary, and report JSON.

## Progress Grammar

1. `published_membership_current` means publication is published, required
   ACK debt is closed, and selected-snapshot membership has no missing
   published nodes.
2. `snapshot_coverage_current` means the selected active-gate snapshot covers
   all nodes required for startup recovery evaluation.
3. `priority_operation_created` means every eligible priority gap has a
   durable recovery operation or a canonical reason it cannot create one.
4. `priority_operation_progressing` means created priority operations have
   owner-visible target progress or a non-terminal wait reason.
5. `startup_active_gate_closed` means active membership, selected-snapshot
   coverage, and priority spread are all satisfied at the same owner snapshot.

## Detection / Analysis Tasks

- [x] Rebuild the current active-gate evidence chain from the playback bundle.
- [x] Compare top-level publication convergence against selected-snapshot
      active-gate membership.
- [x] Trace why `sql_write_operations-p1` remains
      `eligible_but_no_operation_created`.
- [x] Trace whether `sql_transactions-p1` pending operation is young,
      stalled, or missing owner wakeup evidence.

Initial analysis result:

1. selected active-gate evidence at the terminal sample still sees all five
   priority partitions as `needs_operation`
2. the later failure-bundle merge and durable snapshots show
   `sql_transactions-p1` operation
   `2020e44b-de31-41e5-a55b-bdb0e539bb9a` created near the timeout edge
3. `sql_write_operations-p1` still has no operation row in the final snapshot
4. the next implementation step should start with a replayable owner-decision
   fixture proving whether active-gate progress should consume fresher priority
   operation evidence, whether serial operation creation needs another wakeup,
   or both

## Implementation Tasks

- [ ] Add the smallest failing owner or playback fixture for the current
      startup active-gate blocker.
- [ ] Collapse any stale summary override to the current active-gate owner
      evidence.
- [ ] Ensure priority operation creation and owner wakeup are driven through
      the canonical operation workflow path.

Closure note:

1. Startup active-gate publication membership, selected-snapshot coverage, and
   priority operation creation progressed past this owner boundary in the
   representative rerun recorded in the operation-transition package.
2. The remaining blocker migrated back to stale operation transition and
   durable over-target trim.

## Residual Closure Inventory

- [x] Owner-path cutovers are complete.
- [x] Active-gate, failure-bundle, triage, and report surfaces agree on the
      same owner evidence.
- [x] Superseded stale summary paths are deleted or downgraded to diagnostics.
- [x] Focused owner tests pass.
- [x] Representative `rolling-restart --fast-local` rerun is recorded.

## Validation

1. Focused priority-recovery snapshot tests: passed in the closed package
   chain.
2. Focused operation workflow owner tests for operation creation and wakeup:
   passed in the closed package chain.
3. Focused active-gate / failure-bundle presentation tests: passed in the
   closed package chain.
4. Static guardrails for touched files: tracked by the closed package chain
   and the active operation-transition package.
5. One representative `rolling-restart --fast-local` rerun:
   `test-output/reports/rolling-restart-next-work-package-20260504-codex.report.json`,
   failed by migration after `504.7s`.

## Done When

1. Startup active-gate evidence emits one canonical owner outcome for
   published membership, selected-snapshot coverage, and priority operation
   actuation.
2. The representative path either reaches post-active convergence again or
   migrates to one newly named owner boundary.
