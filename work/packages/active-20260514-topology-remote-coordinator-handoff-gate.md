# Topology Remote Coordinator Handoff Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "seven-node-read-write-load-transaction-recovery",
  "artifact": "test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "replica_operation_coordinator_handoff_gate",
  "dominantReason": "remote_coordinator_handoff_release_gate_unproven",
  "currentState": "Activated after killed-rejoin gate migration. Coordinator-created remote operation handoff has focused progress proof, but killed coordinator handoff still needs release-gate classification.",
  "nextAction": "Execute and classify the remote-coordinator handoff gate only. If the gate is red, record the owner-boundary split; do not fix rolling-restart runtime behavior in this package without explicit re-scope.",
  "proof": [
    "npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery --output test-output/reports/topology-remote-coordinator-handoff-gate.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-remote-handoff-convergence.md",
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/packages/done-20260514-topology-killed-rejoin-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "operation_workflow_owner / replica_operation_coordinator_handoff_gate proof should reduce, migrate, or classify remote_coordinator_handoff_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "expectedCausalModelChange": "remote_coordinator_handoff_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until operation_workflow_owner / replica_operation_coordinator_handoff_gate is proven, the sprint representative rolling-restart residual stays open at startup_active_gate_owner / snapshot_coverage. Runtime rolling-restart fixes are out of scope for this observe/classify package.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seven-node-read-write-load-transaction-recovery / operation_workflow_owner / replica_operation_coordinator_handoff_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "operation_workflow_owner / replica_operation_coordinator_handoff_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier operation_workflow_owner / replica_operation_coordinator_handoff_gate; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven operation_workflow_owner / replica_operation_coordinator_handoff_gate causal edge for remote_coordinator_handoff_release_gate_unproven",
    "missingCausalEdgeProbe": "npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for operation_workflow_owner / replica_operation_coordinator_handoff_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-remote-coordinator-handoff-gate.report.json",
    "expectedObservableTransition": "remote_coordinator_handoff_release_gate_unproven resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep operation_workflow_owner / replica_operation_coordinator_handoff_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Focused tests cover coordinator-created remote operation progress, but a killed
coordinator under seven-node transaction load has not been promoted to release
evidence. The sprint intent explicitly requires incomplete coordinator-created
operations to be scanned, normalized, woken when remote, retried durably when
wakeup is not delivered, and terminally classified when stale beyond budget.

This package owns the remote coordinator handoff release gate for
`operation_workflow_owner / replica_operation_coordinator_handoff_gate`.

## Scope Basis

AGPL topology convergence item: fix ship blockers around coordinator-created
operations and never wait only on event delivery. It builds on prior remote
handoff convergence and priority recovery workflow progress packages.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named distributed gate with
  bounded operation workflow candidate files and focused operation tests.
- Escalation trigger to a heavier lane: gate failure requires changing durable
  operation schema, transaction recovery semantics, or publication ACK closure
  beyond remote handoff.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Confirm focused remote handoff operation tests still pass.
2. Execute the seven-node transaction recovery gate.
3. Verify every coordinator-created remote operation has durable owner-key
   state naming partition/message group/replica operation, source owner,
   remote owner, wakeup delivery result, next-attempt, attempt count, and
   terminal/degraded reason.
4. Verify remote wakeup can accelerate progress but is not the authority for
   live state.
5. Fix or split any gap in replay dispatch, delivery, ACK timeout, retry, or
   terminal workflow classification.

## Out Of Scope

1. event-only-wait-final-state
2. owner-bypass-delivery
3. Missed publication ACK gate behavior unless the red evidence specifically
   shows ACK absence is the remote handoff blocker.
4. Broad operation workflow cleanup outside killed coordinator handoff.

## Entry Evidence

1. Focused remote handoff progress proof exists.
2. Representative rolling-restart has a non-frontier operation workflow
   residual.
3. No seven-node killed coordinator handoff artifact currently proves release
   convergence.

## Owner Contract To Prove

`operation_workflow_owner` must make durable operation state the authority for
remote handoff. The gate must prove:

1. Incomplete coordinator-created operations are scanned.
2. One decision snapshot is normalized per operation.
3. Remote owner wakeup is sent when ownership is remote.
4. Delivered wakeup is followed by durable progress verification.
5. Undelivered wakeup schedules bounded retry with next-attempt timestamp.
6. Stale operations beyond budget are terminally classified with precise reason.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-remote-coordinator-handoff-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

1. [x] Review subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-remote-coordinator-handoff-gate-review
2. [x] Fix subagent recorded or explicitly not needed:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-remote-coordinator-handoff-gate-fix
3. [x] Implementation subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-remote-coordinator-handoff-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `event-only-wait-final-state`, `owner-bypass-delivery`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`, `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery --output test-output/reports/topology-remote-coordinator-handoff-gate.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md
3. npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
4. node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery --output test-output/reports/topology-remote-coordinator-handoff-gate.report.json --verbose
5. npm run work:evidence-summary -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/topology-remote-coordinator-handoff-gate.report.json
7. npm run analyze:topology-convergence -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json
8. npm --silent run analyze:causal-model -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json
9. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-remote-coordinator-handoff-gate.report.json --markdown
10. node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
11. node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
12. npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
13. npm run work:validate -- --entry work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md
14. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md
15. npm run work:validate -- --closure work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md
16. git diff --check -- work/packages/active-20260514-topology-remote-coordinator-handoff-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
17. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If wakeup delivery is missing but durable retry exists, split to harness or
   transport observation only if owner progress is otherwise correct.
2. If durable retry is missing, split to operation workflow owner runtime.
3. If ACK absence is the blocker, activate the missed handoff ACK gate.
4. If transaction recovery semantics are the blocker, split a transaction
   recovery owner package rather than broadening topology recovery.

## Acceptance Criteria

1. Seven-node gate artifact proves killed coordinator handoff converges or
   records a precise terminal degraded classification.
2. Focused operation tests prove retry/delivery/ACK state is durable.
3. No operation workflow residual ends as event-only wait.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
