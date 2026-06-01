# Rolling Restart Topology Publication Missing-Active Publication ACK-Pending Convergence Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-join-resume-budget-20260507T103600Z/rolling-restart/",
  "owner": "Topology publication missing-active ACK_PENDING convergence after startup contacting-seed closure",
  "boundary": "Topology publication owner / publication_convergence",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The join auto-resume budget repair closes the startup contacting-seed attempt-cap seam: 11601... now reaches ACTIVE and joiners continue retryable contacting_seed resumes past attempt 4 while elapsed budget remains. The representative rerun still fails, but the direct frontier only transiently lands on epoch 4 ACK_PENDING publication convergence before the deeper 103600Z witness set shows priority recovery closure blocked solely by sql_write_operations-p1 under operation_workflow_owner / workflow_progress.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-startup-replay-reentry.md for the lower workflow-progress startup replay boundary.",
  "proof": [
    "Focused 103600Z publication-convergence witness extraction",
    "Focused join auto-resume budget regression closing the prior startup seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence frontier analysis"
  ],
  "touchedFiles": [
    "src/bootstrap/node-joining-service-segment-2.js",
    "test/bootstrap/node-joining-service.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md",
  "closed": "2026-05-07",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-startup-replay-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Startup Join Contacting Seed Timeout No-Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md)
closed by migration. The join auto-resume budget repair no longer leaves
`11601...` stuck behind fixed attempt exhaustion in `contacting_seed`, so the
startup owner is no longer the direct blocker. The representative rerun now
selects epoch `4` `ACK_PENDING` publication convergence with one pending ACK,
three missing-published nodes, and only `2/5` active nodes.

Closure update on May 7, 2026: this package also closes by migration. The
publication-convergence witness extraction was necessary, but it did not remain
the deepest current owner. The same `103600Z` artifact shows priority recovery
closure blocked only by `sql_write_operations-p1`, while
`control_plane_publications-p1` and the other priority partitions are already
satisfied. The direct continuation therefore moves below publication to
`operation_workflow_owner / workflow_progress`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-join-resume-budget-20260507T103600Z/rolling-restart/`.
3. Result: failed after `134.0s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary reports `rootCauseClass=topology` and dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
6. Topology convergence analysis selects frontier edge
   `publication_ack_convergence` with owner
   `topology_publication_owner`, boundary `publication_convergence`, state
   `blocked`, `publicationStatus=ACK_PENDING`, `pendingAckCount=1`, and
   `missingPublishedCount=3`.
7. Later lower-frontier extraction proved publication convergence was not the
   deepest direct owner after all. Priority recovery closure witness data in
   the same artifact marks `control_plane_publications-p1`,
   `replica_operations-p1`, `sql_transaction_participants-p1`, and
   `sql_transactions-p1` satisfied while
   `sql_write_operations-p1` remains the only blocked partition.
8. `11601...` reaches `ACTIVE` in the fresh rerun, so the predecessor startup
   `contacting_seed` seam is closed enough to stop owning the representative
   blocker.
9. The fresh inactive set is `35a...`, `ebc4...`, and `8be8...`, while the
   seed snapshot lane records `snapshotCoverage=1/5`, `publishedActive=2/5`,
   `pendingAck=1`, and `prioritySpread=pending`.
10. The selected lower blocker is `operation_workflow_owner /
    workflow_progress` on operation
    `413fb5f0-8cc2-4b66-88b4-ddcc3457d40f`, which the artifact first records as
    `persisted_not_dispatched` and later as `dispatched_waiting_progress`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `103600Z` publication-convergence witness set for
   `35a...`, `ebc4...`, `8be8...`, and seed `7493...`.
2. Preserve the closed startup join auto-resume-budget regression from the
   predecessor package.
3. Record the lower workflow-progress continuation instead of widening this
   package beyond the publication witness-extraction slice.

## Out Of Scope

1. Reopening the closed startup `contacting_seed` package unless a fresh rerun
   again selects that lower owner directly.
2. Harness-only timeout increases or topology exemptions that hide the named
   publication-convergence debt.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `topology_publication_owner / publication_convergence` owns the boundary
   when topology convergence selects `publication_ack_convergence` as the
   first blocked frontier with one pending ACK and the same missing-published
   set seen by the active gate.
2. `operation_workflow_owner / workflow_progress` became the successor direct
   owner once the deeper witness set showed publication closure blocked only by
   `sql_write_operations-p1`.
3. Startup join `contacting_seed` is historical proof only while `11601...`
   remains active and the publication frontier is now the first selected edge.

Canonical contract shape:

1. The report, failure bundle, and topology-convergence graph must agree on
   one direct owner for epoch `4` `ACK_PENDING`.
2. The pending ACK and missing-published nodes must share one explicit causal
   path instead of a mixed publication/workflow/startup explanation.
3. If a lower owner is selected, this package must split a successor package in
   the same work cycle.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Codex migration review session 2026-05-07` reviewed
      `work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md`
      on the shared rolling-restart topology-publication boundary and found no
      predecessor bookkeeping or closure fixes blocking this successor package.
- [x] Fix subagent recorded or explicitly not needed:
      `Codex migration fix session 2026-05-07` was `not-needed` after that
      predecessor review.
- [x] Implementation subagent recorded:
      `Codex migration implementation session 2026-05-07` opened this package
      only after the review/fix ledger was clean and limited work to witness
      extraction and migration bookkeeping for the publication-convergence
      boundary before the lower owner split.

## Residual Closure Inventory

- [x] Extract the `103600Z` publication-convergence witness fixture.
- [x] Decide whether the direct owner remains publication ACK convergence or
      migrates to a lower workflow-progress or snapshot-coverage owner.
- [x] Split the lower workflow-progress continuation into a successor package
      in the same work cycle.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded from the predecessor closure evidence and
      current successor worktree before new publication-boundary edits begin.

Closure:

- [x] Same guardrails after successor implementation are owned by the linked
      workflow-progress successor package.
- [x] No relevant publication-witness guardrail count increased before this
      package migrated.
- [x] No new publication-witness owner-path, decision-boundary,
      runtime-grammar, or metadata-gateway violation remains in this
      migration package.
- [x] Out-of-scope inherited violation follow-on is owned by the linked
      workflow-progress successor package where the lower owner continues.

## Validation

1. `npx tap test/bootstrap/node-joining-service.test.js`
   passed with the predecessor join auto-resume-budget regressions in place.
2. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js`,
   `node scripts/check-runtime-grammar-contracts.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js`,
   `node scripts/check-guideline-literals.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`,
   and `git diff --check -- src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`
   all passed before this successor package opened.
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json --fast-local --verbose`
   failed after `134.0s`, but moved the direct owner away from startup join:
   `11601...` reached `ACTIVE`, the rerun stayed resumable past attempt `4`
   for canonical `contacting_seed` bootstrap-not-ready failures, and the live
   blocker shifted to epoch `4` `ACK_PENDING` publication convergence.
4. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json`
   reported `rootCauseClass=topology` and dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json`
   and
   `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-join-resume-budget-20260507T103600Z/rolling-restart/failure-bundle.json`
   both selected `publication_ack_convergence` as the first blocked frontier
   with owner `topology_publication_owner / publication_convergence`.
6. Follow-up witness extraction from the same `103600Z` playback showed
   publication closure blocked only by `sql_write_operations-p1` under
   `operation_workflow_owner / workflow_progress`, so this package closes by
   migration to the lower owner instead of widening the publication slice.

## Migration

This package closes by migration. Publication ACK convergence remained useful
top-level evidence after the startup join repair, but the deeper current owner
for `103600Z` is
[Rolling Restart Topology Publication Missing-Active Operation Workflow Progress Startup Replay Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-startup-replay-reentry.md),
which owns the startup replay gap for already-ready dispatch targets.
