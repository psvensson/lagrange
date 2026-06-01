# Control-Plane Priority Publication & ACK Handoff Triage

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "playback": "none",
    "owner": "control-plane-publications",
    "boundary": "publication-convergence",
    "currentState": "Scaffolded for priority publication and ACK handoff triage.",
    "nextAction": "Explore publication coordinate state and ACK handoff logic.",
    "dominantReason": "priority-spread-pending"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-rerun-4.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md",
      "work/sprints/active-2026-q2-rolling-restart-investigation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Explore publication coordinate state and ACK handoff logic to advance the active sprint goal."
  },
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
        "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": []
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "causalGovernance": {
    "hypothesis": "Priority publication and ACK handoff delays represent a coordination mismatch or logic gap in connection handoffs under load.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-rerun-4.report.json",
    "expectedCausalModelChange": "The package should classify whether fresh evidence is green, reduced, migrated, same-frontier, architecture-gap, or contradictory.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Priority publication spread pending needs material classification before promotion.",
    "crossBoundaryReview": "Triage stays under control-plane-publications / publication-convergence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart-priority-publication-triage",
    "phaseChain": [
      "rolling-restart representative gate rerun completed",
      "route evidence selected control-plane-publications / publication-convergence",
      "triage residuals to classify the frontier outcome"
    ],
    "currentFirstFrontier": "control-plane-publications/publication-convergence",
    "knownDownstreamBlockers": [
      "rolling-restart-stability"
    ],
    "missingCausalEdge": "Classification of fresh representative evidence is pending.",
    "missingCausalEdgeProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json",
    "falsifyingProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json",
    "boundedProgressProof": "The package records that priority publication residuals must be classified before runtime promotion to reconcile and advance progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "expectedObservableTransition": "residuals classified to determine next successor",
    "maxProgressBound": "one classification gate",
    "sameFrontierFallback": "Keep the publication-convergence successor as the active first frontier.",
    "expectedNextFrontier": "publication-convergence",
    "resultClassification": "same-frontier",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "done-20260525-ready-signal-timeout-doubling-revert.md / control-plane-publications / publication-convergence / priority-spread-pending"
    ],
    "oscillationCheck": "The package does not patch runtime; it triages priority publication evidence to select the next owner/boundary.",
    "handoffInvariant": "Priority publication triage is downstream of scenario-release-gate routing."
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": []
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  }
}
-->

## Why

Explore priority publication coordinate state and ACK handoff logic to identify root causes of priority spread convergence delays during rolling restarts.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of `writeScope` and `commitScope` until fresh evidence promotes implementation.
- Keep possible implementation files in `candidateRuntimeFiles` only.
- Subagent sequencing is optional until implementation or tracker-truth write scope is promoted.
- Verifier-fixer proof is optional while the package remains classification-only and no implementation or tracker-truth write scope is present.
- Use 2-3 canonical proof commands, then close and rerun evidence instead of adding more package ceremony.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-rerun-4.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-4.report.json`
- Route owner: `control-plane-publications`
- Route boundary: `publication-convergence`
- Route dominant reason: `priority-spread-pending`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: control-plane-publications; files-changed: none; validation: npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: control-plane-publications; files-changed: none; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown
