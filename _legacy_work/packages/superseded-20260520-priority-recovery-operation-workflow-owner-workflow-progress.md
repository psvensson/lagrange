# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "superseded",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Superseded on 2026-05-20 by architecture reset: the same evidence showed operation progress was shared across workflow, publication, and active-gate observers without a first-class owner resource.",
  "nextAction": "Close this local rolling-restart patch package and replace it with an operation_progress resource/state-machine package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --markdown",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "writeScope": [
    "work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js"
  ],
  "commitScope": [
    "work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "operation-workflow-progress-dispatch-pending/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "runtime proof needs topology publication, startup active-gate, readiness, admission, guardrail, or timeout changes",
      "fresh representative evidence returns unchanged dispatch_pending workflow progress with no operation state, retry, or frontier movement"
    ]
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
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Advance or classify the dispatch_pending control_plane_publications-p1 operation so fresh evidence shows operation progress, a different owner boundary, a structured retry state, or rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "superseded",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Superseded by operation_progress resource/state-machine package."
  },
  "causalGovernance": {
    "hypothesis": "The remaining rolling-restart blocker is publication-visible, but the next required progress mechanism is operation workflow owner advancement: control_plane_publications-p1 has an event-driven REPLACE operation stuck at dispatch_pending/planned and must either advance through the owner or retain explicit retry/progress state.",
    "stopConditionCheck": "Use `npm run analyze:causal-model -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json`, the fresh evidence summary, topology handoff probe, priority residual extractor, and focused operation workflow progress tests before runtime edits.",
    "expectedCausalModelChange": "The next proof should reduce the workflow-progress residual, move the topology operator out of dispatch_pending/planned, migrate the owner boundary, or turn rolling-restart green.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh artifact reports publication_ack_convergence first, but priority residual extraction has one operation_workflow_owner / workflow_progress witness: control_plane_publications-p1, semanticState=recovering_in_flight, topologyOperatorCurrentStepId=dispatch_pending, currentStepState=planned, nextAction=advance_existing_operation.",
    "crossBoundaryReview": "User pre-approved architectural escalation on 2026-05-20. This package may inspect publication and active-gate evidence only to preserve the handoff contract; runtime edits stay in operation workflow owner dispatch/progress handling unless fresh evidence selects another owner."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
    "phaseChain": [
      "publication deferred-drain work made the admin query handoff non-blocking and kept owner handoff debt explicit",
      "fresh representative evidence still reports publication_ack_convergence first",
      "canonical topology handoff probe names operation_workflow_owner / workflow_progress as the next owner path with requiredAction=advance_existing_operation",
      "priority residual extraction reports one workflow_progress witness and splitRequired=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence is the visible failed invariant, while the actionable successor is priority_recovery_partition_progress / operation_workflow_owner / workflow_progress for control_plane_publications-p1 dispatch_pending planned work.",
    "knownDownstreamBlockers": [
      "publicationStatus=OPEN at epoch 2",
      "snapshotCoverage=3/5 with repair_deferred stale_replica_operations_in_flight",
      "topologyOperatorCurrentStepId=dispatch_pending",
      "topologyOperatorCurrentStepState=planned",
      "topologyOperatorNextAction=advance_existing_operation"
    ],
    "missingCausalEdge": "Operation workflow owner must advance, retry, or explicitly classify the dispatch_pending control_plane_publications-p1 operation so publication recovery can continue.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --markdown",
    "boundedProgressProof": "Focused operation workflow progress tests must prove dispatch_pending advance/retry behavior; representative proof must show operation progress, owner-boundary migration, structured retry, or green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json",
    "expectedObservableTransition": "Fresh representative evidence moves control_plane_publications-p1 out of dispatch_pending/planned, reduces the workflow-progress residual, migrates owner boundary, or turns rolling-restart green.",
    "maxProgressBound": "one operation_workflow_owner / workflow_progress runtime slice before another same-frontier workflow successor",
    "sameFrontierFallback": "If fresh evidence returns the same dispatch_pending planned operation with no concrete metric or retry-shape movement, stop for architecture or human escalation.",
    "expectedNextFrontier": "operation progress, structured retry, owner-boundary migration, representative-green, architecture-gap, or human stop",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260520-topology-publication-open-pending-runtime.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260520-startup-active-gate-owner-reconcile-pending-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "The frontier is visibly publication-owned, but fresh canonical residuals now identify a single operation workflow progress witness; prove the workflow owner edge before another publication or active-gate local patch.",
    "handoffInvariant": "Publication owner remains the visible producer and active gate remains the consumer; operation workflow owner may only advance or classify its own durable operation progress."
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / workflow_progress emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json; Prove or split this residual owner boundary..
- State model or invariant: The operation_workflow_owner / workflow_progress decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove or split this residual owner boundary. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion. | npm run work:advance -- --check |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:advance -- --check`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:advance -- --check`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
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

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: superseded; evidence: 2026-05-20 architecture reset selected operation_progress as the missing owned resource instead of another local workflow-progress patch; next: closure as superseded.
- [x] implementation: status: not-run; evidence: no additional local runtime patch was accepted because the replacement package owns operation_progress state-machine implementation; parent revalidated focused proof: yes; next: successor architecture package.
- [x] repair: status: pending-successor; evidence: generated current-blocker will be refreshed after the replacement operation_progress package/sprint is installed; next: validation.

## Validation

1. `git diff --check -- <files>`
