# Network Partition Active Gate Snapshot Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The focused replay fixture now preserves selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node alternative witness evidence; replaying the fixture through the handoff probe still reports handoffContract absent, runtimePromotionAllowed=false, and nextOwnerPath.requiredAction=build_replayable_handoff_fixture.",
  "nextAction": "Use the replayable handoff fixture to select the snapshot/watch owner contract route before any runtime promotion.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture",
    "npm test -- test/scripts/analyze-topology-convergence.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "network-partition-split-brain",
    "artifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Use the replayable handoff fixture to select the snapshot/watch owner contract route before any runtime promotion."
  },
  "causalGovernance": {
    "hypothesis": "Representative active-gate snapshot coverage remains same-frontier after the selected-source alternative witness fallback because the deeper contract between startup_active_gate_owner and canonical snapshot/watch ownership is still absent under partition pressure.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json and confirm whether the dominant failure class remains active_gate_snapshot_coverage_incomplete before promoting runtime work.",
    "expectedCausalModelChange": "The architecture experiment should distinguish selected-source fallback-only debt from snapshot/watch owner handoff debt, then select a concrete owner-boundary route, migration, or architecture gap stop.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh representative evidence remains active_gate_snapshot_coverage with selected_snapshot_source_timeout, snapshotCoverageNodeCount=0/3, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, handoffContract absent, runtimePromotionAllowed=false, and nextOwnerPath.requiredAction=build_replayable_handoff_fixture. The replay fixture now preserves those witness diagnostics, so the remaining gap is the snapshot/watch owner handoff contract rather than missing replay evidence.",
    "crossBoundaryReview": "Required before any next runtime package; compare startup_active_gate_owner, snapshot/watch owner, diagnostics, publication, readiness, and priority recovery boundaries."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain selected snapshot source alternative witness",
    "phaseChain": [
      "publication ACK package satisfied publication convergence",
      "startup active-gate runtime package preserved deferred handoff state in focused proof but representative evidence returned same-frontier",
      "architecture probe closed evidence-incomplete",
      "diagnostics package exposed selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, and alternativeSnapshotWitnessAvailable=true",
      "selected-source alternative witness focused proof passed, but fresh representative rerun stayed same-frontier"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress",
      "scenario_duration and active_gate_timeout budgets remain downstream exhausted after active-gate no progress"
    ],
    "missingCausalEdge": "The architecture edge between selected snapshot source fallback and canonical snapshot/watch owner handoff remains unresolved under partition pressure.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "boundedProgressProof": "Bounded replay/reconcile proof must preserve selectedSnapshotAdminReady, selectedSnapshotReachableBy, alternativeSnapshotWitnessAvailable, and per-node witness evidence, then replay through the handoff probe without allowing runtime promotion.",
    "boundedProgressProofArtifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "expectedObservableTransition": "Replay fixture preserves selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node witness evidence while handoff probe continues to require build_replayable_handoff_fixture.",
    "maxProgressBound": "one autonomous architecture experiment before another startup_active_gate_owner runtime patch",
    "sameFrontierFallback": "If the discriminator returns same-frontier unchanged, stop runtime patching and escalate to owner contract redesign; human escalation only for blocked or contradictory evidence.",
    "expectedNextFrontier": "selected owner-boundary route, owner-boundary migration, representative reduction, or architecture-gap stop",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260522-network-partition-split-brain-startup-active-gate-owner-snap: startup_active_gate_owner / snapshot_coverage returned same-frontier",
      "done-20260522-active-gate-snapshot-witness-diagnostics: diagnostics exposed selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true",
      "active selected-source alternative witness package: focused proof passed but representative rerun returned same-frontier"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after the selected local proof and fresh representative rerun",
    "handoffInvariant": "callers must not keep patching selected-source symptoms until a canonical snapshot/watch owner handoff invariant is selected and proven"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh representative rerun stayed on active_gate_snapshot_coverage after the selected-source alternative witness focused proof.",
      "selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true remain present while selected_snapshot_source_timeout and snapshotCoverageNodeCount=0/3 remain unchanged.",
      "Recent related startup_active_gate_owner / snapshot_coverage runtime work already returned same-frontier."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Run an autonomous architecture experiment before runtime promotion.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
          "npm run work:scenario-triage -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --markdown"
        ]
      }
    ],
    "nextAction": "Run the architecture discriminator and select the next owner-boundary route before runtime edits."
  },
  "observablePrediction": {
    "metric": "selected_snapshot_source_timeout, snapshotCoverageNodeCount, selectedSnapshotAdminReady, alternativeSnapshotWitnessAvailable, and active_gate_snapshot_coverage route",
    "predicted": "The architecture discriminator will either identify a selected-source-only bounded reconcile path that changes selectedSnapshotSourceCause or snapshotCoverageNodeCount, or prove that selectedSnapshotAdminReady=true plus alternativeSnapshotWitnessAvailable=true with unchanged selected_snapshot_source_timeout requires a snapshot/watch owner handoff contract before runtime promotion.",
    "observed": "Matched the owner-handoff-gap branch: canonical proof still shows selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true with unchanged selected_snapshot_source_timeout, handoffContract absent, runtimePromotionAllowed=false, and nextOwnerPath.requiredAction=build_replayable_handoff_fixture. The replay fixture now preserves selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node witness evidence.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture; npm test -- test/scripts/analyze-topology-convergence.test.js"
  },
  "boundedExperiment": {
    "hypothesis": "Selected-source fallback in the harness cannot move representative active-gate snapshot coverage because startup_active_gate_owner lacks a canonical snapshot/watch owner handoff for alternative witnesses under partition pressure.",
    "hypothesisDiscriminator": "If the gap is selected-source fallback only, focused replay should move selectedSnapshotSourceCause or snapshotCoverageNodeCount; if the gap is owner handoff, selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true stay present while selected_snapshot_source_timeout remains unchanged.",
    "expectedMetric": "selected_snapshot_source_timeout, snapshotCoverageNodeCount, selectedSnapshotAdminReady, alternativeSnapshotWitnessAvailable, and active_gate_snapshot_coverage frontier classification",
    "inheritsFrom": "work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md",
    "timebox": "24h",
    "mergeRequirement": "focused architecture discriminator plus canonical route-after-rerun evidence before runtime promotion",
    "killRule": "same frontier with selected_snapshot_source_timeout unchanged after the discriminator keeps runtime patching stopped and escalates to owner contract redesign; human escalation only for blocked or contradictory evidence"
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
      "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
      "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "same-frontier",
    "stopMode": "architecture-gap-stop",
    "nextLane": "experiment",
    "expectedDelta": "Same-frontier active-gate snapshot evidence is now replayable with selected snapshot witness diagnostics preserved; the next route must select the snapshot/watch owner handoff contract before another local runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, replay-fixture proof, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage remains blocked with selected_snapshot_source_timeout, but the replay fixture now preserves the selected snapshot witness diagnostics needed for the owner handoff route.
- Inputs/signals: test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture; npm test -- test/scripts/analyze-topology-convergence.test.js.
- State model or invariant: Replay fixtures must preserve selectedSnapshotAdminReady, selectedSnapshotReachableBy, alternativeSnapshotWitnessAvailable, and per-node witness evidence while the handoff probe keeps runtimePromotionAllowed=false and requiredAction=build_replayable_handoff_fixture.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, edit src/, or patch runtime symptoms outside this package.
- Proof mapping: Implementation and tests must prove replay fixture preservation and handoff-probe classification before runtime promotion is considered.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Preserve selected snapshot witness diagnostics in the replay fixture and keep runtime promotion blocked until the handoff route is selected. | Replay fixture carries selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node witness evidence; handoff probe still requires build_replayable_handoff_fixture. | npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes the diagnostic replay fixture for startup_active_gate_owner / snapshot_coverage directly; it does not patch runtime symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe`
- Success metrics: selected snapshot witness diagnostic field count moves from 0 to 4 in the replay fixture: selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node witness evidence; replay-through-probe keeps requiredAction=build_replayable_handoff_fixture with runtimePromotionAllowed=false.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Selected-source fallback in the harness cannot move representative active-gate snapshot coverage because startup_active_gate_owner lacks a canonical snapshot/watch owner handoff for alternative witnesses under partition pressure.
- Hypothesis discriminator: If the gap is selected-source fallback only, focused replay should move selectedSnapshotSourceCause or snapshotCoverageNodeCount; if the gap is owner handoff, selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true stay present while selected_snapshot_source_timeout remains unchanged.
- Expected metric: selected_snapshot_source_timeout, snapshotCoverageNodeCount, selectedSnapshotAdminReady, alternativeSnapshotWitnessAvailable, and active_gate_snapshot_coverage frontier classification
- Inherits from: `work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused architecture discriminator plus canonical route-after-rerun evidence before runtime promotion
- Kill rule: same frontier with selected_snapshot_source_timeout unchanged after the discriminator keeps runtime patching stopped and escalates to owner contract redesign; human escalation only for blocked or contradictory evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json`
- Expected delta: Same-frontier active-gate snapshot evidence is replayable with selected snapshot witness diagnostics preserved; the next package must select the snapshot/watch owner handoff contract before another local runtime patch.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `same-frontier`
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

1. `scripts/analyze-topology-convergence.js`
2. `test/scripts/analyze-topology-convergence.test.js`
3. `work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md`
4. `work/sprints/active-2026-q2-universal-owner-contract-completion.md`
5. `work/sprints/current-blocker.md`
6. `work/sprints/current-blocker.json`
7. `work/model-ledger.jsonl`

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md`, `work/sprints/active-2026-q2-universal-owner-contract-completion.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `scripts/analyze-topology-convergence.js`, `test/scripts/analyze-topology-convergence.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture`, `npm test -- test/scripts/analyze-topology-convergence.test.js`
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

- [x] implementation: status: validated; evidence: `node --check scripts/analyze-topology-convergence.js` (pass), `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture` (preserves selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, and per-node witness evidence), `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe` (handoffContract absent, runtimePromotionAllowed=false, nextOwnerPath.requiredAction=build_replayable_handoff_fixture), `npm test -- test/scripts/analyze-topology-convergence.test.js` (pass, 25/25); parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: Agent Dalton (019e4eee-79d1-7c41-9e25-463077cb3f72) reran `npm test -- test/scripts/analyze-topology-convergence.test.js` (pass, 25 tests passed, 0 failed) and confirmed replay preservation plus replay-through-probe requiredAction=build_replayable_handoff_fixture; changed files: none from verifier; parent revalidated focused proof: yes; next: validation.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, and `work/sprints/active-2026-q2-universal-owner-contract-completion.md`; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe
4. npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --replay-fixture
5. npm test -- test/scripts/analyze-topology-convergence.test.js
