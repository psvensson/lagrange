# Rolling Restart Topology Publication Missing-Active Startup Join Contacting Seed Timeout No-Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-contact-seed-timeout-contract-20260507T095019Z/rolling-restart/",
  "owner": "Startup join contacting-seed timeout no-progress behind topology publication missing-active PUBLISHED convergence",
  "boundary": "Startup join / contacting-seed timeout no-progress",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The focused bootstrap-request admission repair still holds, and the contact-seed timeout-contract repair closes the raw request-timeout starvation seam. The latest representative rerun now reaches active=4/5 with snapshotCoverage=3/5 at epoch 4 PUBLISHED: nodes 35a..., ebc4..., and 8be8... reach ACTIVE, while 11601... remains the only inactive joiner and now surfaces canonical Seed bootstrap not ready defers instead of generic transport timeouts. The direct boundary stays in startup join contacting_seed, but it narrows from request/transport starvation to seed-owned bootstrap-not-ready no-progress for 11601....",
  "nextAction": "Extract the 095019Z typed bootstrap-not-ready witness on 11601..., decide whether the lower owner is seed-side bootstrap dependency defer or join auto-resume hold-open/exhaustion on canonical BOOTSTRAP_NOT_READY responses, then repair only that direct startup seam before the next representative rerun.",
  "proof": [
    "Focused bootstrap-request admission regression for authoritative bootstrap-join blockers",
    "Focused seed-contact retry contract regression preserving configured request timeout after retryable seed evidence",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Focused 095019Z contacting-seed/bootstrap-not-ready witness extraction"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/bootstrap-api.test-part-3.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "test/bootstrap/node-joining-service.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-join-contacting-seed-timeout-no-progress-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md"
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
- [ ] Extract the `095019Z` typed bootstrap-not-ready witness on `11601...`.
- [ ] Decide whether the new lower owner is seed bootstrap dependency defer or
      join auto-resume hold-open/exhaustion on canonical BOOTSTRAP_NOT_READY.
- [ ] Split or migrate the package if the typed seed-contact no-progress seam
      closes and the representative blocker moves to a lower recovery owner.

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
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

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
