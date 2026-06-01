# Rolling Restart Startup Readiness Admin Reachability Refused Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "admin_reachability_refused",
    "currentState": "Classifier selected startup_readiness_owner / startup_support_evidence after fresh rolling-restart evidence showed zero priority-recovery residuals, active-gate evidence missing, and admin_reachability_refused during restarted-node recovery readiness.",
    "nextAction": "Prove and repair the startup readiness support path that leaves a restarted node alive but admin-unreachable in INIT with control_snapshot_authority_unavailable.",
    "predecessor": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-classification.md",
    "closed": "2026-05-27",
    "successor": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-classification.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/startup-authority-consumption.test.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js"
    ],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-classification.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/startup-authority-consumption.test.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix",
      "theory-20260526-rolling-restart-snapshot-viewpoint-backpressure",
      "theory-20260526-rolling-restart-workflow-budget-capture-mismatch"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
        "regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
        "supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
        "npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown",
        "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/bootstrap/startup-recovery-coordinator.js",
        "src/bootstrap/node-joining-ready-signal-readiness.js",
        "test/bootstrap/startup-authority-consumption.test.js",
        "test/bootstrap/node-joining-ready-signal-retry.test.js",
        "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "theoryLedger": "no-ledger-update"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "evidence_missing",
    "nextAction": "Open the active-gate snapshot coverage evidence_missing successor selected by canonical route-after-rerun evidence."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "admin_reachability_refused",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Startup readiness support records bounded admin reachability/refusal evidence and allows the restarted node to reach recovery-ready, or representative evidence migrates to a new named owner boundary.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason admin_reachability_refused",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "observablePrediction": {
    "metric": "startup readiness admin reachability and control-snapshot authority refusal outcome",
    "predicted": "Focused startup readiness proof emits bounded admin_reachability_refused/control_snapshot_authority_unavailable evidence, and fresh rolling-restart reaches recovery-ready, reduces the startup readiness blocker, or migrates the first frontier away from readiness_startup_support / startup_readiness_owner / startup_support_evidence.",
    "observed": "Focused proof passed and fresh rolling-restart still failed the restarted-node admin readiness symptom, but canonical route migrated the first topology frontier to startup_active_gate_owner / snapshot_coverage / evidence_missing with zero priority-recovery residuals.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "The restarted node remains alive but admin-unreachable in INIT because startup_readiness_owner / startup_support_evidence does not surface or recover the control-snapshot authority/admin reachability refusal before recovery readiness waits expire.",
    "stopConditionCheck": "Use `npm run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json` plus the focused startup readiness proof before source edits; representative rerun must be green, reduce, migrate, or stop for architecture if unchanged.",
    "expectedCausalModelChange": "Startup readiness support records bounded admin reachability/control-snapshot authority evidence and either lets the restarted node reach recovery-ready or produces a new named owner-boundary frontier.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh representative evidence still reports admin_reachability_refused for the restarted node, but canonical routing selects startup_active_gate_owner / snapshot_coverage / evidence_missing as the first topology frontier and leaves startup readiness support as the downstream expected frontier.",
    "crossBoundaryReview": "Do not edit active-gate, operation-workflow, transport, or generic timeout budgets in this package unless the focused startup readiness proof selects a narrower owned dependency."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup readiness support after active-gate evidence classification",
    "phaseChain": [
      "active-gate EHOSTUNREACH projection migrated representative evidence to operation_workflow_owner / rebalancer_handoff",
      "classifier selected one rebalancer_handoff residual group with retry_scheduled dispatched_waiting_progress",
      "operation workflow runtime proof removed priority-recovery residuals",
      "active-gate evidence classifier selected startup_readiness_owner / startup_support_evidence from causal-model startup_readiness_blocked and distributed-failure admin_reachability_refused"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / evidence_missing",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage stays dependent on startup readiness support evidence",
      "priority recovery residuals remain zero in the fresh representative artifact"
    ],
    "missingCausalEdge": "Startup readiness support must make admin reachability refusal and control-snapshot authority unavailability a bounded owner outcome instead of leaving recovery readiness in INIT until timeout.",
    "missingCausalEdgeProbe": "npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
    "falsifyingProbe": "npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
    "boundedProgressProof": "Focused startup readiness tests prove the bounded admin reachability and control-snapshot authority support mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json",
    "expectedObservableTransition": "Focused proof passed and representative rolling-restart migrated to startup_active_gate_owner / snapshot_coverage / evidence_missing.",
    "maxProgressBound": "one startup_readiness_owner / startup_support_evidence runtime slice",
    "sameFrontierFallback": "If fresh representative evidence returns the same startup readiness frontier with no concrete reduction, open/select an autonomous architecture experiment before another startup readiness patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage / evidence_missing successor classification",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-load-admin-unreachable-projection-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260527-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-classification.md / operation_workflow_owner / rebalancer_handoff / classification-only"
    ],
    "oscillationCheck": "Allowed because the predecessor classifier selected startup readiness from fresh causal-model and distributed-failure evidence after priority recovery residuals reached zero.",
    "handoffInvariant": "Startup readiness may classify or repair support evidence but must not weaken admin, transport, active-gate, operation-workflow, or timeout-budget ownership."
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "test/bootstrap/startup-authority-consumption.test.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "theoryLedger": "no-ledger-update",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for admin_reachability_refused.
- Inputs/signals: test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json; falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js; regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json; supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps admin_reachability_refused and route evidence to one emitted outcome: migrate_owner_boundary.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / admin_reachability_refused | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Prove and repair the startup readiness support path that leaves a restarted node alive but admin-unreachable in INIT with control_snapshot_authority_unavailable. | Startup readiness support records bounded admin reachability/refusal evidence and allows the restarted node to reach recovery-ready, or representative evidence migrates to a new named owner boundary. | falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Competing explanations: At minimum compare admin_reachability_refused against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own admin_reachability_refused, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: admin_reachability_refused is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Success metrics: Startup readiness support records bounded admin reachability/refusal evidence and allows the restarted node to reach recovery-ready, or representative evidence migrates to a new named owner boundary.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason admin_reachability_refused`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json`
- Expected delta: Startup readiness support records bounded admin reachability/refusal evidence and allows the restarted node to reach recovery-ready, or representative evidence migrates to a new named owner boundary.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `admin_reachability_refused`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md
5. src/bootstrap/startup-recovery-coordinator.js
6. src/bootstrap/node-joining-ready-signal-readiness.js
7. src/bootstrap/traffic-readiness-utils.js
8. test/bootstrap/startup-authority-consumption.test.js
9. test/bootstrap/node-joining-ready-signal-retry.test.js
10. test/bootstrap/traffic-readiness-utils.test.js
11. test/distributed/harness/startup-readiness-evidence.js
12. test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
13. test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js
14. test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md`, `src/bootstrap/startup-recovery-coordinator.js`, `src/bootstrap/node-joining-ready-signal-readiness.js`, `src/bootstrap/traffic-readiness-utils.js`, `test/bootstrap/startup-authority-consumption.test.js`, `test/bootstrap/node-joining-ready-signal-retry.test.js`, `test/bootstrap/traffic-readiness-utils.test.js`, `test/distributed/harness/startup-readiness-evidence.js`, `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`, `test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, `regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json`, `supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_readiness_owner; files-changed: src/bootstrap/startup-recovery-coordinator.js, src/bootstrap/node-joining-ready-signal-readiness.js, test/bootstrap/startup-authority-consumption.test.js, test/bootstrap/node-joining-ready-signal-retry.test.js, test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js; validation: `npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js` and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: none; validation: `npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js`, `npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, `npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, `npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: not-needed.

## Commit And Push Ledger

1. Focused package commit: 3b2bc6bd6d31e034f3c9a10ec60144842593c562
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js
2. regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json
4. supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.report.json --markdown
