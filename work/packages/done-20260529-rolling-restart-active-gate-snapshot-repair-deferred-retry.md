# Rolling Restart Active Gate Snapshot Repair Deferred Retry

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Fresh representative evidence cleared owner_reconcile_pending but still selects active_gate_snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred.",
    "nextAction": "Test whether selected snapshot repair-deferred retry needs a bounded active-gate snapshot coverage retry transition before another representative rerun.",
    "closed": "2026-05-29",
    "successor": "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-evidence.js"
    ],
    "commitScope": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-reduced",
    "whyHighestLeverageNow": "The owner-reconcile handoff moved; the fresh active-gate frontier is selected snapshot repair-deferred retry."
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
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
        "regression: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "systemTheoryRevision": true,
  "theoryLedger": "planned-new-theory; no ledger update: result is recorded in this package closure; current artifact reduced selected snapshot timeout/deferred repair evidence but still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, so successor work targets the fresh owner-recovery queue drain shape.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test whether selected snapshot repair-deferred retry needs a bounded active-gate snapshot coverage retry transition before another representative rerun.",
    "sprintGoalDelta": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "supported",
    "successorPackage": "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md"
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "snapshot_coverage_incomplete / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Test whether selected snapshot repair-deferred retry needs a bounded active-gate snapshot coverage retry transition before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "owner_reconcile_pending cleared; selected_snapshot_source_timeout and snapshot_repair_deferred remain.",
    "rejectedAlternatives": "Classification-only, evidence-only, route-only, and downstream symptom packages are not valid package work in this theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh representative evidence cleared owner_reconcile_pending but still selects active_gate_snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred.",
    "missingTransitionOrObservation": "Selected snapshot repair-deferred retry must become a bounded owner-owned retry, coverage progress, migration, or architecture-gap stop.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "observed": "Representative rerun stayed red but reduced the selected snapshot timeout/deferred repair evidence: canonical topology explain now reports selectedSnapshotError unknown, selectedSnapshotRepairDeferred false, selectedSnapshotObservation scheduled_repair/stale_usable/pending/idle/wait, and snapshot coverage improved from 1/5 to 2/5.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused repair-deferred timeout proof passed; fresh rolling-restart representative evidence stayed red but selected_snapshot_source_timeout and snapshot_repair_deferred cleared from the canonical explain, snapshot coverage improved from 1/5 to 2/5, and the remaining first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "successorReason": "Rolling-restart is not representative-green yet; the next theory-loop source package targets the fresh owner-recovery queue drain/reentry shape instead of widening this diagnostics timeout package.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After owner_reconcile_pending clears, active_gate_snapshot_coverage remains because the selected snapshot repair-deferred path does not expose a bounded retry or coverage-progress transition for startup_active_gate_owner / snapshot_coverage.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused repair-deferred proof should reduce selected snapshot timeout/deferred-refresh evidence, increase snapshot coverage, migrate owner boundary, or record architecture-gap after one source package.",
    "representativeOutcome": "reduced",
    "causalDebt": "Current artifact has priority recovery satisfied and the repair-deferred selected snapshot timeout reduced, but active_gate_snapshot_coverage remains blocked with snapshot coverage 2/5, owner_reconcile_pending, and owner queue pending writes.",
    "crossBoundaryReview": "Do not reopen priority recovery, owner-reconcile publication, or startup readiness while selected snapshot repair-deferred retry is the selected active-gate frontier shape."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate selected snapshot repair deferred retry",
    "phaseChain": [
      "priority recovery residuals reduced to zero",
      "owner_reconcile_pending handoff proof passed and cleared that witness in representative evidence",
      "fresh representative evidence still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage",
      "repair-deferred timeout evidence reduced; active-gate evidence now reports scheduled_repair stale_usable wait, owner_reconcile_pending, and snapshot coverage 2/5"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md migrated after priority recovery residual witnesses reduced to zero",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md migrated after owner_reconcile_pending cleared"
    ],
    "oscillationCheck": "The selected snapshot timeout shape has recurred, but this package targets the current repair-deferred retry evidence after owner reconcile cleared.",
    "handoffInvariant": "Priority recovery stays closed while active-gate snapshot coverage owns the first frontier; owner-recovery queue drain/reentry is the next local witness.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream of active-gate snapshot coverage",
      "benchmark_events partition visibility remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "selected_snapshot_source_timeout with snapshot_repair_deferred needs a bounded retry, coverage-progress, migration, or architecture-gap transition.",
    "missingCausalEdgeProbe": "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "falsifyingProbe": "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "boundedProgressProof": "Focused proof must show a concrete retry, dispatch, handoff, timeout, advance, wake, or bounded progress mechanism for selected snapshot repair-deferred retry.",
    "boundedProgressProofArtifact": "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged active_gate_snapshot_coverage selected_snapshot_source_timeout and snapshot_repair_deferred evidence after this source package triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "snapshot coverage improves, selected snapshot timeout evidence reduces, owner-boundary migration, representative-green, or architecture-gap",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "owner_reconcile_pending cleared in fresh representative evidence",
      "active_gate_snapshot_coverage remains with selected_snapshot_source_timeout and snapshot_repair_deferred"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded repair-deferred retry proof for the current active-gate witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if focused proof cannot select a bounded owner-owned retry transition.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected repair-deferred retry proof before another representative rerun."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage after owner_reconcile_pending cleared.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "snapshot_coverage_incomplete is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage."
    ],
    "changedFacts": [
      "owner_reconcile_pending no longer appears in the fresh representative active-gate evidence.",
      "selected_snapshot_source_timeout and snapshot_repair_deferred are now the selected active-gate witness shape."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing repair-deferred retry transition.",
      "H2 the same symptom is inherited from stale instrumentation, a diagnostics gap, or a different owner boundary."
    ],
    "eliminatedTheories": [
      "owner_reconcile_pending publication handoff is not the current selected witness after the fresh rerun."
    ],
    "downstreamSymptoms": [
      "Downstream readiness and benchmark visibility symptoms stay frozen until H1 selects a concrete transition or H2 selects migration."
    ],
    "transitionTable": [
      {
        "inputSignal": "snapshot_coverage_incomplete / selected_snapshot_source_timeout / snapshot_repair_deferred",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "selected evidence must become a named owner-owned retry, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
        "migrationTrigger": "the falsifier names a different owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless the falsifier proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/admin/admin-control-snapshot-repair-diagnostics.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is the admin snapshot repair handoff outcome suite.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
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
      "Use this package for the selected repair-deferred retry source slice.",
      "Split only if proof selects a different owner boundary.",
      "Open architecture work only on same-frontier/no-reduction after the source package."
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because fresh representative evidence routes snapshot_coverage_incomplete there after owner_reconcile_pending cleared. It must either move selected snapshot repair-deferred retry evidence or preserve a migration/architecture stop before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to one source file.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits a bounded selected snapshot repair-deferred retry transition or a migration/architecture stop for snapshot_coverage_incomplete.
- Inputs/signals: selected_snapshot_source_timeout, snapshot_repair_deferred, snapshotCoverageNodeCount 1/5, active_gate_snapshot_coverage.
- State model or invariant: selected snapshot repair-deferred evidence must not leave active-gate coverage with only an unbounded wait.
- Non-goals and forbidden interpretations: do not patch priority recovery, owner-reconcile publication, startup readiness, or benchmark table visibility in this package.
- Proof mapping: focused admin snapshot repair handoff tests must prove the owner-owned retry or stop shape before representative proof is accepted.
- Wrong-slice trigger: stop or split if proof needs files outside `src/admin/admin-control-snapshot-repair-diagnostics.js` or names a different owner boundary.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | selected snapshot repair-deferred retry transition, migration, or architecture-gap stop | active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package | falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js |
| scope boundary | declared source file only | proof that needs other runtime files means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream readiness or benchmark visibility symptoms.
- Falsifying focused probe: `falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Competing explanations: selected snapshot repair-deferred retry is real owner debt; evidence is stale/instrumentation-only; another owner boundary owns the selected snapshot timeout.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: This is not another same-frontier symptom patch because owner_reconcile_pending cleared in fresh evidence and the package targets the newly selected repair-deferred retry shape; if evidence returns unchanged, open/select architecture rederive instead of another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_coverage_incomplete after owner_reconcile_pending cleared?
- Architecture review: local owner-boundary proof is selected for one source package; unchanged same-frontier/no-reduction triggers architecture rederive.
- Competing hypotheses: selected snapshot repair-deferred retry is real owner debt; evidence is stale/instrumentation-only; another owner boundary owns the selected snapshot timeout.
- Pre-edit focused probe: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Success metrics: selected snapshot timeout/deferred-refresh evidence reduces, snapshot coverage increases, owner boundary migrates, architecture-gap records, or representative goes green.
- Representative rerun: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Kill rule: unchanged active_gate_snapshot_coverage selected_snapshot_source_timeout plus snapshot_repair_deferred after this source package opens architecture rederive instead of another local patch.

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Test whether selected snapshot repair-deferred retry needs a bounded active-gate snapshot coverage retry transition before another representative rerun.
- Sprint-goal delta: active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Required source write: `src/admin/admin-control-snapshot-repair-diagnostics.js`
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.

## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: active_gate_snapshot_coverage reduces selected snapshot timeout/deferred-refresh evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Observed: Representative rerun stayed red but reduced selected snapshot timeout/deferred repair evidence; canonical topology explain now reports selectedSnapshotError unknown, selectedSnapshotRepairDeferred false, selectedSnapshotObservation scheduled_repair/stale_usable/pending/idle/wait, and snapshot coverage improved from 1/5 to 2/5.
- Accuracy: partial
- Evidence: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`; `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage`

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: selected snapshot timeout/deferred-refresh evidence reduces, snapshot coverage increases, owner boundary migrates, architecture-gap records, or representative goes green.
- Local proof class: focused owner proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, sprint/current-blocker refresh, entry validation, and pre-implementation validation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-next`.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose.
2. Keep durable proof to the declared focused test, regression, route extractor, and representative rerun.
3. Package/sprint/tracker/ledger-only work is not a closure shape in this theory-loop sprint.
4. Same-frontier/no-reduction after this source package opens architecture rederive.

## In Scope

1. src/admin/admin-control-snapshot-repair-diagnostics.js

## Out Of Scope

1. Runtime ownership changes outside the declared source file.
2. Priority recovery, owner-reconcile publication, startup readiness, and benchmark table visibility fixes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/admin/admin-control-snapshot-repair-diagnostics.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `regression: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js`
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

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Sartre (019e7142-ee14-7ad0-9f31-58e964fd50e8); files-changed: work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md; status: validated; decision: fresh; evidence: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage; next: implementation may proceed within write scope src/admin/admin-control-snapshot-repair-diagnostics.js.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/admin/admin-control-snapshot-repair-diagnostics.js; validation: node --check src/admin/admin-control-snapshot-repair-diagnostics.js; node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-repair-diagnostics.js; node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-repair-diagnostics.js; npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-repair-diagnostics.js; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; parent revalidated focused proof: yes; outcome: validated reduced representative evidence, still red.
- [x] action: verification-fix; owner: Agent Lagrange (019e7156-5c57-7fb2-91f8-db9e48197781); files-changed: none; validation: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js passed 100/100; node --check src/admin/admin-control-snapshot-repair-diagnostics.js passed; node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-repair-diagnostics.js passed; node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-repair-diagnostics.js passed; npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-repair-diagnostics.js passed; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
2. regression: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
