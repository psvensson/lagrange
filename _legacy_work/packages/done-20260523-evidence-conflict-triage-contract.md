# Evidence Conflict Triage Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-rerun-2.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "scenario_triage_signal_conflict",
  "dominantReason": "priority_recovery_zero_witness_conflict",
  "currentState": "Canonical triage reports active_gate_snapshot_coverage while priority recovery residual extraction reports zero witnesses and other artifact fields still carry priority-control-plane recovery pending evidence.",
  "nextAction": "Add explicit signal-conflict reporting and low-confidence derived residual handling before the next blocker route is trusted.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package advances the rolling-restart representative gate and current first frontier active_gate_snapshot_coverage by preventing the next runtime package from being selected from a lossy evidence summary while the seed artifact still carries conflicting recovery signals.",
  "representativeRerunCadence": "scheduled-rerun-command",
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "The package makes canonical triage preserve conflicting active-gate, readiness, and recovery signals instead of hiding them behind a zero-witness residual count."
  },
  "proof": [
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe"
  ],
  "writeScope": [
    "scripts/work-scenario-triage.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "test/scripts/work-scenario-triage.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-rerun-2.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "scripts/work-scenario-triage.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "test/scripts/work-scenario-triage.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "work/packages/active-20260523-evidence-conflict-triage-contract.md"
  ],
  "representativeResidual": {
    "status": "successor-selected",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "diagnostics_owner",
    "boundary": "scenario_triage_signal_conflict",
    "dominantReason": "priority_recovery_zero_witness_conflict",
    "nextAction": "Add explicit signal-conflict reporting and low-confidence derived residual handling before the next blocker route is trusted."
  },
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "Resolving conflicting recovery and active-gate signals in the triage script prevents wrong-slice runtime route selection.",
    "stopConditionCheck": "Triage run on rerun-2 reports signalConflict citing npm run analyze:causal-model.",
    "expectedCausalModelChange": "The work:scenario-triage evidence output explicitly flags signal conflicts instead of hiding them under zero witnesses.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The triage tool reports zero residuals but handoff-probe reports pending recovery.",
    "crossBoundaryReview": "Keep other diagnostic and rebalancer scripts frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "canonical triage runs on seed artifact",
      "active-gate coverage reports timeout",
      "priority recovery reports zero witnesses",
      "topology convergence reports pending recovery",
      "triage tool reports signalConflict"
    ],
    "currentFirstFrontier": "scenario_triage_signal_conflict / diagnostics_owner / scenario_triage_signal_conflict / priority_recovery_zero_witness_conflict",
    "knownDownstreamBlockers": [
      "incorrect route promotion",
      "unresolved recovery pending on restarted node"
    ],
    "missingCausalEdge": "Scenario triage needs to report the conflict explicitly when active-gate and recovery signals clash.",
    "missingCausalEdgeProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
    "falsifyingProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown",
    "boundedProgressProof": "Scenario triage will reconcile active-gate, readiness, and recovery signals to print a signalConflict section.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "expectedObservableTransition": "Conflict flagged in scenario triage output.",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "active_gate_snapshot_coverage",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Supported because this resolves the triage tool conflict identified in rerun-2.",
    "handoffInvariant": "diagnostics are healthy."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "scenario_triage_signal_conflict",
    "routeDominantReason": "priority_recovery_zero_witness_conflict",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Scenario triage prints a signalConflict section when dominant route and subordinate recovery/readiness signals disagree.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-2.report.json --owner diagnostics_owner --boundary scenario_triage_signal_conflict --dominant-reason priority_recovery_zero_witness_conflict",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: Required due to frontier oscillation check and implementation write scope.
- Escalation trigger to a heavier lane: none beyond package and lane scope.

## Core Logic Brief

- Canonical outcome: diagnostics_owner / scenario_triage_signal_conflict emits the package outcome for priority_recovery_zero_witness_conflict.
- Inputs/signals: test-output/reports/rolling-restart-rerun-2.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown.
- State model or invariant: The diagnostics_owner / scenario_triage_signal_conflict decision table in the Causal Decision Contract maps priority_recovery_zero_witness_conflict and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not modify runtime databases, change cluster state, or patch symptoms outside the triage and diagnostic tools. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the diagnostics_owner / scenario_triage_signal_conflict invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | diagnostics_owner / scenario_triage_signal_conflict / priority_recovery_zero_witness_conflict | diagnostics_owner owns this decision | Add explicit signal-conflict reporting | The triage output explicitly flags signal conflicts | npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package targets the diagnostic triage script itself, ensuring future runtime decisions are not selected from conflicting evidence.
- Falsifying focused probe: `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`
- Competing explanations: Stale instrumentation or lossy evidence extraction.
- Systemic interaction scan: All downstream runner scripts.
- Ping-pong stop rule: Do not bounce without metric movement.
- Oscillation guard: Stop if same-frontier.





## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Expected delta: Scenario triage prints a signalConflict section when dominant route and subordinate recovery/readiness signals disagree.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Route owner: `diagnostics_owner`
- Route boundary: `scenario_triage_signal_conflict`
- Route dominant reason: `priority_recovery_zero_witness_conflict`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `diagnostic-classification`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
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

1. scripts/work-scenario-triage.js
2. scripts/analyze-priority-recovery-residuals.js
3. test/scripts/work-scenario-triage.test.js
4. test/scripts/analyze-priority-recovery-residuals.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `scripts/work-scenario-triage.js`, `scripts/analyze-priority-recovery-residuals.js`, `test/scripts/work-scenario-triage.test.js`, `test/scripts/analyze-priority-recovery-residuals.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.
Theory ledger update not needed for this diagnostic triage script packaging (theory-ledger: not-needed).

- [x] implementation: status: validated; evidence: `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown` and `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown` successfully output explicit signal conflicts and low-confidence derived residuals; parent revalidated focused proof: yes; next: closure or successor action.
- [x] verification-fix: status: validated; evidence: `node --test test/scripts/work-scenario-triage.test.js && node --test test/scripts/analyze-priority-recovery-residuals.test.js` are fully operational and pass cleanly; changed files: `scripts/work-scenario-triage.js`, `scripts/analyze-priority-recovery-residuals.js`, `test/scripts/work-scenario-triage.test.js`, `test/scripts/analyze-priority-recovery-residuals.test.js`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe
