# Topology Bounded Progress Budgets

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "progress_budget_taxonomy",
  "dominantReason": "retryable_waits_lack_terminal_bounds",
  "currentState": "Critical topology diagnostics still expose unknown or unbounded progress budgets in paths that can affect release-gate closure.",
  "nextAction": "Require bounded retry timeout reconcile and terminal classifications for critical topology workflows",
  "proof": [
    "npm run analyze:owner-files -- topology_control_plane progress_budget_taxonomy --markdown",
    "npx tap test/rebalancer/topology-owner-contracts.test.js test/diagnostics/budget-timeout-accounting.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js",
    "git diff --check -- src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js test/rebalancer/topology-owner-contracts.test.js test/diagnostics/budget-timeout-accounting.test.js work/packages/done-20260513-topology-bounded-progress-budgets.md"
  ],
  "writeScope": [
    "src/rebalancer/topology-owner-constants.js",
    "src/diagnostics/budget-timeout-accounting.js",
    "test/rebalancer/topology-owner-contracts.test.js",
    "test/diagnostics/budget-timeout-accounting.test.js",
    "work/packages/done-20260513-topology-bounded-progress-budgets.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-anti-entropy-reconciler.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/rebalancer/topology-owner-constants.js",
    "src/diagnostics/budget-timeout-accounting.js"
  ],
  "commitScope": [
    "src/rebalancer/topology-owner-constants.js",
    "src/diagnostics/budget-timeout-accounting.js",
    "test/rebalancer/topology-owner-contracts.test.js",
    "test/diagnostics/budget-timeout-accounting.test.js",
    "work/packages/done-20260513-topology-bounded-progress-budgets.md",
    "work/model-ledger.jsonl"
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
  "predecessor": "work/packages/done-20260513-topology-anti-entropy-reconciler.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Critical topology workflows should never remain classified only as retryable
or event-driven. This package owns the shared budget and terminal-state
taxonomy that makes wake, retry, timeout, reconcile, and degraded outcomes
observable and bounded.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  for critical topology progress budgets and terminal states.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Standardize retry windows, next-attempt timestamps, attempt counters,
   terminal degraded classifications, and diagnostic reasons for critical
   topology workflows.
2. Teach diagnostics/analyzers to keep retryable evidence active unless a
   bounded progress mechanism is present.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Timeout stretching to hide failures.
2. Replacing focused owner proof with classification-only closure.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `src/rebalancer/topology-owner-constants.js`,
  `src/diagnostics/budget-timeout-accounting.js`,
  `test/rebalancer/topology-owner-contracts.test.js`,
  `test/diagnostics/budget-timeout-accounting.test.js`,
  `work/packages/done-20260513-topology-bounded-progress-budgets.md`,
  `work/model-ledger.jsonl`
- Forbidden files: rolling-restart scenarios/artifacts, topology convergence
  golden fixtures already dirty before this package, Pro behavior, Enterprise
  behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/rebalancer/topology-owner-contracts.test.js test/diagnostics/budget-timeout-accounting.test.js`
- Model ledger advisory: `escalate`

## Shared Boundary Contract

- Semantic owner: `topology_control_plane`
- Canonical contract shape / vocabulary: progress budget outcomes normalize
  retry windows, next-attempt timestamps, attempt bounds, elapsed workflow
  budgets, terminal degraded classifications, and diagnostic reasons.
- Allowed consumers: topology control-plane owner contracts, operation retry
  and resume diagnostics, and read-only budget accounting reports.
- Prohibited reinterpretations: event-driven waits, cache visibility, timer
  text, incidental row absence, or timeout strings must not be treated as
  bounded progress without an explicit owner budget outcome.
- Primary diagnostics / proof surfaces:
  `test/rebalancer/topology-owner-contracts.test.js` and
  `test/diagnostics/budget-timeout-accounting.test.js`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Codex (019e25ad-657d-7a23-8b65-e60bf5b607e4) reviewed work/packages/done-20260513-topology-anti-entropy-reconciler.md; result clean`.
- [x] Fix subagent recorded or explicitly not needed: `not-needed`.
- [x] Implementation subagent recorded:
      `Agent Epicurus (019e25c4-0d7d-71a2-a44c-8bec70755176) implemented work/packages/done-20260513-topology-bounded-progress-budgets.md`.

## Validation

1. `npm run work:context` passed and confirmed this package as the current
   blocker.
2. `npm run work:llm-start` passed and loaded package doctor, dirty-scope, and
   model-ledger context.
3. `npm run work:package:doctor -- --suggest work/packages/done-20260513-topology-anti-entropy-reconciler.md`
   passed in the review subagent.
4. `npm run work:validate -- --closure work/packages/done-20260513-topology-anti-entropy-reconciler.md`
   passed in the review subagent.
5. `npm run analyze:owner-files -- topology_control_plane progress_budget_taxonomy --markdown`
   passed and identified the topology owner constants plus current package
   handoff as the owner surface.
6. Review subagent proof recorded from Gauss
   (`019e25ad-657d-7a23-8b65-e60bf5b607e4`), result `clean`.
7. Implementation subagent proof recorded from Epicurus
   (`019e25c4-0d7d-71a2-a44c-8bec70755176`).
8. `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
   and `npm run work:evidence-summary -- test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json`
   passed. Focused raw artifact inspection followed because the summary did
   not expose the exact retry-after, timeout-reconcile, and terminal readiness
   fields needed to bind the budget taxonomy.
9. `npx tap test/rebalancer/topology-owner-contracts.test.js test/diagnostics/budget-timeout-accounting.test.js`
   passed after implementation.
10. `node scripts/check-guideline-literals.js src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js`
    passed with 0 new literal-guideline violations.
11. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js`
    passed with 0 decision-boundary guideline violations.
12. `npm run audit:runtime-grammar:file -- src/rebalancer/topology-owner-constants.js src/diagnostics/budget-timeout-accounting.js`
    passed with 0 runtime-grammar-contract violations.
13. `npm run work:model-ledger -- record --package work/packages/active-20260513-topology-bounded-progress-budgets.md --model gpt-5.3-codex --reasoning-effort high --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome implemented --validation-status focused-green --correction-loops 1 --review-findings 0 --notes "..."`
    recorded the final implementation evidence before the package was renamed
    from `active-...` to `done-...`. The ledger was not duplicated after the
    rename so the recorded package path remains
    `work/packages/active-20260513-topology-bounded-progress-budgets.md`.

## Post-Closure Review Fix Notes

Review subagent Codex (`019e25d8-a64b-7363-ab65-ef787e5a3fb9`) found that the
successor handoff needed to reconcile this package with the latest
representative evidence before failure-gate implementation starts.

Residual budget inventory from
`npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`:

1. `scenario_duration` remains `unbounded` under
   `diagnostics_owner / causal_analysis_framework` with next action
   `inspect_scenario_timeout_budget`.
2. `active_gate_timeout` remains `unbounded` under
   `startup_active_gate_owner / snapshot_coverage` with next action
   `reduce_startup_active_gate_budget_contract`.
3. `active_gate_attempts` is `exhausted` but has an observed bound of `8`.
4. `readiness_retry_window` is `exhausted` but has an observed bound of `8`.
5. `workflow_step_timeout` is `within_budget` for
   `operation_workflow_owner / workflow_progress`.

This residual inventory does not prove representative green and does not close
the active-gate runtime first frontier. It also does not block the
human-directed sprint-queue move to the failure-gate package because this
package owned the shared progress-budget taxonomy and focused proof only; the
remaining `active_gate_timeout` budget belongs to
`startup_active_gate_owner / snapshot_coverage`, and the successor
`distributed_test_harness / failure_gate_matrix` package is a coverage-gate
handoff rather than a runtime first-frontier fix.

## Commit And Push Ledger

1. Focused package commit: `2e1a8443`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
