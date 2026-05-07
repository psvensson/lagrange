# Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap admission precheck pressure behind topology publication missing-active reentry",
  "boundary": "Startup join / bootstrap admission precheck pressure",
  "dominantReason": "publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a",
  "currentState": "The bootstrap admission precheck seam is closed. The focused regression now proves the bounded bootstrap slot is claimed before MOVE_REPLICA reservation-refresh work, and the representative rerun no longer supports pre-admission stampede as the live owner. The new artifact reaches epoch 1 PUBLISHED with snapshot coverage 1/5, repeated contacting_seed fetch timeouts on fresh joiners, and supporting control-plane publication source-removal safety evidence on control_plane_publications-p1. The representative blocker therefore migrates to bootstrap request execution timeout rather than bootstrap admission precheck pressure.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md to add a focused regression proving admitted bootstrap requests return canonical BOOTSTRAP_NOT_READY instead of hanging until joiner HTTP timeout when assignment/reservation work stalls, then repair only that owner path.",
  "proof": [
    "Focused 021309Z startup/bootstrap admission precheck fixture",
    "Focused bootstrap concurrent pre-admission pressure regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/bootstrap-request-admission-precheck.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md",
  "closed": "2026-05-07",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md).

## Closure Summary

1. Added a focused regression proving the bounded bootstrap admission slot must
   be claimed before expensive MOVE_REPLICA reservation-refresh work begins.
2. Repaired `src/bootstrap/owners/bootstrap-request-owner.js` so
   `/bootstrap` acquires its bounded admission lease before it runs the
   reservation precheck, preventing concurrent join requests from stampeding
   the same control-plane refresh path.
3. Focused bootstrap proof and touched-file guardrails all passed after the
   repair.
4. Representative rerun
   `rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z`
   materially changed the failure shape and removed the pre-admission pressure
   hypothesis from the live owner boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z/rolling-restart/`.
3. Result: failed after `132.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology`, but the dominant reason moved to
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
6. Publication convergence is now epoch `1` `PUBLISHED` with pending ACK count
   `0`, missing-published count `4`, and gate reasons
   `snapshot_coverage=1/5`,
   `publication_missing_active_node=11601...`,
   `publication_missing_active_node=35a891...`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Priority recovery no longer selects unresolved operation-creation or
   scheduling debt. The remaining supporting progress witness is
   `control_plane_publications-p1` under
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`.
8. Playback events still show the seed passed `setup.seed.bootstrap.ready`
   before joiners started, so the live owner remains downstream of the
   original bootstrap-ready gate.
9. Joiner logs on `8be8...` and `ebc4...` now fail twice in `contacting_seed`
   with raw `fetch failed` transport errors after roughly `138-140s`, which is
   consistent with repeated client-side HTTP timeout windows rather than a fast
   canonical bootstrap defer response.
10. Supporting seed-side logs on `11601...` show the critical
    `control_plane_publications-p1-r4` replacement replica handled a
    `replace_target_leader_election` request successfully, then the workflow
    moved from `replacement leader ownership pending before safe removal` to
    `would drop voter-ready replicas below minimum (2/3)`. That evidence keeps
    source-removal safety in scope as supporting context, but it no longer
    explains the raw joiner transport failure directly.
11. The focused bootstrap regression now proves the old pre-admission
    hypothesis false: once the first request holds the slot, later requests do
    not enter reservation precheck work.
12. The package therefore closes by migration. The next direct owner hypothesis
    is bootstrap request execution timeout: admitted `/bootstrap` requests can
    still overrun the joiner HTTP timeout while assignment or reservation work
    is stalled, so joiners observe transport failure instead of the canonical
    `BOOTSTRAP_NOT_READY` defer contract.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed concurrent bootstrap pre-admission pressure regression.
2. Record the `023700Z` blocker migration from pre-admission pressure to
   bootstrap request execution timeout with supporting source-removal safety
   context.

## Out Of Scope

1. Reopening the closed rebalancer priority-follow-up package unless
   `eligible_but_no_operation_created` re-enters directly.
2. Relaxing `control_plane_publications-p1` minimum-replica safety or other
   critical remove-safety invariants without a new owner-boundary proof.
3. Harness-only timeout increases or networking exemptions.
4. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `bootstrap-request-owner` owns join-time admission sequencing for
   `/bootstrap`.
2. `move-replica-assignment-owner` owns reservation visibility and durable
   MOVE_REPLICA assignment refresh used by bootstrap admission.
3. Joiner `contacting_seed` transport failures are direct evidence only when
   the seed fails to emit the canonical bootstrap defer contract within one
   bounded request-owner budget.

Canonical contract shape:

1. The bounded bootstrap admission slot must protect the expensive reservation
   precheck path, not only later assignment reservation work.
2. Concurrent join requests must either enter one canonical admitted owner
   path or receive one explicit admission/backpressure response before they
   trigger expensive control-plane rereads.
3. When that pre-admission contract is green but joiners still time out on raw
   fetch failures, the blocker has migrated to a different bootstrap or
   topology boundary.

## Residual Closure Inventory

- [x] Extract the `021309Z` startup/bootstrap admission precheck fixture.
- [x] Add the focused concurrent bootstrap pre-admission pressure regression.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.
- [x] Split the migrated bootstrap request execution-timeout seam into one new
      active package before closure.

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

1. `npx tap test/bootstrap/bootstrap-api.test-part-3.js`
   passed.
2. `npx tap test/bootstrap/move-replica-assignment-token.test.js --grep "BootstrapAPI bootstrap admission defers on cached MOVE_REPLICA reservations without replica_operations SQL rereads"`
   passed.
3. `npx tap test/bootstrap/bootstrap-api.test-part-3.js test/bootstrap/bootstrap-request-admission-precheck.test.js`
   passed.
4. `node scripts/check-guideline-literals.js src/bootstrap/owners/bootstrap-request-owner.js test/bootstrap/bootstrap-request-admission-precheck.test.js`
   returned `0 new literal-guideline violations`.
5. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/owners/bootstrap-request-owner.js`
   returned `0 decision-boundary guideline violations`.
6. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/owners/bootstrap-request-owner.js`
   returned `0 runtime-grammar-contract violations`.
7. `npx eslint --no-warn-ignored src/bootstrap/owners/bootstrap-request-owner.js test/bootstrap/bootstrap-request-admission-precheck.test.js`
   passed.
8. `git diff --check`
   passed.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z.report.json --fast-local --verbose`
   failed after `132.6s` with explicit blocker migration notes recorded above.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/bootstrap admission precheck pressure boundary with
   replayable evidence.
2. Sprint bookkeeping points to the bootstrap request execution-timeout package
   as the sole current representative owner.
