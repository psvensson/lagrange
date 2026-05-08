# Rolling Restart Topology Publication Missing-Active Startup Join Contacting Seed Timeout No-Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-join-resume-budget-20260507T103600Z/rolling-restart/",
  "owner": "Startup join contacting-seed timeout no-progress behind topology publication missing-active PUBLISHED convergence",
  "boundary": "Startup join / contacting-seed timeout no-progress",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The startup join contacting-seed seam is closed by migration. The representative rerun after the join auto-resume budget repair brings 11601... to ACTIVE and keeps contacting_seed retries resumable past attempt 4 while elapsed budget remains, but the live blocker moves to epoch 4 ACK_PENDING publication convergence with pendingAck=1, missingPublished=3, active=2/5, and snapshotCoverage=1/5.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md for the direct topology_publication_owner / publication_convergence frontier.",
  "proof": [
    "Focused bootstrap-request admission regression for authoritative bootstrap-join blockers",
    "Focused seed-contact retry contract regression preserving configured request timeout after retryable seed evidence",
    "Focused join auto-resume budget regression preserving elapsed-only resume for contacting_seed bootstrap-not-ready failures",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Focused 095019Z contacting-seed/bootstrap-not-ready witness extraction"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/bootstrap-api.test-part-3.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "test/bootstrap/node-joining-service.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Progress Event-Driven Reentry](./done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md)
closed by migration. The representative rerun no longer selects priority
workflow progress as the direct owner. The focused bootstrap-request admission
repair lets `11601...` clear `/bootstrap` admission and reach `ACTIVE`, but
startup convergence still stops with three nodes timing out in
`contacting_seed` and only one surviving topology snapshot lane responding.

Update on May 7, 2026 after the contact-seed timeout-contract repair: the
request-timeout starvation seam is closed. The representative rerun now moves
`35a...`, `ebc4...`, and `8be8...` through `contacting_seed` into `ACTIVE`,
raises snapshot coverage to `3/5`, and leaves only `11601...` inactive. The
direct startup owner remains `contacting_seed`, but it is now a typed
seed-owned `BOOTSTRAP_NOT_READY` no-progress seam rather than raw HTTP timeout
silence.

Closure update on May 7, 2026: the repeated-evidence contact-seed contraction
hypothesis did not hold up under the representative rerun. The direct seam was
one layer higher: join auto-resume stopped retryable `contacting_seed`
bootstrap-not-ready failures at fixed attempt `4` even while elapsed budget
remained. This slice therefore reverts the repeated-evidence contraction,
keeps the earlier timeout-contract repair, and moves the lower owner into
`NodeJoiningService` join-resume policy. The fresh representative rerun
`rolling-restart-after-join-resume-budget-20260507T103600Z` proves the startup
owner is now closed by migration: `11601...` reaches `ACTIVE`, logs on
`8be8...` show `attemptBudgetMode="elapsed_only"` with retries continuing past
attempt `4`, and the live blocker migrates to epoch `4` `ACK_PENDING`
publication convergence with missing-published nodes `35a...`, `ebc4...`, and
`8be8...`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z/rolling-restart/`.
3. Focused owner proof now exists locally in two slices:
   `/bootstrap` admission preserves the startup-complete adapter when no
   authoritative bootstrap-join snapshot is available, defers authoritative
   blocked bootstrap-join snapshots after startup-complete, preserves the
   recovery-authorized `INIT` projection, and the joiner no longer reuses
   retry-after hints as HTTP timeout caps once retryable seed evidence exists.
4. Focused validation passes on the combined slice:
   `npx tap test/bootstrap/node-joining-service.test.js test/bootstrap/bootstrap-request-execution-timeout.test.js test/bootstrap/bootstrap-api.test-part-3.js`,
   `check-guideline-decision-boundaries`, `check-runtime-grammar-contracts`,
   `check-guideline-boundary-mode-contracts`, `check-guideline-literals`, and
   `git diff --check`.
5. Result: latest representative rerun failed after `132.3s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. The carrier moved forward materially: the rerun now reaches epoch `4`
   `PUBLISHED` with `active=4/5`, `snapshotCoverage=3/5`,
   `publishedActive=2/5`, `pendingAck=0`, and `priorityRecoveryInvariants=passed`.
8. The request-timeout starvation seam is closed:
   nodes `35a...`, `ebc4...`, and `8be8...` all progress through
   `contacting_seed` and reach `ACTIVE`.
9. Only node `11601...` remains inactive. Its joiner log no longer shows raw
   `Request timeout after 1000ms`; it now repeatedly surfaces canonical
   `Seed bootstrap not ready` failures with retry-after guidance around
   `1000ms`, while its local bootstrap-readiness projection remains blocked at
   `INIT` by `control_snapshot_authority_unavailable` and
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
10. Publication and priority-recovery summaries are supporting evidence rather
    than the lower owner: `priority_spread_pending` and
    `needs_operation|operation_stalled` remain because `11601...` never joins,
    not because the repaired `contacting_seed` seam regressed into raw
    transport failure again.
11. Harness-level `readiness_probe_timeout_fallback` on seed `7493...` and
    `admin_not_ready` on `11601...` are observation symptoms after the same
    startup no-progress seam; no playback warning or seed log witness selects a
    lower admin-snapshot owner.
12. The live blocker therefore stays on startup join `contacting_seed`, but
    the next slice must narrow the new typed `BOOTSTRAP_NOT_READY` no-progress
    seam on `11601...` rather than the closed request/transport timeout seam.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `092659Z` startup/contacting-seed plus admin-probe
   witness set for nodes `35a...`, `ebc4...`, `8be8...`, and seed `7493...`.
2. Decide whether the direct owner is still admitted seed-contact
   request/transport starvation or has shifted to seed-side admin snapshot
   capture/readiness timeout under the earlier epoch `1` publication carrier.
3. Preserve the focused `/bootstrap` admission regression that now defers
   authoritative blocked bootstrap-join snapshots after startup-complete.
4. Preserve the closed deferred-dispatch visibility regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed priority workflow-progress package unless the same
   deferred-dispatch visibility seam re-enters directly.
2. Treating supporting priority-recovery witnesses as the owner while blocked
   and unresolved partition counts remain `0`.
3. Harness-only timeout increases or networking exemptions that hide the named
   startup no-progress debt.
4. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Startup join / `contacting_seed` owns the boundary when the same
   missing or unpublished nodes never progress beyond seed contact and no
   lower publication or workflow owner directly explains their absence.
2. Explicit `publication_missing_active_node=<node>` is the scenario carrier
   only while a lower startup owner explains why those nodes remain missing
   from the published active set.
3. Priority workflow progress is supporting evidence only while the
   representative rerun records no blocked or unresolved priority partition.

Canonical contract shape:

1. Failure bundle, triage summary, publication convergence, joiner logs, and
   playback warnings must agree on one direct owner for the same representative
   state, currently epoch `1` `PUBLISHED` with `snapshotCoverage=1/5`,
   `active=2/5`, and four missing-published nodes.
2. The focused proof must show which bounded `contacting_seed` phase does not
   complete: seed-side bootstrap admission, seed response preparation, admin
   snapshot capture/readiness, or another lower request/transport seam.
3. If a lower owner other than seed-contact timeout is selected, this package
   must narrow to that owner or split a successor package in the same work
   cycle.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `fresh review handoff 2026-05-07` reviewed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md`
      on the shared rolling-restart topology publication migration boundary;
      result `fixes-required` for package bookkeeping before startup
      contacting-seed implementation starts: correct the predecessor's stale
      `npm run work:validate` success claim, remove the unsupported claim that
      all inherited out-of-scope debt already has linked follow-on coverage,
      and seed this package's review/fix ledger.
- [x] Fix subagent recorded or explicitly not needed:
      `Codex fix-subagent session 2026-05-07` updated only the predecessor
      and current package bookkeeping: rewrote the predecessor's validation
      and inherited-debt closure text to match the current tree, populated
      this package's sequencing ledger, and did not start startup boundary
      implementation or edit runtime/test source files.
- [x] Implementation subagent recorded:
      `Euclid` (`019e01b6-d4d5-7c42-89f3-4bf68cb64caa`) claimed the startup
      boundary after the review/fix ledger was clean with ownership limited to
      `src/bootstrap/owners/bootstrap-request-owner.js` and
      `test/bootstrap/bootstrap-api.test-part-3.js`. The worker wait stalled
      without a returned patch, so the parent Codex session completed the same
      scoped implementation locally: `/bootstrap` admission now preserves the
      startup-complete adapter when no authoritative bootstrap-join snapshot is
      available, defers authoritative blocked bootstrap-join snapshots after
      startup-complete, preserves recovery-authorized `INIT` projection, and
      adds the focused regression in `bootstrap-api.test-part-3.js`.
- [x] Continuation review/fix/implementation recorded:
      `Codex continuation review session 2026-05-07` reviewed the same active
      package against the latest `095019Z` witness on the shared startup join
      / `contacting_seed` boundary and found no predecessor bookkeeping or
      package-closure fixes blocking resumed implementation. `Codex
      continuation fix session 2026-05-07` reverted the superseded
      repeated-evidence contact-seed contraction after the representative rerun
      disproved that hypothesis. `Codex continuation implementation session
      2026-05-07` then repaired the direct lower owner in
      `src/bootstrap/node-joining-service-segment-2.js`, added focused join
      auto-resume regressions in `test/bootstrap/node-joining-service.test.js`,
      preserved the earlier seed-contact timeout-contract behavior, and updated
      this package file.

## Residual Closure Inventory

- [x] Add the focused regression and repair for the selected bootstrap-request
      admission seam.
- [x] Rerun focused proof, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Extract the `092659Z` contacting-seed plus admin-probe witness fixture.
- [x] Decide that the direct startup owner stays on seed-contact rather than
      shifting to a seed-side admin snapshot/readiness timeout owner.
- [x] Add the focused regression and repair that preserves the configured
      request timeout after retryable seed evidence is retained.
- [x] Extract the `095019Z` typed bootstrap-not-ready witness on `11601...`.
- [x] Decide that the direct lower owner is join auto-resume attempt-budget
      exhaustion on canonical `BOOTSTRAP_NOT_READY` contact-seed failures, not
      a new seed-owned bootstrap dependency defer boundary.
- [x] Add the focused regression and repair that preserves elapsed-budget
      retries for canonical `contacting_seed` bootstrap-not-ready failures
      after the fixed attempt cap would otherwise stop progress.
- [x] Split or migrate the package after the startup seam closes and the
      representative blocker moves to a lower publication-convergence owner.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/bootstrap/node-joining-service.test.js test/bootstrap/bootstrap-request-execution-timeout.test.js test/bootstrap/bootstrap-api.test-part-3.js`
   passed, covering both the earlier `/bootstrap` admission regression and the
   new seed-contact retry-contract regression.
2. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/phases/contact-seed-phase.js`
   reported `0` violations.
3. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/phases/contact-seed-phase.js`
   reported `0` violations.
4. `node scripts/check-guideline-boundary-mode-contracts.js src/bootstrap/phases/contact-seed-phase.js`
   reported `0` hotspot violations.
5. `node scripts/check-guideline-literals.js src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`
   reported `0` new literal-guideline violations.
6. `git diff --check -- src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`
   returned clean.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z.report.json --fast-local --verbose`
   failed after `132.3s`, but materially advanced the startup boundary:
   `active=4/5`, `snapshotCoverage=3/5`, epoch `4` `PUBLISHED`,
   `pendingAck=0`, and only `11601...` remains inactive. Nodes `35a...`,
   `ebc4...`, and `8be8...` now reach `ACTIVE`, while `11601...` no longer
   times out on raw HTTP transport and instead exhausts `contacting_seed`
   progress through canonical `Seed bootstrap not ready` failures.
8. `npx tap test/bootstrap/node-joining-service.test.js` passed after adding
   focused regressions proving that canonical `contacting_seed`
   `BOOTSTRAP_NOT_READY` failures continue auto-resuming on elapsed budget
   after fixed attempt `4`, while the fixed attempt cap still stops other
   retryable join failures.
9. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js`,
   `node scripts/check-runtime-grammar-contracts.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js`,
   `node scripts/check-guideline-literals.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`,
   and `git diff --check -- src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`
   all passed for the continuation slice.
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json --fast-local --verbose`
    failed after `134.0s`, but it closed this startup seam by migration:
    `11601...` reaches `ACTIVE`, `8be8...` logs show retryable
    `contacting_seed` resumes continuing with `attemptBudgetMode="elapsed_only"`
    and `maxAttempts=null`, and the live blocker moves to epoch `4`
    `ACK_PENDING` publication convergence with missing-published nodes
    `35a...`, `ebc4...`, and `8be8...`.
11. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json`
    reported `rootCauseClass=topology` and dominant reason
    `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
12. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-join-resume-budget-20260507T103600Z.report.json`
    and the matching failure-bundle analysis both selected
    `topology_publication_owner / publication_convergence` at frontier edge
    `publication_ack_convergence` with `publicationStatus=ACK_PENDING`,
    `pendingAckCount=1`, and `missingPublishedCount=3`, so the successor
    package above now owns the direct boundary.
