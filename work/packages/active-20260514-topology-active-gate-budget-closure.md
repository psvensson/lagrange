# Topology Active Gate Budget Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage_budget",
  "dominantReason": "active_gate_timeout_unbounded",
  "currentState": "Causal model reports active_gate_timeout unbounded with observed elapsed active-gate time and absent limit while snapshot coverage is incomplete.",
  "nextAction": "Make active-gate elapsed time retry window next-attempt and terminal degraded classification bounded and owned by the startup active-gate decision snapshot.",
  "proof": [
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npx tap test/diagnostics/budget-timeout-accounting.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-active-gate-budget-closure.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-bounded-progress-budgets.md",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/diagnostics/budget-timeout-accounting.js",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "test/diagnostics/budget-timeout-accounting.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-active-gate-budget-closure.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
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
    "status": "red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Bound active-gate timeout, retry, next-attempt, and terminal degraded classification before active-gate cohort convergence."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage_budget proof should reduce, migrate, or classify active_gate_timeout_unbounded without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "active_gate_timeout_unbounded becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until startup_active_gate_owner / snapshot_coverage_budget is proven, the sprint representative rolling-restart residual stays open at startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Required before closure through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage_budget",
    "phaseChain": [
      "canonical evidence extraction",
      "startup_active_gate_owner / snapshot_coverage_budget focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier startup_active_gate_owner / snapshot_coverage_budget; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven startup_active_gate_owner / snapshot_coverage_budget causal edge for active_gate_timeout_unbounded",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for startup_active_gate_owner / snapshot_coverage_budget.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "active_gate_timeout_unbounded resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage_budget active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The representative rolling-restart artifact reports incomplete active-gate
snapshot coverage and the causal model reports `active_gate_timeout` as
unbounded. That is a topology recovery defect even if a later package fixes the
cohort math: a critical owner must never end in an unknown or event-only wait.

This package owns the startup active-gate budget boundary. It should make the
active-gate decision snapshot carry elapsed time, bounded retry window,
next-attempt timestamp, attempt counter, and terminal degraded classification
when convergence cannot be reached inside the allowed window.

## Scope Basis

AGPL topology convergence item: harden budgets and terminal states for owner
workflows. Prior focused proof exists in
`work/packages/done-20260513-topology-bounded-progress-budgets.md`, but the
representative artifact still exposes an unbounded active-gate timeout.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package is constrained to the
  `startup_active_gate_owner / snapshot_coverage_budget` owner boundary and its
  diagnostics/tests.
- Escalation trigger to a heavier lane: the budget fix requires publication
  owner behavior, distributed harness timing policy, or a new shared topology
  lifecycle contract.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Inspect active-gate budget accounting through
   `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`.
2. Normalize one active-gate budget decision snapshot that includes elapsed
   time, configured limit, retry window, next-attempt timestamp, attempt count,
   terminal/degraded classification, and reason.
3. Ensure active-gate diagnostics cannot report an unbounded timeout for a
   critical recovery wait.
4. Add or adjust focused tests in the budget accounting boundary if needed.
5. Update the package and active sprint with the exact budget contract and
   representative evidence result.

## Out Of Scope

1. harness-timeout-increases
2. publication-runtime-changes-without-fresh-evidence
3. Changing active cohort membership semantics beyond the minimum needed to
   attach bounded budget diagnostics.
4. Reclassifying `PUBLISHED` or missing publication projection; that belongs to
   the publication package.

## Entry Evidence

1. Causal model: `active_gate_timeout` has observed elapsed time but missing or
   unknown limit.
2. Representative artifact: snapshot coverage is incomplete while ship criteria
   require `snapshotCoverage=5/5`.
3. Prior budget package: focused budget proof exists but did not close the
   representative active-gate timeout observation.

## Owner Contract To Prove

`startup_active_gate_owner` must own all live and terminal wait outcomes for the
active gate. A critical active-gate wait is valid only if it has:

1. A finite retry or convergence budget.
2. A durable next-attempt timestamp when work remains retryable.
3. An attempt counter tied to owner state, not event delivery.
4. A terminal degraded reason when the budget is exhausted.
5. A diagnostic reason attached to the same normalized decision snapshot used
   by the active-gate decision.

`waiting for event` is never a final state for this owner.

## Activation Contract

Required before implementation continues in this active package:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-active-gate-budget-closure.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/diagnostics/budget-timeout-accounting.js`, `src/bootstrap/bootstrap-api-runtime-methods.js`, `src/bootstrap/bootstrap-service-runtime-methods.js`, `test/diagnostics/budget-timeout-accounting.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required now because this active package is a runtime owner-boundary package.

1. [ ] Review subagent recorded: pending before implementation starts.
2. [ ] Fix subagent recorded or explicitly not needed: pending until review
   result.
3. [ ] Implementation subagent recorded: pending until pre-implementation proof
   is clean.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-active-gate-budget-closure.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `harness-timeout-increases`, `publication-runtime-changes-without-fresh-evidence`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npx tap test/diagnostics/budget-timeout-accounting.test.js`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-active-gate-budget-closure.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-active-gate-budget-closure.md
3. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. npx tap test/diagnostics/budget-timeout-accounting.test.js
6. node scripts/check-guideline-literals.js src/diagnostics/budget-timeout-accounting.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js test/diagnostics/budget-timeout-accounting.test.js
7. node scripts/check-guideline-decision-boundaries.js src/diagnostics/budget-timeout-accounting.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js test/diagnostics/budget-timeout-accounting.test.js
8. npm run audit:runtime-grammar:file -- src/diagnostics/budget-timeout-accounting.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js test/diagnostics/budget-timeout-accounting.test.js
9. npm run work:validate -- --entry work/packages/active-20260514-topology-active-gate-budget-closure.md
10. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-active-gate-budget-closure.md
11. npm run work:validate -- --closure work/packages/active-20260514-topology-active-gate-budget-closure.md
12. git diff --check -- work/packages/active-20260514-topology-active-gate-budget-closure.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md
13. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If fixing budget accounting requires changing publication owner state, split
   that work to `todo-20260514-topology-publication-projection-reconciliation.md`.
2. If active gate still cannot converge after bounded budget proof, hand off to
   `todo-20260514-topology-active-gate-owner-cohort-convergence.md`.
3. If causal model exposes another unbounded critical owner wait, split a new
   owner-boundary package instead of widening this package.

## Acceptance Criteria

1. Focused budget test proves finite active-gate budget, next-attempt,
   attempt-count, and terminal degraded reason.
2. Causal model no longer reports `active_gate_timeout` as unbounded for the
   latest relevant artifact after rerun, or this package records a narrower
   blocker explaining why a rerun is not yet meaningful.
3. Active-gate diagnostics preserve one normalized owner decision snapshot.
4. No harness timeout increase is used as the fix.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
