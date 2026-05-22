# Node Failure Rebalance Startup Active Gate Snapshot Watch Handoff Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "node-failure-rebalance",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Architecture discriminator selected the snapshot/watch owner handoff contract route: handoff probe is absent with runtimePromotionAllowed=false while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true.",
  "nextAction": "Implement the snapshot/watch owner handoff contract for WebSocket-closed selected snapshot source evidence by emitting a typed selectedSnapshotObservation and publication-active-gate handoff outcome before runtime promotion.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This is the active sprint representative frontier after the architecture gate selected owner-contract emission as the highest-leverage route for startup_active_gate_owner / snapshot_coverage.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js",
    "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/report.json --replay-fixture"
  ],
  "writeScope": [
    "work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-snapshot-owner.js"
  ],
  "commitScope": [
    "work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
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
  "boundedExperiment": {
    "hypothesis": "The remaining active-gate timeout is caused by absent snapshot/watch handoff contract emission for a WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness, not by another selected-source retry rule.",
    "hypothesisDiscriminator": "If selected-source retry is the gap, focused proof changes selectedSnapshotReachableBy or snapshot coverage without a contract; if handoff contract emission is the gap, adding the owner contract changes selectedSnapshotObservation or publicationActiveGateHandoff while preserving runtimePromotionAllowed=false until safe.",
    "expectedMetric": "selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, and snapshotCoverageNodeCount",
    "inheritsFrom": "work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner contract tests, admin consumer tests, handoff probe, replay fixture, and static guardrails",
    "killRule": "If focused proof cannot emit a typed handoff contract without weakening active-gate admission or adding another caller-local retry path, stop and reopen architecture instead of patching symptoms."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "node-failure-rebalance",
    "artifact": "test-output/report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement typed snapshot/watch owner handoff contract emission for WebSocket-closed selected snapshot source evidence before runtime promotion."
  },
  "causalGovernance": {
    "hypothesis": "The WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness remains blocked because startup_active_gate_owner / snapshot_coverage does not emit a typed snapshot/watch owner handoff contract for that evidence.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/report.json, npm run analyze:topology-convergence -- test-output/report.json --handoff-probe, and npm run analyze:topology-convergence -- test-output/report.json --replay-fixture after focused owner proof; continue only if the handoff contract or selectedSnapshotObservation evidence changes without weakening runtimePromotionAllowed.",
    "expectedCausalModelChange": "Focused proof should move selectedSnapshotObservation or publicationActiveGateHandoff from absent/unknown to a typed owner outcome while keeping runtimePromotionAllowed=false until the handoff contract allows promotion.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Handoff probe reports publication_active_gate_handoff_not_detected with selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, alternativeSnapshotWitnessAvailable=true, handoffContract absent, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Publication ACK and operation workflow stay satisfied; the package may update contract/admin consumers but must not add another selected-source retry path or admit active-gate promotion from degraded evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "node-failure-rebalance WebSocket-closed selected snapshot source with alternative witness",
    "phaseChain": [
      "selected snapshot source timeout proof passed locally",
      "focused WebSocket-closed handoff fixture replayed selectedSnapshotReachableBy=admin_ws and alternative witness availability",
      "architecture discriminator selected same-owner runtime successor for typed snapshot/watch owner handoff contract emission"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains inherited active-gate no-progress evidence",
      "scenario duration and timeout evidence remain downstream symptoms"
    ],
    "missingCausalEdge": "Emit a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for WebSocket-closed selected-source evidence with admin_ws reachability and an alternative witness.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "boundedProgressProof": "Focused owner proof must emit one bounded reconcile outcome that changes selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, or runtimePromotionAllowed reasoning without weakening active-gate admission.",
    "boundedProgressProofArtifact": "test-output/report.json",
    "expectedObservableTransition": "selectedSnapshotObservation or publicationActiveGateHandoff changes from absent/unknown to a typed owner outcome for WebSocket-closed selected-source evidence.",
    "maxProgressBound": "one runtime-owner-boundary successor after the architecture experiment before another architecture stop",
    "sameFrontierFallback": "If focused proof cannot emit a typed contract without another caller-local retry path, stop and reopen architecture.",
    "expectedNextFrontier": "typed handoff contract detected, representative reduction, owner-boundary migration, or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done handoff fixture package replayed WebSocket-closed selected source evidence",
      "architecture package selected snapshot/watch owner handoff contract route"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after local selected-timeout and fixture proof without snapshotCoverageNodeCount movement",
    "handoffInvariant": "Runtime promotion remains blocked until a canonical snapshot/watch handoff owner contract is emitted and proven."
  },
  "observablePrediction": {
    "metric": "selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, and snapshotCoverageNodeCount",
    "predicted": "Focused proof will move selectedSnapshotObservation or publicationActiveGateHandoff from absent/unknown to a typed owner outcome for WebSocket-closed selected-source evidence, while runtimePromotionAllowed remains false until the contract allows promotion.",
    "observed": "pending-before-probe",
    "accuracy": "pending-before-observation",
    "evidence": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "metricDelta": 0
  },
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
      "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js",
      "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Handoff probe detects a typed publicationActiveGateHandoff or selectedSnapshotObservation contract for WebSocket-closed selected source evidence while runtimePromotionAllowed remains false until the contract allows promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/report.json; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run analyze:topology-convergence -- test-output/report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/report.json --replay-fixture.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the snapshot/watch owner handoff contract for WebSocket-closed selected snapshot source evidence by emitting a typed selectedSnapshotObservation and publication-active-gate handoff outcome before runtime promotion. | Handoff probe detects a typed publicationActiveGateHandoff or selectedSnapshotObservation contract for WebSocket-closed selected source evidence while runtimePromotionAllowed remains false until the contract allows promotion. | npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Success metrics: Handoff probe detects a typed publicationActiveGateHandoff or selectedSnapshotObservation contract for WebSocket-closed selected source evidence while runtimePromotionAllowed remains false until the contract allows promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The remaining active-gate timeout is caused by absent snapshot/watch handoff contract emission for a WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness, not by another selected-source retry rule.
- Hypothesis discriminator: If selected-source retry is the gap, focused proof changes selectedSnapshotReachableBy or snapshot coverage without a contract; if handoff contract emission is the gap, adding the owner contract changes selectedSnapshotObservation or publicationActiveGateHandoff while preserving runtimePromotionAllowed=false until safe.
- Expected metric: selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, and snapshotCoverageNodeCount
- Inherits from: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused owner contract tests, admin consumer tests, handoff probe, replay fixture, and static guardrails
- Kill rule: If focused proof cannot emit a typed handoff contract without weakening active-gate admission or adding another caller-local retry path, stop and reopen architecture instead of patching symptoms.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/report.json`
- Expected delta: Handoff probe detects a typed publicationActiveGateHandoff or selectedSnapshotObservation contract for WebSocket-closed selected source evidence while runtimePromotionAllowed remains false until the contract allows promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/report.json`
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

1. work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md
2. work/sprints/active-2026-q2-universal-owner-contract-completion.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-active-gate-handoff-contract.js
7. src/admin/admin-control-snapshot-class-part-1.js
8. src/admin/admin-control-snapshot-class-part-2.js
9. test/control-plane/publication-active-gate-handoff-contract.test.js
10. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
11. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`, `work/sprints/active-2026-q2-universal-owner-contract-completion.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: none beyond declared write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js`, `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture`
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

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
2. node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js
4. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js
5. npm run analyze:topology-convergence -- test-output/report.json --handoff-probe
6. npm run analyze:topology-convergence -- test-output/report.json --replay-fixture
