# Rolling Restart Green Gate Workflow Progress Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The latest rolling-restart rerun after dispatch retry recovery is red. Canonical evidence now treats priority recovery progress as satisfied from the explicit activeGate progress-class contract and promotes active_gate_snapshot_coverage as the first frontier: activeGate timed out with active=2/5, snapshotCoverage=1/5, publication PUBLISHED, pendingAck=0, and no failed priority recovery invariants. Startup joiners loop behind MOVE_REPLICA_HANDOFF_STABILIZING while the selected snapshot query times out.",
  "nextAction": "Continue same-scenario startup active-gate work by making bootstrap admission, move-replica handoff stabilization, and selected snapshot coverage converge through one bounded owner path. Do not increase harness timeouts or reopen priority recovery unless fresh canonical evidence promotes it again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "node --test test/bootstrap/node-joining-service.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/scripts/summarize-representative-evidence.test.js test/control-plane/priority-recovery-snapshot.test.js",
    "node scripts/check-guideline-literals.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js",
    "npm run audit:runtime-grammar:file -- src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
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
    "src/diagnostics/topology-convergence-graph.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-progress-event-driven.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-timeout-transition-deferred.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/",
    "test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness/rolling-restart/",
    "test-output/reports/.playback/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness/rolling-restart/failure-bundle.json"
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
    "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
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
    "src/diagnostics/topology-convergence-graph.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-progress-event-driven.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-timeout-transition-deferred.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "fresh canonical evidence promotes priority recovery, publication convergence, or readiness support ahead of active gate snapshot coverage",
      "the fix requires harness timeout increases, Pro behavior, or Enterprise behavior",
      "bootstrap admission or move-replica handoff cannot expose one bounded owner path",
      "scenario remains red after focused startup active-gate proof and one representative rerun"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_active_gate_owner / snapshot_coverage owns the fresh first frontier, bootstrap admission, move-replica handoff stabilization, and selected snapshot coverage must converge through one bounded owner path until all rolling-restart nodes can become ACTIVE.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "expectedCausalModelChange": "The active-gate snapshot-coverage frontier either converges to representative-green or exposes the next same-scenario owner boundary with fresh evidence; this cycle exposed startup_readiness_owner / startup_support_evidence.",
    "representativeOutcome": "migrated",
    "causalDebt": "The focused startup active-gate fixes improved bounded bootstrap behavior but the fresh representative run remains red with active=2/5, snapshotCoverage=1/5, activeGate timed out, and causal stop decision owner_boundary_migration to startup_readiness_owner / startup_support_evidence because selectedSnapshotError reports snapshot_timeout.",
    "crossBoundaryReview": "Workflow-progress review, fix, and implementation proof is recorded in the Subagent Sequencing Ledger. The fresh active-gate continuation is recorded as blocked-by-environment-policy because subagent spawning requires an explicit user request in this host."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart green-only release gate baseline from May 13, 2026 plus dispatch-retry recovery readiness rerun",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "rebalancer handoff",
      "startup active-gate snapshot coverage",
      "startup readiness"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage is blocked under startup_active_gate_owner / snapshot_coverage with activeGate timed out, active=2/5, snapshotCoverage=1/5, and priority recovery progress satisfied.",
    "knownDownstreamBlockers": [
      "readiness_startup_support is terminal_failed after active-gate coverage improves",
      "startup joiners are looping behind MOVE_REPLICA_HANDOFF_STABILIZING and BOOTSTRAP_NOT_READY",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs",
      "priority_recovery_partition_progress is satisfied from explicit activeGate progress-class evidence"
    ],
    "missingCausalEdge": "Startup active-gate must turn move-replica handoff stabilization, bootstrap admission retry hints, and selected snapshot query timeouts into one bounded owner path instead of letting joiners spin until the active gate expires.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Implementation must prove bounded bootstrap admission, handoff stabilization, selected snapshot coverage, or a narrower owner-boundary migration before the representative rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json plus focused startup active-gate/bootstrap tests selected by implementation",
    "expectedObservableTransition": "The same scenario emitted a fresh same-sprint owner-boundary migration to startup_readiness_owner / startup_support_evidence.",
    "maxProgressBound": "one startup active-gate owner cycle plus one representative rolling-restart rerun after focused tests pass",
    "sameFrontierFallback": "not used; the bounded active-gate cycle migrated after one representative rerun.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence successor for selectedSnapshotError snapshot_timeout support evidence.",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md"
}
-->

## Why

The sprint exit is a green `rolling-restart` run. The May 13, 2026 baseline is
still red, so the earlier classified closure is invalid for this sprint.

Canonical evidence from
`rolling-restart-green-gate-after-dispatch-retry-recovery-readiness` now
promotes `startup_active_gate_owner / snapshot_coverage` as the first
frontier. Priority recovery progress is satisfied by explicit active-gate
progress-class evidence, so the same-scenario loop moves to startup active-gate
coverage without treating owner migration as sprint closure.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named owner boundary, fresh artifact, proof ladder, and required sequential
  subagents. Fresh evidence narrows the active blocker to startup active-gate
  snapshot coverage, bootstrap admission, and move-replica handoff
  stabilization.
- Escalation trigger to a heavier lane: fresh evidence promotes a different
  owner ahead of active-gate snapshot coverage, the fix requires harness
  timeout changes, or the scenario remains red after focused startup proof.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

Review and fix sequencing must be recorded before runtime implementation
starts. The implementation entry is recorded after the fresh implementation
subagent completes this package.

- [x] Review subagent recorded:
      Agent Lorentz (019e1f7b-2910-75f1-ab78-7ddc820d9259) reviewed work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Plato (019e1f7d-e951-7610-b22b-9b0211cbe7a3) fixed work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-fresh-active-gate-continuation

## In Scope

1. Fresh `rolling-restart` red evidence from
   `test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`.
2. Startup active-gate snapshot coverage, selected snapshot query behavior, and
   bootstrap admission loops that keep joiners inactive.
3. Move-replica handoff stabilization evidence exposed through bootstrap
   readiness and admission retry hints.
4. The diagnostics proof that explicit empty priority-recovery progress-class
   contracts satisfy the priority-recovery edge instead of falling back to
   retained partition witnesses.
5. The active sprint tracker and generated current-blocker files.
6. Same-scenario successor blockers found by canonical extractors after each
   representative rerun.

## Out Of Scope

1. Treating classification-only, accepted backpressure, reduced evidence, or
   owner migration as sprint success.
2. Reopening priority recovery or publication convergence unless fresh
   canonical evidence promotes them back to the first frontier.
3. Publication-convergence implementation while publication remains
   `PUBLISHED` with zero pending acknowledgements.
4. Harness timeout increases.
5. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: this package, active sprint handoff, generated current-blocker
  files, `work/model-ledger.jsonl`, selected bootstrap active-gate runtime
  files, the topology convergence diagnostics file, and focused tests named in
  the metadata.
- Forbidden files: harness timeout increases, publication-convergence
  implementation without fresh first-frontier evidence, priority-recovery
  reopening without fresh first-frontier evidence, Pro behavior, Enterprise
  behavior, and roadmap rows outside AGPL scope.
- Frozen decisions: `rolling-restart` green is the only sprint success
  measure; non-green classifications keep the sprint active.
- Escalation triggers: fresh evidence promotes priority recovery, publication
  convergence, readiness support, harness timeout, Pro, or Enterprise behavior;
  bootstrap admission or move-replica handoff cannot expose one bounded owner
  path; scenario remains red after focused startup active-gate proof.
- Focused proof: canonical evidence summary, topology explanations for
  `priority_recovery_partition_progress` and `active_gate_snapshot_coverage`,
  causal model, distributed-failure analyzer, focused bootstrap tests,
  diagnostics tests, runtime guardrails, and one representative
  `rolling-restart` rerun.
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `startup_active_gate_owner / snapshot_coverage` owns
  the fresh first frontier, bootstrap admission, move-replica handoff
  stabilization, and selected snapshot coverage must converge through one
  bounded owner path until all rolling-restart nodes become `ACTIVE`.
- Stop-condition check: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
- Expected causal model change: the first frontier converges to
  representative-green or exposes the next same-scenario owner boundary with
  fresh evidence; non-green classification does not close the sprint.
- Representative outcome: `pending-before-rerun`
- Causal debt: the latest run is red with `active=2/5`,
  `snapshotCoverage=1/5`, publication `PUBLISHED`, `pendingAck=0`, and
  priority recovery progress satisfied. Three joiners remain behind
  `BOOTSTRAP_NOT_READY` and `MOVE_REPLICA_HANDOFF_STABILIZING`, while the
  selected snapshot probe times out.
- Cross-boundary review: review found fixes-required on the predecessor
  startup-readiness handoff; fix subagent Codex
  (019e1f7d-e951-7610-b22b-9b0211cbe7a3) repaired sprint and predecessor
  package truth. The fresh active-gate continuation records
  `blocked-by-environment-policy` for implementation delegation because this
  host requires an explicit user request before spawning subagents.

## Scenario Causal Closure

- Reference scenario/probe: May 13, 2026 green-only `rolling-restart`
  baseline plus dispatch-retry recovery readiness rerun.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, rebalancer handoff, startup active-gate snapshot coverage, startup
  readiness.
- Current first frontier: `active_gate_snapshot_coverage` is blocked under
  `startup_active_gate_owner / snapshot_coverage` with active-gate timeout,
  `active=2/5`, and `snapshotCoverage=1/5`.
- Known downstream blockers: `readiness_startup_support` is terminal after
  active-gate coverage improves; publication ACK convergence remains satisfied;
  priority recovery progress is satisfied by explicit active-gate progress
  class evidence.
- Missing causal edge: startup active-gate must turn move-replica handoff
  stabilization, bootstrap admission retry hints, and selected snapshot query
  timeouts into one bounded owner path instead of letting joiners spin until
  the active gate expires.
- Missing causal edge probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage`
- Bounded progress proof: focused tests plus representative rerun must prove
  bounded bootstrap admission, handoff stabilization, selected snapshot
  coverage, or a narrower owner-boundary migration.
- Bounded progress proof artifact:
  `test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
- Expected observable transition: `rolling-restart` passes, or fresh evidence
  names the next active same-scenario owner boundary.
- Max progress bound: one startup active-gate owner cycle plus one
  representative rerun after focused tests pass.
- Same-frontier fallback: keep this package active and continue canonical
  evidence-driven fixes until `rolling-restart` passes.
- Expected next frontier: representative-green `rolling-restart`; any non-green
  successor remains active sprint work.
- Result classification:
  `pending-before-probe`
- Stop condition: `continue-local-fix`

## Validation

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress`
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
5. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
6. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
7. `node --test test/bootstrap/node-joining-service.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js`
8. `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/scripts/summarize-representative-evidence.test.js test/control-plane/priority-recovery-snapshot.test.js`
9. `node scripts/check-guideline-literals.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js`
10. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js`
11. `npm run audit:runtime-grammar:file -- src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/contact-seed-phase.js src/diagnostics/topology-convergence-graph.js ./test/bootstrap/dynamic-partition-cdc-subscription.test.js ./test/bootstrap/move-replica-assignment-token.test.js ./test/bootstrap/node-joining-service.test.js ./test/diagnostics/topology-convergence-graph.test.js ./test/scripts/analyze-topology-convergence.test.js`
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --fast-local --verbose`
