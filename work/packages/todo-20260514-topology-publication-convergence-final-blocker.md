# Topology Publication Convergence Final Blocker

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Final ship confirmation failed and selected publication_ack_convergence as the first frontier. The final artifact reports active=0/5, snapshotCoverage=2/5, publication=PUBLISHED, pendingAck=0, missingPublished=4, missingPublishedIds=11601fe0-72d6-5853-8590-ec2881853e72|35a891b8-c1a0-5064-9c6e-2acfba61c2a7|8be8d30f-4499-5eed-865c-71b4d529a67a|ebc4aa0b-06c6-506d-93ea-1dd2deca3f58. Priority recovery remains a non-frontier tail with two operation_workflow_owner / workflow_progress witnesses.",
  "nextAction": "Hold the sprint on this narrow publication convergence blocker. Do not fix rolling-restart runtime behavior without explicit re-scope; use this package as the handoff for future topology_publication_owner / publication_convergence work.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json"
  ],
  "writeScope": [
    "work/packages/todo-20260514-topology-publication-convergence-final-blocker.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/packages/active-20260514-topology-ship-gate-final-confirmation.md",
    "work/packages/done-20260514-topology-priority-recovery-residual-drain.md",
    "work/packages/done-20260514-topology-contract-integration-reconciliation.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/todo-20260514-topology-publication-convergence-final-blocker.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Future work may fix or further split publication convergence only after explicit re-scope."
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_convergence work should reduce, migrate, or classify missing_published_nodes_present without hiding active-gate snapshot coverage or priority recovery tails.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "expectedCausalModelChange": "missing_published_nodes_present becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Final confirmation proved the sprint is not ship-ready. Runtime fixes remain out of scope until explicitly re-scoped.",
    "crossBoundaryReview": "Required before implementation through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner / publication_convergence",
    "phaseChain": [
      "canonical final confirmation extraction",
      "topology_publication_owner / publication_convergence focused proof",
      "representative rerun classification"
    ],
    "currentFirstFrontier": "topology_publication_owner / publication_convergence from final confirmation artifact",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage remains 2/5 after publication convergence",
      "priority recovery has two non-frontier operation workflow witnesses in final evidence"
    ],
    "missingCausalEdge": "publication PUBLISHED with pendingAck=0 still coexists with missingPublished=4 and active=0/5",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "boundedProgressProof": "Future work must prove publication convergence through owner truth, typed missing-published reasons, retry/reconcile evidence, or terminal classification.",
    "boundedProgressProofArtifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "expectedObservableTransition": "missing_published_nodes_present resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "not executed in this sprint segment; this package is an active handoff until runtime work is explicitly re-scoped",
    "sameFrontierFallback": "keep topology_publication_owner / publication_convergence active and do not broaden into rolling-restart runtime fixes",
    "expectedNextFrontier": "publication convergence green or a narrower topology publication owner blocker",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Final ship confirmation selected `topology_publication_owner /
publication_convergence` as the first frontier. The rolling-restart final
artifact is red with `active=0/5`, `snapshotCoverage=2/5`,
`publication=PUBLISHED`, `pendingAck=0`, and `missingPublished=4`.

This package is an active handoff for future publication convergence work. It
does not start runtime repair in the current tools/observability sprint
segment.

## Scope Basis

AGPL topology convergence release-gate closure. Final confirmation cannot close
the sprint, so the sprint must point at the exact owner-boundary blocker rather
than a completed focused package.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the next semantic blocker is one runtime owner
  boundary, but execution is paused until explicit runtime-fix re-scope.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or
  representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Record final confirmation evidence and the exact publication convergence
   blocker.
2. Keep `current-blocker` pointed at this package after final confirmation
   closes as migrated.
3. Preserve the non-frontier priority recovery tail as downstream evidence
   without starting operation workflow repair.

## Out Of Scope

1. rolling-restart-runtime-fixes-without-explicit-rescope
2. operation-workflow-runtime-fixes
3. active-gate-runtime-fixes
4. harness-timeout-stretching

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260514-topology-publication-convergence-final-blocker.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `rolling-restart-runtime-fixes-without-explicit-rescope`, `operation-workflow-runtime-fixes`, `active-gate-runtime-fixes`, `harness-timeout-stretching`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
2. npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
