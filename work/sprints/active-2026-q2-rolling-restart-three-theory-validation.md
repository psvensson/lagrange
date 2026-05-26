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

## Theory Loop Sprint

- Central problem: priority recovery eligible but no operation created during rolling-restart
- Representative artifact: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
- Success condition: rolling restart succeeds and all nodes reach ACTIVE status
- Iteration rule: create or update one compact theory package with 1-3 theories, read source/log evidence first, implement only confirmed bugs, then record each theory as supported, avoided, falsified, fixed, migrated, or needs-rerun.
- Ceremony budget: use `npm run work:theory-loop -- next|record|fix` for package and ledger updates before hand-editing markdown.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress-triage.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Triage priority_recovery_partition_progress with combined scenario evidence before runtime edits.
Representative status: active
Causal outcome: accept_classified_backpressure
Architecture gate: watching / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded from representative evidence for priority_recovery_partition_progress.
Allowed edits: unknown
Candidate runtime files: unknown
Forbidden edits: Owners decide admin readiness, bootstrap recovery readiness, and active-gate admission; diagnostics and harness evidence may observe but must not override owner outcomes.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. Keep one package active at a time.
2. Run `npm run work:context`, `npm run work:llm-start`, entry validation, and pre-implementation validation before source edits.
3. Source edits must be driven by focused proof for one of the three hypotheses, not by raw representative failure alone.
4. If source changes, rerun `rolling-restart` and route the fresh artifact before closing the package.
5. Closure remains atomic: package evidence, `npm run work:repair`, closure validation, focused commit, and push.

## Package Queue

1. [Rolling Restart Three Theory Validation](../packages/done-20260526-20260526-rolling-restart-three-theory-validation.md)
   - Lane: `causal-escalation`
   - Purpose: Completed H1/H2/H3 discriminator; H2 diagnostics sidecar loading was fixed and rerun migrated to operation-workflow priority recovery.
   - First-run reason: Latest representative evidence routed to `active_gate_snapshot_coverage / evidence_missing` after priority recovery residuals reached zero.
2. [Artifact Triage - operation_workflow_owner - workflow_progress](../packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress-triage.md)
   - Lane: `diagnostic-classification`
   - Purpose: Triage priority_recovery_partition_progress with combined scenario evidence before runtime edits.
   - First-run reason: Latest representative evidence routed to `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait` after post-diagnostics rerun.


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
