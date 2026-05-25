# Rolling Restart Active Gate Snapshot Coverage Repair

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "currentState": "Scaffolded from representative evidence for active_gate_snapshot_coverage.",
    "nextAction": "Align active-gate cohort fallbacks and repair snapshot recovery projection logic",
    "dominantReason": "active_gate_timed_out"
  },
  "scope": {
    "writeScope": [
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-tracker.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "src/control-plane/control-plane-readiness-service-segment-3.js",
      "test/distributed/harness/cluster-segment-5.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-active-wait-publication-gate.js",
      "test/distributed/harness/cluster-segment-2.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "src/control-plane/control-plane-readiness-service-segment-3.js",
      "test/distributed/harness/cluster-segment-5.js"
    ],
    "commitScope": [
      "work/packages/done-20260525-rolling-restart-active-gate-snapshot-coverage-repair.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-tracker.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "src/control-plane/control-plane-readiness-service-segment-3.js",
      "test/distributed/harness/cluster-segment-5.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-active-wait-publication-gate.js",
      "test/distributed/harness/cluster-segment-2.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package advances the active sprint goal and current first frontier.",
    "stabilityCredit": "local-proof-only",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260513-rolling-restart-preflight-green-gate-confirmation"
    ],
    "proof": {
      "commands": [
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
        "npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown",
        "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown"
      ]
    }
  },
  "causalGovernance": {
    "hypothesis": "WebSocket disconnect grace periods and cohort fallback querying prevent premature active_gate_timed_out failures.",
    "stopConditionCheck": "Focused cluster and rebalancer tests, fresh representative rolling-restart, and npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "Active gate snapshot coverage completes successfully without timeouts.",
    "representativeOutcome": "reduced",
    "causalDebt": "Stale timeout active gate snapshot due to transport disconnect timing issues and fallback cohort witness querying gaps.",
    "crossBoundaryReview": "Only active node eligibility evaluation and WebSocket transport files are in scope."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "startup active gate timeout is detected",
      "transport closed observations are registered",
      "wait owner recovery handoff is evaluated",
      "cohort fallback is resolved",
      "snapshot coverage converges"
    ],
    "currentFirstFrontier": "startup_active_gate_owner/snapshot_coverage",
    "knownDownstreamBlockers": [
      "active gate snapshot coverage remains incomplete"
    ],
    "missingCausalEdge": "WebSocket disconnect grace periods and cohort fallback witness querying are not fully aligned.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown",
    "falsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown",
    "boundedProgressProof": "The diagnostic evidence summary and scenario triage prove the exact active-gate cohort fallbacks and recovery projection logic to reconcile state successfully.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "expectedObservableTransition": "Active gate snapshot coverage complete is true in representative rerun.",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-single-inactive-snapshot-coverage-architecture-experiment.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Supported because cohort fallback witness querying resolves oscillation.",
    "handoffInvariant": "cohort recovery is bounded."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "Active gate snapshot coverage completes successfully.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

This package resolves critical ReferenceError exceptions in the distributed test harness encountered during cluster snapshot coverage evaluation and publication convergence checking (under high load / rolling restarts). These issues caused harness crashes and stalled the validation suite.

## Scope Basis

Align active-gate cohort fallbacks and repair snapshot recovery projection logic. No ledger update.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Align active-gate cohort fallbacks and repair snapshot recovery projection logic | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-control-snapshot-recovery.js, test/distributed/harness/cluster-segment-7-class-5.js; validation: Local tests compile and reference errors resolved, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-active-wait-publication-gate.js, test/distributed/harness/cluster-segment-2.js; validation: Local verification run resolves subsequent reference errors successfully, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown

