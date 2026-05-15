# Startup Active Gate Snapshot Coverage Owner Reconcile Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "Fresh rolling-restart evidence after handoff contract consolidation remains red at active_gate_snapshot_coverage: all five nodes report active, publication ACK is satisfied, the canonical handoff contract is present, snapshot coverage is 2/5, pending reconcile remains visible, and runtimePromotionAllowed=false.",
  "nextAction": "Implement the owner-key publication reconcile path required by nextAction=reconcile_owner_membership_publication so rolling-restart reaches active=5/5, snapshotCoverage=5/5, missingPublished=0 without timeout increases or active-gate admission relaxation.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:package:doctor -- --fix-dry-run work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:validate -- --entry work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:validate -- --pre-impl work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json",
    "npm run work:validate -- --closure work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "writeScope": [
    "work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md",
    "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json"
  ],
  "commitScope": [
    "work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-green-gate/current-frontier",
    "outputProfile": "high",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement owner-key publication reconcile from the canonical handoff contract so snapshot coverage reaches 5/5 and missingPublished reaches 0 without relaxing active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "After the publication-to-active-gate handoff contract is explicit, startup_active_gate_owner / snapshot_coverage must drain owner_reconcile_pending by running the owner-key publication reconcile path and producing durable active membership visibility for the expected cohort.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green with active=5/5, snapshotCoverage=5/5, missingPublished=0, or the package migrates to a narrower owner boundary with concrete evidence and next action.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The handoff-contract sprint removed duplicate handoff truth, but fresh representative evidence still times out at active_gate_snapshot_coverage. The handoff contract is present and pending with nextAction=reconcile_owner_membership_publication, pendingReconcileCount=3, and runtimePromotionAllowed=false. Leaving this unresolved keeps rolling-restart red even though publication ACK and node activity are otherwise visible.",
    "crossBoundaryReview": "This package starts after the handoff-contract simplification sprint. It must not reopen publication handoff ownership unless canonical evidence promotes publication_ack_convergence again; diagnostics and analyzer surfaces remain observation-only."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup active-gate snapshot coverage owner reconcile closure",
    "phaseChain": [
      "freeze latest reduced handoff evidence",
      "prepare subagent review/fix/implementation sequencing",
      "identify exact owner-key reconcile path",
      "implement bounded owner reconcile without admission relaxation",
      "prove focused owner/consumer tests and static guardrails",
      "rerun representative rolling-restart until green or narrowed"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with state blocked and dominant reason active_gate_timed_out in test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "publication ACK convergence is satisfied and the canonical handoff contract exists",
      "snapshot coverage remains 2/5 while expectedNodeCount=5",
      "handoffContract.state=pending with reasonCode=owner_reconcile_pending and nextAction=reconcile_owner_membership_publication",
      "runtimePromotionAllowed=false, so active-gate admission must stay strict",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress"
    ],
    "missingCausalEdge": "The remaining missing edge is bounded owner-key reconcile from the canonical handoff pending-reconcile cohort into durable published active membership and selected snapshot coverage.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Current probe proves a concrete reconcile mechanism: missingEdge=null, contractEdge=publication_active_gate_handoff_contract, nextAction=reconcile_owner_membership_publication, pendingReconcileCount=3, and runtimePromotionAllowed=false. This package must make that reconcile advance or classify a narrower owner blocker.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "expectedObservableTransition": "Representative rolling-restart reaches active=5/5, snapshotCoverage=5/5, missingPublished=0, or moves to a new first frontier with a narrower owner boundary and no duplicate handoff truth.",
    "maxProgressBound": "one green-gate package slice; no planned split may defer owner-key reconcile, focused tests, static guardrails, representative rerun, or closure classification",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier after implementation, record whether owner reconcile advanced, stalled, or exposed a narrower runtime owner; do not reopen the completed handoff-contract package by default.",
    "expectedNextFrontier": "representative-green, readiness_startup_support after active-gate coverage improves, migrated operation_workflow_owner / workflow_progress if canonical evidence promotes it, or same-frontier with a narrower owner-key reconcile blocker",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced",
      "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md / startup_active_gate_owner / snapshot_coverage / dormant stopped-sprint context",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The prior oscillation boundary was reduced by the canonical handoff contract. This package owns the current active-gate snapshot coverage gate and must not duplicate handoff truth.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; consumers must use the canonical handoff contract rather than reconstructing publication truth."
  },
  "predecessor": "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md"
}
-->

## Why

The last sprint reduced the publication-to-active-gate boundary: the handoff
contract is now explicit, shared, and visible in the representative artifact.
`rolling-restart` is still red because startup active-gate snapshot coverage
does not advance from `2/5` to `5/5` while the canonical handoff says owner
publication reconcile is pending.

This package owns the remaining green-gate blocker. It must make
`nextAction=reconcile_owner_membership_publication` actually drain into durable
published active membership and selected snapshot coverage, or produce a
narrower owner-boundary migration with canonical evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the sprint goal is representative green, but
  the package starts from a recently oscillating publication/active-gate
  boundary, so the local owner reconcile patch must keep the causal handoff
  invariant explicit before implementation.
- Escalation trigger to a heavier lane: canonical evidence promotes a different
  first owner boundary before owner-key reconcile can be implemented.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Preserve the completed canonical handoff contract and consume it as the only
   publication-to-active-gate handoff truth.
2. Locate and implement the owner-key reconcile path required by
   `reconcile_owner_membership_publication`.
3. Advance pending reconcile node IDs into durable published active membership
   and selected snapshot coverage.
4. Keep active-gate admission strict while `runtimePromotionAllowed=false`.
5. Update focused owner/consumer tests, diagnostics/harness fixtures, and
   replay surfaces only where they are part of this owner path.
6. Rerun representative `rolling-restart` and classify it as green, migrated,
   same-frontier, classification-only, or architecture-gap with concrete owner
   evidence.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation while `runtimePromotionAllowed=false`.
3. Publication handoff contract rewrites unless canonical evidence promotes
   that owner again.
4. Pro or Enterprise behavior
5. Diagnostics-only success or presentation-only reclassification.

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation package.
This is the first package in the new sprint.

- [x] Review subagent recorded:
      not-needed (first-package-in-sprint)
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-green-gate/current-frontier`
- Output profile: `high`
- Owned files: `work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, `work/releases/0.1-dependency-map.md`, `work/releases/0.1-stabilization.md`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `publication handoff contract rewrites unless canonical evidence promotes that owner again`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:validate -- --entry work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:validate -- --pre-impl work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json`, `npm run work:validate -- --closure work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
7. npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
8. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
9. npm run work:validate -- --entry work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
10. npm run work:validate -- --pre-impl work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
11. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --fast-local --verbose
12. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json
13. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --handoff-probe
14. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json
15. npm run work:validate -- --closure work/packages/active-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
