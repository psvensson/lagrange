# Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap request execution timeout behind topology publication missing-active reentry",
  "boundary": "Startup join / bootstrap request execution budget",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The bootstrap admission precheck seam and admitted bootstrap request timeout seam are both now closed. The representative rerun reaches epoch 4 PUBLISHED with pending ACK count 0 and snapshot coverage 2/5, seed-side logs prepare canonical bootstrap responses, and the normalized blocker moves forward to rebalancer_leader / operation_scheduling on sql_write_operations-p1.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md for the returned priority recovery operation-scheduling boundary.",
  "proof": [
    "Focused 023700Z contacting-seed timeout fixture",
    "Focused bootstrap request execution-timeout regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/bootstrap-api-constants.js",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/bootstrap-join-admission-owner.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "test/bootstrap/bootstrap-request-execution-timeout.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md)
closed by migration. The representative rerun no longer supports concurrent
pre-admission reservation-refresh stampede as the direct bootstrap owner.

Closure update on May 7, 2026: admitted `/bootstrap` requests now carry one
bounded execution budget through blocking-admission reads, reservation
expiration, exclusion filtering, and MOVE_REPLICA reservation persistence. The
focused regression proves this path returns canonical
`BOOTSTRAP_NOT_READY` with retry semantics before the joiner-side HTTP timeout
window expires. The representative rerun
`test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json`
no longer selects startup join / bootstrap request execution budget as the
live boundary. Publication reaches epoch `4` `PUBLISHED` with pending ACK
count `0`, seed-side logs prepare bootstrap responses for joiners, and the
dominant blocker moves back to `rebalancer_leader / operation_scheduling` on
`sql_write_operations-p1`.

## Closing Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z/rolling-restart/`.
3. Result: failed after `131.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class is now `topology`, dominant reason
   `priority_recovery_operation_scheduling_event_driven`, and failure class
   `priority_recovery_progress_blocked`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, recovery protocol state `priority_spread_pending`, and gate reasons
   `priority_partitions_not_spread` plus `snapshot_coverage=2/5`.
7. The selected primary witness is `sql_write_operations-p1` with semantic
   state `needs_operation`, owner `rebalancer_leader`, boundary
   `operation_scheduling`, wait mode `event_driven`, next action
   `create_recovery_operation`, and progress class
   `eligible_but_no_operation_created`.
8. Supporting priority-recovery context keeps `sql_transactions-p1` in
   `recovering_in_flight` behind pending operation
   `40bb8fa6-d839-4a34-8d81-2aa9c0c22780`.
9. Seed-side logs during the rerun now include prepared bootstrap responses,
   including a `MOVE_REPLICA` bootstrap reply and a later
   `CREATE_SELF_HOSTED` bootstrap reply for joiner `8be8...`. That evidence
   shows the admitted bootstrap request owner no longer dominates the live
   scenario boundary.
10. Active-gate progress still stalls at active `2/5`, snapshot coverage
    `2/5`, and missing-active nodes `11601...`, `8be8...`, and `ebc4...`, but
    the normalized blocker signature now includes
    `priority_recovery_progress_class=eligible_but_no_operation_created`
    rather than a bootstrap transport timeout signature.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `023700Z` startup/bootstrap execution-timeout fixture
   for joiner timeout windows and the supporting control-plane publication
   progression.
2. Add a focused regression proving admitted `/bootstrap` requests return a
   canonical `BOOTSTRAP_NOT_READY` response when assignment or reservation work
   stalls beyond one bounded server-side execution budget.
3. Repair only the selected startup/bootstrap request owner path.
4. Preserve the closed concurrent pre-admission pressure regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed bootstrap admission precheck package unless that
   direct owner seam re-enters.
2. Relaxing `control_plane_publications-p1` minimum-replica safety or other
   critical remove-safety invariants without a new owner proof.
3. Harness-only timeout increases or networking exemptions.
4. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `bootstrap-request-owner` owns join-time execution budget and canonical
   defer semantics for admitted `/bootstrap` requests.
2. `bootstrap-join-admission-owner` owns assignment or reservation selection
   used inside that bounded request path.
3. Control-plane publication or source-removal safety is supporting evidence
   unless it becomes the direct canonical blocker for the same timeout window.

Canonical contract shape:

1. A joiner that reaches the admitted `/bootstrap` owner path must either
   complete successfully or receive one canonical `BOOTSTRAP_NOT_READY`
   response with bounded retry semantics before the joiner HTTP client times
   out.
2. Pressure or slow assignment visibility may defer bootstrap, but it must not
   degrade into repeated transport-level `fetch failed` outcomes while the
   request owner still holds the canonical path.
3. Failure bundle, playback events, and focused regression proof must agree on
   one owner boundary before the package closes.

## Residual Closure Inventory

- [x] Extract the `023700Z` contacting-seed timeout fixture.
- [x] Add the focused bootstrap request execution-timeout regression.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/bootstrap/bootstrap-request-execution-timeout.test.js`
   passed.
2. `npx tap test/bootstrap/bootstrap-api.test-part-3.js test/bootstrap/bootstrap-request-admission-precheck.test.js test/bootstrap/bootstrap-request-execution-timeout.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/bootstrap/bootstrap-api-constants.js src/bootstrap/bootstrap-api.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/owners/move-replica-assignment-owner.js test/bootstrap/bootstrap-request-execution-timeout.test.js`
   passed with `0 new literal-guideline violations`.
4. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/bootstrap-api.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/owners/move-replica-assignment-owner.js`
   passed with `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/bootstrap-api.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/owners/move-replica-assignment-owner.js`
   passed with `0 runtime-grammar-contract violations`.
6. `npx eslint --no-warn-ignored src/bootstrap/bootstrap-api-constants.js src/bootstrap/bootstrap-api.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/owners/move-replica-assignment-owner.js test/bootstrap/bootstrap-request-execution-timeout.test.js`
   passed.
7. `git diff --check`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json --fast-local --verbose`
   failed after `131.7s`, but moved the blocker forward from startup join /
   bootstrap request execution budget to
   `rebalancer_leader / operation_scheduling` while preserving the top-level
   topology publication missing-active re-entry gate.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/bootstrap request execution-timeout boundary with
   replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.

## Migration

This package closes by migration. The repaired boundary was admitted
`/bootstrap` request execution budget ownership inside the bootstrap API and
MOVE_REPLICA reservation path. The successor package is
[Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Event-Driven Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md),
which owns the returned `sql_write_operations-p1`
`eligible_but_no_operation_created` witness in the `031003Z` artifact.
