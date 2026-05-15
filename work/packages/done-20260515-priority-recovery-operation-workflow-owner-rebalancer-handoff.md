# Priority Recovery operation_workflow_owner rebalancer_handoff Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Closed as reduced. Duplicate CREATE_REPLICA idempotency for local pending/creating replicas now emits canonical owner progress, and the fresh rolling-restart rerun no longer reports the rebalancer_handoff residual group.",
  "nextAction": "Activate operation_workflow_owner / workflow_progress with the fresh representative artifact; active-gate snapshot coverage remains the outer red gate until stale operation progress drains.",
  "proof": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown",
    "./node_modules/.bin/tap test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "git diff --check -- src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json",
    "npm run audit:runtime-grammar:file -- src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node scripts/check-guideline-decision-boundaries.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node scripts/check-guideline-literals.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json"
  ],
  "writeScope": [
    "src/node/replica-handler-class-part-1.js",
    "src/rebalancer/executor-outcome-constants.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/node/replica-handler.test.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/node/replica-handler-class-part-1.js",
    "src/node/replica-handler-runtime-methods.js",
    "src/node/replica-state-machine.js",
    "src/rebalancer/executor-outcome-constants.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/node/replica-handler.test.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "src/node/replica-handler-class-part-1.js",
    "src/rebalancer/executor-outcome-constants.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/node/replica-handler.test.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate-reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "rebalancer_handoff_reduced_to_workflow_progress",
    "nextAction": "Close this package as reduced and activate the parked operation_workflow_owner / workflow_progress residual with the fresh representative artifact."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Fresh representative evidence drained the recovering_in_flight rebalancer_handoff group. The focused priority residual extractor now reports one workflow_progress witness, while the topology model keeps active-gate snapshot coverage red because stale replica operation progress still defers repair.",
    "evidence": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown"
  },
  "causalGovernance": {
    "hypothesis": "The remaining active-gate snapshot timeout is blocked by operation workflow recovery handoff progress: recovering_in_flight replicas receive remote handoff wake-ups but do not advance their replica lifecycle out of pending/creating quickly enough to clear priority recovery.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, the residual reduces to operation_workflow_owner / workflow_progress only, or this package splits to a narrower replica lifecycle owner with concrete operation and handler evidence.",
    "representativeOutcome": "reduced",
    "causalDebt": "The predecessor moved stale operation dispatch out of the active-gate owner path. This package reduced the recovering_in_flight handoff gap by making duplicate CREATE_REPLICA pending/creating idempotency emit owner progress. The remaining red evidence is no longer rebalancer_handoff; it is the parked workflow_progress witness plus active-gate snapshot coverage still waiting on operation drain.",
    "crossBoundaryReview": "Do not reopen publication handoff truth, owner-key membership reconcile, or active-gate admission. The only runtime candidates are operation workflow handoff and replica lifecycle progress for the recovered replicas named by canonical residual evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery operation workflow rebalancer handoff residual",
    "phaseChain": [
      "freeze predecessor migration evidence",
      "prepare subagent sequencing ledger under environment-policy constraints",
      "inspect rebalancer handoff owner files and replica lifecycle idempotency path",
      "implement one bounded handoff or lifecycle progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress split residual under operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress in test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has three recovering_in_flight witnesses",
      "control_plane_publications-p1 direct wake-up reaches CREATE_REPLICA handling but lifecycle remains pending/creating until timeout",
      "operation_workflow_owner / workflow_progress has paired spread_satisfied_in_flight witnesses and remains parked behind this first split package",
      "active-gate admission must remain strict while publication handoff remains partial"
    ],
    "missingCausalEdge": "Recovered replica handoff must either advance duplicate CREATE_REPLICA lifecycle progress or classify a narrower replica lifecycle state-machine blocker.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded handoff progress through wake, retry, dispatch, timeout, or lifecycle advance evidence for recovering_in_flight replicas, or split to the narrower lifecycle owner with a concrete operation id and handler state.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedObservableTransition": "Fresh rolling-restart evidence drained the recovering_in_flight rebalancer_handoff witnesses. The focused priority extractor now reports only operation_workflow_owner / workflow_progress, and the topology model reports active_gate_snapshot_coverage as the outer red gate.",
    "maxProgressBound": "one rebalancer_handoff owner package slice; no timeout increases, active-gate admission relaxation, or publication handoff rewrites",
    "sameFrontierFallback": "If rebalancer_handoff remains, record whether wake delivery, duplicate create idempotency, state-machine progress, or persistence failed; do not start workflow_progress until the direct handoff blocker is reduced or split.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress, with startup_active_gate_owner / snapshot_coverage remaining the outer active-gate red gate until stale operation progress drains",
    "resultClassification": "reduced",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced",
      "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md / operation_workflow_owner / rebalancer_handoff / reduced"
    ],
    "oscillationCheck": "This package follows a canonical split from priority-recovery residual evidence, not a return to publication or active-gate handoff ownership.",
    "handoffInvariant": "The package must preserve strict active-gate admission and the canonical publication-active-gate handoff contract while focusing only operation workflow handoff progress."
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

Fresh representative evidence split the remaining red residual after the
active-gate owner reconcile package. This package owns the first split group:
`operation_workflow_owner / rebalancer_handoff` with `recovering_in_flight`
witnesses.

The observed control-plane publication operation is no longer a lost wake-up:
the direct CREATE_REPLICA wake reaches the handler. The remaining handoff
question is whether duplicate create idempotency should advance the replica
lifecycle out of pending/creating, or whether that evidence promotes a narrower
replica lifecycle owner.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package starts from canonical representative
  split evidence and owns one runtime owner boundary.
- Escalation trigger to a heavier lane: focused evidence promotes a separate
  replica lifecycle owner, requires timeout increases, or reopens publication
  handoff truth.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Freeze the predecessor migration evidence.
2. Inspect the operation workflow rebalancer handoff files and replica
   lifecycle idempotency path named by residual evidence.
3. Promote exact runtime/test files into `writeScope` after focused owner
   evidence confirms the local boundary.
4. Implement one bounded wake, retry, dispatch, timeout, or lifecycle-advance
   fix, or split to a narrower lifecycle owner with concrete evidence.
5. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Publication handoff contract rewrites.
4. Starting `operation_workflow_owner / workflow_progress` before this direct
   rebalancer handoff residual is reduced or split.
5. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required because this is a causal-escalation runtime package. Subagent
execution is blocked in this host unless the user explicitly asks for
delegation.

- [x] Review subagent recorded:
      blocked-by-environment-policy; reason: developer policy allows spawning
      subagents only when the user explicitly asks for delegation.
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy; reason: review role is blocked by the
      same environment policy, so no separate fix role can be truthfully run.
- [x] Implementation subagent recorded:
      blocked-by-environment-policy; reason: developer policy allows spawning
      subagents only when the user explicitly asks for delegation.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: package/sprint handoff files; replica handler create idempotency;
  executor outcome constants/routing; focused replica handler and outcome
  routing tests.
- Forbidden files: timeout increases, active-gate admission relaxation, publication handoff contract rewrites, Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown
4. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown
5. Focused failing proof:
   `./node_modules/.bin/tap --grep "creating idempotency|REPLICA_CREATE_CREATING" test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
6. `./node_modules/.bin/tap --grep "creating idempotency|pending replica|REPLICA_CREATE_CREATING" test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js` - passed but skipped nested cases because this tap filter matched only top-level test names.
7. `./node_modules/.bin/tap test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js` - passed, `265/265`.
8. `git diff --check -- src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js test/node/replica-handler.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json` - passed.
9. `npm run audit:runtime-grammar:file -- src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js` - passed.
10. `node scripts/check-guideline-decision-boundaries.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js` - passed.
11. `node scripts/check-guideline-literals.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js` - passed.
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --fast-local --verbose` - failed `0/1` after `137.3s`; reduced from split rebalancer handoff residual to active-gate snapshot coverage red with priority recovery topology satisfied and one remaining workflow_progress residual witness.
13. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json` - first frontier `active_gate_snapshot_coverage`; owner `startup_active_gate_owner`; boundary `snapshot_coverage`; priority recovery edge satisfied.
14. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown` - split required `false`; one group remains: `operation_workflow_owner / workflow_progress`.
15. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe` - handoff contract pending with `pendingReconcileCount=4`, `runtimePromotionAllowed=false`.
16. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json` - outcome `continue_local_fix`; dominant failure class `active_gate_snapshot_coverage_incomplete`.

## Implementation Result

- Result classification: `reduced`.
- Runtime change: duplicate `CREATE_REPLICA` idempotency for local
  `PENDING` and `CREATING` replicas now emits
  `REPLICA_CREATE_CREATING` / `WORKFLOW_STEP.CREATING` into the
  operation workflow owner path.
- Owner proof: `REPLICA_CREATE_CREATING` maps to `UPDATE_STEP` and retries
  through empty visibility like the existing create progress outcomes.
- Representative proof: fresh rolling-restart evidence no longer reports the
  `rebalancer_handoff` residual group. The remaining operation workflow
  evidence is the parked `workflow_progress` witness, while the outer scenario
  remains red at active-gate snapshot coverage.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 5fba8a352eaa3deade0f792d68fff27b8f70f722.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
