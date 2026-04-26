# Harness Canonical Owner-State Classification

## Why

The harness is now good enough to expose real runtime bugs, but some failure
summaries still describe later runtime-pressure failures with older
publication-oriented vocabulary.

That makes the system harder to understand:

1. a closed publication gate can still be summarized as publication blocked
2. pressure and source-removal safety can be hidden behind
   `nodeAdmissionBlocked`
3. priority recovery may be reconstructed from partial publication,
   readiness, and operation evidence instead of consumed from the owner
   decision contract

The harness must remain strict, but it should classify from canonical owner
contracts only.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Critical replace remove safety and convergence timeout](./done-20260424-critical-replace-remove-safety-and-convergence-timeout.md)
2. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

## In Scope

1. Audit failure-bundle, triage-summary, report-writer, and summary scripts
   for local reconstruction of publication, readiness, priority recovery, and
   pressure meaning.
2. Cut live artifact classification over to canonical owner-state surfaces:
   - `PriorityRecoveryDecisionSnapshot`
   - `PriorityRecoveryObservationSnapshot`
   - `OwnerContractOutcome`
   - `ControlPlaneWriteHealth`
   - convergence diagnostics emitted by the runtime owner
3. Keep legacy replay support explicitly labeled as retained-artifact support.
4. Add tests that prove runtime pressure and replace/remove blockers are not
   misclassified as publication convergence blockers when owner evidence says
   publication is ready.

## Out Of Scope

1. Weakening harness pass/fail criteria.
2. Runtime repair from harness artifacts.
3. New runtime owner vocabulary created only for reporting convenience.

## Shared Boundary Contract

- Semantic owner:
  harness classification is a presentation consumer of runtime owner
  decisions.
- Canonical contract:
  the harness may summarize owner states, but it must not invent new runtime
  meaning from partial publication/readiness/operation fragments.
- Allowed consumers:
  failure bundles, triage summaries, report writer, harness run summaries, and
  local replay tooling.
- Prohibited reinterpretations:
  deriving publication recovery from stale priority summaries after an owner
  closure witness exists, collapsing pressure into generic
  `nodeAdmissionBlocked`, or inferring operation absence from partial rows.
- Primary proof:
  harness unit tests plus replay against the latest representative artifacts.

## Progress Grammar

1. `runtime_replace_remove_blocked` means source-removal safety or replacement
   leader ownership is the owner-reported blocker.
2. `runtime_pressure_deferred` means critical progress is retryable but delayed
   by pressure.
3. `publication_convergence_blocked` means the publication owner itself says
   publication or priority spread is pending.
4. `readiness_admission_blocked` means readiness owner state is the direct
   blocker and no deeper owner blocker outranks it.
5. `unknown_legacy_artifact` means retained artifact data predates the
   canonical contract needed for classification.

## Hotspots

1. `test/distributed/harness/failure-bundle-segment-4.js`
2. `test/distributed/harness/failure-bundle.js`
3. `test/distributed/harness/report-writer.js`
4. `test/distributed/harness/priority-recovery-summary-normalization.js`
5. `test/distributed/harness/assertions-segment-3.js`
6. `test/distributed/harness/__tests__/assert-consistency.test.js`
7. `test/distributed/harness/__tests__/failure-bundle.test.js`
8. `test/distributed/harness/__tests__/report-writer.test.js`
9. `scripts/summarize-harness-runs.js`

## Status Update

First implementation cut executed on April 24, 2026.

1. `assertions-segment-3.js` now collects publication-gate evidence from the
   canonical observation gate, explicit publication convergence gate, and
   convergence-derived gate before choosing one outcome.
2. A same-epoch ready publication gate can override stale observation reasons
   only when the observation has no concrete blocked or unresolved priority
   recovery evidence.
3. Concrete priority recovery blockers remain authoritative even if another
   gate reports ready.
4. The post-classification `node-join-under-load` rerun no longer fails with
   `Publication-scoped consistency not ready`; it now fails later with
   `Convergence timeout after 60000ms` and `failureClass = load_pressure`.
5. Remaining presentation debt: triage still uses `nodeAdmissionBlocked` as
   the dominant reason and leaves `failureAction` / `operatorRecommendation`
   unknown for this pressure-plus-replace-remove blocker.

Sprint execution update:

1. terminal operation visibility and priority recovery observation now expose
   the current owner-state blocker directly in `rolling-restart`
2. stale publication summaries no longer mask the active blocker after the
   representative path passes
3. latest secondary classification names
   `priority_recovery_progress_blocked`, semantic state `needs_operation`,
   and unresolved partition `replica_operations-p1`
4. remaining harness work is presentation polish; the current blocker is
   understandable enough to drive a runtime package

April 24 terminal active-gate update:

1. the latest `rolling-restart` rerun carried terminal report-level
   `activeGate` diagnostics with publication and priority recovery closed
2. retained playback reconstruction still had older priority-recovery evidence
   and initially reintroduced `priority_recovery_progress_blocked`
3. failure bundles now derive publication convergence from direct terminal
   active-gate progress before merging playback fallback evidence
4. stale publication dominant reasons are replaced by the terminal active-gate
   blocker when publication and priority recovery are closed
5. regenerated artifacts now classify the run as `topology_unstable` with
   dominant reason `inactive_nodes=1`

April 24 post-active convergence update:

1. the latest `rolling-restart` strict restart rerun reached `activeGate`
   `ready` with publication `PUBLISHED`, pending ACK count `0`, and priority
   recovery unresolved counts `0`
2. the actual thrown barrier moved to `waitForConvergence`, which timed out
   after `120000ms`
3. retained active-gate readiness delay still caused the generated bundle to
   classify the failure as `startup_recovery_blocked`
4. this package now owns the first execution slice from
   [Critical topology convergence grammar contract](./done-20260424-critical-topology-convergence-grammar-contract.md):
   failing-barrier precedence before retained observation evidence

April 25 fresh-artifact update:

1. the operation-lifecycle rerun again threw `Convergence timeout after
   120000ms` after failover, convergence, and restart recovery gates closed
2. the initially generated playback triage still selected stale startup
   readiness evidence
3. the convergence failure barrier now owns fresh artifacts as well as replayed
   artifacts when the thrown barrier is convergence and the retained reason is
   superseded startup/readiness evidence
4. the canonical playback triage for
   `runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun`
   now reports `topology_unstable` / `convergence_timeout`

## Residual Closure Inventory

- [x] Consistency assertion chooses one publication recovery gate from
      canonical owner evidence instead of letting stale observation reasons
      reopen a ready gate.
- [x] Live failure-bundle classification consumes owner-state contracts.
- [x] Legacy retained-artifact paths are explicitly labeled for the current
      classifier path; broader retained-artifact cleanup is queued in
      [Admin observation owner cutover and repair fencing](./todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md).
- [x] Superseded local reconstruction paths are deleted, fenced, or split to
      queued consumer-cutover work.
- [x] Failure-bundle and report-writer proof covers pressure and
      replace/remove blockers.
- [x] Representative artifact rerun moved the terminal failure from stale
      publication-gate classification to runtime `load_pressure`.
- [x] Representative artifact replay names the pressure-plus-replace-remove
      blocker without generic `nodeAdmissionBlocked`.
- [x] Post-active convergence timeout proof keeps the thrown `convergence`
      barrier ahead of retained readiness-delay evidence.

## Validation

1. `node test/distributed/harness/__tests__/failure-bundle.test.js`
2. `node test/distributed/harness/__tests__/report-writer.test.js`
3. `npm test -- test/distributed/harness/__tests__/assert-consistency.test.js`
4. `node scripts/summarize-harness-runs.js`
5. Replay or parse the latest `node-join-under-load` artifact after the
   runtime owner package lands.

Executed:

1. `npm test -- test/distributed/harness/__tests__/assert-consistency.test.js`
2. Result: `29/29` subtests passing
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/runtime-stability-node-join-20260424-codex-after-harness-classification.report.json --fast-local --verbose`
4. Result: failed as expected with migrated blocker:
   `Convergence timeout after 60000ms`, `failureClass = load_pressure`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-superseded-stale-operation.report.json --fast-local --verbose`
6. Result: failed with named owner-state blocker:
   `priority_recovery_progress_blocked`, `needs_operation`,
   `replica_operations-p1`
7. `node --check test/distributed/harness/failure-bundle-segment-3.js`
8. Result: passed.
9. `node --check test/distributed/harness/failure-bundle-segment-4.js`
10. Result: passed.
11. `node --check test/distributed/harness/failure-bundle-segment-5.js`
12. Result: passed.
13. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
14. Result: passed, `41/41`.
15. Regenerated
    `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun/rolling-restart/failure-bundle.json`
    and sibling triage summary.
16. Result: latest rolling-restart artifacts classify as
    `topology_unstable` / `inactive_nodes=1`.
17. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
18. Result: passed, `44/44`; focused proof now covers post-active
    convergence timeout precedence over retained startup readiness evidence.
19. Replayed
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
    through `writeFailureBundlesForReport`.
20. Result: `rolling-restart` now classifies as `topology_unstable` with
    dominant reason `convergence_timeout`, root cause `topology`, and
    failure-barrier signals `failureBarrier=convergence` and
    `failureBarrierReason=convergence_timeout`.
21. `node --check test/distributed/harness/failure-bundle-segment-4.js`
22. Result: passed.
23. `node --check test/distributed/harness/failure-bundle-segment-5.js`
24. Result: passed.
25. Replayed and regenerated
    `test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
    through `writeFailureBundlesForReport`.
26. Result: the canonical playback triage now reports root cause `topology`,
    failure class `topology_unstable`, and dominant reason
    `convergence_timeout`.

## Done When

1. Harness artifacts explain the current dominant blocker in canonical owner
   vocabulary.
2. Publication-style labels appear only when the publication owner is actually
   blocked.
3. The harness remains strict while becoming easier to trust and debug.
