# Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap admission precheck pressure behind topology publication missing-active reentry",
  "boundary": "Startup join / bootstrap admission precheck pressure",
  "dominantReason": "publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a",
  "currentState": "The priority operation-scheduling seam is closed. The representative rerun now reaches epoch 5 ACK_PENDING with only sql_write_operations-p1 left recovering_in_flight, but joiners 8be8... and ebc4... remain stuck in contacting_seed / bootstrap INIT after the seed had already reached seed_join_ready. Seed-side logs show control-plane query pressure during the same window, and the strongest live hypothesis is that /bootstrap still performs expensive MOVE_REPLICA reservation refresh work before it acquires the bounded bootstrap admission slot, allowing concurrent join requests to stampede the pre-admission hot path.",
  "nextAction": "Extract the 021309Z startup/bootstrap witnesses and seed-side bootstrap-request timing evidence; add a focused bootstrap regression that proves saturated concurrent join requests do not enter the expensive reservation precheck path after the first request claims the bounded slot; then repair bootstrap request sequencing so admission is acquired before expensive reservation refresh work or otherwise guards that work behind the same slot.",
  "proof": [
    "Focused 021309Z startup/bootstrap admission precheck fixture",
    "Focused bootstrap concurrent pre-admission pressure regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "test/bootstrap/bootstrap-api.test-part-3.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md)
closed by migration. The representative rerun no longer selects
`rebalancer_leader / operation_scheduling` as the live owner. The top-level
gate still fails `rolling-restart`, but the current direct seam has moved back
into startup/bootstrap request handling under concurrent join pressure.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z/rolling-restart/`.
3. Result: failed after `133.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology` and dominant reason
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
6. Publication convergence is epoch `5` `ACK_PENDING` with pending ACK count
   `1`, missing-published count `2`, and gate reasons
   `priority_partitions_not_spread`, `publication_epoch_pending`,
   `snapshot_coverage=2/5`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Priority recovery is now subordinate context: `sql_write_operations-p1`
   remains `recovering_in_flight` with pending operation
   `f57d2c14-afae-4f6a-a626-897ff8934175`, while all earlier
   `eligible_but_no_operation_created` evidence is closed.
8. Playback events show the seed passed `setup.seed.bootstrap.ready` with
   startup gate state `seed_join_ready` before joiners `35a...`, `11601...`,
   `ebc4...`, and `8be8...` were started, so the live owner is not the
   original bootstrap-ready gate.
9. Joiner logs on `ebc4...` and `8be8...` fail in `contacting_seed` with
   `Failed to contact seed node: fetch failed`, and final node diagnostics keep
   both in bootstrap phase `INIT` with `BOOTSTRAP_PHASE_INCOMPLETE`,
   `SQL_ENGINE_UNAVAILABLE`, `LEADER_METADATA_INCOMPLETE`,
   `BOOTSTRAP_NOT_READY`, `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, and
   admin-port `ECONNREFUSED`.
10. Seed-side logs on `11601...` show control-plane query pressure during the
    same window, including `SELECT * FROM nodes WHERE node_id = ?` and
    `SELECT * FROM services WHERE node_id = ?` timing out at `1500ms`, plus an
    in-flight operation owner query taking `8206ms`.
11. In `BootstrapRequestOwner.handleBootstrapRequest()`, the expensive
    `getBlockingMoveReplicaBootstrapAdmissions(now)` call still runs before
    the bounded `maxConcurrentBootstrapRequests` saturation check and before
    `acquireBootstrapAdmission(...)`, while the underlying reservation path can
    fall back to `executeBootstrapControlPlaneQuery(...)` when cache coverage
    is incomplete.
12. The strongest live hypothesis is therefore a pre-admission stampede:
    concurrent join requests can all enter the expensive reservation-refresh
    path even though bootstrap admission is configured to admit only one
    request at a time.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `021309Z` startup/bootstrap fixture for the two blocked
   joiners, the seed bootstrap timeline, and seed-side reservation-query
   pressure evidence.
2. Prove whether the live owner is bootstrap request pre-admission pressure
   rather than generic network fetch instability or stale publication
   observation.
3. Add a focused bootstrap regression that covers concurrent join requests and
   the expensive reservation precheck path.
4. Repair only the selected startup/bootstrap owner path.
5. Preserve the closed priority follow-up target-readiness regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed rebalancer priority-follow-up package unless
   `eligible_but_no_operation_created` re-enters directly.
2. Harness-only timeout increases or networking exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `bootstrap-request-owner` owns join-time admission sequencing for
   `/bootstrap`.
2. `move-replica-assignment-owner` owns reservation visibility and durable
   MOVE_REPLICA assignment refresh used by bootstrap admission.
3. Joiner `contacting_seed` failures are direct evidence only if they can be
   tied to bounded seed-side bootstrap request behavior rather than stale
   downstream observation.

Canonical contract shape:

1. The bounded bootstrap admission slot must protect the expensive reservation
   precheck path, not only later assignment reservation work.
2. Concurrent join requests must either enter one canonical admitted owner
   path or receive one explicit admission/backpressure response before they
   trigger expensive control-plane rereads.
3. Failure bundle, playback events, and seed/joiner runtime evidence must
   agree on one canonical startup/bootstrap owner before the package closes.

## Residual Closure Inventory

- [ ] Extract the `021309Z` startup/bootstrap admission precheck fixture.
- [ ] Add the focused concurrent bootstrap pre-admission pressure regression.
- [ ] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. Focused `021309Z` startup/bootstrap admission precheck fixture passes.
2. Focused bootstrap owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/bootstrap admission precheck pressure boundary with
   replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
