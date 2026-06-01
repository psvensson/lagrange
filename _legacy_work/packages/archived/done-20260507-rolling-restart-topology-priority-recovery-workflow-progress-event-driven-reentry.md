# Rolling Restart Topology Priority Recovery Workflow Progress Event-Driven Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z/rolling-restart/",
  "owner": "Priority recovery workflow progress no-dispatch behind topology publication PUBLISHED priority-spread convergence",
  "boundary": "Operation workflow owner / workflow_progress",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The deferred-dispatch retry visibility seam is closed. The representative rerun now advances sql_write_operations-p1 on target 8be8... from PENDING through SENDING and CREATING into ACTIVE, with sql_transactions-p1 remaining only supporting in-flight priority work. The live blocker migrated back to startup join contacting_seed timeout no-progress: nodes 35a..., 11601..., and ebc4... each exhaust retryable seed-contact resumes on 500ms request timeouts while publication remains epoch 4 PUBLISHED with pending ACK count 0 and three missing-published nodes.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md for the returned startup join / contacting-seed timeout no-progress boundary.",
  "proof": [
    "Focused 072145Z workflow-progress witness fixture or blocker probe",
    "Focused remote-owned priority REPLACE wake-up or dispatch regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js",
    "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Publication Convergence Open Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md)
closed by migration. The representative rerun no longer selects startup
`contacting_seed` timeout no-progress as the direct lower owner. The bounded
seed-contact probe change collapsed repeated retry wall-clock loss, `35a...`
now reaches active, and the representative failure moved forward into
priority-recovery workflow progression after publication closure.

Closure update on May 7, 2026: the deferred-dispatch retry path now reuses the
retained operation snapshot when authoritative visibility remains deferred. The
focused owner-path regression proves a remote-owned priority `REPLACE` retry
re-enters the canonical dispatch owner instead of abandoning the retained row.
The representative rerun
`rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z`
no longer selects `sql_write_operations-p1` workflow-progress as the direct
owner: operation `036a62c3-d9fb-4dc0-822b-52ede4cc2b8f` advances
`PENDING -> SENDING -> CREATING -> ACTIVE` on `8be8...`, replica creation
completes, and the remaining scenario blocker migrates back to startup join
`contacting_seed` timeout no-progress for nodes `35a...`, `11601...`, and
`ebc4...`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z/rolling-restart/`.
3. Result: failed after `130.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary now reports root cause class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and failure class `publication_convergence_blocked`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, blocked partition count `0`, unresolved partition count `0`, recovery
   protocol state `publication_pending`, and gate reasons
   `snapshot_coverage=2/5` plus
   `publication_missing_active_node=11601...|35a891...|ebc4...`.
7. Priority recovery is now supporting evidence rather than the direct owner:
   failure-bundle witnesses classify `sql_write_operations-p1` and
   `sql_transactions-p1` as `spread_satisfied_in_flight`, and the triage
   summary records `sql_transactions-p1` as pending workflow progress without
   any blocked or unresolved priority partition.
8. Runtime logs on `8be8...` show the repaired owner path directly:
   operation `036a62c3-d9fb-4dc0-822b-52ede4cc2b8f` advances
   `PENDING -> SENDING -> CREATING -> ACTIVE` for `sql_write_operations-p1`,
   replica creation completes, and operation
   `32ef9ba2-8ad4-4b8c-a42e-e9821ea48aac` for `sql_transactions-p1` also
   progresses through dispatch into replica creation.
9. Joiner logs on `35a...`, `11601...`, and `ebc4...` now align on one lower
   startup seam instead: each node remains in `contacting_seed`, exhausts its
   retryable resume budget after repeated `Request timeout after 500ms`
   failures, and never creates local services before teardown.
10. The package therefore closes by migration: deferred dispatch no longer
    abandons retained priority operations under deferred visibility, and the
    representative blocker has moved back to startup join no-progress under
    the same top-level topology carrier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `072145Z` workflow-progress witness set for
   `sql_write_operations-p1` and operation
   `0e957d74-4bae-4a33-90b0-ccf53e765d01`.
2. Add a focused reproduction for remote-owned priority REPLACE wake-up and
   dispatch progression after durable operation creation.
3. Repair only the selected `operation_workflow_owner / workflow_progress`
   seam that leaves the recovery operation durable `PENDING`.
4. Preserve the closed startup seed-contact retryability regressions from the
   predecessor package.

## Out Of Scope

1. Reopening the closed startup seed-contact package unless a fresh rerun
   again selects `contacting_seed` as the direct owner.
2. Harness-only timeout increases or relaxed failure classification that hide
   the named workflow-progress debt.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_progress` owns the boundary when the
   selected publication epoch is already `PUBLISHED`, pending ACK count is
   `0`, and one blocked priority partition carries a durable active operation
   with no step transitions.
2. Direct remote dispatch or wake-up transport is subordinate until the proof
   shows that the selected durable `PENDING` row fails to reach or advance
   through the canonical target-owner ingress.
3. Startup `contacting_seed` failures are supporting evidence only when the
   blocked priority partition remains the direct cause after publication
   closure.

Canonical contract shape:

1. Failure bundle, triage summary, publication convergence, and focused tests
   must agree on one direct owner for `sql_write_operations-p1`.
2. The focused proof must show why operation
   `0e957d74-4bae-4a33-90b0-ccf53e765d01` remains durable `PENDING` rather
   than relying on stale missing-active or snapshot-coverage presentation.
3. If the next focused proof selects a lower transport or dispatch owner, this
   package must either narrow to that lower owner or split a successor package
   in the same work cycle.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `019e0168-d047-7541-8357-3cff88712095` / `Lovelace` reviewed
      `work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md`
      on the shared rolling-restart topology publication/workflow-progress
      boundary; result `fixes-required` for package bookkeeping before
      TopologyConvergenceGraph implementation starts.
- [x] Fix subagent recorded or explicitly not needed:
      `Codex package-bookkeeping fix session 2026-05-07T09:53:31+02:00`
      performed the scoped bookkeeping repair: add this ledger, remove the
      predecessor's invalid historical ledger, and close or reword predecessor
      checklist entries for validation.
- [x] Implementation subagent recorded:
      `current active rolling-restart package session` remains the
      implementation session for this active workflow-progress package after
      the review/fix ledger is clean; no TopologyConvergenceGraph
      implementation started in this bookkeeping-fix turn.
- [x] Continuation review subagent recorded:
      `019e018b-f1b3-7273-992f-1cfed6b88a05` / `Confucius` reviewed
      `work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md`
      on the shared rolling-restart / `priority_recovery_workflow_progress_event_driven`
      sprint boundary; result `fixes-required` for healthy-convergence
      frontier behavior and direct `failureBundle` provenance defects before
      this workflow-progress implementation resumes.
- [x] Continuation fix subagent recorded:
      `019e018f-c659-7e22-a7ea-d63f0e604af7` / `Ampere` repaired the
      diagnostics package findings in
      `src/diagnostics/topology-convergence-graph.js` and its focused tests,
      reran targeted validation plus `npm run work:validate`, and left the
      review/fix ledger clean before this workflow-progress implementation
      resumes.
- [x] Continuation implementation subagent recorded:
      `019e0199-49c0-76b0-ba2b-26759d7a85a7` / `Pascal` owns only
      `src/rebalancer/operation-workflow-owner-segment-1.js` and
      `test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js`
      for this resumed workflow-progress slice, and implementation starts only
      after the Confucius review and Ampere fix continuation ledger is clean.

## Residual Closure Inventory

- [x] Extract the `072145Z` workflow-progress witness fixture or narrow blocker
      probe for `sql_write_operations-p1`.
- [x] Add the focused reproduction for remote-owned priority REPLACE wake-up or
      dispatch progression.
- [x] Repair the selected workflow-progress seam without reopening the closed
      startup seed-contact path.
- [x] Rerun focused proof, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.
      Baseline for `src/rebalancer/operation-workflow-owner-segment-1.js`:
      literal ownership `0 new / 0 inherited`, decision-boundary `0`,
      runtime-grammar `0`, and `git diff --check` clean for the planned
      touched files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Out-of-scope inherited debt is explicitly disclosed here: one unrelated
      owner-path convergence subtest still fails outside this package's scope,
      and this closure record does not claim that a dedicated follow-on
      package already exists for that inherited failure.

## Validation

1. `node --test test/diagnostics/topology-convergence-graph.test.js`
   passed after the continuation fix subagent repaired the predecessor-package
   healthy-frontier and `failureBundle` provenance defects before this package
   resumed implementation.
2. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js`
   passed with `0 new literal-guideline violations`.
3. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js`
   passed with `0 decision-boundary guideline violations`.
4. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-1.js`
   passed with `0 runtime-grammar-contract violations`.
5. `git diff --check -- src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js work/packages/done-20260507-systemic-topology-convergence-graph-diagnostic.md src/rebalancer/operation-workflow-owner-segment-1.js test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md`
   passed.
6. `npm run work:validate`
   passes on the current tree only after the successor package
   [Rolling Restart Topology Publication Missing-Active Startup Join
   Contacting Seed Timeout No-Progress Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md)
   records its required Subagent Sequencing Ledger entries. This done package
   does not independently claim repository-wide validator cleanliness.
7. `node test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js`
   confirms the new subtest
   `deferred dispatch retry reuses the retained priority REPLACE snapshot when visibility is deferred`
   passes, while one inherited unrelated owner-path convergence subtest still
   fails outside this package's scope and remains without a dedicated linked
   follow-on package from this closure record.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-deferred-dispatch-visibility-fallback-20260507T085020Z.report.json --fast-local --verbose`
   failed after `130.8s`, but removed the direct workflow-progress blocker:
   `sql_write_operations-p1` now reaches `ACTIVE`, and the representative path
   migrates to startup join `contacting_seed` timeout no-progress under the
   same top-level topology publication carrier.

## Migration

This package closes by migration. The repaired boundary was deferred
dispatch-retry visibility fallback inside
`operation_workflow_owner / workflow_progress`, where remote-owned priority
`REPLACE` retries previously abandoned retained operations when authoritative
visibility stayed deferred. The successor package is
[Rolling Restart Topology Publication Missing-Active Startup Join Contacting Seed Timeout No-Progress Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md),
which owns the `085020Z` startup join witness for `35a...`, `11601...`, and
`ebc4...`.
