# Rolling Restart Selected Timeout Handoff Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_timeout",
  "currentState": "Focused proof classifies selected_timeout/admin_health repair-deferred evidence. The latest representative test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json records publication convergence ready and the typed non-promoting handoff, but rolling-restart remains red at active_gate_snapshot_coverage with snapshotCoverage=0/5, selected_timeout, pendingRecoveryCount=1, and owner-recovery queue/outcome absent.",
  "nextAction": "Close this package as reduced handoff-contract evidence after required verifier-fix closure, then open/select an autonomous architecture experiment before another same-frontier startup_active_gate_owner / snapshot_coverage runtime patch.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "The representative has moved past the previous publication/load-readiness symptom and now exposes the startup active-gate selected-timeout handoff gap directly. This package extends the existing owner contract that already handles selected_transport_closed/admin_ws, rather than adding another timeout, retry, or caller-local selected-source patch.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json"
  ],
  "writeScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "test-output/reports/rolling-restart-selected-timeout-handoff-contract-20260522T191651Z.report.json",
    "test-output/reports/rolling-restart-selected-timeout-handoff-contract-20260522T192732Z.report.json",
    "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
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
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_timeout",
    "nextAction": "Publication convergence is now ready, but owner recovery still does not act on wait_owner_recovery/pendingRecoveryCount=1. The two-shot same-frontier guard blocks another runtime-owner-boundary package; select/open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "The startup active-gate selected snapshot timeout remains red because selected_timeout/admin_health repair-deferred evidence is not part of the canonical snapshot/watch owner handoff contract.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json plus the focused owner contract/admin/harness proof and static guardrails; continue only if selected_timeout becomes typed handoff evidence without widening timeouts, bypassing snapshot coverage, or permitting runtime promotion from degraded evidence.",
    "expectedCausalModelChange": "Focused proof should move selected_timeout/admin_health from timeout-only evidence into a typed owner handoff outcome while runtimePromotionAllowed remains false until coverage is safe.",
    "representativeOutcome": "reduced",
    "causalDebt": "The latest representative records publication convergence ready, selectedSnapshotAdminReady=true via admin_health, selectedSnapshotError=snapshot_timeout, selectedSnapshotObservation=repair_deferred/retry, snapshotCoverage=0/5, and a typed non-promoting handoff contract with wait_owner_recovery, but no owner-recovery queue/outcome.",
    "crossBoundaryReview": "Publication convergence and priority recovery are satisfied in the fresh representative; this package may extend the snapshot/watch handoff grammar and admin consumer projection, but must not alter publication ownership, widen budgets, or add another selected-source retry path."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected_timeout/admin_health startup active-gate snapshot coverage",
    "phaseChain": [
      "load-readiness force-repair handoff proof passed and the fresh representative moved away from the prior publication_ack_convergence frontier",
      "fresh representative fails at startup active-gate snapshot coverage before pre_load",
      "publication convergence is satisfied and priority recovery residuals are clear",
      "selected snapshot source is admin-health reachable but returns selected_timeout with repair_deferred retry observation and snapshotCoverage=0/5"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_timeout",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached in the fresh representative",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "selected_timeout/admin_health repair-deferred selected-source evidence must enter the canonical snapshot/watch handoff contract as a typed owner outcome.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "boundedProgressProof": "Focused proof must show selected_timeout joins the pending owner handoff reason set, admin forced-repair timeout deferral preserves selected_timeout as structured owner evidence, and the harness selected-timeout consumer keeps runtime promotion blocked.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "expectedObservableTransition": "selected_timeout/admin_health evidence changes from timeout-only/deferred snapshot observation into a typed handoff owner outcome while runtimePromotionAllowed remains false.",
    "maxProgressBound": "one snapshot/watch handoff-contract extension before representative rerun or architecture stop",
    "sameFrontierFallback": "If focused proof cannot emit the typed selected_timeout handoff without caller-local retries or timeout changes, stop and reopen architecture.",
    "expectedNextFrontier": "typed handoff contract detected, representative reduction, owner-boundary migration, or architecture-gap stop",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260522-network-partition-active-gate-selected-source-alternative-witness / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260522-network-partition-active-gate-snapshot-architecture-experiment / startup_active_gate_owner / snapshot_coverage / architecture-gap",
      "done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after local retry and force-repair handoff packages; selected route is to extend the existing handoff contract.",
    "handoffInvariant": "Degraded selected-source evidence may defer and schedule owner work, but must not allow active-gate promotion until snapshot coverage proof is safe."
  },
  "boundedExperiment": {
    "hypothesis": "The current rolling-restart startup active-gate timeout is now caused by selected_timeout/admin_health evidence staying outside the snapshot/watch handoff contract.",
    "hypothesisDiscriminator": "If this is the contract gap, selected_timeout becomes a pending owner handoff reason and admin forced-repair timeout deferral preserves it as structured owner evidence; if not, focused proof cannot change handoff detection without weakening promotion.",
    "expectedMetric": "selectedSnapshotObservation reason codes, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, and snapshotCoverageNodeCount",
    "inheritsFrom": "work/packages/done-20260522-rolling-restart-load-readiness-snapshot-force-repair.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner contract tests, admin consumer tests, harness selected-timeout consumer proof, static guardrails, and runtime grammar audit",
    "killRule": "If focused proof cannot emit a typed selected_timeout handoff without widening timeouts or adding caller-local retry paths, stop and reopen architecture instead of patching symptoms."
  },
  "observablePrediction": {
    "metric": "selected_timeout/admin_health handoff contract state and runtimePromotionAllowed",
    "predicted": "Focused proof will show selected_timeout is accepted as a pending owner handoff reason and admin query-timeout repair deferral preserves selected_timeout as structured repair-deferred evidence; publicationActiveGateHandoff remains non-promoting with runtimePromotionAllowed=false.",
    "observed": "Focused proof passed and representative test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json shows publication convergence ready plus publicationActiveGateHandoffState=pending, reasonCode=owner_reconcile_pending, nextAction=wait_owner_recovery, pendingRecoveryCount=1, runtimePromotionAllowed=false, snapshotCoverage=0/5, and absent owner-recovery queue/outcome.",
    "accuracy": "partial",
    "evidence": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe"
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
      "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
  "routeDominantReason": "snapshot_timeout",
  "routeCausalOutcome": "continue_local_fix",
  "stopMode": "classified_local_blocker",
  "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof emits a typed handoff owner outcome for selected_timeout/admin_health evidence while runtimePromotionAllowed remains false until snapshot coverage is safe.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_timeout",
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
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for snapshot_timeout.
- Inputs/signals: test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps snapshot_timeout and route evidence to one emitted outcome: migrated.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_timeout | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Extend the snapshot/watch owner handoff contract to classify selected_timeout/admin_health repair-deferred evidence before runtime promotion. | Focused proof emits a typed handoff owner outcome for selected_timeout/admin_health evidence while runtimePromotionAllowed remains false until snapshot coverage is safe. | npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Competing explanations: At minimum compare snapshot_timeout against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_timeout, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: snapshot_timeout is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Success metrics: Focused proof emits a typed handoff owner outcome for selected_timeout/admin_health evidence while runtimePromotionAllowed remains false until snapshot coverage is safe.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_timeout`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The current rolling-restart startup active-gate timeout is now caused by selected_timeout/admin_health evidence staying outside the snapshot/watch handoff contract.
- Hypothesis discriminator: If this is the contract gap, selected_timeout becomes a pending owner handoff reason and admin forced-repair timeout deferral preserves it as structured owner evidence; if not, focused proof cannot change handoff detection without weakening promotion.
- Expected metric: selectedSnapshotObservation reason codes, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, and snapshotCoverageNodeCount
- Inherits from: `work/packages/done-20260522-rolling-restart-load-readiness-snapshot-force-repair.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused owner contract tests, admin consumer tests, harness selected-timeout consumer proof, static guardrails, and runtime grammar audit
- Kill rule: If focused proof cannot emit a typed selected_timeout handoff without widening timeouts or adding caller-local retry paths, stop and reopen architecture instead of patching symptoms.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
- Expected delta: Focused proof emits a typed handoff owner outcome for selected_timeout/admin_health evidence while runtimePromotionAllowed remains false until snapshot coverage is safe.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_timeout`
- Route causal outcome: `migrated`
- Stop mode: `architecture-gap-stop`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-architecture-experiment`
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

1. src/control-plane/publication-active-gate-handoff-contract.js
2. src/control-plane/control-plane-snapshot-owner.js
3. src/admin/admin-control-snapshot-class-part-1.js
4. src/admin/admin-control-snapshot-class-part-2.js
5. test/distributed/harness/cluster-segment-7-class-5.js
6. test/control-plane/publication-active-gate-handoff-contract.test.js
7. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
8. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/control-plane-snapshot-owner.js`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Forbidden files: none beyond declared write scope
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: focused proof passed `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` with 140/140 passing; static guardrails passed with 0 literal violations, 0 runtime-grammar violations, and decision-boundary unchanged at inherited 21; representative `test-output/reports/rolling-restart-selected-timeout-handoff-contract-20260522T192732Z.report.json` reduced to visible pending handoff `wait_owner_recovery` with runtimePromotionAllowed=false; parent revalidated focused proof: yes; next: successor action for missing owner-recovery queue/outcome.
- [x] implementation falsification: status: validated; wrong-slice evidence would be no typed handoff in focused proof or representative; evidence: representative now includes `publicationActiveGateHandoffState=pending`, `reasonCode=owner_reconcile_pending`, `nextAction=wait_owner_recovery`, `pendingRecoveryCount=1`, and `runtimePromotionAllowed=false`; next: split/continue owner-recovery action.
- [x] implementation: status: validated; evidence: local-first selected-source repair follow-up passed `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` with 11/11 and full focused proof `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` with 140/140; static guardrails passed with 0 literal violations, 0 runtime-grammar violations, unchanged inherited 21 decision-boundary findings, and `git diff --check`; representative `test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json` reduced publication convergence to ready but remains blocked at active_gate_snapshot_coverage with snapshotCoverage=0/5, selected_timeout, wait_owner_recovery, and absent owner-recovery queue/outcome; parent revalidated focused proof: yes; next: required verifier-fix closure or architecture experiment selection before another same-frontier runtime patch.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed `work/sprints/current-blocker.json` and `work/sprints/current-blocker.md`; next: pre-implementation validation passed, closure still requires separate verifier-fix evidence.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
2. node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
4. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/control-plane-snapshot-owner.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json
