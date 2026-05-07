# Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap request execution timeout behind topology publication missing-active reentry",
  "boundary": "Startup join / bootstrap request execution budget",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The bootstrap admission precheck seam is closed. The representative rerun now reaches epoch 1 PUBLISHED with snapshot coverage 1/5 and four missing-active nodes, while joiners 8be8... and ebc4... still fail in contacting_seed with raw fetch timeouts after roughly two client HTTP timeout windows. Supporting control-plane publication evidence on 11601... shows control_plane_publications-p1 source-removal safety moved forward from replacement-leader ownership pending to minimum-voter protection, so the strongest live hypothesis is no longer pre-admission pressure. The next direct owner seam is bootstrap request execution timeout: admitted /bootstrap requests can still overrun the joiner HTTP timeout inside assignment or reservation work instead of returning canonical BOOTSTRAP_NOT_READY with retryAfterMs.",
  "nextAction": "Extract the 023700Z contacting_seed timeout witnesses and supporting control-plane publication progression, add a focused bootstrap regression proving admitted bootstrap requests return canonical BOOTSTRAP_NOT_READY when assignment or reservation work stalls past one bounded server-side request budget, then repair only that owner path and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 023700Z contacting-seed timeout fixture",
    "Focused bootstrap request execution-timeout regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/bootstrap-api-constants.js",
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/bootstrap-join-admission-owner.js",
    "test/bootstrap/bootstrap-request-execution-timeout.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md)
closed by migration. The representative rerun no longer supports concurrent
pre-admission reservation-refresh stampede as the direct bootstrap owner.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z/rolling-restart/`.
3. Result: failed after `132.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology` and dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
6. Publication convergence is epoch `1` `PUBLISHED` with pending ACK count
   `0`, missing-published count `4`, and gate reasons
   `snapshot_coverage=1/5`,
   `publication_missing_active_node=11601...`,
   `publication_missing_active_node=35a891...`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Joiner logs on `8be8...` and `ebc4...` fail in `contacting_seed` with raw
   `fetch failed` transport errors after roughly `137-140s`, which matches
   repeated client-side HTTP timeout windows rather than one fast canonical
   bootstrap defer.
8. Final node diagnostics keep `35a...`, `8be8...`, and `ebc4...` in bootstrap
   phase `INIT` with `BOOTSTRAP_PHASE_INCOMPLETE`,
   `SQL_ENGINE_UNAVAILABLE`, `LEADER_METADATA_INCOMPLETE`,
   `BOOTSTRAP_NOT_READY`, and `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
9. Supporting seed-side evidence on `11601...` shows
   `control_plane_publications-p1-r4` handled a
   `replace_target_leader_election` request successfully, then the workflow
   advanced from `replacement leader ownership pending before safe removal` to
   `would drop voter-ready replicas below minimum (2/3)`. That narrows the
   control-plane publication seam, but it does not explain why joiners still
   observe transport-level bootstrap failure instead of a typed defer.
10. `ServiceLeaderReadinessOwner.waitForServiceLeaders()` does not block on a
    long convergence loop; it snapshots current leader readiness and returns
    immediately. The remaining long-running bootstrap path is therefore the
    admitted request owner path around assignment or reservation work.

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

- [ ] Extract the `023700Z` contacting-seed timeout fixture.
- [ ] Add the focused bootstrap request execution-timeout regression.
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

1. Focused `023700Z` contacting-seed timeout fixture passes.
2. Focused bootstrap request execution-timeout regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/bootstrap request execution-timeout boundary with
   replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
