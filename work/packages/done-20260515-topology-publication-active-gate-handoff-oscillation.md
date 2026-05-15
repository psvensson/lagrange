# Topology Publication Active Gate Handoff Oscillation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused publication recovery gate and failure-bundle projection repair now classify fallback-built and supplied-stream UNKNOWN/no-debt unpublished observations as not_started/not_required and prevent stale top-level publicationPending from reopening the publication frontier. The fresh representative rerun remains red, but canonical topology evidence marks publication_ack_convergence satisfied and selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage as the first frontier.",
  "nextAction": "Close this cross-boundary handoff slice as migrated/reduced and continue with a startup_active_gate_owner / snapshot_coverage successor package using the fresh representative artifact.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --handoff-probe",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/control-plane/publication-recovery-gate.test.js",
    "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-evidence-open-membership.test.js",
    "node --test test/distributed/harness/__tests__/failure-bundle.test.js",
    "npx eslint --no-ignore src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-gate.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-handoff-oscillation.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-reachability.expected.json",
    "test/scripts/__fixtures__/topology-convergence/publication-count-only-ack.expected.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-gate.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-handoff-oscillation.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-reachability.expected.json",
    "test/scripts/__fixtures__/topology-convergence/publication-count-only-ack.expected.json"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "escalationTriggers": [
      "runtime files are promoted before a replayable missing-edge probe is named",
      "fresh evidence stops oscillating and selects one owner boundary with monotonic reduction",
      "operation_workflow_owner becomes the canonical first frontier"
    ]
  },
  "representativeResidual": {
    "status": "live-red-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage. Publication ACK convergence is satisfied with publicationPending=false, pendingAck=0, missingPublished=0, ack not_required, no_revision, and stream not_started."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence and active-gate snapshot coverage are not independent residuals; the missing edge is the handoff that should make publication ACK state, authoritative snapshot repair, and active-gate coverage move monotonically in the same representative run.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "publication_ack_convergence and active_gate_snapshot_coverage become a single replayable handoff fixture with a named missing edge, or the package classifies why no bounded runtime fix should proceed.",
    "representativeOutcome": "migrated",
    "causalDebt": "The cross-boundary publication handoff is now monotonic for the UNKNOWN/no-debt unpublished observation shape: publication ACK convergence is satisfied, top-level publicationPending is false, and stale publication_epoch_pending reasons are retired from the failure-bundle projection. The fresh representative run remains red because active_gate_snapshot_coverage is blocked with snapshotCoverage=0/5 and selected snapshot timeout/repair failure.",
    "crossBoundaryReview": "Review/fix/implementation subagent sequencing is required before implementation. Runtime files remain candidates only until the package records a replayable missing-edge probe."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / publication-to-active-gate handoff after forced snapshot refresh-debt fallback",
    "phaseChain": [
      "publication owner-stream migration proof",
      "active-gate forced snapshot fallback proof",
      "fresh oscillation artifact extraction",
      "publication-to-active-gate missing-edge probe",
      "focused handoff repair or architecture-gap classification"
    ],
    "currentFirstFrontier": "fresh representative rerun first frontier moved to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverage=0/5, and selected snapshot timeout/forced repair failure",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with publicationPending=false, pendingAck=0, missingPublished=0, ack not_required, no_revision, and stream not_started",
      "active_gate_snapshot_coverage remains blocked as first frontier with activeGate=timed_out, snapshotCoverage=0/5, and forced authoritative snapshot repair error",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted",
      "priority_recovery_partition_progress remains classified as satisfied"
    ],
    "missingCausalEdge": "The publication-to-active-gate handoff now closes; the next missing edge is active-gate selected snapshot coverage not advancing from 0/5 before active-gate timeout after forced repair fails.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused gate and failure-bundle regressions prove the bounded reconcile mechanism for UNKNOWN/no-debt unpublished observation: it no longer reopens publication pending, and stale publication_epoch_pending reasons are retired from projection. Fresh representative proof moves publication_ack_convergence to satisfied and selects active_gate_snapshot_coverage as first frontier, so this package closes as migrated/reduced rather than green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "expectedObservableTransition": "Observed: UNKNOWN publicationStatus with unpublished_observation, pendingAckCount=0, pendingAckNodeIds=[], missingPublishedCount=0, and owner stream not_started/not_required stops emitting top-level publication_pending; representative evidence migrated the first frontier to active_gate_snapshot_coverage.",
    "maxProgressBound": "one cross-boundary causal package slice with canonical extractors, subagent sequencing, focused missing-edge probe, and representative result classification",
    "sameFrontierFallback": "not used; publication_ack_convergence is no longer the representative first frontier in the fresh artifact.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated-to-publication",
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated-to-active-gate",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md / startup_active_gate_owner / snapshot_coverage / migrated-to-publication"
    ],
    "oscillationCheck": "The cross-boundary package stopped the stale publication_pending reentry for the current representative shape; the frontier moved to active_gate_snapshot_coverage with publication satisfied. Continue in a startup active-gate successor instead of reopening publication.",
    "handoffInvariant": "Do not reopen topology_publication_owner / publication_convergence unless fresh canonical extraction promotes publication_ack_convergence back to the first frontier with non-stale publication debt."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The publication recovery gate and failure-bundle projection repair stopped UNKNOWN/no-debt unpublished observation from re-opening stale publicationPending. The fresh representative artifact marks publication_ack_convergence satisfied and selects active_gate_snapshot_coverage as the first frontier with active_gate_timed_out and snapshotCoverage=0/5.",
    "evidence": [
      "node --test test/control-plane/publication-recovery-gate.test.js",
      "node --test test/distributed/harness/__tests__/failure-bundle.test.js",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --verbose",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md"
}
-->

## Why

The last two focused runtime packages alternated the representative first
frontier between publication convergence and active-gate snapshot coverage. The
latest active-gate package fixed a real local symptom: forced snapshot repair
now escalates repair-deferred refresh debt instead of reusing stale local
snapshot evidence. The fresh representative artifact still fails, but it fails
earlier at publication convergence while active-gate coverage is downstream.

This package owns the cross-boundary handoff. Its first deliverable is not a
runtime patch; it is a replayable missing-edge probe that explains why
publication ACK state, forced authoritative snapshot repair, and active-gate
coverage do not move monotonically in one run.

## Scope Basis

AGPL topology convergence release-gate closure. The work is bounded to the
rolling-restart causal chain and may promote runtime files only after the
missing-edge probe names the exact owner boundary and write scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the representative evidence now spans two
  runtime owners and the sprint re-entry gate requires cross-boundary causal
  proof before more tactical runtime edits.
- Escalation trigger to a heavier lane: the missing-edge probe cannot be built
  from existing artifacts, or fresh evidence promotes operation workflow to the
  canonical first frontier.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl
4. src/control-plane/publication-recovery-gate.js
5. test/control-plane/publication-recovery-gate.test.js
6. test/distributed/harness/failure-bundle-segment-4.js
7. test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js
8. test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
9. scripts/analyze-topology-convergence.js
10. test/scripts/analyze-topology-convergence.test.js
11. test/scripts/__fixtures__/topology-convergence/publication-active-gate-handoff-oscillation.fixture.json
12. test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json
13. test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-reachability.expected.json
14. test/scripts/__fixtures__/topology-convergence/publication-count-only-ack.expected.json

## Out Of Scope

1. Runtime ownership changes outside the promoted publication recovery gate
   owner path unless fresh evidence promotes exact files.
2. Admin, active-gate, and non-failure-bundle harness caller edits unless the
   focused projection repair leaves the representative frontier unchanged with
   new evidence.
3. Another single-owner publication or active-gate package unless canonical
   evidence stops oscillating.

## Subagent Sequencing Ledger

Required before implementation because this causal package spans runtime owner
boundaries.

- [x] Review subagent recorded:
      Agent Singer (019e2ab2-1507-7f71-b478-50b0861eafc7) reviewed work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Plato (019e2ab5-acfe-76e2-9138-eec7ae823b7d) fixed work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md
- [x] Implementation subagent recorded:
      Agent Kierkegaard (019e2ac2-c211-7913-b410-b9f335180af7) implemented work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md; result partial script probe, fixture/test integration completed after bounded stop

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`, `src/control-plane/publication-recovery-gate.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/distributed/harness/failure-bundle-segment-4.js`, `test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js`, `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`, `scripts/analyze-topology-convergence.js`, `test/scripts/analyze-topology-convergence.test.js`, `test/scripts/__fixtures__/topology-convergence/publication-active-gate-handoff-oscillation.fixture.json`, `test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json`, `test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-reachability.expected.json`, `test/scripts/__fixtures__/topology-convergence/publication-count-only-ack.expected.json`
- Forbidden files: admin, active-gate, or snapshot owner runtime files until fresh evidence promotes exact paths into write scope
- Frozen decisions: active-gate forced snapshot refresh-debt fallback is closed; current frontier oscillation must be handled cross-boundary.
- Escalation triggers: runtime files promoted before probe, fresh evidence selects operation_workflow_owner first, or the handoff cannot be replayed from available artifacts.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --handoff-probe`, `node --test test/scripts/analyze-topology-convergence.test.js`, `node --test test/control-plane/publication-recovery-gate.test.js`, `node --test test/distributed/harness/__tests__/failure-bundle.test.js`, `npx eslint --no-ignore src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --handoff-probe
5. node --test test/scripts/analyze-topology-convergence.test.js
6. node --test test/control-plane/publication-recovery-gate.test.js
7. node --test test/distributed/harness/__tests__/failure-bundle.test.js
8. npx eslint --no-ignore src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
9. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
10. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
11. npm run work:validate -- --closure work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md

## Commit And Push Ledger

1. Focused package commit: `6102bcd6fece367d112e403c9f04bb7b1f89a14e`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Implementation commit retained for provenance: `5cee8cd89f08249f4119c1381d4cb86ac8b88f17`
