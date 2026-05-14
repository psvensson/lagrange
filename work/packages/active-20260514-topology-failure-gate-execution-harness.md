# Topology Failure Gate Execution Harness

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "failure-gate-matrix",
  "artifact": "test-output/reports/topology-failure-gate-execution-harness.report.json",
  "playback": "none",
  "owner": "distributed_test_harness",
  "boundary": "failure_gate_execution",
  "dominantReason": "failure_gate_matrix_not_executed",
  "currentState": "The prior sprint added a canonical failure-gate matrix but recorded no executable gate plan, artifact naming, durable assertion IDs, or red-outcome split package wiring.",
  "nextAction": "Sharpen the failure-gate harness and sprint observability only: generate deterministic gate execution plans, assertion metadata, artifact paths, and package split rules without fixing rolling-restart runtime behavior.",
  "proof": [
    "npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown",
    "node test/distributed/harness/__tests__/scenario-registry.test.js",
    "node test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-failure-gate-execution-harness.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-failure-scenario-gates.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260514-topology-failure-gate-execution-harness.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js"
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
  "causalGovernance": {
    "hypothesis": "distributed_test_harness / failure_gate_execution proof should reduce, migrate, or classify failure_gate_matrix_not_executed without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-failure-gate-execution-harness.report.json",
    "expectedCausalModelChange": "failure_gate_matrix_not_executed becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until distributed_test_harness / failure_gate_execution is proven, the sprint representative rolling-restart residual stays open. Runtime rolling-restart fixes are out of scope for this tooling package.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "failure-gate-matrix / distributed_test_harness / failure_gate_execution",
    "phaseChain": [
      "canonical evidence extraction",
      "distributed_test_harness / failure_gate_execution focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier distributed_test_harness / failure_gate_execution; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative publication/snapshot coverage remains red until green or migrated by a later runtime package",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven distributed_test_harness / failure_gate_execution causal edge for failure_gate_matrix_not_executed",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for distributed_test_harness / failure_gate_execution.",
    "boundedProgressProofArtifact": "test-output/reports/topology-failure-gate-execution-harness.report.json",
    "expectedObservableTransition": "failure_gate_matrix_not_executed resolves to executable gate-plan evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep distributed_test_harness / failure_gate_execution active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The prior sprint created a canonical topology failure-gate matrix, but it did
not execute those gates or produce gate artifacts. That leaves the sprint with
named risk coverage but no release proof. The successor sprint needs executable
gate wiring before the individual failure gates can be closed rigorously.

This package owns the distributed test harness boundary for gate execution:
matrix entries, scenario registry wiring, artifact naming, durable convergence
assertion metadata, and per-gate split rules.

## Scope Basis

AGPL topology release-gate hardening for the failure scenarios named by the
prior sprint: rolling restart, node killed during join, node killed during
rejoin, node killed while coordinating replica operation, missed remote handoff
ACK, stale publication with durable truth ahead, and split/rebalance during
node recovery.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package edits only harness matrix/registry
  wiring and harness tests. Runtime failures discovered by gate execution are
  split to owner packages.
- Escalation trigger to a heavier lane: a gate cannot be represented without
  new runtime instrumentation, new scenario semantics, or relaxed convergence
  criteria.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Make every topology failure-gate matrix entry executable from the distributed
   harness or explicitly mark it unsupported with a follow-up package.
2. Ensure each gate records scenario name, config, expected durable convergence
   assertion, output artifact path convention, owning package, and owner-boundary
   split target when red.
3. Add harness tests proving the matrix and scenario registry agree.
4. Update the sprint with gate execution order and artifact naming.
5. Keep runtime fixes out of this package even when a gate definition reveals a
   likely runtime gap.

## Out Of Scope

1. runtime-fixes-discovered-by-gates
2. harness-timeout-stretching-without-owner-proof
3. Weakening durable convergence assertions to absence-of-throw checks.
4. Adding Pro or Enterprise scenario coverage.

## Required Gate Matrix

1. Rolling restart: prove `active=5/5`, `snapshotCoverage=5/5`,
   `missingPublished=0`, and no `priority_recovery_event_driven_wait`.
2. Node killed during join: prove durable join intent, epoch fencing, rebalance
   repair, and active admission after the failed join.
3. Node killed during rejoin: prove post-rejoin reconciliation gates active
   admission and repairs/rearms local and remote work.
4. Node killed while coordinating replica operation: prove durable operation
   replay, remote wakeup, bounded retry, ACK/timeout, and terminal
   classification.
5. Missed remote handoff ACK: prove ACK absence schedules retry or terminal
   degraded outcome before publication closes.
6. Stale cache publication with durable truth ahead: prove durable owner truth
   outranks stale projection.
7. Split/rebalance during node recovery: prove descriptor epoch fencing,
   capacity/degraded accounting, anti-entropy exact owner-key repair, and final
   placement convergence.

## Owner Contract To Prove

The harness must assert durable convergence, not just that the scenario process
exited. Every gate needs a machine-readable assertion plan that names the
durable owner fields it checks and the package that owns a failed check.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-failure-gate-execution-harness.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. `candidateRuntimeFiles` is empty; runtime writes require a narrower package
   or explicit metadata update. Harness writes are limited to this package's
   declared matrix, registry, and focused tests.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-failure-gate-execution-harness.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-gate-execution-harness-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-gate-execution-harness-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-gate-execution-harness-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-failure-gate-execution-harness.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `test/distributed/harness/topology-failure-gate-matrix.js`, `test/distributed/harness/scenario-registry.js`, `test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`, `test/distributed/harness/__tests__/scenario-registry.test.js`
- Forbidden files: `runtime-fixes-discovered-by-gates`, `harness-timeout-stretching-without-owner-proof`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown`, `node test/distributed/harness/__tests__/scenario-registry.test.js`, `node test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-failure-gate-execution-harness.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-failure-gate-execution-harness.md
3. npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown
4. node test/distributed/harness/__tests__/scenario-registry.test.js
5. node test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js
6. node scripts/check-guideline-literals.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js
7. node scripts/check-guideline-decision-boundaries.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js
8. npm run audit:runtime-grammar:file -- test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js
9. npm run work:validate -- --entry work/packages/active-20260514-topology-failure-gate-execution-harness.md
10. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-failure-gate-execution-harness.md
11. npm run work:validate -- --closure work/packages/active-20260514-topology-failure-gate-execution-harness.md
12. git diff --check -- work/packages/active-20260514-topology-failure-gate-execution-harness.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js
13. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If a gate runs and fails due to runtime behavior, split to the package named
   by that gate's owner-boundary mapping.
2. If a scenario cannot inject the named failure yet, split a harness package
   with exactly that injection as scope.
3. If convergence assertions require new diagnostic fields, split to the owner
   that must expose those fields before weakening the assertion.

## Acceptance Criteria

1. Matrix and registry tests prove all required gates are executable or have a
   precise unsupported follow-up.
2. Every gate has durable convergence assertions and artifact naming.
3. Active sprint lists gate order and package owner for each red outcome.
4. No runtime behavior is changed in this package.

## Implementation Proof

- Focused tooling change:
  `test/distributed/harness/topology-failure-gate-matrix.js` now records
  durable assertion IDs, red-outcome split packages, stable artifact paths, and
  command/argument execution plans for all seven topology failure gates.
- Registry surface:
  `test/distributed/harness/scenario-registry.js` exports canonical execution
  plan and execution-line helpers so other harness tooling can consume the gate
  plan without duplicating matrix logic.
- Focused tests passed:
  `node test/distributed/harness/__tests__/scenario-registry.test.js` reported
  `9/9` passing and
  `node test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`
  reported `6/6` passing.
- Package-listed historical `npx tap` command returned `skip/no tests found`,
  so the package proof was corrected to the direct node commands that execute
  the tap ESM test files.
- Static guardrails passed for the four touched harness/test files:
  guideline literals, decision boundaries, and runtime grammar audit.
- Result classification: `reduced`. The matrix is no longer only a static list;
  it has deterministic executable gate plans and split ownership. This package
  changes harness observability only and does not fix `rolling-restart`
  runtime behavior.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
