# Node Failure Rebalance Active Gate Snapshot Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "node-failure-rebalance",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Architecture discriminator selected the startup_active_gate_owner / snapshot_coverage runtime-owner successor for the snapshot/watch owner handoff contract. Handoff probe still reports handoffContract absent and runtimePromotionAllowed=false while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true.",
  "nextAction": "Close this architecture package as route-selected and continue in work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This is the current architecture stop for the active sprint first frontier after a focused WebSocket-closed handoff fixture proved the representative evidence is replayable but the handoff contract remains absent.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/report.json --replay-fixture",
    "npm run analyze:causal-model -- test-output/report.json"
  ],
  "writeScope": [
    "work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-causal-gate",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness is blocked by a missing snapshot/watch owner handoff contract rather than another local selected-source retry path.",
    "hypothesisDiscriminator": "If this is selected-source retry debt, replay evidence should select retry or alternative witness promotion; if it is owner handoff debt, handoff remains absent with runtimePromotionAllowed=false and requiredAction=build_replayable_handoff_fixture.",
    "expectedMetric": "selectedSnapshotObservation state, handoff contract detection, runtimePromotionAllowed, and selected owner-boundary route",
    "inheritsFrom": "work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md",
    "timebox": "24h",
    "mergeRequirement": "canonical handoff probe and replay fixture select the next owner-boundary route before runtime promotion",
    "killRule": "same-frontier with handoff contract absent after the discriminator keeps runtime patching stopped and escalates to owner contract redesign; human escalation only for blocked or contradictory evidence"
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
      "npm run work:evidence-summary -- test-output/report.json",
      "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
      "npm run analyze:topology-convergence -- test-output/report.json --replay-fixture"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "node-failure-rebalance",
    "artifact": "test-output/report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue in the startup_active_gate_owner / snapshot_coverage runtime successor that implements typed snapshot/watch owner handoff contract emission before active-gate runtime promotion."
  },
  "causalGovernance": {
    "hypothesis": "The WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness remains blocked because the active-gate owner lacks a canonical snapshot/watch owner handoff contract.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/report.json, npm run analyze:topology-convergence -- test-output/report.json --handoff-probe, and npm run analyze:topology-convergence -- test-output/report.json --replay-fixture; runtime promotion remains blocked while the handoff contract is absent and runtimePromotionAllowed=false.",
    "expectedCausalModelChange": "Selected the startup_active_gate_owner / snapshot_coverage runtime-owner successor for typed snapshot/watch owner handoff contract emission before runtime promotion.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Handoff probe reports publication_active_gate_handoff_not_detected with selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, alternativeSnapshotWitnessAvailable=true, handoffContract absent, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Publication ACK and operation workflow stay satisfied; selected-source retry and alternative-witness evidence are present; the next bounded route is owner-contract emission, not another caller-local selected-source retry."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "node-failure-rebalance WebSocket-closed selected snapshot source with alternative witness",
    "phaseChain": [
      "selected snapshot source timeout proof passed locally",
      "fresh representative rerun stayed on active_gate_snapshot_coverage with WebSocket-closed selected source evidence",
      "focused handoff fixture replayed selectedSnapshotReachableBy=admin_ws and alternative witness availability",
      "handoff probe still reports publication_active_gate_handoff_not_detected",
      "architecture discriminator selected a same-owner runtime successor for typed snapshot/watch owner handoff contract emission"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains inherited active-gate no-progress evidence",
      "scenario duration and timeout evidence remain downstream symptoms"
    ],
    "missingCausalEdge": "Selected: implement the snapshot/watch owner handoff contract for WebSocket-closed selected-source evidence before runtime promotion.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/report.json --replay-fixture",
    "boundedProgressProof": "Architecture proof selected a bounded same-owner runtime successor; runtime promotion remains blocked until focused proof emits a typed selectedSnapshotObservation or publicationActiveGateHandoff contract.",
    "boundedProgressProofArtifact": "test-output/report.json",
    "expectedObservableTransition": "selected owner-boundary route changed from pending architecture selection to startup_active_gate_owner / snapshot_coverage runtime-owner successor for snapshot/watch handoff contract emission.",
    "maxProgressBound": "one autonomous architecture experiment before another startup_active_gate_owner runtime patch",
    "sameFrontierFallback": "If the runtime successor cannot emit a typed handoff contract without weakening active-gate admission or adding another caller-local retry path, stop and reopen architecture.",
    "expectedNextFrontier": "runtime-owner-boundary successor for snapshot/watch owner handoff contract emission",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done handoff fixture package replayed WebSocket-closed selected source evidence",
      "current representative artifact still requires build_replayable_handoff_fixture"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after a local selected-timeout proof and fixture proof without snapshotCoverageNodeCount movement",
    "handoffInvariant": "Runtime promotion is blocked until the selected runtime successor emits and proves a canonical snapshot/watch handoff owner contract."
  },
  "observablePrediction": {
    "metric": "handoff contract detection, runtimePromotionAllowed, selectedSnapshotObservation state, and selected owner-boundary route",
    "predicted": "Handoff probe reports detected=false, handoffContract absent, runtimePromotionAllowed=false, requiredAction=build_replayable_handoff_fixture, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true; replay fixture preserves the same WebSocket-closed selected-source evidence.",
    "observed": "Handoff probe reports detected=false, handoffContract absent, runtimePromotionAllowed=false, requiredAction=build_replayable_handoff_fixture, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true; replay fixture preserves the same WebSocket-closed selected-source evidence.",
    "accuracy": "matched",
    "evidence": "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/report.json --replay-fixture",
    "metricDelta": 1
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "same owner-boundary returned after local selected-source proof",
      "focused WebSocket-closed fixture made the evidence replayable while handoff remained absent"
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement typed snapshot/watch owner handoff contract emission under startup_active_gate_owner / snapshot_coverage before runtime promotion.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
          "npm run analyze:topology-convergence -- test-output/report.json --replay-fixture"
        ]
      }
    ],
    "nextAction": "Continue in work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md before runtime edits."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Runtime successor emits a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for WebSocket-closed selected-source evidence while runtimePromotionAllowed remains false until the contract allows promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md"
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage selected the snapshot/watch owner handoff contract runtime successor for active_gate_timed_out.
- Inputs/signals: test-output/report.json; npm run work:evidence-summary -- test-output/report.json; npm run analyze:topology-convergence -- test-output/report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/report.json --replay-fixture; npm run analyze:causal-model -- test-output/report.json; npm run work:scenario-triage -- test-output/report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table maps WebSocket-closed selected-source evidence plus admin_ws reachability and an alternative witness to one emitted outcome: continue in a typed snapshot/watch owner handoff contract successor.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: This package proves the architecture discriminator only; the successor owns runtime contract tests, admin consumer tests, handoff probe, replay fixture, and static guardrails.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Continue in the runtime-owner successor for typed snapshot/watch owner handoff contract emission before runtime promotion. | Handoff probe remains absent while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true, selecting owner-contract emission instead of another selected-source retry. | npm run analyze:topology-convergence -- test-output/report.json --handoff-probe |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/report.json`
- Success metrics: Select a concrete owner-boundary route, owner migration, architecture contract, or human stop from the replayable WebSocket-closed selected snapshot source fixture before any runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The WebSocket-closed selected snapshot source with admin_ws reachability and an alternative witness is blocked by a missing snapshot/watch owner handoff contract rather than another local selected-source retry path.
- Hypothesis discriminator: If this is selected-source retry debt, replay evidence should select retry or alternative witness promotion; if it is owner handoff debt, handoff remains absent with runtimePromotionAllowed=false and requiredAction=build_replayable_handoff_fixture.
- Expected metric: selectedSnapshotObservation state, handoff contract detection, runtimePromotionAllowed, and selected owner-boundary route
- Inherits from: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical handoff probe and replay fixture select the next owner-boundary route before runtime promotion
- Kill rule: same-frontier with handoff contract absent after the discriminator keeps runtime patching stopped and escalates to owner contract redesign; human escalation only for blocked or contradictory evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/report.json`
- Expected delta: Select a concrete owner-boundary route, owner migration, architecture contract, or human stop from the replayable WebSocket-closed selected snapshot source fixture before any runtime promotion.
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

1. work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md
2. work/sprints/active-2026-q2-universal-owner-contract-completion.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md`, `work/sprints/active-2026-q2-universal-owner-contract-completion.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture`, `npm run analyze:causal-model -- test-output/report.json`, `npm run work:scenario-triage -- test-output/report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/report.json --markdown`
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

- [x] implementation: status: validated; evidence: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe` passed with detected=false, handoffContract absent, runtimePromotionAllowed=false, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true; `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture` passed with the same WebSocket-closed selected-source evidence preserved; `npm run analyze:causal-model -- test-output/report.json` passed with active_gate_snapshot_coverage as the local blocker; route selected to `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`; parent revalidated focused proof: yes; next: verifier-fixer, repair, closure migration.
- [x] verification-fix: status: validated; evidence: `npm run work:package:doctor -- work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md` passed; `npm run work:package:doctor -- work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md` passed; `npm run work:validate -- --pre-impl --package work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md` passed; `npm run work:validate -- --closure --package work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md` failed before this fix on open execution-evidence items and observablePrediction mismatch; changed files: work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-universal-owner-contract-completion.md; parent revalidated focused proof: yes; next: closure migration.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/report.json
2. npm run analyze:topology-convergence -- test-output/report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/report.json --replay-fixture
4. npm run analyze:causal-model -- test-output/report.json
5. npm run work:scenario-triage -- test-output/report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/report.json --markdown

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
