# Rolling Restart Selected Transport Closed Owner Recovery Projection Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "closed": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "selected_transport_closed_owner_recovery_projection_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The architecture package selected a narrow runtime edge: selected_transport_closed is now emitted by snapshot observation, but startup owner-recovery projection still only recognizes selected_timeout repair-deferred evidence.",
  "nextAction": "Implement selected_transport_closed repair-deferred owner recovery projection so the startup active gate can consume bounded owner recovery evidence without runtime promotion or timeout widening.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "This is the smallest selected edge after the direct active-gate successor was rejected because of oscillation: it updates the consumer of already-normalized selected_transport_closed evidence rather than reopening broader snapshot coverage behavior.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "work/packages/active-20260523-rolling-restart-selected-transport-closed-owner-recovery-projection-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "representativeResidual": {
    "status": "successor-selected",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "selected_transport_closed_owner_recovery_projection_contract",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement selected_transport_closed owner-recovery projection and rerun rolling-restart."
  },
  "causalGovernance": {
    "hypothesis": "Selected transport-closed repair-deferred evidence is already normalized, but the startup owner-recovery projection only treats selected_timeout as bounded recovery evidence, so readiness timeout diagnostics stay blocked even though pending owner recovery is bounded.",
    "stopConditionCheck": "Run focused selected_transport_closed owner-recovery projection proof, static guardrails, `npm run analyze:causal-model` on the fresh representative, and a fresh rolling-restart representative before closure.",
    "expectedCausalModelChange": "Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy selected owner-recovery projection while preserving runtimePromotionAllowed=false.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh evidence has selectedSnapshotObservationReasonCodes=selected_transport_closed, selectedSnapshotObservationNextAction=retry, retryAfterMs=100, pending owner recovery, bounded ownerQueue=1 with no growth, publication active=5/5, pendingAck=0, and one readiness_probe_timeout inactive node.",
    "crossBoundaryReview": "Keep src/, timeout budgets, runtime promotion, publication convergence, priority recovery, and snapshot producer behavior frozen. This package changes only the startup active-gate projection consumer and focused fixture."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected transport-closed owner recovery projection",
    "phaseChain": [
      "admin availability support removed admin_not_ready residual",
      "selected transport-closed observation is already normalized",
      "active-gate snapshot coverage remains blocked with pending owner recovery",
      "startup owner-recovery projection still requires selected_timeout",
      "one readiness_probe_timeout inactive node remains"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "snapshot coverage remains incomplete at 1/5",
      "runtime promotion remains unsafe while owner recovery is pending",
      "readiness timeout projection remains blocked until selected transport-closed recovery is accepted"
    ],
    "missingCausalEdge": "selected_transport_closed repair-deferred retry must satisfy the same bounded owner-recovery projection as selected_timeout.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof",
    "boundedProgressProof": "Focused proof must show selected_transport_closed retry/defer evidence activates bounded owner-recovery projection, projects the readiness timeout diagnostic only under that owner outcome, and keeps runtime promotion blocked.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "expectedObservableTransition": "Focused proof passes; fresh rolling-restart reduces the single readiness timeout residual, increases snapshot coverage, migrates owner/boundary, or passes.",
    "maxProgressBound": "one selected transport-closed owner-recovery projection package before representative rerun",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no metric movement, stop for architecture-gap instead of another local patch.",
    "expectedNextFrontier": "reduced active-gate residual, owner/boundary migration, or rolling-restart green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-single-inactive-snapshot-coverage-architecture-experiment / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-startup-readiness-admin-availability-support-contract / startup_readiness_owner / startup_support_evidence / reduced",
      "done-20260523-rolling-restart-single-inactive-admin-probe-snapshot-residual / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "Allowed because the predecessor architecture package selected this narrower selected_transport_closed owner-recovery projection contract after direct snapshot_coverage activation was rejected.",
    "handoffInvariant": "selected_transport_closed owner-recovery evidence may not imply runtime promotion or snapshot coverage completion."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Direct snapshot_coverage runtime activation was rejected for frontier oscillation.",
      "Architecture proof selected selected_transport_closed owner-recovery projection as the missing consumer edge.",
      "Selected transport-closed observation is already normalized in the fresh representative."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected transport-closed owner-recovery projection contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use only if selected_transport_closed cannot preserve bounded non-promoting owner recovery.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory evidence"
        ]
      }
    ],
    "nextAction": "Execute the selected focused proof."
  },
  "observablePrediction": {
    "metric": "selected transport-closed owner-recovery projection, single readiness timeout residual, snapshot coverage, route owner/boundary, rolling-restart result",
    "predicted": "Focused proof will project readiness timeout only when selected_transport_closed repair-deferred owner recovery is bounded; fresh representative will reduce the single inactive residual, increase snapshot coverage, migrate owner/boundary, or pass.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation",
    "metricDelta": 0
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "selected_transport_closed_owner_recovery_projection_contract",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy the bounded owner-recovery projection path; fresh rolling-restart should reduce the single readiness timeout residual, increase snapshot coverage, migrate owner/boundary, or pass.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --owner startup_active_gate_owner --boundary selected_transport_closed_owner_recovery_projection_contract --dominant-reason active_gate_timed_out",
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

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement selected_transport_closed repair-deferred owner recovery projection so the startup active gate can consume bounded owner recovery evidence without runtime promotion or timeout widening. | Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy the bounded owner-recovery projection path; fresh rolling-restart should reduce the single readiness timeout residual, increase snapshot coverage, migrate owner/boundary, or pass. | npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof`
- Success metrics: Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy the bounded owner-recovery projection path; fresh rolling-restart should reduce the single readiness timeout residual, increase snapshot coverage, migrate owner/boundary, or pass.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --owner startup_active_gate_owner --boundary selected_transport_closed_owner_recovery_projection_contract --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Expected delta: Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy the bounded owner-recovery projection path; fresh rolling-restart should reduce the single readiness timeout residual, increase snapshot coverage, migrate owner/boundary, or pass.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `selected_transport_closed_owner_recovery_projection_contract`
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

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown`
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
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json matches, local tests passed; parent revalidated focused proof: yes; next: closure.
- [x] verification-fix: status: validated; evidence: npm test passed with 6/6 assertions, static audits passed; changed files: none; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: closure.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js # focused selected_transport_closed owner recovery projection and startup active-gate consumer proof
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown
