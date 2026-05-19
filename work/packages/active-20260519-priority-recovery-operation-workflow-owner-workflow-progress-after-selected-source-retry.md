# Priority Recovery operation_workflow_owner workflow_progress After Selected Source Retry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Causal escalation package opened because fresh representative evidence after the selected-source retry improved active-gate snapshot coverage from 0/5 to 3/5, then reselected publication/priority-recovery backpressure: control_plane_publications-p1 is recovering_in_flight, actuationState=persisted_not_dispatched, waitMode=event_driven, nextRequiredAction=advance_existing_operation under operation_workflow_owner / workflow_progress.",
  "nextAction": "Prove the cross-boundary handoff decision, then open the bounded runtime successor only if operation_workflow_owner / workflow_progress remains the selected owner boundary.",
  "proof": [
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260519-priority-recovery-operation-workflow-owner-workflow-progress-after-selected-source-retry.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-priority-recovery-operation-workflow-owner-workflow-progress-after-selected-source-retry.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify the cross-boundary handoff from selected-source active-gate reduction to operation workflow progress; either open a bounded operation_workflow_owner / workflow_progress runtime successor or stop for architecture if the handoff is not defensible.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  }
  ,
  "causalGovernance": {
    "hypothesis": "The selected-source retry removed the startup active-gate timeout symptom, exposing a real operation_workflow_owner / workflow_progress priority-recovery residual for control_plane_publications-p1.",
    "stopConditionCheck": "Use priority residual extraction, topology handoff probe, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json` before opening another runtime package.",
    "expectedCausalModelChange": "Causal escalation should either select operation_workflow_owner / workflow_progress as the bounded runtime successor or classify the route as architecture-gap/human-stop.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has snapshotCoverage=3/5, active_gate_snapshot_coverage deferred on owner_reconcile_pending / snapshot_repair_deferred, publication_ack_convergence visible, and one priority recovery witness for control_plane_publications-p1 persisted_not_dispatched advance_existing_operation.",
    "crossBoundaryReview": "Do not open local runtime work until the handoff from startup active-gate reduction to operation workflow progress is recorded in this causal package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after selected-source retry",
    "phaseChain": [
      "startup active-gate selected-source timeout reduced",
      "snapshot coverage improved from 0/5 to 3/5",
      "publication/priority recovery backpressure remains visible",
      "priority residual extraction selects operation_workflow_owner / workflow_progress"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains the visible topology frontier while handoff and priority residual probes identify operation_workflow_owner / workflow_progress as the next actionable owner.",
    "knownDownstreamBlockers": [
      "control_plane_publications-p1 is recovering_in_flight",
      "actuationState=persisted_not_dispatched",
      "waitMode=event_driven",
      "nextRequiredAction=advance_existing_operation"
    ],
    "missingCausalEdge": "The sprint needs a cross-boundary decision proving whether the remaining publication surface is caused by operation workflow progress backpressure.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
    "boundedProgressProof": "The causal package must prove whether the next bounded progress mechanism is advance_existing_operation on operation_workflow_owner / workflow_progress, not runtime edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
    "expectedObservableTransition": "owner-boundary migration to operation_workflow_owner / workflow_progress, architecture-gap, or human stop.",
    "maxProgressBound": "one causal-escalation handoff decision",
    "sameFrontierFallback": "If the route cannot prove a concrete owner/boundary successor, stop for architecture instead of local patching.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress if causal proof is clean",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Required by validation: adjacent owner-boundary fixes did not close rolling-restart; this package records the cross-boundary handoff before any operation workflow runtime patch.",
    "handoffInvariant": "Selected-source timeout, topology publication owner, and startup active-gate runtime stay frozen unless fresh causal evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "publication owner and startup active-gate owner packages reduced concrete debt but did not close rolling-restart",
      "fresh artifact improved snapshotCoverage from 0/5 to 3/5 but returned publication_ack_convergence as the visible frontier",
      "priority residual extraction reports one operation_workflow_owner / workflow_progress witness with nextRequiredAction=advance_existing_operation",
      "handoff probe reports nextOwnerPath operation_workflow_owner / workflow_progress"
    ],
    "choices": [
      {
        "id": "operation-workflow-progress-runtime-successor",
        "summary": "Select a bounded operation_workflow_owner / workflow_progress runtime successor for control_plane_publications-p1 persisted_not_dispatched advance_existing_operation.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop runtime patching if causal proof cannot distinguish operation workflow progress from publication or active-gate symptoms.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json"
        ]
      }
    ],
    "selectedChoice": "operation-workflow-progress-runtime-successor",
    "nextAction": "Run causal proof, then open operation_workflow_owner / workflow_progress runtime successor if the selected choice remains supported."
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

- Canonical outcome: operation_workflow_owner / workflow_progress emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json; npm run analyze:owner-files -- operation_workflow_owner workflow_progress; npm run work:scenario-route -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked --explain priority_recovery_partition_progress; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --markdown.
- State model or invariant: The operation_workflow_owner / workflow_progress decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: accept_classified_backpressure.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove or split the single control_plane_publications-p1 persisted_not_dispatched residual; expected local action is advance_existing_operation. | Advance or classify the single control_plane_publications-p1 persisted_not_dispatched workflow residual, reducing the priority recovery witness, migrating owner boundary, or turning rolling-restart green. | npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`
- Success metrics: Advance or classify the single control_plane_publications-p1 persisted_not_dispatched workflow residual, reducing the priority recovery witness, migrating owner boundary, or turning rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`
- Expected delta: Advance or classify the single control_plane_publications-p1 persisted_not_dispatched workflow residual, reducing the priority recovery witness, migrating owner boundary, or turning rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
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

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-priority-recovery-operation-workflow-owner-workflow-progress-after-selected-source-retry.md`
- Forbidden files: runtime/test files remain candidates until review/fix sequencing is clean and implementation scope is promoted.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked --explain priority_recovery_partition_progress`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-selected-source-retry-20260519T064809Z.report.json
