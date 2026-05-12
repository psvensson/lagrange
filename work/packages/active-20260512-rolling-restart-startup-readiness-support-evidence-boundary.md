# Rolling Restart Startup Readiness Support Evidence Boundary

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof/rolling-restart/",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "startup_readiness_blocked",
  "currentState": "Fresh causal proof after direct workflow-progress closure keeps rolling-restart red and migrates the stop condition to startup_readiness_owner / startup_support_evidence. Priority recovery is retryable rather than blocked, publication ACK convergence is satisfied, and startup_active_gate_owner / snapshot_coverage is only the projected topology edge after readiness support evidence is resolved. Workflow/tooling repairs are owned by the dedicated workflow-tooling package, while this package owns only the scenario handoff and startup-readiness support-evidence proof.",
  "nextAction": "Have a fresh implementation subagent prove why startup readiness support evidence reaches terminal no-progress in the representative run. The first implementation proof must be a focused startup-readiness support-evidence fixture or probe; only after that may runtime code change.",
  "proof": [
    "npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain readiness_startup_support",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown",
    "focused startup_readiness_owner / startup_support_evidence fixture or owner test selected by implementation package",
    "representative rolling-restart rerun or explicit migration proof"
  ],
  "writeScope": [
    "work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "work/packages/active-20260511-workflow-tooling-llm-usability.md",
    "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
    "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof/rolling-restart/",
    "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-migration/current-frontier",
    "escalationTriggers": [
      "evidence promotes startup_active_gate_owner / snapshot_coverage ahead of startup readiness support evidence",
      "the fix requires operation_workflow_owner / workflow_progress runtime changes",
      "the fix requires publication convergence, harness timeout, Pro, or Enterprise behavior",
      "startup readiness support evidence is only presentation debt and not an owner-runtime boundary"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_readiness_owner / startup_support_evidence owns the migrated residual, startup readiness terminal no-progress evidence should identify a bounded support-evidence owner path instead of leaving readiness_terminal with source unknown and cause none.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
    "expectedCausalModelChange": "The startup readiness support evidence boundary reduces, converges, or migrates to one named owner before startup active-gate snapshot coverage is implemented.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The fresh report remains red after workflow progress became retryable. Causal stop decision is owner_boundary_migration with reason startup_readiness_boundary; readinessFailure is startup no_progress_terminal with terminalReason stalled_no_progress, source unknown, and cause none.",
    "crossBoundaryReview": "Review subagent 019e1d40-9ba1-79e1-9ec3-c4cf459a9a9d found fixes-required on this startup-readiness handoff. This handoff repair records the fix; runtime implementation still requires a fresh separate implementation subagent."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup readiness support evidence after workflow-progress migration",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup readiness support evidence",
      "startup active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress is retryable under operation_workflow_owner / workflow_progress; causal stop migrates to startup_readiness_owner / startup_support_evidence while readiness_startup_support is terminal_failed and not the topology first frontier.",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage is the projected topology edge after priority recovery becomes retryable",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs",
      "operation_workflow_owner / workflow_progress remains retryable priority_recovery_event_driven_wait and is out of scope for this successor"
    ],
    "missingCausalEdge": "Startup readiness terminal no-progress evidence has source unknown and cause none, so the owner support evidence does not yet expose the concrete wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded migration path.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain readiness_startup_support plus npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json",
    "boundedProgressProof": "Implementation must prove a deterministic wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded migration path for startup readiness support evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json plus focused startup_readiness_owner / startup_support_evidence fixture or owner tests selected by implementation",
    "expectedObservableTransition": "Readiness terminal evidence reduces from source unknown and cause none to a named support-evidence owner path, or migrates to startup active-gate snapshot coverage with explicit owner evidence.",
    "maxProgressBound": "one startup readiness support evidence probe or focused readiness-support owner test",
    "sameFrontierFallback": "keep startup_readiness_owner / startup_support_evidence active and do not implement startup active-gate snapshot coverage without fresh owner evidence",
    "expectedNextFrontier": "startup readiness support evidence reduction, representative-green, or one named owner-boundary migration",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md"
}
-->

## Why

The direct workflow-progress package reduced priority recovery from blocked to
retryable, and the causal stop decision now names
`startup_readiness_owner / startup_support_evidence`. The representative run is
still red because startup readiness reaches terminal no-progress with
`source=unknown` and `cause=none`.

This package owns that migrated readiness-support boundary. It must prove why
startup readiness support evidence goes terminal, then reduce it or record the
next named owner-boundary migration without implementing startup active-gate
behavior from this package.

## Future Agent Entry Contract

Before implementation starts, future agents must:

1. Run `npm run work:llm-start -- --package work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`.
2. Run `npm run work:package:doctor -- --suggest work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`.
3. Confirm the review and handoff-fix ledger entries below are still intact.
4. Use `npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`
   for the required fresh implementation subagent.
5. Follow the repo-wide tool-first contract maintained by
   [Workflow Tooling LLM Usability Slice](active-20260511-workflow-tooling-llm-usability.md);
   do not edit workflow docs or templates from this startup-readiness package.
6. Do not reopen predecessor
   workflow-progress work unless fresh normalized evidence promotes it.
7. Do not use ad hoc `jq` or raw log sampling unless the canonical extractors
   are missing or insufficient and the package records why.

## Subagent Sequencing Ledger

Review and handoff-repair proof is recorded here. Runtime implementation is
still intentionally open; parent-session notes or local manual labels do not
satisfy that future implementation entry.

- [x] Review subagent recorded:
      Agent Review Subagent (019e1d40-9ba1-79e1-9ec3-c4cf459a9a9d) reviewed
      `work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Codex Handoff Fix (019e1d45-e12e-7083-b20c-26c71520368f) fixed
      `work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`.
- [ ] Implementation subagent recorded:
      pending-before-implementation-starts

## Scope Basis

AGPL rolling-restart release-gate closure from `roadmap.md` and the active
sprint handoff. The package follows the causal migration from the closed
workflow-progress package and stays inside
`startup_readiness_owner / startup_support_evidence` unless fresh normalized
evidence promotes another owner boundary.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work is a bounded representative
  owner-boundary migration package with a named artifact, causal stop decision,
  proof ladder, and required sequential subagents.
- Escalation trigger to a heavier lane: startup readiness support evidence is
  only presentation debt, the fix requires startup active-gate implementation,
  or representative scenario evidence promotes a different owner boundary.

## In Scope

1. work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md
2. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. The latest representative artifact, playback, predecessor package, and
   workflow-tooling package as handoff/read context only.
6. Future implementation-subagent write scope is limited to selected
   `startup_readiness_owner / startup_support_evidence` runtime and test files
   only after the focused fixture or probe proves they own the missing
   support-evidence edge.

## Out Of Scope

1. operation_workflow_owner / workflow_progress runtime changes
2. startup active-gate implementation
3. publication-convergence implementation
4. harness timeout increases
5. Pro or Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-migration/current-frontier`
- Owned files: `work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `operation_workflow_owner / workflow_progress runtime changes`, `startup active-gate implementation`, `publication-convergence implementation`, `harness timeout increases`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: startup active-gate snapshot coverage becomes the
  normalized first owner, operation workflow runtime changes are needed,
  publication convergence reopens, or representative scenario evidence changes.
- Focused proof: `npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain readiness_startup_support`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown`, focused startup_readiness_owner / startup_support_evidence fixture or owner test selected by implementation package, representative rolling-restart rerun or explicit migration proof
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `startup_readiness_owner / startup_support_evidence`
  owns the migrated residual, terminal no-progress readiness evidence should
  identify a bounded support-evidence owner path instead of leaving
  `source=unknown` and `cause=none`.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
- Expected causal-model change: startup readiness support evidence reduces,
  converges, or migrates before startup active-gate snapshot coverage is
  implemented.
- Representative outcome: `pending-before-rerun`.
- Causal debt: `rolling-restart` remains red with causal stop
  `owner_boundary_migration`, reason `startup_readiness_boundary`.
- Cross-boundary review: review and handoff-repair sequencing is recorded;
  a fresh separate implementation subagent must be recorded before runtime
  implementation and package closure.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` startup readiness support
  evidence after workflow-progress migration.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, startup readiness support evidence, startup active-gate snapshot
  coverage.
- Current first frontier: priority recovery is retryable; causal stop migrates
  to `startup_readiness_owner / startup_support_evidence`.
- Known downstream blockers: startup active-gate snapshot coverage is projected
  after readiness support; publication ACK convergence is satisfied; operation
  workflow progress is retryable and out of scope.
- Missing causal edge: terminal startup readiness support evidence lacks a
  concrete source/cause and owner progress mechanism.
- Bounded progress proof: implementation must prove a deterministic wake,
  retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or
  bounded migration path.
- Expected next frontier: readiness support reduction, representative green, or
  one named owner-boundary migration.
- Stop condition: `continue-local-fix`.

## Fixture-First Implementation Contract

The first implementation proof must be a focused startup-readiness
support-evidence fixture or probe. It must reproduce the latest representative
shape before any runtime behavior changes:

1. `rolling-restart` report remains failed.
2. Publication ACK convergence is satisfied with `PUBLISHED` and zero pending
   ACKs.
3. Priority recovery is retryable, not blocked:
   `priority_recovery_event_driven_wait`.
4. Active gate times out with snapshot coverage `2/5`.
5. Readiness failure is startup `no_progress_terminal`, terminal reason
   `stalled_no_progress`.
6. Support evidence is weak: `source=unknown`, `cause=none`,
   `error=unknown`, `attemptsSinceProgress=0`, and `maxAttempts=unknown`.

The fixture must classify one canonical next step:

1. If readiness has state but loses owner/source/cause evidence, fix the
   readiness support evidence contract first.
2. If readiness has concrete stalled owner state, fix startup readiness owner
   progression.
3. If normalized evidence promotes `startup_active_gate_owner /
   snapshot_coverage`, migrate to that owner and stop this package.
4. If operation workflow becomes blocked again, stop and migrate back only with
   fresh normalized evidence.

Do not run another broad `rolling-restart` rerun until the focused fixture or
probe is green or the package records an explicit migration.

## Bailout Rule

This package gets one focused startup-readiness support-evidence implementation
cycle. If it cannot produce representative green, a reduced frontier, or one
clean owner-boundary migration, stop local patching and open a causal-analysis
or architecture-gap package for the startup readiness and active-gate boundary.

## Validation

1. npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain readiness_startup_support
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain active_gate_snapshot_coverage
6. npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown
7. focused startup_readiness_owner / startup_support_evidence fixture or owner test selected by implementation package
8. representative rolling-restart rerun or explicit migration proof
