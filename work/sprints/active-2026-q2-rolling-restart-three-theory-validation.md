# Rolling Restart Three Theory Validation Sprint

Status: active. Created on May 26, 2026. Reused on May 26, 2026 for the latest restarted-node recovery-ready failure.

## Goal

Test the three current rolling-restart failure theories against the latest representative artifact, fix only confirmed source bugs, and rerun `rolling-restart` when source changes.

## Sprint Strategy Brief

- Goal state: representative `rolling-restart` is green, or fresh evidence shows a reduced/migrated first frontier with exactly one named successor owner boundary.
- Current causal thesis: the three-theory sprint confirmed H2 as a diagnostics sidecar-loading bug. After the fix, the representative rerun moved off `evidence_missing` and now routes to `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.
- Confidence and evidence: High that H2 was a real diagnostics bug because linked failure-bundle sidecars contained decisive state that report-level analyzers ignored. Medium that H1/H3 were baseline symptoms only for this package: the post-diagnostics rerun did not repeat the restarted-node admin-refused recovery-ready shape.
- Competing hypotheses:
  - H1 restarted-node admin surface: bootstrap health is reachable, but the restarted node's admin service never binds or becomes queryable after restart.
  - H2 active-gate evidence capture gap: active-gate/control-snapshot diagnostics drop decisive coverage, expected-node, blocker, or probe outcome evidence, producing `evidence_missing`.
  - H3 control-snapshot authority recovery: startup recovery cannot establish control-snapshot authority or publication evidence after restart, leaving recovery diagnostics unavailable.
- Expected green path: continue from a successor operation-workflow priority-recovery package; do not patch H1/H3 runtime code from the older evidence-missing artifact.
- Wrong direction signals: raising timeouts, weakening recovery-ready or active-gate admission, treating bootstrap reachability as admin readiness, or patching active-gate symptoms while decisive evidence is still missing.
- Stop or escalate rule: if focused proof cannot distinguish the three theories or the rerun stays `evidence_missing` with no admin/recovery/evidence movement, stop for an autonomous architecture experiment or human escalation.
- Next best package: open or focus the successor for `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Open or focus the successor for operation_workflow_owner / workflow_progress priority recovery event-driven wait; do not patch H1/H3 from the older evidence-missing artifact in this package.
Representative status: active
Causal outcome: accept_classified_backpressure
Architecture gate: selected / open-architecture-package
Expected delta: The rerun populated active-gate evidence and migrated the first frontier to operation_workflow_owner / workflow_progress with priorityRecoveryResiduals witnessCount=5 and splitRequired=true.
Current state: Three-theory sprint executed. H2 was confirmed as a diagnostics/report sidecar-loading bug and fixed by loading linked failure-bundle and triage sidecars before route, topology, causal, and representative summaries. Baseline H1/H3 were supported as symptoms (admin ECONNREFUSED after durable rejoin and control_snapshot_authority_unavailable), but no runtime patch was selected. The post-diagnostics rolling-restart rerun failed on a migrated frontier: operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait with active-gate evidence populated.
Allowed edits: work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md, work/sprints/active-2026-q2-rolling-restart-three-theory-validation.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/theory-ledger.md, src/admin/admin-websocket-api-segment-1.js, src/admin/admin-control-snapshot-class-part-2.js, src/admin/admin-service-discovery-readiness-methods.js, src/bootstrap/bootstrap-api-server-methods.js, src/bootstrap/bootstrap-readiness-ladder.js, src/bootstrap/startup-recovery-coordinator.js, src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js, src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js, src/control-plane/control-plane-snapshot-owner.js, src/transport/message-router.js, scripts/artifact-sidecar-loader.js, scripts/analyze-causal-model.js, scripts/analyze-topology-convergence.js, scripts/summarize-representative-evidence.js, scripts/work-scenario-route.js, test/admin/admin-control-snapshot.test.js, test/bootstrap/bootstrap-api.test.js, test/bootstrap/bootstrap-readiness-ladder.test.js, test/bootstrap/startup-recovery-coordinator.test.js, test/distributed/harness/__tests__/cluster.test-part-2.js, test/distributed/harness/__tests__/cluster.test-part-4-control-snapshot-coverage.js, test/distributed/harness/__tests__/failure-bundle-core-07-test-cases.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/summarize-representative-evidence.test.js, test/transport/message-router.test.js
Candidate runtime files: src/admin/admin-websocket-api-segment-1.js, src/admin/admin-control-snapshot-class-part-2.js, src/admin/admin-service-discovery-readiness-methods.js, src/bootstrap/bootstrap-api-server-methods.js, src/bootstrap/bootstrap-readiness-ladder.js, src/bootstrap/startup-recovery-coordinator.js, src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js, src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js, src/control-plane/control-plane-snapshot-owner.js, src/transport/message-router.js
Forbidden edits: Owners decide admin readiness, bootstrap recovery readiness, and active-gate admission; diagnostics and harness evidence may observe but must not override owner outcomes.
Required latest proof: falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage, regression: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json, baseline: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage, baseline: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json, focused: node --test test/scripts/summarize-representative-evidence.test.js, focused: node --test --test-name-pattern "loads linked failure-bundle sidecars" test/scripts/analyze-topology-convergence.test.js, rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose, post-rerun: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. Keep one package active at a time.
2. Run `npm run work:context`, `npm run work:llm-start`, entry validation, and pre-implementation validation before source edits.
3. Source edits must be driven by focused proof for one of the three hypotheses, not by raw representative failure alone.
4. If source changes, rerun `rolling-restart` and route the fresh artifact before closing the package.
5. Closure remains atomic: package evidence, `npm run work:repair`, closure validation, focused commit, and push.

## Package Queue

1. [Rolling Restart Three Theory Validation](../packages/active-20260526-20260526-rolling-restart-three-theory-validation.md)
   - Lane: `causal-escalation`
   - Purpose: Completed H1/H2/H3 discriminator; H2 diagnostics sidecar loading was fixed and rerun migrated to operation-workflow priority recovery.
   - First-run reason: Latest representative evidence routed to `active_gate_snapshot_coverage / evidence_missing` after priority recovery residuals reached zero.

## Proof Ladder

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage`
2. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
5. Focused diagnostics tests selected by H2: `node --test test/scripts/summarize-representative-evidence.test.js`; `node --test --test-name-pattern "loads linked failure-bundle sidecars" test/scripts/analyze-topology-convergence.test.js`; `node --test --test-name-pattern "loads linked failure-bundle sidecars" test/scripts/summarize-representative-evidence.test.js`.
6. Source changed: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose`.
7. Fresh route: `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json` => `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.

## Theory Ledger

1. `theory-20260526-rolling-restart-restarted-node-admin-surface`
2. `theory-20260526-rolling-restart-active-gate-evidence-capture-gap`
3. `theory-20260526-rolling-restart-control-snapshot-authority-recovery`

## Closure Rules

1. The sprint closes only after the package is completed or explicitly superseded by a named architecture package.
2. Stability must be proven by representative green or a clear bounded successor blocker.
3. Commit only package-owned files plus generated handoff files.
