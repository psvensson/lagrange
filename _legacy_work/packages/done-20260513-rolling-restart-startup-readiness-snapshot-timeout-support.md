# Rolling Restart Startup Readiness Snapshot Timeout Support

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-startup-active-gate-recovery/rolling-restart/",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "startup_readiness_blocked",
  "currentState": "Fresh representative evidence after the startup active-gate owner cycle remains red. Canonical topology keeps active_gate_snapshot_coverage as the first frontier with activeGate timed out, active=2/5, and snapshotCoverage=1/5; causal analysis now stops on owner-boundary migration because readiness_startup_support is terminal_failed from selectedSnapshotError snapshot_timeout.",
  "nextAction": "Prove or reduce the startup readiness support-evidence snapshot-timeout boundary without changing harness timeouts or reopening priority recovery; expected outcomes are representative green, a deferred inherited active-gate support path, or a fresh named owner migration.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/diagnostics/causal-graph-builder.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-startup-active-gate-recovery/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/diagnostics/causal-graph-builder.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-migration/current-frontier",
    "escalationTriggers": [
      "evidence promotes startup_active_gate_owner / snapshot_coverage back to a same-frontier local runtime fix",
      "the support-evidence boundary requires bootstrap or rebalancer runtime changes",
      "the fix requires harness timeout increases, Pro behavior, or Enterprise behavior",
      "representative evidence remains terminal readiness after one focused diagnostics proof"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_readiness_owner / startup_support_evidence owns the migrated residual, selected-snapshot timeout evidence observed while active-gate snapshot coverage is still incomplete must reduce to a bounded support-evidence path instead of turning downstream readiness into an independent terminal owner.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "expectedCausalModelChange": "The readiness_startup_support edge either defers through inherited active-gate no progress, converges to representative green, or names a fresh owner-boundary migration with concrete evidence. The focused proof reduced it to deferred inherited active-gate no progress.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence remains red, but this package reduced selectedSnapshotError snapshot_timeout from terminal readiness ownership to inherited active-gate support evidence. Causal analysis now returns continue_local_fix for startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Review, fix, and implementation delegation are recorded as blocked-by-environment-policy because this host requires an explicit user request before spawning subagents."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup active-gate recovery rerun from May 13, 2026",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence",
      "top failure reason ranking"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains blocked under startup_active_gate_owner / snapshot_coverage, but the bounded active-gate package migrated because readiness_startup_support is now terminal_failed from selectedSnapshotError snapshot_timeout.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with PUBLISHED and zero pending acknowledgements",
      "priority_recovery_partition_progress is satisfied from explicit activeGate progress-class evidence",
      "active_gate_snapshot_coverage remains blocked with activeGate timed out and snapshotCoverage=1/5",
      "readiness_startup_support is terminal_failed with supportPath readiness_failure"
    ],
    "missingCausalEdge": "Selected snapshot timeout evidence should identify whether startup readiness owns a terminal support failure or is inheriting the already-blocked active-gate snapshot coverage path.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused diagnostics tests must prove the selected-snapshot timeout support path before another broad rolling-restart rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json",
    "expectedObservableTransition": "The causal model reduced startup readiness support evidence to deferred inherited active-gate no progress and returned the local blocker to startup_active_gate_owner / snapshot_coverage.",
    "maxProgressBound": "one focused startup readiness support-evidence proof",
    "sameFrontierFallback": "not used; readiness support evidence reduced and the successor returns to startup_active_gate_owner / snapshot_coverage",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage successor after readiness support evidence reduction",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md"
}
-->

## Why

The active-gate package completed one focused startup owner cycle and reran
`rolling-restart`. The scenario is still red, and canonical causal analysis now
stops on `startup_readiness_owner / startup_support_evidence` because the
readiness edge is terminal from `selectedSnapshotError` with
`snapshot_timeout`.

This package owns that support-evidence boundary only. It must prove whether
the selected snapshot timeout is a real terminal readiness owner or inherited
evidence from the already-blocked active-gate snapshot coverage path.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named owner boundary, focused diagnostics proof, and no harness timeout
  changes.
- Escalation trigger to a heavier lane: runtime ownership changes are required,
  the scenario evidence promotes a different owner, or support evidence remains
  terminal after one focused proof.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

Review and fix sequencing is recorded before implementation starts. Real
subagents require an explicit user request in this host, so unavailable role
proof is recorded rather than invented.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-startup-readiness-successor-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-startup-readiness-successor-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-startup-readiness-successor-implementation

## In Scope

1. work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md
2. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. work/model-ledger.jsonl
6. src/diagnostics/topology-convergence-graph.js
7. src/diagnostics/failure-class-taxonomy.js
8. src/diagnostics/causal-graph-builder.js
9. test/diagnostics/topology-convergence-graph.test.js
10. test/diagnostics/failure-class-taxonomy.test.js
11. test/diagnostics/stop-condition-decision.test.js
12. test/diagnostics/causal-graph-builder.test.js

## Out Of Scope

1. harness timeout increases
2. priority-recovery runtime changes without fresh first-frontier evidence
3. publication-convergence implementation without fresh first-frontier evidence
4. Pro behavior
5. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-migration/current-frontier`
- Owned files: `work/packages/done-20260513-rolling-restart-startup-readiness-snapshot-timeout-support.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/model-ledger.jsonl`, `src/diagnostics/topology-convergence-graph.js`, `src/diagnostics/failure-class-taxonomy.js`, `src/diagnostics/causal-graph-builder.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/diagnostics/failure-class-taxonomy.test.js`, `test/diagnostics/stop-condition-decision.test.js`, `test/diagnostics/causal-graph-builder.test.js`
- Forbidden files: `harness timeout increases`, `priority-recovery runtime changes without fresh first-frontier evidence`, `publication-convergence implementation without fresh first-frontier evidence`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json`, `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown`, `node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `startup_readiness_owner / startup_support_evidence`
  owns the migrated residual, selected-snapshot timeout evidence observed while
  active-gate snapshot coverage is incomplete must reduce to a bounded support
  path instead of turning downstream readiness into an independent terminal
  owner.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json`
- Expected causal-model change: readiness support evidence defers through
  inherited active-gate no progress, converges to representative green, or
  names a fresh owner-boundary migration.
- Representative outcome: `pending-before-rerun`.
- Causal debt: `rolling-restart` remains red with active-gate timeout,
  `active=2/5`, `snapshotCoverage=1/5`, and readiness support evidence
  terminal from `selectedSnapshotError` / `snapshot_timeout`.
- Cross-boundary review: role delegation is recorded as
  `blocked-by-environment-policy` because this host requires explicit user
  request before spawning subagents.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` startup active-gate recovery
  rerun from May 13, 2026.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, startup active-gate snapshot coverage, startup readiness support
  evidence, top failure reason ranking.
- Current first frontier: active-gate snapshot coverage remains blocked, but
  the bounded active-gate package migrated because readiness support evidence is
  now terminal.
- Known downstream blockers: publication ACK and priority recovery are
  satisfied; active-gate snapshot coverage is blocked; readiness support is
  terminal with support path `readiness_failure`.
- Missing causal edge: selected snapshot timeout evidence must identify whether
  startup readiness owns a terminal support failure or inherits the already
  blocked active-gate coverage path.
- Bounded progress proof: focused diagnostics tests before another broad
  `rolling-restart` rerun.
- Expected next frontier: `startup_active_gate_owner / snapshot_coverage` if
  support evidence reduces; otherwise the fresh named owner boundary from
  canonical evidence.
- Stop condition: `continue-local-fix`.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json
4. npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown
5. node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js
