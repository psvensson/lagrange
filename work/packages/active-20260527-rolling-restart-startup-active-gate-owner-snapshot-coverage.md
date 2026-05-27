# Artifact Triage - startup_active_gate_owner - snapshot_coverage

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-27",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.",
    "nextAction": "Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits."
  },
  "scope": {
    "writeScope": [],
    "handoffFiles": [
      "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "not-applicable: this architecture experiment selects the next active-gate snapshot coverage contract and will record or cite a durable theory at closure if it creates one.",
    "proof": {
      "commands": [
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "Selected snapshot source remains admin-reachable but repair-deferred, and active-gate snapshot coverage has no detected owner-recovery handoff to rearm or promote an alternate witness.",
    "hypothesisDiscriminator": "Handoff probe shows runtimePromotionAllowed=false, selectedSnapshotObservationState=deferred_refresh, pendingRecoveryCount=0, and coverage remains 1/5 after the table-bootstrap local proof.",
    "expectedMetric": "Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "single-owner",
  "observablePrediction": {
    "metric": "Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.",
    "predicted": "Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
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
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "experiment",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Selected snapshot source remains admin-reachable but repair-deferred, and active-gate snapshot coverage has no detected owner-recovery handoff to rearm or promote an alternate witness.",
    "stopConditionCheck": "Run npm run analyze:causal-model on test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json, then use the handoff probe and scenario route before any runtime edits; select one architecture successor or stop.",
    "expectedCausalModelChange": "The architecture package records whether the missing active-gate contract is repair-deferred handoff rearming, alternate witness promotion, or an architecture stop.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative evidence repeated the table partition visibility timeout after focused bootstrap proof, while canonical handoff evidence reports selectedSnapshotObservationState=deferred_refresh, runtimePromotionAllowed=false, pendingRecoveryCount=0, and snapshotCoverageNodeCount=1/5.",
    "crossBoundaryReview": "Do not patch benchmark table bootstrap, startup readiness, priority recovery, or timeout budgets in this architecture package; runtime files remain candidates until the contract decision is selected."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage repair-deferred architecture",
    "phaseChain": [
      "owner-recovery reconcile cleared active_gate_timed_out",
      "benchmark table bootstrap local proof passed",
      "representative rerun repeated benchmark_events partition visibility timeout",
      "handoff probe routed the missing progress back to active_gate_snapshot_coverage with repair_deferred selected snapshot observation"
    ],
    "currentFirstFrontier": "startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "rolling restart cannot establish load admission while selected snapshot coverage stays 1/5",
      "table bootstrap reports no repair attempted because the selected admin path remains repair-deferred"
    ],
    "missingCausalEdge": "Active-gate snapshot coverage has no selected architecture contract for repair-deferred selected source with no owner-recovery handoff detected.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage --markdown",
    "boundedProgressProof": "The experiment must select one implementable active-gate repair-deferred handoff contract with a concrete wake, retry, reconcile, timer, or bounded advance mechanism, or record an architecture stop before another runtime patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "expectedObservableTransition": "The loop stops same-slice runtime edits and promotes one architecture-selected successor or architecture stop.",
    "maxProgressBound": "one architecture experiment package; no runtime edits before selection",
    "sameFrontierFallback": "If the architecture proof cannot distinguish a successor contract, record architecture-gap stop instead of opening another local runtime package.",
    "expectedNextFrontier": "selected active-gate runtime successor, architecture-gap stop, or representative-green after a later runtime package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "theoryLedger": "not-applicable: this architecture experiment selects the next active-gate snapshot coverage contract and will record or cite a durable theory at closure if it creates one."
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes snapshot_coverage_incomplete there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: Selected snapshot source remains admin-reachable but repair-deferred, and active-gate snapshot coverage has no detected owner-recovery handoff to rearm or promote an alternate witness.
- Hypothesis discriminator: Handoff probe shows runtimePromotionAllowed=false, selectedSnapshotObservationState=deferred_refresh, pendingRecoveryCount=0, and coverage remains 1/5 after the table-bootstrap local proof.
- Expected metric: Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.
- Predicted: Architecture package selects one implementable active-gate repair-deferred handoff contract or records an architecture stop before another runtime patch.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-observation
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-architecture-experiment`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown
