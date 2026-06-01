# Rolling Restart Active Gate Snapshot Coverage Post Stale Cache Route

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.",
    "nextAction": "Record the active-gate snapshot coverage route from the post-stale-cache representative artifact and open a runtime-owner-boundary successor only after the artifact and related active-gate theories are acknowledged.",
    "successor": "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
      "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/distributed/harness/active-gate-contract.js",
      "test/distributed/harness/cluster-active-wait-diagnostics.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ],
    "commitScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
      "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the current representative rolling-restart frontier after the stale-cache scheduling fix by preserving the startup_active_gate_owner / snapshot_coverage route before any runtime successor is opened."
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
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
        "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and do-not-edit scope are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "frontier": "startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Record the active-gate snapshot coverage route from the post-stale-cache representative artifact and open a runtime-owner-boundary successor only after the artifact and related active-gate theories are acknowledged."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "The post-stale-cache rolling-restart artifact now clears priority-recovery residuals and selects startup_active_gate_owner / snapshot_coverage / active_gate_timed_out, so the next executable move must preserve that route before runtime promotion.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`, evidence-summary, scenario-triage, and priority-recovery residual extraction before opening runtime work.",
    "expectedCausalModelChange": "Classification confirms active_gate_snapshot_coverage as the current first frontier, keeps priority recovery residual witnesses at zero, and selects exactly one runtime-owner-boundary successor or architecture experiment.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The artifact proves priority recovery is no longer first blocker, but active-gate snapshot coverage still lacks a recorded successor route from the post-stale-cache evidence.",
    "crossBoundaryReview": "Do not patch startup readiness, admin reachability, rebalancer scheduling, operation workflow, or active-gate runtime files until this classification package closes and a successor write scope is active."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart post-stale-cache representative route",
    "phaseChain": [
      "stale-cache scheduling package removed priority-recovery residual witnesses",
      "fresh representative artifact still failed rolling-restart",
      "canonical route selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
      "classification package preserves route before runtime promotion"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness and admin reachability symptoms remain downstream until active-gate route is classified",
      "candidate active-gate runtime files stay out of write scope until successor activation"
    ],
    "missingCausalEdge": "The active-gate snapshot coverage route needs one recorded successor decision from the post-stale-cache artifact before source edits.",
    "missingCausalEdgeProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "boundedProgressProof": "Classification proves bounded progress by confirming zero priority-recovery residuals and selecting runtime-owner-boundary successor work or architecture-gap stop from canonical evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "expectedObservableTransition": "Canonical proof preserves startup_active_gate_owner / snapshot_coverage as the first frontier and authorizes only one concrete successor route.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage classification slice",
    "sameFrontierFallback": "If focused proof repeats the same active-gate frontier with no metric movement or discriminator, open/select an autonomous architecture experiment before another local runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage runtime-owner-boundary successor or architecture experiment",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-classification.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "done-20260527-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-classification.md / operation_workflow_owner / rebalancer_handoff / classification-only"
    ],
    "oscillationCheck": "Allowed because the selected artifact is fresh after the stale-cache scheduling package and priority-recovery residual witnesses are zero.",
    "handoffInvariant": "Classification may update package and sprint truth only; runtime files remain forbidden until a successor package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Latest post-stale-cache artifact selects active_gate_snapshot_coverage with zero priority-recovery residuals; this package preserves that route and prevents another incomplete or wrong-owner successor.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "commitAndPushLedgerRequired": true,
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
      "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  }
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`.

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

- Baseline artifact: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`
- Expected delta: Latest post-stale-cache artifact selects active_gate_snapshot_coverage with zero priority-recovery residuals; this package preserves that route and prevents another incomplete or wrong-owner successor.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Classify and preserve the route in this package file.
2. Keep runtime edits out of scope until a follow-on runtime-owner-boundary package activates candidate files.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: bounded local edit after owner, scope, proof, and do-not-edit scope are named
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md, work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md; npm run work:validate -- --pre-impl work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md; npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md; validation: npm run work:repair; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: a33b4a6aa1accc563d7d1e7c97ee7896758ba0f9
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
