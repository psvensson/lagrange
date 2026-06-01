# Topology Publication Count Only ACK Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused publication owner, recovery gate, recovery evidence, harness projection, and topology graph fixes closed the stale count-only ACK edge. The latest rolling-restart artifact now marks publication_ack_convergence satisfied: publication is PUBLISHED, pendingAckCount=0, pendingAckNodeIds=[], publicationOwnerAckState=not_required, freshnessFence=consumer_lag, recoveryOutcome=waiting_for_consumer, streamOutcome=stale, and priority recovery has zero residual witnesses. The representative scenario remains red after migration: active_gate_snapshot_coverage is blocked under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, owner_reconcile_pending, snapshot_coverage_incomplete, and snapshot_repair_deferred.",
  "nextAction": "Close this publication package as migrated and continue with a focused startup_active_gate_owner / snapshot_coverage successor using test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json. Do not relax active-gate admission, increase timeouts, or reopen publication ACK debt while publication_ack_convergence remains satisfied.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "npm run work:validate -- --entry work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run work:subagent-prompt -- --role review --package work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "npm run work:subagent-prompt -- --role fix --package work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "npm run work:validate -- --pre-impl work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "node --test test/distributed/harness/__tests__/failure-bundle.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js",
    "git diff --check -- work/packages/done-20260516-topology-publication-count-only-ack-closure.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/tracks/topology-convergence.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js src/diagnostics/topology-convergence-graph.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md",
    "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json"
  ],
  "generatedFiles": [
    "test-output/reports/rolling-restart-after-count-only-ack-closure-20260516.report.json",
    "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "runtime ownership changes",
      "representative scenario evidence changes",
      "files outside the publication convergence consumer/reporting scope"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage. Required progress mechanism is reconcile; handoff has pendingReconcileCount=0 but activeGateOwnerCohort reports one missing published recovery target."
  },
  "causalGovernance": {
    "hypothesis": "A PUBLISHED publication with an explicit empty pending ACK node list should close stale count-only ACK debt and allow missing published membership to classify as consumer lag rather than pending ACK convergence.",
    "stopConditionCheck": "Run focused owner/gate/harness tests, static guardrails, representative rolling-restart, work:evidence-summary, handoff-probe, priority residual extraction, npm run analyze:causal-model, and owner-files on the fresh artifact.",
    "expectedCausalModelChange": "publication_ack_convergence becomes satisfied and the first actionable frontier migrates to active_gate_snapshot_coverage, or the package remains on a concrete non-count-only publication edge.",
    "representativeOutcome": "migrated",
    "causalDebt": "The latest artifact satisfies publication ACK convergence and priority recovery, but active-gate snapshot coverage remains blocked with snapshotCoverage=2/5, expectedNodeCount=5, selected snapshot repair_deferred, publicationActiveGateHandoffState=pending, pendingReconcileCount=0, and activeGateOwnerCohortMissingPublishedCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72.",
    "crossBoundaryReview": "Review, fix, and implementation proof are recorded with real agent identities. Do not continue editing publication ACK evidence after the canonical extractors mark publication_ack_convergence satisfied."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after top-level publication projection repair",
    "phaseChain": [
      "fresh checkpoint reselected publication_ack_convergence",
      "focused publication owner and recovery gate repair closed PUBLISHED empty ACK-list debt",
      "harness top-level projection and topology graph accepted not_required ACK closure",
      "representative rolling-restart rerun",
      "canonical extractors migrated the first frontier to active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with publication PUBLISHED, pendingAckCount=0, pendingAckNodeIds=[], publicationOwnerAckState=not_required, freshnessFence=consumer_lag, recoveryOutcome=waiting_for_consumer, streamOutcome=stale",
      "priority-recovery residual extraction reports zero witnesses",
      "active-gate snapshot coverage is blocked with activeGateState=timed_out, snapshotCoverageNodeCount=2, expectedNodeCount=5, selectedSnapshotObservationMode=repair_deferred, and reason codes cache_stale_watermark, discovery_node_coverage_gap, stale_replica_operations_in_flight",
      "handoff contract remains pending with reason owner_reconcile_pending, nextAction=wait_owner_recovery, runtimePromotionAllowed=false, pendingReconcileCount=0, and activeGateOwnerCohort pending recovery for node 11601fe0-72d6-5853-8590-ec2881853e72"
    ],
    "missingCausalEdge": "The next package must explain why activeGateOwnerCohort has one missing published recovery target while the active-gate handoff pendingReconcileCount is 0, then make that target publish, recover, split, or migrate.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe",
    "boundedProgressProof": "Focused publication repair made publication_ack_convergence satisfied and priority recovery clean; npm run analyze:causal-model now reports active_gate_snapshot_coverage_incomplete with outcome continue_local_fix and the handoff probe names reconcile as the required progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "expectedObservableTransition": "The successor should reduce the one active-gate owner cohort recovery target, improve selected snapshot coverage, or migrate to a narrower owner with canonical evidence.",
    "maxProgressBound": "one focused publication convergence package slice and one representative rerun before owner-boundary migration.",
    "sameFrontierFallback": "Not used; publication_ack_convergence is satisfied in canonical evidence.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260516-foundationdb-style-deterministic-missing-edge-replay.md / diagnostics_owner / deterministic_missing_edge_replay / migrated"
    ],
    "oscillationCheck": "This package re-entered publication convergence only because fresh evidence selected pending ACK convergence. It closes after canonical evidence migrates to active-gate snapshot coverage.",
    "handoffInvariant": "Active-gate admission remains strict while runtimePromotionAllowed=false; publication handoff truth remains owned by canonical recovery evidence and topology graph classification."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The latest representative artifact marks publication_ack_convergence satisfied and priority recovery clean. The causal graph, evidence summary, and handoff probe select active_gate_snapshot_coverage as the only critical path with owner_reconcile_pending and snapshot_coverage_incomplete evidence.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
    ]
  },
  "predecessor": "work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md"
}
-->

## Why

Fresh representative evidence reselected publication ACK convergence after the
systems-pattern checkpoint. This package narrowed the edge to stale count-only
ACK evidence: publication was already `PUBLISHED` with an explicit empty
`pendingAckNodeIds` list, but raw count-only projections still preserved
`pendingAckCount=1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the publication frontier returned after recent
  related packages, so this package records oscillation context and proves the
  count-only ACK edge before migration.
- Escalation trigger to a heavier lane: fresh canonical evidence selects a
  different owner boundary or the fix needs files outside the declared
  publication convergence consumer/reporting scope.

## Subagent Sequencing Requirement

Required before implementation because this package is a scenario-driven
runtime owner-boundary package under the oscillation guard.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Hooke (019e30e4-b7e5-7ed3-b6ef-b2da2315bc0b) reviewed work/packages/done-20260516-topology-publication-count-only-ack-closure.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Epicurus (019e30e7-660a-7173-955b-e0694d50c30a) fixed work/packages/done-20260516-topology-publication-count-only-ack-closure.md.
- [x] Implementation subagent recorded: Agent Codex (be6e02e6-c909-43b4-9c47-a8c2b1b7de04) implemented work/packages/done-20260516-topology-publication-count-only-ack-closure.md.

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

## In Scope

1. `src/control-plane/publication-owner-evidence.js`
2. `src/control-plane/publication-recovery-gate.js`
3. `src/control-plane/publication-recovery-evidence.js`
4. `test/control-plane/publication-owner-stream.test.js`
5. `test/control-plane/publication-recovery-gate.test.js`
6. `test/control-plane/publication-recovery-evidence.test.js`
7. `test/distributed/harness/publication-evidence-contract.js`
8. `test/distributed/harness/failure-bundle-segment-4.js`
9. `test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js`
10. `src/diagnostics/topology-convergence-graph.js`
11. Work package, sprint, track, current-blocker, and model ledger handoff files.

## Out Of Scope

1. `src/startup-active-gate`
2. Representative timeout budget changes
3. Active-gate admission relaxation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-topology-publication-count-only-ack-closure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/distributed/harness/publication-evidence-contract.js`, `test/distributed/harness/failure-bundle-segment-4.js`, `test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js`, `src/diagnostics/topology-convergence-graph.js`
- Forbidden files: `src/startup-active-gate`, `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: runtime ownership changes, representative scenario evidence changes, or files outside the publication convergence consumer/reporting scope.
- Focused proof: owner tests, failure-bundle tests, guideline checks, runtime grammar audit, representative rolling-restart, evidence summary, handoff probe, priority residual extraction, causal-model, and owner-files extraction listed in metadata proof.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/done-20260516-topology-publication-count-only-ack-closure.md
3. npm run work:validate -- --entry work/packages/done-20260516-topology-publication-count-only-ack-closure.md
4. npm run work:llm-start
5. npm run work:validate -- --pre-impl work/packages/done-20260516-topology-publication-count-only-ack-closure.md
6. node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js
7. node --test test/distributed/harness/__tests__/failure-bundle.test.js
8. node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js
9. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js
10. npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js src/diagnostics/topology-convergence-graph.js
11. git diff --check -- package-owned files
12. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --verbose
13. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json
14. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe
15. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown
16. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json
17. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown

## Implementation Result

Focused tests and harness proof now treat a `PUBLISHED` publication with an
explicit empty pending ACK node list as a closed required ACK list. That closes
stale count-only ACK debt in the owner stream, publication recovery gate,
canonical recovery evidence, top-level failure-bundle projection, and topology
graph consumer-lag classification.

Representative rerun:
`test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json`
is still red, but the first frontier migrated. Canonical evidence reports
`publication_ack_convergence` satisfied, priority recovery residual witnesses
at zero, and `active_gate_snapshot_coverage` blocked under
`startup_active_gate_owner / snapshot_coverage`.

## Migration Result

- From: `topology_publication_owner / publication_convergence`
- To: `startup_active_gate_owner / snapshot_coverage`
- Reason: publication ACK convergence is satisfied and the canonical critical
  path is now active-gate snapshot coverage.
- Successor should investigate the mismatch between handoff
  `pendingReconcileCount=0` and `activeGateOwnerCohort` reporting one pending
  recovery target for `11601fe0-72d6-5853-8590-ec2881853e72`.

## Commit And Push Ledger

1. Focused package commit: b3b04d73e1f0f72ea163dfe463e4e6475d09d7ff
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
