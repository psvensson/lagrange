# Topology Residual Evidence Inventory

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "residual_inventory",
  "dominantReason": "residual_inventory_incomplete",
  "currentState": "Latest representative evidence remains red with active_gate_snapshot_coverage first frontier and failure-gate matrix execution pending.",
  "nextAction": "Produce one canonical residual ledger from evidence-summary topology-convergence priority-recovery residuals causal-model and distributed-failure analyzers before runtime fixes continue.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-residual-evidence-inventory.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/sprints/done-2026-q2-topology-convergence-ship-shape.md",
    "work/packages/done-20260513-topology-failure-scenario-gates.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260514-topology-residual-evidence-inventory.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "hypothesis": "diagnostics_owner / residual_inventory proof should reduce, migrate, or classify residual_inventory_incomplete without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "residual_inventory_incomplete becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until diagnostics_owner / residual_inventory is proven, the sprint representative rolling-restart residual stays open at startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Required before closure through the causal-escalation subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / diagnostics_owner / residual_inventory",
    "phaseChain": [
      "canonical evidence extraction",
      "diagnostics_owner / residual_inventory focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier diagnostics_owner / residual_inventory; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven diagnostics_owner / residual_inventory causal edge for residual_inventory_incomplete",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for diagnostics_owner / residual_inventory.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "residual_inventory_incomplete resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep diagnostics_owner / residual_inventory active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The successor sprint must begin from one canonical residual ledger, not from a
mix of stale sprint prose, focused package claims, and ad hoc report reading.
The latest representative rolling-restart artifact is still red with
`active_gate_snapshot_coverage` as the first frontier. It also carries a
non-frontier operation workflow residual and an unexecuted failure-gate matrix.

This package owns the evidence normalization step before runtime fixes resume.
It must answer what is currently first, what is merely residual, which previous
packages are relevant handoff context, and which next package should become the
active blocker.

## Scope Basis

Approved AGPL topology convergence closure work from `roadmap.md`, the prior
`topology-convergence-ship-shape` sprint, and the active residual-closure
sprint. This package is documentation and causal triage only; it does not
change runtime code or test harness behavior.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package reconciles canonical extractor
  output and sprint/package state. It can select a runtime package, but it does
  not edit runtime owners.
- Escalation trigger to a heavier lane: extractor output identifies a new
  first frontier that is not represented by the successor package queue, or the
  residual ledger requires runtime investigation before package selection is
  safe.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run the canonical evidence commands listed in package metadata against
   `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.
2. Produce a concise residual ledger in this package and the active sprint:
   owner, boundary, dominant reason, artifact, exact extractor source, and
   next package.
3. Separate first-frontier blockers from non-frontier residues:
   `startup_active_gate_owner / snapshot_coverage` is first unless fresh
   extractor output proves otherwise.
4. Record whether `operation_workflow_owner / workflow_progress` remains a
   non-frontier ship blocker or has become irrelevant after fresh evidence.
5. Record the failure-gate matrix execution status and map each unexecuted gate
   to a package in this sprint queue.
6. Regenerate `work/sprints/current-blocker.md` and
   `work/sprints/current-blocker.json` if the selected active blocker changes.

## Out Of Scope

1. Runtime fixes under `src/`.
2. Distributed harness edits under `test/distributed/`.
3. Scenario reruns except for reading an already-produced artifact.
4. Reclassifying focused package success as representative ship success.

## Entry Evidence

1. Latest representative artifact:
   `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.
2. Prior sprint handoff:
   `work/sprints/done-2026-q2-topology-convergence-ship-shape.md`.
3. Failure-gate matrix handoff:
   `work/packages/done-20260513-topology-failure-scenario-gates.md`.

## Residual Ledger To Produce

The package is not closed until it records these fields from canonical
extractors:

1. Representative result: pass/fail, scenario, artifact path, run timestamp if
   present, and first failing frontier.
2. Active-gate cohort: expected nodes, ready leased nodes, published active
   nodes, snapshot coverage, missing published count, and degraded reason if
   any.
3. Publication projection: publication status, pending ACK count, missing
   published node IDs, and whether publication is being treated as cache
   status or durable owner truth.
4. Operation workflow residue: affected operation IDs, partitions/message
   groups if present, current workflow state, next attempt, attempt count, and
   terminal/degraded classification.
5. Budget state: whether `active_gate_timeout`, scenario duration, and any
   owner retry windows are bounded.
6. Failure-gate matrix: each required gate, status as executed/unexecuted,
   artifact if executed, and package that owns it if unexecuted or red.

## Owner Contract To Prove

Diagnostics are authoritative only when they normalize one decision snapshot per
owner boundary. This package must not stitch together unrelated raw fields into
a new conclusion. If canonical extractors disagree, record the disagreement,
the extractor commands used, and split a causal-escalation package rather than
hand-waving a merged state.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-residual-evidence-inventory.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. `candidateRuntimeFiles` is empty; any new runtime or harness write requires a narrower package or an explicit metadata update before implementation.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a causal-escalation package.

1. [ ] Review subagent recorded: pending until package activation.
2. [ ] Fix subagent recorded or explicitly not needed: pending until review result.
3. [ ] Implementation subagent recorded: pending until pre-implementation proof is clean.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-residual-evidence-inventory.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `src/`, `test/runtime-edits`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-residual-evidence-inventory.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-residual-evidence-inventory.md
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
7. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
8. npm run work:validate -- --entry work/packages/active-20260514-topology-residual-evidence-inventory.md
9. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-residual-evidence-inventory.md
10. npm run work:validate -- --closure work/packages/active-20260514-topology-residual-evidence-inventory.md
11. git diff --check -- work/packages/active-20260514-topology-residual-evidence-inventory.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json
12. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If first frontier is still `startup_active_gate_owner / snapshot_coverage`,
   activate `todo-20260514-topology-active-gate-budget-closure.md` first when
   budget remains unbounded; otherwise activate
   `todo-20260514-topology-active-gate-owner-cohort-convergence.md`.
2. If publication is the first durable blocker, activate
   `todo-20260514-topology-publication-projection-reconciliation.md`.
3. If operation workflow residual becomes first frontier, activate
   `todo-20260514-topology-priority-recovery-residual-drain.md` or split a
   narrower operation package if the owner/boundary has changed.
4. If the artifact is stale or extractors cannot parse it, create a fresh
   evidence package or rerun package instead of editing runtime from uncertain
   evidence.

## Acceptance Criteria

1. Active sprint contains a current residual ledger with exact owner/boundary
   mappings and package ownership.
2. Current blocker points to the package that owns the first unresolved
   representative frontier.
3. No package is described as ship-complete unless representative
   rolling-restart is green or a narrower active blocker is explicitly recorded.
4. All failure-gate residuals are mapped to executable packages in this sprint.

## Closure Notes

Before marking done, record the extractor outputs summarized above, regenerate
`current-blocker` if package selection changes, then run `npm run work:context`
to prove the handoff names the intended next blocker.
