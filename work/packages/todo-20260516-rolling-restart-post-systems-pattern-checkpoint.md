# Rolling Restart Post Systems Pattern Checkpoint

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-16",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "pending-fresh-post-systems-pattern-rerun",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "rolling_restart_post_systems_pattern_checkpoint",
  "dominantReason": "fresh_representative_checkpoint_required_after_support_contracts",
  "currentState": "The paused rolling-restart green-gate sprint migrated to systems-pattern hardening, and both systems-pattern hardening plus completion closure are now done. The latest representative artifact before that detour selected publication_ack_convergence under topology_publication_owner / publication_convergence, but no fresh representative rolling-restart artifact exists after live TiKV witness emission, broad Cockroach admin tail proof, and stale active-reference tracker validation landed.",
  "nextAction": "Run a fresh rolling-restart representative checkpoint and classify it with canonical extractors before any runtime edit. If the gate is green, close the paused gate; if red, open or activate the owner-boundary package selected by fresh evidence.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "npm run work:validate -- --entry work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "npm run work:llm-start",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "npm run work:validate -- --closure work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md"
  ],
  "writeScope": [
    "work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md"
  ],
  "handoffFiles": [
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md",
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
    "work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md",
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "status": "pending-before-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "frontier": "pending-fresh-classification",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_post_systems_pattern_checkpoint",
    "dominantReason": "fresh_representative_checkpoint_required_after_support_contracts",
    "nextAction": "Run and classify a fresh representative checkpoint before selecting any runtime owner."
  },
  "causalGovernance": {
    "hypothesis": "After systems-pattern hardening and completion closure, the paused rolling-restart gate either reaches representative green or exposes a fresh first frontier that should replace the stale pre-detour handoff.",
    "stopConditionCheck": "Run the representative scenario, then work:evidence-summary, topology-convergence handoff probe, npm run analyze:causal-model, priority-recovery residuals, owner-files, and distributed-failure extractors on the new artifact.",
    "expectedCausalModelChange": "Representative-green or a fresh owner-boundary successor package selected by canonical extractors.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The last pre-detour artifact selected publication_ack_convergence under topology_publication_owner / publication_convergence, but no fresh run exists after live TiKV witness emission, broad Cockroach admin proof, and stale active-reference validation landed.",
    "crossBoundaryReview": "When activated, run scenario-release-gate review/fix/implementation subagent sequencing before closure."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after systems-pattern hardening and completion closure",
    "phaseChain": [
      "systems-pattern support contracts closed",
      "representative rolling-restart checkpoint",
      "canonical extractor classification",
      "green closure or successor owner-boundary activation"
    ],
    "currentFirstFrontier": "pending fresh classification; last pre-detour frontier was publication_ack_convergence under topology_publication_owner / publication_convergence",
    "knownDownstreamBlockers": [
      "last pre-detour artifact reported publication_ack_blocked and wait_owner_recovery",
      "active-gate owner reconcile drained to pendingReconcileCount=0 and must not be resumed as the active trace",
      "priority recovery remains subordinate unless fresh canonical extraction promotes it"
    ],
    "missingCausalEdge": "Unknown until the post-systems-pattern representative run; do not infer from the old pending-reconcile active-gate trace.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe",
    "boundedProgressProof": "One bounded representative checkpoint plus canonical extractor classification before any runtime package is opened or activated.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json",
    "expectedObservableTransition": "rolling-restart passes, or canonical evidence selects a current owner boundary for the next focused runtime package.",
    "maxProgressBound": "one representative rolling-restart rerun and one classification pass",
    "sameFrontierFallback": "If publication_ack_convergence remains first frontier, activate or create a topology_publication_owner / publication_convergence package using the fresh artifact and owner-files proof.",
    "expectedNextFrontier": "representative-green or a fresh canonical owner-boundary successor",
    "resultClassification": "pending-before-probe",
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

- Selected lane: `scenario-release-gate`
- Why this lane is required: the package runs and classifies a representative
  release-gate scenario.
- Escalation trigger to a heavier lane: the fresh artifact selects a runtime
  owner boundary that needs implementation, or the checkpoint cannot be
  classified by canonical extractors.

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

## Continuation Decision

The fresh checkpoint has three valid outcomes:

1. `representative-green`: close the rolling-restart gate with the new report.
2. Red with a fresh owner boundary: create or activate the selected successor
   package and update current-blocker to that package.
3. Red with the same publication frontier: continue through
   `topology_publication_owner / publication_convergence` using the fresh
   report, not the stale pre-detour artifact.

## Model Fit

- Package class: `representative-green-confirmation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-checkpoint/after-support-contract-completion`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`
- Forbidden files: `src/`, `test/`, `representative timeout budget changes`, `active-gate admission relaxation`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:package:doctor -- --suggest work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `npm run work:validate -- --entry work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md`, `npm run work:llm-start`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`, `npm run work:validate -- --closure work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md
3. npm run work:validate -- --entry work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md
4. npm run work:llm-start
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
7. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --handoff-probe
8. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
9. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json --markdown
10. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
11. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json
12. npm run work:validate -- --closure work/packages/todo-20260516-rolling-restart-post-systems-pattern-checkpoint.md
