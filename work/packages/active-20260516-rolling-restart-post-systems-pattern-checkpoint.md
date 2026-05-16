# Rolling Restart Post Systems Pattern Checkpoint

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_ack_blocked",
  "currentState": "The fresh post-systems-pattern rolling-restart checkpoint is red, not green. All five nodes reached ACTIVE, but the active gate timed out because snapshotCoverage=2/5. Canonical evidence selects publication_ack_convergence as the first frontier under topology_publication_owner / publication_convergence: publication is PUBLISHED, pendingAck=1, pendingAckNodeIds=[], publishedActiveNodeIds is seed-only, missingPublishedCount=4, publicationOwnerAckState=waiting_for_ack, freshnessFence=ack_lag, recoveryOutcome=waiting_for_ack, and streamOutcome=waiting_for_ack. The consumer active-gate handoff has pendingReconcileCount=0, nextAction=wait_owner_recovery, and runtimePromotionAllowed=false, so the drained active-gate owner-reconcile trace remains historical. Causal-model outcome is accept_classified_backpressure while the dominant failure class remains publication_ack_blocked; priority recovery reports two workflow-progress witnesses and remains subordinate unless a later package promotes it.",
  "nextAction": "Continue with a focused topology_publication_owner / publication_convergence successor using test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json as the fresh artifact. Prove or split the pending ACK / publication owner recovery edge before any runtime implementation.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "npm run work:validate -- --entry work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "npm run work:llm-start",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run work:model-ledger -- record --package work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class scenario-release-gate --package-class representative-green-confirmation --intended-minimum-model gpt-5.3-codex --scope-shape release-gate-checkpoint/after-support-contract-completion --escalated true --bailout-reason same-frontier --outcome same-frontier --validation-status closure-green --correction-loops 1 --review-findings 0 --notes rolling-restart-post-systems-pattern-checkpoint-reselected-publication-ack-convergence-pending-acks-present",
    "npm run work:validate -- --closure work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md"
  ],
  "writeScope": [
    "work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md",
    "work/packages/done-20260516-topology-systems-pattern-completion-closure.md",
    "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json"
  ],
  "generatedFiles": [
    "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-green-confirmation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate-checkpoint/after-support-contract-completion",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_ack_blocked",
    "nextAction": "Continue through topology_publication_owner / publication_convergence with the fresh post-systems-pattern artifact."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "release_gate_owner",
    "toBoundary": "rolling_restart_post_systems_pattern_checkpoint",
    "reason": "The last pre-detour representative artifact selected topology_publication_owner / publication_convergence, but systems-pattern hardening and completion closure landed after that artifact. This package is a bounded release-gate support checkpoint, not a runtime-owner migration, and it must preserve the old frontier only as historical context until a fresh rolling-restart artifact is classified.",
    "evidence": [
      "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
      "work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md",
      "work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md",
      "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After systems-pattern hardening and completion closure, the paused rolling-restart gate either reaches representative green or exposes a fresh first frontier that should replace the stale pre-detour handoff.",
    "stopConditionCheck": "Run the representative scenario, then work:evidence-summary, topology-convergence handoff probe, npm run analyze:causal-model, priority-recovery residuals, owner-files, and distributed-failure extractors on the new artifact.",
    "expectedCausalModelChange": "Fresh canonical extraction reselected topology_publication_owner / publication_convergence as the owner-boundary successor rather than representative green.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The fresh post-systems-pattern artifact still selects publication_ack_convergence. Pending ACK and publication owner recovery remain the first frontier: publicationOwnerAckState=waiting_for_ack, freshnessFence=ack_lag, recoveryOutcome=waiting_for_ack, and streamOutcome=waiting_for_ack. Active-gate owner reconcile is drained with pendingReconcileCount=0, nextAction=wait_owner_recovery, and runtimePromotionAllowed=false. Causal-model outcome is accept_classified_backpressure, but the dominant failure class remains publication_ack_blocked; priority recovery is subordinate unless a later extractor promotes it.",
    "crossBoundaryReview": "The checkpoint used scenario-release-gate review/fix/implementation sequencing; the successor runtime package must run its own required sequencing before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after systems-pattern hardening and completion closure",
    "phaseChain": [
      "systems-pattern support contracts closed",
      "representative rolling-restart checkpoint",
      "canonical extractor classification",
      "green closure or successor owner-boundary activation"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json, owned by topology_publication_owner / publication_convergence.",
    "knownDownstreamBlockers": [
      "publication status is PUBLISHED with pendingAck=1, pendingAckNodeIds=[], seed-only publishedActiveNodeIds, missingPublishedCount=4, publicationOwnerAckState=waiting_for_ack, freshnessFence=ack_lag, recoveryOutcome=waiting_for_ack, and streamOutcome=waiting_for_ack",
      "active-gate owner reconcile remains drained with pendingReconcileCount=0, nextAction=wait_owner_recovery, and runtimePromotionAllowed=false",
      "priority recovery has two operation_workflow_owner / workflow_progress witnesses; split required is false and this remains subordinate to publication_ack_convergence unless a future package promotes it"
    ],
    "missingCausalEdge": "Publication ACK / owner recovery edge: the publication is visible but ACK convergence remains blocked with pending_acks_present after systems-pattern completion.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe",
    "boundedProgressProof": "One bounded representative checkpoint plus canonical extractor classification before any runtime package is opened or activated.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "expectedObservableTransition": "Canonical evidence selected topology_publication_owner / publication_convergence as the current owner boundary for the next focused package.",
    "maxProgressBound": "one representative rolling-restart rerun and one classification pass",
    "sameFrontierFallback": "If publication_ack_convergence remains first frontier, activate or create a topology_publication_owner / publication_convergence package using the fresh artifact and owner-files proof.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence successor using the fresh checkpoint artifact",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260516-foundationdb-style-deterministic-missing-edge-replay.md / diagnostics_owner / deterministic_missing_edge_replay / migrated",
      "work/packages/done-20260516-etcd-style-active-gate-admission-catchup-fence.md / startup_active_gate_owner / active_gate_admission_catchup_fence / done",
      "work/packages/done-20260516-topology-systems-pattern-completion-closure.md / topology_convergence_owner / systems_pattern_contract_completion / done"
    ],
    "oscillationCheck": "Treat the old publication/active-gate oscillation as historical until the fresh checkpoint reselects a frontier.",
    "handoffInvariant": "Do not relax active-gate admission, increase timeouts, or rewrite publication handoff truth while the checkpoint is classification-only."
  },
  "predecessor": "work/packages/done-20260516-topology-systems-pattern-completion-closure.md"
}
-->

## Why

This package is the continuation checkpoint for the paused rolling-restart
green-gate sprint after the systems-pattern detour closed. It does not assume
that the old publication frontier is still current; it requires one fresh
representative run and canonical classification before any runtime owner package
is opened or resumed.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime. The package is also bounded by the closed systems-pattern hardening
and completion closure sprints, which made the support contracts available for
the resumed gate.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative checkpoint is red and returned
  to a recently closed publication boundary, so the package records a
  cross-boundary handoff before any local runtime patch.
- Escalation trigger to a heavier lane: the fresh artifact cannot be
  classified by canonical extractors, or the successor needs more than one
  runtime owner.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Activate this package only when the rolling-restart gate is intentionally
   resumed.
2. Run one fresh representative `rolling-restart` checkpoint after the
   systems-pattern completion closure.
3. Classify the new artifact with the canonical topology, causal, priority
   residual, owner-file, and distributed-failure extractors.
4. Update the sprint, track, and generated current-blocker handoff to point at
   either representative green evidence or the fresh owner-boundary successor.

## Out Of Scope

1. Runtime edits in `src/` or `test/` before the fresh artifact selects an
   owner boundary.
2. Representative timeout budget changes.
3. Active-gate admission relaxation.
4. Resuming the old pending-reconcile active-gate trace; the latest handoff
   before the systems-pattern detour had `pendingReconcileCount=0`.

## Required Preconditions

1. `work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md`
   is closed.
2. `work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md`
   is closed and pushed.
3. The package is moved from `todo` to `active`, and the active sprint handoff
   is regenerated before `npm run work:llm-start`.

## Subagent Sequencing Requirement

When activated, run scenario-release-gate review, fix if needed, and
implementation subagents before closure. For a first package in a freshly
resumed sprint, review may be recorded as `not-needed
(first-package-in-sprint)` only if the sprint is explicitly treated as a new
activation boundary.

## Subagent Sequencing Ledger

Required before implementation because this is a scenario-release-gate package.
The resumed rolling-restart checkpoint is treated as the first package in a new
activation boundary after the systems-pattern detour closed.

- [x] Review subagent recorded: not-needed (first-package-in-sprint).
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex Replacement Implementation Subagent (c8d0b014-d13b-4158-8e9b-a2ffc0969277) implemented work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md.

## Continuation Decision

The fresh checkpoint has three valid outcomes:

1. `representative-green`: close the rolling-restart gate with the new report.
2. Red with a fresh owner boundary: create or activate the selected successor
   package and update current-blocker to that package.
3. Red with the same publication frontier: continue through
   `topology_publication_owner / publication_convergence` using the fresh
   report, not the stale pre-detour artifact.

Fresh checkpoint result: outcome 3. `rolling-restart` failed and canonical
extractors reselected `publication_ack_convergence` under
`topology_publication_owner / publication_convergence` from
`test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`.
The successor should use this fresh artifact, not the stale pre-detour report.

## Model Fit

- Package class: `representative-green-confirmation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-checkpoint/after-support-contract-completion`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/model-ledger.jsonl`
- Forbidden files: `src/`, `test/`, `representative timeout budget changes`, `active-gate admission relaxation`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:package:doctor -- --suggest work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `npm run work:validate -- --entry work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `npm run work:llm-start`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run work:model-ledger -- record --package work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class scenario-release-gate --package-class representative-green-confirmation --intended-minimum-model gpt-5.3-codex --scope-shape release-gate-checkpoint/after-support-contract-completion --escalated true --bailout-reason same-frontier --outcome same-frontier --validation-status closure-green --correction-loops 1 --review-findings 0 --notes rolling-restart-post-systems-pattern-checkpoint-reselected-publication-ack-convergence-pending-acks-present`, `npm run work:validate -- --closure work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md
3. npm run work:validate -- --entry work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md
4. npm run work:llm-start
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
7. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe
8. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
9. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown
10. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
11. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
12. npm run work:model-ledger -- record --package work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class scenario-release-gate --package-class representative-green-confirmation --intended-minimum-model gpt-5.3-codex --scope-shape release-gate-checkpoint/after-support-contract-completion --escalated true --bailout-reason same-frontier --outcome same-frontier --validation-status closure-green --correction-loops 1 --review-findings 0 --notes rolling-restart-post-systems-pattern-checkpoint-reselected-publication-ack-convergence-pending-acks-present
13. npm run work:validate -- --closure work/packages/active-20260516-rolling-restart-post-systems-pattern-checkpoint.md

## Checkpoint Classification

- Implementation subagent: Agent Codex Replacement Implementation Subagent
  (`c8d0b014-d13b-4158-8e9b-a2ffc0969277`).
- Scenario result: red; `rolling-restart` wrote
  `test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`
  and failed after 138872ms.
- Canonical first frontier: `publication_ack_convergence`.
- Owner boundary: `topology_publication_owner / publication_convergence`.
- Dominant evidence: `publication_ack_blocked` / `pending_acks_present`;
  publication is `PUBLISHED`, `pendingAck=1`, `missingPublishedCount=4`,
  active nodes are `5/5`, and snapshot coverage is `2/5`.
- Producer recovery state: `pendingAckNodeIds=[]`,
  `publishedActiveNodeIds` is seed-only,
  `publicationOwnerAckState=waiting_for_ack`, `freshnessFence=ack_lag`,
  `recoveryOutcome=waiting_for_ack`, and `streamOutcome=waiting_for_ack`.
- Handoff state: `publication_active_gate_handoff_contract` remains detected;
  `pendingReconcileCount=0`, `nextAction=wait_owner_recovery`, and
  `runtimePromotionAllowed=false`.
- Subordinate evidence: priority recovery reports two
  `operation_workflow_owner / workflow_progress` witnesses, but
  `work:evidence-summary` and `causal-model` keep
  `publication_ack_convergence` as the first critical path.
- Causal model: outcome `accept_classified_backpressure`, dominant failure
  class `publication_ack_blocked`; priority recovery backpressure is
  subordinate and not the successor owner unless later evidence promotes it.
- Distributed-failure extractor note: the command emitted the red report
  summary and exited non-zero because the report is failed and its timeline
  reader hit an `events.ndjson` shape warning; no raw JSON/log fallback was
  needed for owner selection.
