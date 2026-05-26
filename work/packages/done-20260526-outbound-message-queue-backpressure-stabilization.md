# Outbound Message Queue Backpressure Stabilization

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "playback": "none",
    "owner": "transport_owner",
    "boundary": "message_routing",
    "dominantReason": "accept_classified_backpressure",
    "currentState": "Scaffolded for priority recovery transport_owner message_routing stabilization.",
    "nextAction": "Separate metadata control signals from data messages to stabilize outbound queue"
  },
  "scope": {
    "writeScope": [
      "src/transport/message-router-shared-stage-2.js",
      "src/transport/message-router-shared-stage-3.js",
      "src/transport/message-router-shared-stage-4.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/transport/message-router-shared-stage-2.js",
      "src/transport/message-router-shared-stage-3.js",
      "src/transport/message-router-shared-stage-4.js"
    ],
    "commitScope": [
      "work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md",
      "work/sprints/active-2026-q2-rolling-restart-investigation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "src/transport/message-router-shared-stage-2.js",
      "src/transport/message-router-shared-stage-3.js",
      "src/transport/message-router-shared-stage-4.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260513-rolling-restart-preflight-green-gate-confirmation"
    ],
    "proof": {
      "commands": [
        "falsifier: contract transition transport_owner message_routing accept_classified_backpressure npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json",
        "regression: contract transition transport_owner message_routing accept_classified_backpressure npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json",
        "supporting: contract transition transport_owner message_routing accept_classified_backpressure npm run work:advance -- --check"
      ]
    }
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
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "frontier": "control-plane-publications/publication-convergence",
    "owner": "transport_owner",
    "boundary": "message_routing",
    "dominantReason": "accept_classified_backpressure",
    "nextAction": "Separate metadata control signals from data messages to stabilize outbound queue"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "transport_owner",
    "toBoundary": "message_routing",
    "reason": "The user explicitly selected Option C to stabilize outbound transport queue backpressure, targeting transport_owner/message_routing before continuing operation_workflow_owner priority recovery.",
    "evidence": "test-output/reports/rolling-restart-rerun-4.report.json"
  },
  "causalGovernance": {
    "causalHypothesis": "Stabilizing outbound message queues under backpressure prevents priority recovery stalls.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-rerun-4.report.json",
    "expectedCausalModelChange": "Outbound queues are stabilized and priority spread convergence succeeds.",
    "representativeOutcome": "reduced",
    "causalDebt": "The previous sprint closed on metadata signal delay timeouts; this package resolves the underlying transport queue priority backpressure.",
    "crossBoundaryReview": "Reviewed with the transport and membership owners to ensure priority signal propagation.",
    "hypothesis": "Outbound message buffers saturate, delaying critical membership and recovery signals. Separating priority metadata signals stabilizes progression."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "triage",
      "design",
      "implement",
      "validate"
    ],
    "currentFirstFrontier": "transport_owner/message_routing",
    "knownDownstreamBlockers": [
      "priority spread latency",
      "outbound queue saturation"
    ],
    "missingCausalEdge": "backpressure control in outbound queues",
    "missingCausalEdgeProbe": "npm run work:advance -- --check",
    "falsifyingProbe": "npm test -- test/transport/message-router.test.js",
    "boundedProgressProof": "Separate critical metadata control signals from lower priority messages to accelerate drain, dispatch, and delivery of recovery signals.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "expectedObservableTransition": "stable queue progression",
    "maxProgressBound": "24h",
    "sameFrontierFallback": "re-evaluate",
    "expectedNextFrontier": "clean convergence",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [],
    "oscillationCheck": "none",
    "handoffInvariant": "none"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "routeOwner": "transport_owner",
    "routeBoundary": "message_routing",
    "routeDominantReason": "accept_classified_backpressure",
    "routeCausalOutcome": "reduced",
    "stopMode": "classified_local_blocker",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-4.report.json --owner transport_owner --boundary message_routing --dominant-reason accept_classified_backpressure",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md"
    ]
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "selectedChoice": "unknown",
    "route": "continue-local-proof",
    "choices": [],
    "triggerEvidence": []
  }
}
-->

## Why

This package stabilizes the outbound queue by separating critical metadata control signals from lower-priority data messages to prevent priority recovery stalls under load.

## Scope Basis

Approved rolling restart stabilization roadmap.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: transport_owner / message_routing emits the package outcome for accept_classified_backpressure.
- Inputs/signals: Separate metadata control signals from data messages to stabilize outbound queue.
- State model or invariant: The transport_owner / message_routing decision table in the Causal Decision Contract maps accept_classified_backpressure and route evidence to one emitted outcome: Separate metadata control signals from data messages to stabilize outbound queue.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the transport_owner / message_routing invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | transport_owner / message_routing / accept_classified_backpressure | transport_owner owns this decision before downstream consumers reinterpret it | Separate metadata control signals from data messages to stabilize outbound queue | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:advance -- --check |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies transport_owner / message_routing directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:advance -- --check`
- Competing explanations: Compare accept_classified_backpressure against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on unchanged evidence; require fresh route evidence before opening implementation work.
- Oscillation guard: if the same frontier repeats with no concrete reduction, select an autonomous architecture experiment rather than another local patch.

## Decision Experiment Gate

- Decision question: Does transport_owner / message_routing still own accept_classified_backpressure, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: accept_classified_backpressure is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:advance -- --check`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner transport_owner --boundary message_routing --dominant-reason accept_classified_backpressure`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `transport_owner`
- Route boundary: `message_routing`
- Route dominant reason: `accept_classified_backpressure`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

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
- Owned files: `work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: transport_owner; files-changed: src/transport/message-router-shared-stage-2.js, src/transport/message-router-shared-stage-3.js; validation: npm test -- test/transport/message-router.test.js: pass (361 tests); parent revalidated focused proof: yes; no ledger update; outcome: validated.
- [x] action: verification-fix; owner: transport_owner; files-changed: src/transport/message-router-shared-stage-2.js, src/transport/message-router-shared-stage-3.js; validation: npm run work:validate -- --pre-impl: ok; parent revalidated focused proof: yes; no ledger update; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: no tracker-generated repair needed before package closure; parent revalidated focused proof: yes; no ledger update; outcome: not-needed.

## Validation

1. `git diff --check -- <files>`
