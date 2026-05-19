# Topology Publication Active Gate Handoff Fixture Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused replay fixture proves the no-debt publication_pending shape emits a publication active-gate owner reconcile handoff, and the coordinator preserves an explicit target_blocked owner outcome for the empty target without enqueueing downstream recovery work.",
  "nextAction": "Close this package as a focused same-frontier proof slice, then open a bounded topology_publication_owner / publication_convergence successor to surface the replay-proved handoff contract or target_blocked owner outcome in representative diagnostics before downstream active-gate/readiness edits.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-3.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
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
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Queue drain residual is reduced: priority residuals are 0, pending owner reconcile is 0, activeGateOwnerCohortMissingPublishedCount is 0, and the next missing edge is publication_ack_to_active_gate_reconcile_missing with required action build_replayable_handoff_fixture.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "build_replayable_handoff_fixture"
  },
  "causalGovernance": {
    "hypothesis": "Queue-drain runtime reduced the accepted owner-recovery queue residual, but the publication owner still lacks a replayable proof for the publication_ack_to_active_gate_reconcile_missing edge before downstream active-gate evidence can progress.",
    "stopConditionCheck": "Before runtime edits, run npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json and npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --handoff-probe, then confirm requiredAction=build_replayable_handoff_fixture. Focused proof must build or identify the handoff fixture and prove whether publication owner emits the active-gate reconcile handoff or preserves an explicit owner outcome.",
    "expectedCausalModelChange": "The missing publication_ack_to_active_gate_reconcile edge becomes replayable and classifies into a bounded publication-owner runtime successor, owner-boundary migration, architecture stop, human stop, or representative-green outcome.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json remains red at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending. Queue-drain residuals are reduced: priority residual witnesses are 0, pending owner reconcile is 0, activeGateOwnerCohortMissingPublishedCount is 0, membershipPublicationHandoffOutcome is absent, and handoff probe resultClassification=publication_ack_to_active_gate_reconcile_missing with requiredAction=build_replayable_handoff_fixture. Focused fixture now proves the no-debt publication_pending replay emits a publication active-gate handoff contract and the coordinator preserves target_blocked / expected_cohort_unavailable instead of enqueuing downstream owner recovery work; the unchanged artifact still lacks that surfaced handoff contract.",
    "crossBoundaryReview": "Startup active-gate, startup readiness, operation workflow, admission, and timeout paths remain frozen until the publication-owner handoff edge is replayable or ownership migrates."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after queue-drain runtime reduction",
    "phaseChain": [
      "multi-node owner reconcile runtime reduced pendingReconcileCount from 4 to 1",
      "owner recovery wake queue admission runtime moved membershipPublicationHandoffOutcomeEnqueued=false to write_deferred#enqueued=true",
      "queue drain runtime preserved retryable owner queue drain state and fresh evidence reduced priority residual witnesses to 0",
      "fresh representative evidence still reports publication_ack_convergence first with publication_ack_to_active_gate_reconcile_missing"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=timed_out",
      "snapshotCoverageNodeCount=0/5",
      "selectedSnapshotSourceCause=selected_snapshot_source_timeout",
      "publicationActiveGateHandoffPendingReconcileCount=0",
      "activeGateOwnerCohortMissingPublishedCount=0",
      "membershipPublicationHandoffOutcome=absent",
      "priority recovery residual witnesses=0",
      "runtimePromotionAllowed=false"
    ],
    "missingCausalEdge": "publication_ack_to_active_gate_reconcile_missing",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --handoff-probe",
    "boundedProgressProof": "Build or identify a replayable handoff fixture and prove whether the publication owner emits the active-gate reconcile handoff or preserves an explicit owner outcome.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json",
    "expectedObservableTransition": "Focused fixture proved a publication-owner same-frontier successor: the no-debt publication_pending replay emits an owner reconcile handoff, then normalizes to a target_blocked owner outcome because the representative replay has no expected cohort. Representative evidence remains unchanged until a successor surfaces that contract/outcome.",
    "maxProgressBound": "one fixture/runtime-owner-boundary package before rerun or renewed causal escalation",
    "sameFrontierFallback": "If the handoff fixture cannot prove the missing edge or an explicit owner outcome, stop for architecture or human escalation instead of editing downstream active-gate/readiness paths.",
    "expectedNextFrontier": "bounded publication-owner projection/runtime successor or architecture/human stop before downstream active-gate edits",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-admission-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "This same-owner runtime package is allowed because the previous queue-drain runtime produced concrete reduction: priority residual witnesses 3 to 0, pending owner reconcile 2 to 0, and a new missing edge publication_ack_to_active_gate_reconcile_missing.",
    "handoffInvariant": "Do not edit startup active-gate, startup readiness, operation workflow, admission, or timeout paths until the publication owner handoff edge is replayable or ownership migrates."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative evidence stays on topology_publication_owner / publication_convergence / publication_pending",
      "queue-drain runtime produced concrete reduction with priority residual witnesses=0 and pending owner reconcile=0",
      "handoff probe reports publication_ack_to_active_gate_reconcile_missing and requiredAction=build_replayable_handoff_fixture",
      "downstream startup active-gate/readiness paths remain frozen"
    ],
    "choices": [
      {
        "id": "publication-active-gate-handoff-fixture-runtime",
        "summary": "Build the replayable publication-owner handoff fixture before selecting another runtime patch.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --handoff-probe",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Stop for human direction if the missing edge cannot be reproduced without downstream symptom edits.",
        "route": "human-escalation",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json"
        ]
      }
    ],
    "selectedChoice": "publication-active-gate-handoff-fixture-runtime",
    "nextAction": "Use the recorded focused implementation evidence to close this proof slice or open the bounded publication-owner successor; do not add review/fix sequencing unless fresh evidence changes the package scope."
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Build a replayable handoff fixture for publication_ack_to_active_gate_reconcile_missing and prove whether the publication owner emits the active-gate reconcile handoff or preserves an explicit owner outcome. | Queue drain residual is reduced: priority residuals are 0, pending owner reconcile is 0, activeGateOwnerCohortMissingPublishedCount is 0, and the next missing edge is publication_ack_to_active_gate_reconcile_missing with required action build_replayable_handoff_fixture. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`
- Success metrics: Queue drain residual is reduced: priority residuals are 0, pending owner reconcile is 0, activeGateOwnerCohortMissingPublishedCount is 0, and the next missing edge is publication_ack_to_active_gate_reconcile_missing with required action build_replayable_handoff_fixture.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`
- Expected delta: Queue drain residual is reduced: priority residuals are 0, pending owner reconcile is 0, activeGateOwnerCohortMissingPublishedCount is 0, and the next missing edge is publication_ack_to_active_gate_reconcile_missing with required action build_replayable_handoff_fixture.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
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
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. test/control-plane/membership-publication-coordinator-main-stage-2.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown`
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

## Focused Fixture Result

- Replay fixture: `reconcileClusterMembership preserves target-blocked active-gate handoff replay` in `test/control-plane/membership-publication-coordinator-main-stage-2.js`.
- Producer proof: no-debt `publicationPending=true`, `recoveryProtocolState=unpublished_observation`, pending ACK count `0`, missing published count `0`, and priority spread `false` emit a publication active-gate handoff contract with `state=pending`, `reasonCode=owner_reconcile_pending`, `nextAction=reconcile_owner_membership_publication`, `runtimePromotionAllowed=false`, and no pending reconcile nodes.
- Owner outcome proof: routing that replay through `reconcileClusterMembership({publicationActiveGateHandoff})` preserves an explicit owner outcome: `state=target_blocked`, target `reconcileRequired=false`, nested handoff `state=unavailable`, `reasonCode=expected_cohort_unavailable`, `nextAction=observe_owner_handoff`, and owner recovery enqueue count `0`.
- Classification: this package proved the missing edge is replayable and classifies to an explicit publication-owner outcome for the empty-target replay. It did not promote runtime scope because `src/` is forbidden in this package.
- Successor boundary: surface the replay-proved handoff contract or `target_blocked` owner outcome in representative diagnostics/evidence before editing downstream startup active-gate, startup readiness, operation workflow, admission, or timeout paths.

## Execution Evidence

- [x] implementation: status: validated; evidence: focused replay fixture, route-after-rerun, handoff probe, evidence summary, scenario triage, priority residual extractor, decision-boundary guard, runtime grammar audit, and scoped diff check passed; parent revalidated focused proof: yes; next: close this package or open the bounded publication-owner successor.

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [x] Agent Hypatia (019e40db-d1f4-7a70-960f-275407e6a609) explorer checkpoint: status: validated; last checkpoint: fixture pattern inspection complete; parent action: accepted; evidence: identified the replay fixture in `test/control-plane/membership-publication-coordinator-main-stage-2.js`, confirmed the no-debt publication pending contract rules in `src/control-plane/publication-active-gate-handoff-contract.js`, and recommended assertions for emitted handoff plus `target_blocked` owner outcome; next: parent local proof and package classification.
- [x] Parent implementation checkpoint: status: validated; last checkpoint: focused replay fixture and proof ladder complete; parent action: revalidated; evidence: `node test/control-plane/membership-publication-coordinator-main-stage-2.js` passed with `128/128` assertions, `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` kept the route on `topology_publication_owner / publication_convergence / publication_pending`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --handoff-probe` kept `publication_ack_to_active_gate_reconcile_missing`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown`, `node scripts/check-guideline-decision-boundaries.js test/control-plane/membership-publication-coordinator-main-stage-2.js`, `npm run audit:runtime-grammar:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js`, and scoped `git diff --check` passed; next: close package or open bounded successor for surfaced handoff outcome.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: not required by `npm run work:advance -- --check`; focused explorer Agent Hypatia (019e40db-d1f4-7a70-960f-275407e6a609) inspected fixture pattern and assertions.
- [x] Fix subagent recorded or explicitly not needed: not needed; no review findings required a separate fix role.
- [x] Implementation subagent recorded: parent implemented the test-only replay fixture with subagent-assisted fixture review; parent revalidated focused proof: yes.

## Validation

1. PASS - `node test/control-plane/membership-publication-coordinator-main-stage-2.js` passed with `128/128` assertions.
2. PASS - `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` kept route `topology_publication_owner / publication_convergence / publication_pending`, causal outcome `continue_local_fix`, stop `classified_local_blocker`, and priority witnesses `0`.
3. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --handoff-probe` kept `publication_ack_to_active_gate_reconcile_missing`, no handoff contract in the representative artifact, no owner recovery queue handoff outcome, and `runtimePromotionAllowed=false`.
4. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --replay-fixture` emitted the no-debt publication pending replay fixture that the focused TAP test now covers.
5. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json` kept first frontier `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`.
6. PASS - `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown` kept causal outcome `continue_local_fix`, stop `classified_local_blocker`, priority witnesses `0`, and split required `false`.
7. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-queue-drain-runtime-20260519T151451Z.report.json --markdown` reported priority recovery witnesses `0` and split required `false`.
8. PASS - `node scripts/check-guideline-decision-boundaries.js test/control-plane/membership-publication-coordinator-main-stage-2.js` found `0` decision-boundary violations.
9. PASS - `npm run audit:runtime-grammar:file -- test/control-plane/membership-publication-coordinator-main-stage-2.js` found `0` runtime-grammar-contract violations.
10. PASS - Scoped `git diff --check` over package-owned files passed.
