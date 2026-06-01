# Rolling Restart Active Gate Snapshot Coverage After Readiness Support Reduction

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence after the priority-recovery SQL dispatch-deadline proof records active_gate_snapshot_coverage as the first frontier with activeGate timed out, active=1/5, snapshotCoverage=1/5, publication ACK convergence satisfied, priorityRecovery=none, and readiness_startup_support deferred.",
  "nextAction": "Continue startup_active_gate_owner / snapshot_coverage runtime work from the latest report; make bootstrap admission, move-replica handoff stabilization, selected snapshot coverage, and active-node publication converge without harness timeout increases.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node --test test/bootstrap/node-joining-service.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md",
    "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "fresh canonical evidence promotes priority recovery, publication convergence, or readiness support ahead of active gate snapshot coverage",
      "the fix requires harness timeout increases, Pro behavior, or Enterprise behavior",
      "bootstrap admission or move-replica handoff cannot expose one bounded owner path",
      "scenario remains red after focused active-gate proof and one representative rerun"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_active_gate_owner / snapshot_coverage owns the current first frontier after priority-recovery SQL dispatch-deadline proof, bootstrap admission, move-replica handoff stabilization, selected snapshot coverage, and active-node publication must converge through one bounded owner path.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "expectedCausalModelChange": "The active-gate snapshot-coverage frontier either converges to representative green, reduces to a narrower active-gate runtime edge, or exposes a fresh same-scenario owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "After priority-recovery SQL dispatch-deadline proof, the latest representative report remains red with activeGate timed out, active=1/5, snapshotCoverage=1/5, publication ACK convergence satisfied, priorityRecovery=none, and readiness_startup_support deferred behind active-gate no progress.",
    "crossBoundaryReview": "Review, fix, and implementation delegation are recorded as blocked-by-environment-policy because this host requires an explicit user request before spawning subagents."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup active-gate recovery report after priority-recovery SQL dispatch-deadline proof",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage is blocked under startup_active_gate_owner / snapshot_coverage with activeGate timed out, active=1/5, snapshotCoverage=1/5, publication ACK convergence satisfied, priorityRecovery=none, and readiness support deferred.",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred through inherited_active_gate_no_progress",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending acknowledgements",
      "priority_recovery_partition_progress is no longer a first frontier after focused operation workflow proof",
      "four nodes remain outside the active-gate snapshot coverage set in the latest failure bundle"
    ],
    "missingCausalEdge": "Startup active-gate must turn the remaining bootstrap admission, move-replica handoff stabilization, selected snapshot coverage, and active-node publication debt into one bounded owner path.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused bootstrap and active-gate tests must prove a bounded retry, reconcile, timeout, or advance path before the representative rolling-restart rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "expectedObservableTransition": "rolling-restart passes, or the same scenario emits a fresh first frontier with concrete owner evidence that remains part of the green-only sprint loop.",
    "maxProgressBound": "one startup active-gate owner cycle plus one representative rolling-restart rerun after focused tests pass",
    "sameFrontierFallback": "keep this startup_active_gate_owner / snapshot_coverage package active if the next rerun remains same-frontier with new active-gate evidence",
    "expectedNextFrontier": "representative-green rolling-restart, or a narrower active-gate owner-boundary successor from canonical evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "predecessor": "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md"
}
-->

## Why

The priority-recovery operation package added bounded SQL priority replica
operation dispatch delivery and moved the representative gate off
`operation_workflow_owner / workflow_progress`. The current first frontier is
again `startup_active_gate_owner / snapshot_coverage`.

This package owns the next active-gate runtime cycle. The remaining evidence is
not priority recovery, publication ACK, or readiness support: it is active-gate
timeout with `active=1/5` and `snapshotCoverage=1/5`.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named startup owner boundary, focused bootstrap proof, and one representative
  rerun after implementation.
- Escalation trigger to a heavier lane: fresh evidence promotes another owner,
  the fix requires harness timeout increases, or the active-gate path cannot be
  reduced after one owner cycle.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

Review and fix sequencing is recorded before implementation starts. Real
subagents require an explicit user request in this host, so unavailable role
proof is recorded rather than invented.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-active-gate-successor-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-active-gate-successor-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-active-gate-successor-implementation

## In Scope

1. work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md
2. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. work/model-ledger.jsonl
6. src/bootstrap/bootstrap-api-runtime-methods.js
7. src/bootstrap/bootstrap-service-runtime-methods.js
8. src/bootstrap/node-joining-service-segment-2.js
9. src/bootstrap/node-joining-service-segment-5.js
10. src/bootstrap/owners/move-replica-assignment-owner.js
11. src/bootstrap/phases/contact-seed-phase.js
12. src/bootstrap/phases/create-message-group-phase.js
13. test/bootstrap/dynamic-partition-cdc-subscription.test.js
14. test/bootstrap/move-replica-assignment-token.test.js
15. test/bootstrap/node-joining-service.test.js

## Out Of Scope

1. harness timeout increases
2. priority recovery runtime changes without fresh first-frontier evidence
3. publication convergence implementation without fresh first-frontier evidence
4. Pro behavior
5. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/model-ledger.jsonl`, `src/bootstrap/bootstrap-api-runtime-methods.js`, `src/bootstrap/bootstrap-service-runtime-methods.js`, `src/bootstrap/node-joining-service-segment-2.js`, `src/bootstrap/node-joining-service-segment-5.js`, `src/bootstrap/owners/move-replica-assignment-owner.js`, `src/bootstrap/phases/contact-seed-phase.js`, `src/bootstrap/phases/create-message-group-phase.js`, `test/bootstrap/dynamic-partition-cdc-subscription.test.js`, `test/bootstrap/move-replica-assignment-token.test.js`, `test/bootstrap/node-joining-service.test.js`
- Forbidden files: `harness timeout increases`, `priority recovery runtime changes without fresh first-frontier evidence`, `publication convergence implementation without fresh first-frontier evidence`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `node --test test/bootstrap/node-joining-service.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js`, `node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --fast-local --verbose`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `startup_active_gate_owner / snapshot_coverage` owns
  the current first frontier, bootstrap admission, move-replica handoff
  stabilization, selected snapshot coverage, and active-node publication must
  converge through one bounded owner path.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`
- Expected causal-model change: active-gate snapshot coverage converges,
  reduces to a narrower active-gate runtime edge, or exposes a fresh
  same-scenario owner boundary.
- Representative outcome: `migrated`.
- Causal debt: latest report remains red with active-gate timeout,
  `active=1/5`, `snapshotCoverage=1/5`, publication ACK convergence
  satisfied, priority recovery non-frontier, and readiness support deferred.
- Cross-boundary review: role delegation is recorded as
  `blocked-by-environment-policy` because this host requires explicit user
  request before spawning subagents.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` startup active-gate recovery
  report after priority-recovery SQL dispatch-deadline proof.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, startup active-gate snapshot coverage, startup readiness support
  evidence.
- Current first frontier: `active_gate_snapshot_coverage` under
  `startup_active_gate_owner / snapshot_coverage`.
- Known downstream blockers: readiness support is deferred through inherited
  active-gate no progress; publication ACK is satisfied; priority recovery is
  no longer first frontier.
- Missing causal edge: remaining bootstrap admission, move-replica handoff
  stabilization, selected snapshot coverage, and active-node publication debt
  need one bounded startup owner path.
- Bounded progress proof: focused bootstrap tests before the representative
  `rolling-restart` rerun.
- Expected next frontier: representative green or a narrower active-gate
  successor from canonical evidence.
- Stop condition: `continue-local-fix`.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
6. node --test test/bootstrap/node-joining-service.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js
7. node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js
8. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --fast-local --verbose
