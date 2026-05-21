# Priority Recovery operation_workflow_owner workflow_progress Advance From Dispatch Planned

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "superseded",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Active scenario package. Canonical evidence keeps priority_recovery_partition_progress first under operation_workflow_owner / workflow_progress, and the compact handoff probe preserves the control_plane_publications-p1 dispatch_pending/planned advance_existing_operation witness.",
  "nextAction": "Use the compact dispatch_pending/planned handoff fixture to implement or falsify one bounded advance_existing_operation workflow-progress fix, then rerun rolling-restart.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown",
    "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "npm run test:static",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json"
  ],
  "writeScope": [
    "work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress-advance-from-dispatch-planned.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress-advance-from-dispatch-planned.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1: workflow_progress can advance the existing dispatch_pending/planned operation from the compact handoff witness; H2: the residual is still split with rebalancer_handoff and must stop before runtime promotion; H3: the representative artifact is too stale for runtime proof and needs a fresh rerun first.",
    "hypothesisDiscriminator": "H1 predicts a focused owner regression can force dispatch_pending/planned re-entry and reduce workflow_progress evidence; H2 predicts focused proof cannot isolate workflow_progress from rebalancer_handoff; H3 predicts the compact fixture no longer matches the representative residual.",
    "expectedMetric": "workflow_progress witness count drops below 4, owner boundary migrates, or rolling-restart turns green",
    "inheritsFrom": "work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement discards the experiment or escalates"
  },
  "validationTier": "cross-owner",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown",
      "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "ask_human",
    "stopMode": "insufficient_evidence",
    "nextLane": "causal-escalation",
    "expectedDelta": "workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green; unchanged same-frontier stops local patching",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker state with npm run work:current-blocker -- --write or npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "requiredPreImplProbe": {
    "command": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "artifact": "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "reason": "Runtime promotion depends on the compact dispatch_pending/planned operation workflow witness created by the predecessor diagnostics package."
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Use the compact dispatch_pending/planned probe to prove or falsify one bounded workflow_progress advance_existing_operation fix."
  },
  "causalGovernance": {
    "hypothesis": "The first actionable rolling-restart frontier is operation_workflow_owner / workflow_progress. The compact control_plane_publications-p1 fixture preserves dispatch_pending/planned, so one bounded workflow-progress proof can decide whether advance_existing_operation is still locally owned.",
    "stopConditionCheck": "Use npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe, npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown, npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json, focused owner regression, static guardrails, and a fresh route-after-rerun result before closure.",
    "expectedCausalModelChange": "A runtime fix should reduce workflow_progress witnesses, migrate owner boundary, or turn rolling-restart green; unchanged same-frontier evidence stops local patching.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Baseline artifact still has four workflow_progress witnesses and two rebalancer_handoff witnesses. This package owns only the workflow_progress advance_existing_operation leg.",
    "crossBoundaryReview": "Subagent execution is blocked by environment policy in this session; parent local proof must re-run every focused validation command before closure."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart baseline plus compact control_plane_publications-p1 dispatch_pending/planned handoff probe",
    "phaseChain": [
      "publication convergence is satisfied",
      "priority recovery operation workflow progress is blocked",
      "rebalancer handoff remains a secondary split",
      "startup active-gate snapshot coverage remains downstream"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains blocked under operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has two secondary witnesses",
      "startup_active_gate_owner / snapshot_coverage is expected after priority progress closes"
    ],
    "missingCausalEdge": "The workflow owner must advance or classify dispatch_pending/planned advance_existing_operation state without relying on downstream active-gate symptoms.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "boundedProgressProof": "Focused operation workflow regression must prove the advance mechanism for dispatch_pending/planned re-entry through the owner path before representative rerun.",
    "boundedProgressProofArtifact": "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "expectedObservableTransition": "workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green.",
    "maxProgressBound": "one operation_workflow_owner / workflow_progress runtime slice",
    "sameFrontierFallback": "If fresh evidence returns unchanged same-frontier with no metric movement, stop for architecture or human escalation.",
    "expectedNextFrontier": "operation_workflow_owner / rebalancer_handoff or startup_active_gate_owner / snapshot_coverage after workflow_progress closes",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260520-topology-publication-workflow-handoff-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-topology-publication-remaining-pending-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md / diagnostics_owner / priority_recovery_fixture_and_burndown / classification-only"
    ],
    "oscillationCheck": "Adjacent topology publication reductions did not close rolling-restart; this package must preserve the compact handoff proof and decide whether workflow_progress may own the next runtime child.",
    "handoffInvariant": "Publication convergence remains satisfied, the compact probe must keep control_plane_publications-p1 dispatch_pending/planned, and workflow runtime promotion is allowed only after this handoff gate validates."
  },
  "observablePrediction": {
    "metric": "workflow_progress witness count after focused proof and representative rerun",
    "predicted": "workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green",
    "observed": "pending-before-implementation",
    "accuracy": "pending-before-observation",
    "evidence": "pending focused owner proof and route-after-rerun",
    "metricDelta": 0
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "canonical evidence keeps priority_recovery_partition_progress first under operation_workflow_owner / workflow_progress",
      "priority residuals split workflow_progress and rebalancer_handoff groups",
      "compact handoff probe preserves the dispatch_pending/planned workflow witness"
    ],
    "choices": [
      {
        "id": "workflow-progress-advance-child",
        "summary": "After the compact handoff proof validates, promote one bounded operation_workflow_owner / workflow_progress child for advance_existing_operation.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown"
        ]
      },
      {
        "id": "split-rebalancer-handoff",
        "summary": "Split rebalancer_handoff if focused proof cannot isolate workflow_progress advancement.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown"
        ]
      },
      {
        "id": "architecture-stop",
        "summary": "Stop if causal proof cannot separate publication convergence, workflow progress, and handoff responsibility.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json"
        ]
      }
    ],
    "selectedChoice": "workflow-progress-advance-child",
    "nextAction": "Validate the compact handoff gate, then open or promote the bounded workflow_progress runtime child."
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart release-gate closure under AGPL-owned topology workflow stabilization, failure simulation, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: adjacent owner fixes did not close the representative gate, so this package records the cross-boundary handoff decision before runtime promotion.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / workflow_progress emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-green-only-baseline-20260513.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown; npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe; npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; npm run test:static; npm run work:scenario-triage -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown.
- State model or invariant: dispatch_pending/planned advance_existing_operation evidence is normalized once by operation_workflow_owner / workflow_progress, which either schedules owner re-entry, emits a bounded deferred outcome, or proves the slice belongs elsewhere.
- Non-goals and forbidden interpretations: Do not patch topology publication, startup active-gate, readiness, timeout budgets, or rebalancer_handoff witnesses inside this package.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Use the compact dispatch_pending/planned handoff fixture to implement or falsify one bounded advance_existing_operation workflow-progress fix, then rerun rolling-restart. | workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green; unchanged same-frontier stops local patching | npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
- Success metrics: workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green; unchanged same-frontier stops local patching; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Bounded Experiment

- Hypothesis: H1 says workflow_progress can advance the existing dispatch_pending/planned operation from the compact handoff witness; H2 says the residual is still split with rebalancer_handoff and must stop before runtime promotion; H3 says the representative artifact is too stale for runtime proof and needs a fresh rerun first.
- Hypothesis discriminator: H1 predicts a focused owner regression can force dispatch_pending/planned re-entry and reduce workflow_progress evidence; H2 predicts focused proof cannot isolate workflow_progress from rebalancer_handoff; H3 predicts the compact fixture no longer matches the representative residual.
- Expected metric: workflow_progress witness count drops below 4, owner boundary migrates, or rolling-restart turns green.
- Inherits from: `work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement discards the experiment or escalates
- The executor owns the implementation pass; a separate verifier-fixer is required before done closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
- Expected delta: workflow_progress witness count reduces below 4, owner boundary migrates, or rolling-restart turns green; unchanged same-frontier stops local patching
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `ask_human`
- Stop mode: `insufficient_evidence`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress-advance-from-dispatch-planned.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl
5. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
6. src/rebalancer/operation-workflow-owner.js
7. src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
8. src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js
9. src/rebalancer/operation-workflow-owner-constants.js

## Out Of Scope

1. Runtime ownership changes outside `operation_workflow_owner / workflow_progress`.
2. Topology publication, startup active-gate, readiness, timeout-budget, or rebalancer_handoff runtime changes.
3. Unrelated dirty files: `test/distributed/README.local.md` and `test/integration/three-node-seed-rebalance.integration.test.js`.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress-advance-from-dispatch-planned.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Forbidden files: source files outside the named operation workflow write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown`, `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`, `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `npm run test:static`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages uses one executor pass plus one separate verifier-fixer pass. Agent identity is optional provenance and must not be invented.
Legacy review/fix ledgers remain valid only for reopened historical packages already using them.
This package is superseded by the workflow reset and records no runtime implementation claim.

- [x] implementation: status: superseded; evidence: no runtime implementation was performed; workflow reset closes this package without a behavior claim; next: no active package.
- [x] verification-fix: status: superseded; evidence: no implementation work to verify in this package reset; changed files: none; next: no active package.
- [x] repair: status: validated; evidence: generated current-blocker will be refreshed after package supersession; next: no active package.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown
3. npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe
4. npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
5. npm run test:static
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown
