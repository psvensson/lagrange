# Topology Publication Convergence Final Blocker

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Focused publication-owner repair landed and representative rerun reduced the blocker but did not close it. Fresh artifact reports active=2/5, snapshotCoverage=3/5, publication=PUBLISHED, pendingAck=0, missingPublished=2, missingPublishedIds=8be8d30f-4499-5eed-865c-71b4d529a67a|ebc4aa0b-06c6-506d-93ea-1dd2deca3f58. Priority recovery remains non-frontier and causally classified; failed-phase node reasons show the two remaining missing nodes under PRIORITY_CONTROL_PLANE_RECOVERY_PENDING.",
  "nextAction": "Continue the same topology_publication_owner / publication_convergence blocker. Inspect why priority-control-plane-recovery-pending nodes stay outside the published cohort after the count-only ACK repair; split only if owner evidence proves the remaining blocker belongs to operation workflow, startup active gate, or readiness ownership.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json"
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
    "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Continue the same publication convergence owner boundary against the reduced missingPublished=2 residual."
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_convergence work should reduce, migrate, or classify missing_published_nodes_present without hiding active-gate snapshot coverage or priority recovery tails.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "expectedCausalModelChange": "missing_published_nodes_present reduced from missingPublished=4 to missingPublished=2 while staying in topology_publication_owner / publication_convergence.",
    "representativeOutcome": "reduced",
    "causalDebt": "The count-only ACK repair reduced the representative residual but did not close it; the same owner boundary remains active for the two priority-control-plane-recovery-pending missing nodes.",
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
    "currentFirstFrontier": "topology_publication_owner / publication_convergence from the reduced after-repair artifact",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage remains 3/5 after publication convergence",
      "priority recovery has three non-frontier operation workflow witnesses in after-repair evidence"
    ],
    "missingCausalEdge": "publication PUBLISHED with pendingAck=0 still coexists with missingPublished=2 and active=2/5",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "boundedProgressProof": "Focused repair proved bounded progress by advancing publicationEpoch to 3 and reducing missingPublished from 4 to 2; next work must close, split, or further reduce the two remaining missing published members.",
    "boundedProgressProofArtifact": "test-output/reports/topology-publication-convergence-final-blocker-after-repair.report.json",
    "expectedObservableTransition": "missing_published_nodes_present resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "representative rolling-restart rerun failed after 209230ms but reduced active=0/5 to 2/5, snapshotCoverage=2/5 to 3/5, publishedActive=1/5 to 3/5, and missingPublished=4 to 2",
    "sameFrontierFallback": "keep topology_publication_owner / publication_convergence active and do not broaden into rolling-restart runtime fixes",
    "expectedNextFrontier": "same owner boundary for remaining missing nodes 8be8d30f-4499-5eed-865c-71b4d529a67a and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58 unless owner evidence forces a split",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Final ship confirmation selected `topology_publication_owner /
publication_convergence` as the first frontier. The focused repair reduced the
representative `rolling-restart` residual, but the after-repair artifact is
still red with `active=2/5`, `snapshotCoverage=3/5`,
`publication=PUBLISHED`, `pendingAck=0`, and `missingPublished=2`.

This package has been explicitly re-scoped for a narrow runtime repair inside
`topology_publication_owner / publication_convergence`.

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

1. [x] Review subagent recorded:
   Agent Hume (019e2763-0b74-7553-bdce-bb629f43066e) reviewed
   work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
   result clean.
2. [x] Fix subagent recorded or explicitly not needed:
   not-needed.
3. [x] Implementation subagent recorded:
   Agent Codex (019e2766-67d6-7941-8dfd-90d9f143d2af) implemented
   work/packages/active-20260514-topology-publication-convergence-final-blocker.md;
   result focused-runtime-fix-pending-representative-rerun.

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

## Implementation Proof

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
