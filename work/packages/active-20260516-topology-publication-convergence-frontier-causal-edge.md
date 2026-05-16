# Topology Publication Convergence Frontier Causal Edge

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_ack_blocked",
  "currentState": "Canonical extractors keep the representative frontier on publication_ack_convergence / topology_publication_owner / publication_convergence. Pending ACK is 0 and publication status is PUBLISHED, but publishedActiveNodeIds is still 1/5, missingPublishedCount is 4, publicationOwnerFreshnessFence is consumer_lag, publicationOwnerRecoveryOutcome is waiting_for_consumer, and publicationOwnerStreamOutcome is stale. Active-gate handoff pendingReconcileCount is 0 and nextAction is wait_owner_recovery, so the drained startup active-gate owner-reconcile path remains closed.",
  "nextAction": "Stay on topology_publication_owner / publication_convergence and create replayable proof for the publication owner recovery wake / stale owner stream edge before any runtime implementation.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-topology-publication-convergence-frontier-causal-edge.md",
    "work/packages/todo-20260516-topology-publication-convergence-frontier-causal-edge.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-topology-publication-convergence-frontier-causal-edge.md",
    "work/packages/todo-20260516-topology-publication-convergence-frontier-causal-edge.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md"
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
    "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_ack_blocked",
    "nextAction": "Stay on topology_publication_owner / publication_convergence; prove the publication owner recovery wake / stale owner stream edge before runtime implementation."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate owner-reconcile path drained, so the remaining representative red gate is either publication ACK convergence, owner recovery/readiness support, or a lower-priority operation workflow handoff that fresh residual extractors must promote explicitly.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "expectedCausalModelChange": "The package records topology_publication_owner / publication_convergence as the selected next owner-boundary and rejects readiness or operation workflow migration until fresh canonical evidence promotes them.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The remaining missing edge is publication owner recovery wake / stale owner stream under consumer_lag, not ACK delivery, active-gate owner reconcile, or priority recovery handoff.",
    "crossBoundaryReview": "Do not reopen startup active-gate snapshot coverage or paused rolling-restart sprint work unless fresh canonical evidence makes it the first frontier again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / publication ACK convergence after active-gate owner reconcile drained",
    "phaseChain": [
      "consume handoff-hygiene closure",
      "run canonical evidence extractors on the latest artifact",
      "fill the publication/readiness/workflow causal edge table",
      "select exactly one next owner-boundary",
      "promote runtime files only after the owner-boundary decision"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json, owned by topology_publication_owner / publication_convergence.",
    "knownDownstreamBlockers": [
      "active-gate handoff pendingReconcileCount is 0 with nextAction wait_owner_recovery",
      "owner_reconcile_service_unavailable no longer dominates the representative artifact",
      "seed readiness timeout shape remains in distributed failure evidence",
      "priority recovery remains classified unless residual extractors promote operation_workflow_owner / rebalancer_handoff"
    ],
    "missingCausalEdge": "Publication owner recovery wake / stale owner stream: publication is PUBLISHED and acknowledged, but only 1/5 active nodes are published while the owner reports consumer_lag, waiting_for_consumer, and stale stream outcome.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe plus work:evidence-summary, causal-model, priority-recovery-residuals, distributed-failure, and owner-files on the same artifact.",
    "boundedProgressProof": "A bounded causal edge table selects topology_publication_owner / publication_convergence and rejects readiness or operation workflow migration for this artifact.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "expectedObservableTransition": "The package closes as classification-only before any runtime edit.",
    "maxProgressBound": "one classification package; no runtime/test edits, timeout increases, or active-gate admission changes before owner selection",
    "sameFrontierFallback": "Stay on topology_publication_owner / publication_convergence and create replayable proof for the stale owner stream edge before patching runtime.",
    "expectedNextFrontier": "diagnostics_owner / deterministic_missing_edge_replay as the next proof step, then topology_publication_owner / publication_convergence runtime work if replay confirms the edge.",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / reduced"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding package migrated out of startup_active_gate_owner after active-gate owner reconcile drained.",
    "handoffInvariant": "Active-gate admission stays strict and the paused rolling-restart sprint remains closed; this package only classifies the successor frontier."
  }
}
-->

## Why

This is the immediate successor package after the current active-gate
owner-reconcile slice closes or migrates. The active handoff path is no longer
the first frontier in current context; the representative gate moved to
`publication_ack_convergence` under `topology_publication_owner /
publication_convergence`.

This package exists to prevent the next runtime change from guessing. It first
classifies whether the new publication frontier is truly an ACK-convergence
owner issue, a seed readiness or owner-recovery issue, or a priority-recovery
handoff that should migrate back to `operation_workflow_owner`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization, failure simulations, and production guarantees. Edition matrix
scope remains Community / AGPL repo.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: this package starts from a live red
  release-gate artifact and may choose between adjacent runtime owners before
  implementation.
- Escalation trigger to a heavier lane: the causal model reports
  contradictory frontier evidence, the successor needs more than one runtime
  owner, or the active package has not been cleanly closed/migrated.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`
  and
  `work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md`.
- Evidence that may be read but not mutated:
  `test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`.
- Files explicitly forbidden before activation: all runtime and test files in
  `candidateRuntimeFiles`.
- Runtime architecture ideas captured as contract/backlog items: the pattern
  packages in
  `work/sprints/active-2026-q2-topology-convergence-systems-pattern-hardening.md`.
- Activation rule before runtime implementation: the active package must close
  or migrate, `work:current-blocker` must name this owner/boundary, and the
  first extractor pass must still select `publication_ack_convergence` or
  explicitly migrate to `operation_workflow_owner / rebalancer_handoff`.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run canonical evidence summary, topology convergence, causal model,
   priority residuals, distributed-failure, and owner-files extraction against
   the latest artifact.
2. Fill a causal edge table with these columns: durable publication row,
   required ACK set, observed ACK set, owner recovery outcome, seed readiness
   state, active-gate handoff state, and priority-recovery witness state.
3. Decide exactly one next owner:
   `topology_publication_owner / publication_convergence`,
   `startup_readiness_owner / startup_support_evidence`, or
   `operation_workflow_owner / rebalancer_handoff`.
4. If runtime implementation proceeds, promote only the files owned by the
   selected row in the causal edge table.
5. Update current-blocker handoff after classification so later agents do not
   continue treating the drained owner-reconcile path as active.

## Out Of Scope

1. Returning to `startup_active_gate_owner / snapshot_coverage` unless fresh
   canonical evidence makes it the first frontier again.
2. Timeout increases, active-gate admission relaxation, or diagnostics-only
   success.
3. Runtime edits before the owner migration decision is recorded.
4. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required before runtime implementation because this is a causal-escalation
package. This package is currently classification-only; runtime implementation
must not start until a human explicitly authorizes subagent delegation or the
environment policy changes.

- [x] Review subagent recorded: blocked-by-environment-policy reason: subagent-delegation-requires-explicit-user-request-before-runtime-implementation
- [x] Fix subagent recorded or explicitly not needed: blocked-by-environment-policy reason: subagent-delegation-requires-explicit-user-request-before-runtime-implementation
- [x] Implementation subagent recorded: blocked-by-environment-policy reason: subagent-delegation-requires-explicit-user-request-before-runtime-implementation

## Borrowed Pattern Hook

- TiKV/PD pattern: scheduling operators are followed by later heartbeat
  evidence. Local analogue: do not call the publication frontier solved until
  a later control snapshot or publication row proves the requested ACK/recovery
  step completed.
- FoundationDB pattern: use a replayable missing-edge fixture before another
  broad rerun. Local analogue: if the extractor cannot distinguish ACK block
  from readiness support, create a focused artifact replay before patching
  runtime.

## Causal Edge Table

| Candidate | Evidence | Decision |
| --- | --- | --- |
| ACK delivery | `publicationStatus=PUBLISHED`, `pendingAckCount=0`, `publicationOwnerAckState=acknowledged`. | Reject as next edge; ACK is closed. |
| Durable publication visibility | `publishedActiveNodeIds=1/5`, `missingPublishedCount=4`, distributed failure dominant reason `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`. | Keep under `topology_publication_owner / publication_convergence`. |
| Owner recovery wake | handoff `pendingReconcileCount=0`, `nextAction=wait_owner_recovery`, owner cohort `pendingRecoveryCount=1`. | Selected missing edge with durable visibility. |
| Publication owner stream freshness | `publicationOwnerFreshnessFence=consumer_lag`, `publicationOwnerRecoveryOutcome=waiting_for_consumer`, `publicationOwnerStreamOutcome=stale`. | Selected missing edge; requires replayable proof before runtime patch. |
| Startup readiness support | readiness failure is terminal, but causal graph keeps readiness downstream/deferred after active-gate snapshot coverage. | Reject migration for this artifact. |
| Active-gate owner reconcile | owner-reconcile service unavailable is gone and `pendingReconcileCount=0`. | Keep the paused sprint closed. |
| Priority recovery handoff | causal model marks priority recovery satisfied; residual extractor reports one `operation_workflow_owner / rebalancer_handoff` witness with `splitRequired=false`. | Reject as first owner unless fresh extractor output promotes it. |

Selected next owner-boundary:
`topology_publication_owner / publication_convergence`.

Selected next proof step:
`diagnostics_owner / deterministic_missing_edge_replay`, using the
FoundationDB-style replay package to freeze the owner recovery wake / stale
owner stream edge before runtime implementation.

## Acceptance

1. The package records one selected owner/boundary and explains why the other
   candidate boundaries were not selected.
2. If it stays on publication convergence, the next action names one missing
   causal edge: ACK delivery, owner recovery wake, durable publication
   visibility, or readiness support.
3. If it migrates, the successor package command is recorded with the exact
   owner, boundary, dominant reason, and artifact.
4. The original rolling-restart gate remains represented by the same artifact
   until a fresh representative run is intentionally produced.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: this package file, current-blocker files, topology track handoff
  text, `work/model-ledger.jsonl`, and successor-pointer metadata in the
  closed rolling-restart sprint/package; candidate runtime files may be
  promoted only after the causal edge table selects a single owner.
- Forbidden files: non-candidate runtime files, timeout budgets, active-gate
  admission relaxation, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS: npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
2. PASS: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe
3. PASS: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
4. PASS: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown
5. PASS: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
6. PASS: npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
