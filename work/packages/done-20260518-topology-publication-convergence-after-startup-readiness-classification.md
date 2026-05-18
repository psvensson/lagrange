# Topology Publication Convergence After Startup Readiness Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused implementation classifies UNKNOWN/no-epoch/no-node-list count-only publication debt as unpublished startup evidence. A fresh rolling-restart rerun no longer reports UNKNOWN/no-epoch publication debt; it reports concrete publicationStatus OPEN, publicationEpoch=1, publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, and five retry-scheduled operation_workflow_owner / rebalancer_handoff residual witnesses.",
  "nextAction": "Closed as reduced and handed off to work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md. Continue there after the required review/fix/implementation subagent sequence; keep publication runtime, startup active-gate runtime, startup readiness runtime, and timeout budgets frozen unless fresh canonical evidence reselects them.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-evidence-open-membership.test.js",
    "npm run work:advance -- --check"
  ],
  "writeScope": [
    "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
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
    "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md"
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
    "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
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
    "status": "reduced-same-frontier-concrete-evidence",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Continue in the operation_workflow_owner / rebalancer_handoff successor for the retry-scheduled priority recovery residuals exposed after the UNKNOWN count-only publication debt was reduced."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "The focused publication classifier removes the stale UNKNOWN/no-epoch/no-node-list count-only debt. The fresh rerun still has publication_ack_convergence visible first, but priority residual extraction now reports one concrete operation_workflow_owner / rebalancer_handoff group with five retry-scheduled dispatched_waiting_progress witnesses and nextRequiredAction wait_for_operation_progress.",
    "evidence": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If topology_publication_owner / publication_convergence owns the current local blocker, focused owner proof should reduce publication_pending, migrate to a concrete successor owner boundary, or classify the remaining publication evidence without reopening startup readiness, active-gate runtime, operation workflow runtime, or timeout budgets.",
    "stopConditionCheck": "Use scenario-route, evidence-summary, npm run analyze:causal-model, owner-files, and work:advance before runtime edits. Runtime edits require the package's required review/fix/implementation subagent sequence.",
    "expectedCausalModelChange": "Observed: publication_ack_convergence remains visible first, but the stale UNKNOWN/no-epoch/no-node-list evidence reduced to concrete OPEN epoch-1 publication evidence and priority residual extraction selected operation_workflow_owner / rebalancer_handoff.",
    "representativeOutcome": "reduced",
    "causalDebt": "The fresh rerun remains red at active=0/5 and snapshotCoverage=2/5 with publicationStatus OPEN, publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, and five operation_workflow_owner / rebalancer_handoff witnesses. This package did not patch operation workflow, active-gate runtime, readiness runtime, or timeout budgets.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation package is a scenario-driven runtime owner-boundary package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after startup readiness support classification",
    "phaseChain": [
      "active-gate owner reconcile closed as classification-only",
      "pre-fix representative stalled at active=0/5 and snapshotCoverage=0/5",
      "startup readiness support reduced selectedSnapshotError snapshot_timeout to inherited active-gate evidence",
      "priority residual extraction initially reported zero witnesses",
      "focused publication classifier reduces UNKNOWN/no-epoch/no-node-list count-only publication debt",
      "fresh representative rerun reports concrete OPEN epoch-1 publication evidence and operation_workflow_owner / rebalancer_handoff residual witnesses"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains visible in test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json, but the publication evidence is now concrete: publicationStatus OPEN, publicationEpoch=1, publishedActive=1/5, missingPublishedCount=4, and prioritySpreadPending=true.",
    "knownDownstreamBlockers": [
      "runner stalled with active=0/5 and snapshotCoverage=2/5",
      "publicationStatus is OPEN with publicationEpoch=1",
      "publishedActiveNodeIds contains one seed node while four nodes remain missing from publication",
      "prioritySpreadPending is true",
      "priority residual extraction reports five operation_workflow_owner / rebalancer_handoff retry-scheduled witnesses",
      "active_gate_snapshot_coverage is deferred with owner_reconcile_pending and snapshot_repair_deferred",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "Determine whether the retry-scheduled rebalancer_handoff witnesses should drain, classify as bounded backpressure, or split to a narrower operation workflow owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "boundedProgressProof": "Implemented a bounded classification mechanism in src/control-plane/publication-recovery-evidence.js with regression coverage in test/control-plane/publication-recovery-evidence.test.js: UNKNOWN publication status, publicationEpoch=0, no concrete ACK/member node-list evidence, pendingAckCount=0, and count-only missingPublishedCount now classify as unpublished_observation / not_started rather than publication_pending.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json plus focused publication recovery tests",
    "expectedObservableTransition": "Observed reduction from UNKNOWN/no-epoch/no-node-list debt to concrete OPEN epoch-1 publication evidence; successor owns the retry-scheduled rebalancer_handoff residuals.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "If focused proof cannot move or classify publication_pending, record same-frontier and do not widen into active-gate, readiness, operation workflow, or timeout-budget work.",
    "expectedNextFrontier": "operation_workflow_owner / rebalancer_handoff for retry-scheduled priority recovery residual witnesses",
    "resultClassification": "reduced",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md / startup_readiness_owner / startup_support_evidence / migrated",
      "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md / release_gate_owner / representative_evidence / migrated",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "Allowed because focused diagnostic proof changed the selected owner boundary by removing startup_readiness_blocked from the fresh causal model.",
    "handoffInvariant": "Topology publication runtime, startup readiness runtime, startup active-gate runtime, and timeout budgets remain frozen unless canonical evidence selects them again."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No architecture decision gate is required before the publication-convergence proof."
  },
  "predecessor": "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md"
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
- [x] Implementation subagent recorded: Agent Codex (019e3a5a-9b58-7f8e-9d38-0e3f4bf71a21) implemented work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md.

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

1. work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md
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
- Owned files: `work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `operation_workflow_owner/runtime`, `startup_active_gate_owner/runtime`, `startup_readiness_owner/runtime`, `harness-timeout-increase`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, focused publication owner tests, static guardrails, and `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
6. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
7. node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-evidence-open-membership.test.js
8. node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
9. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
10. npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
11. npm run work:advance -- --check

## Extractor Fallback Note

Canonical extractors used: `work:scenario-route`, `work:evidence-summary`,
`analyze:causal-model`, `analyze:owner-files`,
`analyze:priority-recovery-residuals`, `analyze:topology-convergence`, and
`analyze:distributed-failure`. A focused raw report read was used only after
those extractors did not expose the full `publicationOwnerStream` and
`publicationRecoveryGate` field-level shape needed to isolate the count-only
UNKNOWN/no-node-list publication debt case.

## Commit And Push Ledger

1. Focused package commit: `d62b3d4a`
2. Closure ledger commit: `a3ba4083`
3. Pushed to: `origin/codex/pending-ack-eligibility-filter`
4. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
