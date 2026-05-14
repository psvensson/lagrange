# Topology Active Gate Budget Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage_budget",
  "dominantReason": "active_gate_timeout_unbounded",
  "currentState": "Causal model now classifies active_gate_timeout as exhausted terminal active-gate accounting; representative snapshot coverage remains incomplete.",
  "nextAction": "Close this package as reduced and activate active-gate owner cohort convergence for snapshot coverage and owner-truth repair.",
  "proof": [
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "node --test test/diagnostics/budget-timeout-accounting.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-active-gate-budget-closure.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/diagnostics/budget-timeout-accounting.js",
    "test/diagnostics/budget-timeout-accounting.test.js"
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
    "work/packages/done-20260514-topology-active-gate-budget-closure.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/diagnostics/budget-timeout-accounting.js",
    "test/diagnostics/budget-timeout-accounting.test.js"
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
    "nextAction": "Continue with active-gate cohort convergence now that timeout and attempt budget accounting are terminally classified."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage_budget proof should reduce, migrate, or classify active_gate_timeout_unbounded without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "active_gate_timeout_unbounded becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "reduced",
    "causalDebt": "The active_gate_timeout_unbounded residual is reduced to exhausted terminal accounting; the sprint representative residual stays open at startup_active_gate_owner / snapshot_coverage for cohort convergence.",
    "crossBoundaryReview": "Review, fix, and implementation subagent proof is recorded; follow-on package owns startup_active_gate_owner / snapshot_coverage."
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
    "missingCausalEdge": "package-local startup_active_gate_owner / snapshot_coverage_budget edge reduced active_gate_timeout_unbounded to exhausted terminal accounting; remaining representative edge is startup_active_gate_owner / snapshot_coverage",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for startup_active_gate_owner / snapshot_coverage_budget.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "active_gate_timeout_unbounded reduced to exhausted terminal active-gate accounting; remaining representative frontier is snapshot_coverage_incomplete.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage_budget active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage via active-gate owner cohort convergence",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
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

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-budget-closure.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/diagnostics/budget-timeout-accounting.js`, `src/bootstrap/bootstrap-api-runtime-methods.js`, `src/bootstrap/bootstrap-service-runtime-methods.js`, `test/diagnostics/budget-timeout-accounting.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required now because this active package is a runtime owner-boundary package.

1. [x] Review subagent recorded: Agent Socrates (019e2658-5ef0-7500-aad6-94fbcbd913bd) reviewed work/packages/done-20260514-topology-residual-evidence-inventory.md; result fixes-required.
2. [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e265a-3938-7a12-bd38-a44307a5f603) fixed work/packages/done-20260514-topology-residual-evidence-inventory.md.
3. [x] Implementation subagent recorded: Agent Codex (019e265f-a3ed-74d2-980c-f6ff6c8e8cbc) implemented work/packages/done-20260514-topology-active-gate-budget-closure.md.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-active-gate-budget-closure.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `src/diagnostics/budget-timeout-accounting.js`, `test/diagnostics/budget-timeout-accounting.test.js`
- Forbidden files: `harness-timeout-increases`, `publication-runtime-changes-without-fresh-evidence`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `node --test test/diagnostics/budget-timeout-accounting.test.js`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-active-gate-budget-closure.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-budget-closure.md
3. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. node --test test/diagnostics/budget-timeout-accounting.test.js
6. node scripts/check-guideline-literals.js src/diagnostics/budget-timeout-accounting.js test/diagnostics/budget-timeout-accounting.test.js
7. node scripts/check-guideline-decision-boundaries.js src/diagnostics/budget-timeout-accounting.js test/diagnostics/budget-timeout-accounting.test.js
8. npm run audit:runtime-grammar:file -- src/diagnostics/budget-timeout-accounting.js test/diagnostics/budget-timeout-accounting.test.js
9. npm run work:validate -- --entry work/packages/done-20260514-topology-active-gate-budget-closure.md
10. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-active-gate-budget-closure.md
11. npm run work:validate -- --closure work/packages/done-20260514-topology-active-gate-budget-closure.md
12. git diff --check -- src/diagnostics/budget-timeout-accounting.js test/diagnostics/budget-timeout-accounting.test.js work/packages/done-20260514-topology-active-gate-budget-closure.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md
13. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If fixing budget accounting requires changing publication owner state, split
   that work to `todo-20260514-topology-publication-projection-reconciliation.md`.
2. If active gate still cannot converge after bounded budget proof, hand off to
   `active-20260514-topology-active-gate-owner-cohort-convergence.md`.
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

## Implementation Proof Notes

Implementation subagent changed only `src/diagnostics/budget-timeout-accounting.js`
and `test/diagnostics/budget-timeout-accounting.test.js` plus package/sprint
proof notes. Owner-file proof promoted those runtime/test paths into
`writeScope` and `commitScope`.

Focused budget behavior now normalizes one active-gate budget decision snapshot
for elapsed time, attempts, attempts-since-progress, coordinator cycles, state,
and reason code. For the representative artifact, `active_gate_timeout` now
reports `state=exhausted`, `observed=87249`, `limit=87249`,
`progressState=terminal_progress`, `progressMechanism=terminal_classification`,
`terminalState=terminal_degraded`, `reason=active_gate_timeout_terminal`, and
`nextAttemptInMs=absent`. `active_gate_attempts` remains exhausted at `9/8`
and now carries the same terminal degraded classification.

Validation run by implementation subagent:

1. `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-budget-closure.md` - passed, no deterministic suggestions.
2. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown` - selected this package and diagnostics/test candidates as the bounded owner surface.
3. `node --test test/diagnostics/budget-timeout-accounting.test.js` - passed 6 tests.
4. `npx tap test/diagnostics/budget-timeout-accounting.test.js` - completed with `SKIP no tests found`; this file is a `node:test` suite.
5. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` - active-gate timeout changed from unbounded to exhausted terminal accounting; sprint first frontier remains `startup_active_gate_owner / snapshot_coverage`.
6. `npm run work:validate -- --pre-impl work/packages/done-20260514-topology-active-gate-budget-closure.md` - passed.

Parent-session review added a regression for the overclassification edge: plain
`state=stalled` without a terminal reason or exhausted attempt/cycle budget
still remains unbounded, so terminal accounting requires owner-budget evidence
rather than the state label alone.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 270ccb1e79d2a6203afcfd0606579b7b0bb5824d.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
