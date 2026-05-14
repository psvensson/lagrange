# Topology Publication Convergence Final Blocker

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Current implementation role widened the bounded publication-planning repair from reason-only to blocked PRIORITY_CONTROL_PLANE_RECOVERY_PENDING readiness evidence while preserving process-dead fail-closed behavior. Focused owner tests and static guardrails pass. Representative checkpoint test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json remains same-frontier red: active=0/5, snapshotCoverage=1/5, publication=PUBLISHED, publicationEpoch=1, pendingAck=0, publishedActive=1/5, missingPublished=4, and first frontier topology_publication_owner / publication_convergence with missing_published_nodes_present. Raw playback after canonical extractors shows the selected runtime publication owner still carries only the seed node in membershipLifecycleSummary/projectionDiagnostics; the missing-node evidence lives in active-gate/bootstrap diagnostics while a non-frontier control_plane_publications operation workflow witness remains persisted_not_dispatched.",
  "nextAction": "Continue from the after-blocked-readiness same-frontier representative artifact, but do not keep broadening the publication planner without new owner evidence. The focused planner proof now covers reason-only and blocked PRIORITY_CONTROL_PLANE_RECOVERY_PENDING readiness entries; representative runtime evidence instead shows the coordinator planning stream lacks those missing-node readiness entries. Next work should either prove a bounded publication-owner ingestion path for runtime-ready/bootstrap evidence, or split/migrate to the operation_workflow_owner / workflow_progress witness if canonical owner evidence is updated to make that the first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json",
    "node test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "node test/control-plane/publication-recovery-gate.test.js",
    "npx eslint src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "node scripts/check-guideline-literals.js src/control-plane/membership-publication-planning.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-planning.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-planning.js",
    "npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-planning.js",
    "npm run guard:guideline:constant-names:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-publication-convergence-final-blocker.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-ship-gate-final-confirmation.md",
    "work/packages/done-20260514-topology-priority-recovery-residual-drain.md",
    "work/packages/done-20260514-topology-contract-integration-reconciliation.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-publication-convergence-final-blocker.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "repair requires operation workflow, active-gate runtime, or harness timeout changes"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Continue with bounded owner evidence: the blocked-readiness focused proof passed, but representative runtime evidence stayed red with missingPublished=4 and did not expose the missing nodes in the publication owner planning stream."
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_convergence work should reduce, migrate, or classify missing_published_nodes_present without hiding active-gate snapshot coverage or priority recovery tails.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "expectedCausalModelChange": "The blocked-readiness focused repair should reduce, migrate, or classify missing_published_nodes_present; representative evidence instead stayed same-frontier red with missingPublished=4.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The focused reason-only and blocked-readiness repairs are green locally, but representative evidence remains red at topology_publication_owner / publication_convergence with publicationEpoch=1, count-only ACK completion, consumer_lag, and four missing published nodes. Raw fallback evidence shows those missing nodes are absent from the runtime publication owner planning stream and appear only in active-gate/bootstrap diagnostics.",
    "crossBoundaryReview": "Required before implementation through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner / publication_convergence",
    "phaseChain": [
      "canonical final confirmation extraction",
      "topology_publication_owner / publication_convergence focused proof",
      "representative rerun classification",
      "same-owner reduced residual continuation"
    ],
    "currentFirstFrontier": "topology_publication_owner / publication_convergence from the after-blocked-readiness representative artifact",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage remains 1/5 in the current progress sample and 2/5 at best after publication convergence",
      "priority recovery has one non-frontier operation_workflow_owner / workflow_progress witness in after-blocked-readiness evidence for control_plane_publications-p1"
    ],
    "missingCausalEdge": "publication PUBLISHED with count-only pendingAck=0 still coexists with missingPublished=4 and active=0/5 after the blocked-readiness focused repair, while selected runtime publication diagnostics still contain only the seed node projection.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "boundedProgressProof": "Focused owner proof now covers publication retry/advance paths for reason-only and blocked priority recovery pending readiness, but representative rolling-restart did not reduce; raw playback shows the missing-node evidence is not present in the runtime publication owner planning input.",
    "boundedProgressProofArtifact": "test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json",
    "expectedObservableTransition": "missing_published_nodes_present resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "representative rolling-restart rerun failed after 143500ms with active=0/5, snapshotCoverage=1/5 current and 2/5 best, publishedActive=1/5, pendingAck=0, missingPublished=4, and one non-frontier operation_workflow_owner / workflow_progress witness",
    "sameFrontierFallback": "keep topology_publication_owner / publication_convergence active only for bounded evidence-ingestion work; do not broaden this package into operation workflow or active-gate runtime fixes without an explicit split",
    "expectedNextFrontier": "same owner boundary for missing nodes 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, 8be8d30f-4499-5eed-865c-71b4d529a67a, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58 unless the next canonical extraction or package split promotes operation_workflow_owner / workflow_progress for control_plane_publications-p1",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Final ship confirmation selected `topology_publication_owner /
publication_convergence` as the first frontier. The first focused repair
reduced the representative `rolling-restart` residual, but the reason-only
and blocked-readiness follow-up checkpoints stayed same-frontier red with
`active=0/5`, `publication=PUBLISHED`, `pendingAck=0`, and
`missingPublished=4`.

This package has been explicitly re-scoped for a narrow runtime repair inside
`topology_publication_owner / publication_convergence`.

## Scope Basis

AGPL topology convergence release-gate closure. Final confirmation cannot close
the sprint, so the sprint must point at the exact owner-boundary blocker rather
than a completed focused package.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the runtime re-scope already happened inside one
  runtime owner boundary, and the package remains active because after-repair
  evidence is reduced but still red.
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
2. Add a focused publication-owner regression for `PUBLISHED` plus
   `pendingAckCount=0` with missing published members.
3. Repair or narrowly classify the owner planning path without changing
   operation workflow, active-gate runtime, or harness timeouts.
4. Preserve the non-frontier priority recovery tail as downstream evidence
   without starting operation workflow repair.

## Out Of Scope

1. rolling-restart-runtime-fixes-without-explicit-rescope
2. operation-workflow-runtime-fixes
3. active-gate-runtime-fixes
4. harness-timeout-stretching

## Subagent Sequencing Ledger

Required when this package is activated because it is a runtime owner-boundary
package.

Prior reduced-progress sequencing proof: Agent Hume
(019e2763-0b74-7553-bdce-bb629f43066e) reviewed this package with result
clean; fix was not-needed; Agent Codex
(019e2766-67d6-7941-8dfd-90d9f143d2af) implemented the focused runtime fix
that reduced the representative residual.

- [x] Review subagent recorded:
   Agent Volta (019e2779-aec9-78a3-9942-1a07f4c54d16) reviewed
   work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
   result fixes-required.
- [x] Fix subagent recorded or explicitly not needed:
   Agent Descartes (019e277c-6c41-7120-be78-2fa2c8cfd85b) fixed
   work/packages/active-20260514-topology-publication-convergence-final-blocker.md.
- [x] Implementation subagent recorded:
   Agent Codex (019e2780-e504-7bf2-b0fc-6ff02ccdad15) implemented
   work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
   result focused-runtime-fix-same-frontier-representative-red.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-publication-convergence-final-blocker.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`, `src/control-plane/membership-publication-planning.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`
- Forbidden files: `rolling-restart-runtime-fixes-without-explicit-rescope`, `operation-workflow-runtime-fixes`, `active-gate-runtime-fixes`, `harness-timeout-stretching`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or repair requires operation workflow, active-gate runtime, or harness timeout changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
2. npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
4. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --fast-local --verbose
5. npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json
6. npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json
7. npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json
8. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --markdown
9. npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json
10. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --fast-local --verbose
11. npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json
12. npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json
13. npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json
14. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --markdown
15. npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json
16. node test/control-plane/membership-publication-coordinator-main-stage-2.js
17. node test/control-plane/publication-recovery-gate.test.js
18. npx eslint src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js
19. node scripts/check-guideline-literals.js src/control-plane/membership-publication-planning.js
20. node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-planning.js
21. npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-planning.js
22. npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-planning.js
23. npm run guard:guideline:constant-names:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js
24. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --fast-local --verbose
25. npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json
26. npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json
27. npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json
28. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --markdown
29. npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json

## Implementation Proof

- Latest continuation proof:
  The parent session widened the publication-planning repair to readiness
  entries that already have blocked serve/write dimensions but carry
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. The repair preserves
  process-dead fail-closed behavior by refusing to synthesize recovery
  projection when `processAlive` is explicitly `false`.
- Runtime change: `src/control-plane/membership-publication-planning.js`
  now merges the bounded recovery-eligible publication-planning dimension into
  priority-recovery-pending readiness evidence instead of only handling
  reason-only entries.
- Regression:
  `test/control-plane/membership-publication-coordinator-main-stage-2.js`
  adds a count-only ACK-complete stale `PUBLISHED` case where the missing
  member has blocked readiness dimensions plus
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`; the owner now reopens the
  publication and includes that node in the ACK-required repair cohort.
- Focused proof commands:
  - The new regression failed before the runtime fix with 62/66 assertions
    passing, then `node test/control-plane/membership-publication-coordinator-main-stage-2.js`
    passed with 66/66 assertions.
  - `node test/control-plane/publication-recovery-gate.test.js` passed with
    85/85 assertions.
  - `npx eslint src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `node scripts/check-guideline-literals.js src/control-plane/membership-publication-planning.js` passed.
  - `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-planning.js` passed.
  - `npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-planning.js` passed.
  - `npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-planning.js` passed.
  - `npm run guard:guideline:constant-names:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
- Representative checkpoint:
  - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --fast-local --verbose`
    failed after 143.5s and stayed same-frontier red:
    `active=0/5`, current `snapshotCoverage=1/5`, best
    `snapshotCoverage=2/5`, `publication=PUBLISHED`, `publicationEpoch=1`,
    `publishedActive=1/5`, `pendingAck=0`, and `missingPublished=4`.
  - `npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json`
    still selects `publication_ack_convergence` under
    `topology_publication_owner / publication_convergence` with
    `missing_published_nodes_present`.
  - `npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json`
    reports `publicationEpoch=1`, `publicationStatus=PUBLISHED`,
    `pendingAckCount=0`, `publishedActive=1/5`, and `missingPublished=4`.
  - `npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json`
    keeps stop decision `continue_local_fix` with dominant failure class
    `publication_ack_blocked`.
  - `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-blocked-readiness-repair.report.json --markdown`
    reports one non-frontier `operation_workflow_owner / workflow_progress`
    witness in `spread_satisfied_in_flight`; split required is false.
  - Raw fallback after canonical extractors: the extractors identify the owner
    boundary but do not expose the selected runtime owner stream versus
    active-gate/bootstrap readiness split. Playback shows the selected
    publication convergence still carries only the seed node in
    `membershipLifecycleSummary` and `projectionDiagnostics`, while
    failed-phase active-gate readiness reasons show four missing published
    nodes under `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`; the same artifact
    also shows `control_plane_publications-p1` as `persisted_not_dispatched`
    under the non-frontier operation workflow witness.

- Current implementation subagent recorded:
  Agent Codex (019e2780-e504-7bf2-b0fc-6ff02ccdad15) implemented
  work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
  result focused-runtime-fix-same-frontier-representative-red.
- Runtime change: `src/control-plane/membership-publication-planning.js`
  now normalizes publication-planning readiness entries that carry
  reason-only `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` evidence into bounded
  recovery-eligible projection evidence for membership publication planning.
  This keeps the repair inside the publication owner and avoids changing
  readiness, active-gate, operation workflow, or harness runtime behavior.
- Regression:
  `test/control-plane/membership-publication-coordinator-main-stage-2.js`
  adds a count-only ACK-complete stale `PUBLISHED` case where the missing
  member has no readiness dimensions and only
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`; the owner now reopens the
  publication and includes that node in the ACK-required repair cohort.
- Focused proof commands:
  - `node test/control-plane/membership-publication-coordinator-main-stage-2.js`
    - failed before runtime fix on the new regression with 59/62 assertions
      passing, then passed with 62/62 assertions.
  - `node test/control-plane/publication-recovery-gate.test.js` passed with
    85/85 assertions.
  - `npx eslint src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `node scripts/check-guideline-literals.js src/control-plane/membership-publication-planning.js` passed.
  - `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-planning.js` passed.
  - `npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-planning.js` passed.
  - `npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-planning.js` passed.
  - `npm run guard:guideline:constant-names:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `npm run work:validate -- --pre-impl` passed.
- Representative checkpoint:
  - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --fast-local --verbose`
    failed after 146.1s and stayed same-frontier red:
    `active=0/5`, `snapshotCoverage=2/5`, `publication=PUBLISHED`,
    `publicationEpoch=1`, `publishedActive=1/5`, `pendingAck=0`, and
    `missingPublished=4`.
  - `npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json`
    still selects `publication_ack_convergence` under
    `topology_publication_owner / publication_convergence` with
    `missing_published_nodes_present`.
  - `npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json`
    reports missing published nodes
    `11601fe0-72d6-5853-8590-ec2881853e72`,
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
  - `npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json`
    keeps stop decision `continue_local_fix` with dominant failure class
    `publication_ack_blocked`.
  - `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-reason-only-repair.report.json --markdown`
    reports one non-frontier `operation_workflow_owner / workflow_progress`
    witness in `spread_satisfied_in_flight`; split required is false.
  - Raw report fallback after canonical extractors: the extractors identify the
    owner boundary but do not expose failed-phase per-node readiness reasons.
    `jq '.scenarios[0].details.diagnostics.failedPhase.artifacts.nodeReasonsByNodeId'`
    on the after-reason-only report shows four missing published nodes under
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.

Prior reduced-progress implementation proof:

- Implementation subagent recorded:
  Agent Codex (019e2766-67d6-7941-8dfd-90d9f143d2af) implemented
  work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
  result focused-runtime-fix-pending-representative-rerun.
- Runtime change: `src/control-plane/membership-publication-planning.js`
  now treats publishable recovery-eligible readiness for nodes outside the
  published baseline as bounded publication-owner repair evidence, so stale
  `PUBLISHED` count-only ACK completion no longer retains a closed durable
  target when missing published members are provably repairable.
- Regression: `test/control-plane/membership-publication-coordinator-main-stage-2.js`
  adds a count-only ACK-complete stale `PUBLISHED` case with a readiness-only
  recovery-eligible missing member and proves the owner opens a repair
  publication with a new epoch and required ACK cohort.
- Focused proof commands:
  - `node test/control-plane/membership-publication-coordinator-main-stage-2.js`
    - failed before runtime fix on the new regression, then passed with 59/59
      assertions.
  - `node test/control-plane/publication-recovery-gate.test.js` passed with
    85/85 assertions.
  - `npx eslint src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-planning.js` passed.
  - `npm run guard:guideline:constant-names:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `git diff --check -- work/packages/active-20260514-topology-publication-convergence-final-blocker.md src/control-plane/membership-publication-planning.js test/control-plane/membership-publication-coordinator-main-stage-2.js` passed.
  - `npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-publication-convergence-final-blocker.md` passed.
  - `npm run work:validate -- --pre-impl` passed.
- Advisory/non-closure proof:
  - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --fast-local --verbose`
    failed after 209.2s, but reduced the representative residual:
    `active=0/5` to `2/5`, `snapshotCoverage=2/5` to `3/5`,
    `publishedActive=1/5` to `3/5`, and `missingPublished=4` to `2`.
  - `npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json`
    still selects `publication_ack_convergence` under
    `topology_publication_owner / publication_convergence` with
    `missing_published_nodes_present`.
  - `npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json`
    reports `publicationEpoch=3`, `publicationStatus=PUBLISHED`,
    `pendingAckCount=0`, `publishedActive=3/5`, and
    `missingPublishedCount=2` for
    `8be8d30f-4499-5eed-865c-71b4d529a67a` and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
  - `npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json`
    keeps the stop decision at `continue_local_fix` with dominant failure
    class `publication_ack_blocked`.
  - `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --markdown`
    reports three non-frontier `operation_workflow_owner / workflow_progress`
    witnesses in `spread_satisfied_in_flight`; causal analysis still
    classifies priority recovery as satisfied for the frontier decision.
  - Raw report fallback after canonical extractors: the extractors identify the
    remaining owner boundary but do not expose failed-phase per-node readiness
    reasons. `jq '.scenarios[0].details.diagnostics.failedPhase.artifacts.nodeReasonsByNodeId'`
    on the after-repair report shows both remaining missing published nodes
    under `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
  - `node test/admin/admin-control-snapshot.test.js` failed in out-of-scope
    admin/priority-recovery expectations, including
    `priority_spread_pending` versus `steady_published` in the live
    priority-recovery observation fixture and several
    `priority_operation_serial_wait`/semantic-state assertions. These were not
    changed because operation workflow and priority recovery are out of this
    package scope.
  - `node scripts/check-file-size-thresholds.js --help` invoked the inherited
    file-size ratchet and failed with existing counts
    source 152/144 and test 162/159. Touched file sizes are
    `src/control-plane/membership-publication-planning.js` 1628 lines and
    `test/control-plane/membership-publication-coordinator-main-stage-2.js`
    997 lines; this package adds local source-file size debt and does not
    perform broad oversized-file cleanup.
