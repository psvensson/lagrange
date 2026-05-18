# Topology Publication Convergence After Startup Readiness Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Startup readiness support is now classified as inherited active-gate support evidence for selectedSnapshotError snapshot_timeout. The fresh artifact remains red at active=0/5 and snapshotCoverage=0/5; scenario-route reports publication_ack_convergence under topology_publication_owner / publication_convergence as the visible local blocker, with priority residual witnesses at zero.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then classify or repair publication_pending without touching operation workflow runtime, startup active-gate runtime, startup readiness support, or timeout budgets.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run work:advance -- --check"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
    "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
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
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Run required subagent sequencing, then classify or repair the publication_pending local blocker selected after startup readiness support reduced to inherited active-gate evidence."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_readiness_owner",
    "fromBoundary": "startup_support_evidence",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The predecessor diagnostic package removed startup_readiness_blocked by classifying selectedSnapshotError snapshot_timeout as inherited active-gate support evidence. The fresh artifact still fails with publication_ack_convergence as the first visible frontier and scenario-route now reports classified_local_blocker for topology_publication_owner / publication_convergence.",
    "evidence": [
      "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --test test/diagnostics/topology-convergence-graph.test.js --test test/diagnostics/failure-class-taxonomy.test.js --test test/diagnostics/stop-condition-decision.test.js --test test/diagnostics/causal-graph-builder.test.js --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If topology_publication_owner / publication_convergence owns the current local blocker, focused owner proof should reduce publication_pending, migrate to a concrete successor owner boundary, or classify the remaining publication evidence without reopening startup readiness, active-gate runtime, operation workflow runtime, or timeout budgets.",
    "stopConditionCheck": "Use scenario-route, evidence-summary, npm run analyze:causal-model, owner-files, and work:advance before runtime edits. Runtime edits require the package's required review/fix/implementation subagent sequence.",
    "expectedCausalModelChange": "Publication_ack_convergence becomes satisfied, reduces to a narrower publication owner edge, migrates to a successor owner boundary, or remains same-frontier with concrete publication owner evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The fresh artifact still has active=0/5, snapshotCoverage=0/5, active-gate snapshot source timeout, and zero priority residual witnesses. This package must not absorb startup active-gate runtime, startup readiness runtime, operation workflow runtime, or timeout-budget work.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation package is a scenario-driven runtime owner-boundary package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after startup readiness support classification",
    "phaseChain": [
      "active-gate owner reconcile closed as classification-only",
      "fresh representative stalled at active=0/5 and snapshotCoverage=0/5",
      "startup readiness support reduced selectedSnapshotError snapshot_timeout to inherited active-gate evidence",
      "priority residual extraction reports zero witnesses",
      "scenario-route selects publication_ack_convergence as the local blocker"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json, owned by topology_publication_owner / publication_convergence with publication_pending, publicationStatus UNKNOWN, missingPublishedCount=5, and zero priority recovery residual witnesses.",
    "knownDownstreamBlockers": [
      "runner stalled with active=0/5 and snapshotCoverage=0/5",
      "publicationStatus is UNKNOWN and missingPublishedCount is 5",
      "active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout",
      "selectedSnapshotNodeId is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotTimeoutMs is 3000",
      "readiness_startup_support is deferred as inherited active-gate no progress",
      "priority recovery residual witnesses are zero"
    ],
    "missingCausalEdge": "Determine whether publication_pending is a topology publication owner bug, a bounded publication support classification, or a migration to a concrete successor owner boundary.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "boundedProgressProof": "Pending: required subagent sequence must run before implementation; first proof is the publication-convergence scenario route and owner-files review, then any runtime proof must name a bounded publication reconcile or retry mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "expectedObservableTransition": "Publication convergence reduces, migrates, classifies as same-frontier with concrete owner evidence, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "If focused proof cannot move or classify publication_pending, record same-frontier and do not widen into active-gate, readiness, operation workflow, or timeout-budget work.",
    "expectedNextFrontier": "publication_ack_convergence until focused proof reduces, migrates, or classifies it",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md / startup_readiness_owner / startup_support_evidence / migrated",
      "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md / release_gate_owner / representative_evidence / migrated",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "Allowed because focused diagnostic proof changed the selected owner boundary by removing startup_readiness_blocked from the fresh causal model.",
    "handoffInvariant": "Startup readiness runtime, startup active-gate runtime, operation workflow runtime, and timeout budgets remain frozen unless canonical evidence selects them again."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No architecture decision gate is required before the publication-convergence proof."
  },
  "predecessor": "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md"
}
-->

## Why

The predecessor diagnostic package proved that the selected snapshot timeout is
startup active-gate support evidence, not a startup readiness owner bug. The
fresh rolling-restart artifact is still red, and the remaining selected local
blocker is `publication_ack_convergence` under
`topology_publication_owner / publication_convergence`.

This package owns the publication-convergence proof only. It must not absorb
startup active-gate runtime, startup readiness runtime, operation workflow
runtime, or timeout-budget work.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical diagnostics select a runtime owner boundary after a migrated
  diagnostic package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run the review/fix/implementation sequence before
runtime or test implementation edits.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e39f8-8f6c-78a0-9f52-ab8a604cb8e0) reviewed work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-evidence.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-recovery-gate.js
9. src/control-plane/publication-recovery-evidence.js
10. test/control-plane/publication-owner-stream.test.js
11. test/control-plane/publication-recovery-gate.test.js
12. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. operation_workflow_owner/runtime
2. startup_active_gate_owner/runtime
3. startup_readiness_owner/runtime
4. harness-timeout-increase

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `operation_workflow_owner/runtime`, `startup_active_gate_owner/runtime`, `startup_readiness_owner/runtime`, `harness-timeout-increase`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
4. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
5. npm run work:advance -- --check
