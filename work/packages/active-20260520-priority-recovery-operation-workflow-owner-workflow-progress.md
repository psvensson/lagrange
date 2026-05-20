# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Causal proof is complete for the fresh snapshot-lane reset artifact. The residual is split across operation_workflow_owner / workflow_progress and operation_workflow_owner / rebalancer_handoff, the topology handoff probe reports runtimePromotionAllowed=false with publication_active_gate_handoff_contract pending owner_reconcile_pending, and the causal model keeps publication_ack_convergence as the failed invariant. Direct workflow runtime promotion is blocked until the publication/workflow handoff contract is owned.",
  "nextAction": "Close or park this direct workflow runtime successor as architecture-gap for runtime promotion, then open the publication/workflow handoff contract package before any operation_workflow_owner runtime edit.",
  "proof": [
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json"
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
    "work/packages/active-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-handoff/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:advance -- --check"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify the cross-boundary publication/workflow handoff from the fresh snapshot-lane reset artifact; either promote a bounded workflow_progress runtime child, split rebalancer_handoff, or stop as architecture-gap/human escalation.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker state with npm run work:current-blocker -- --write or npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Classify the two workflow_progress witnesses before runtime promotion; rebalancer_handoff remains a split candidate behind workflow_progress."
  },
  "causalGovernance": {
    "hypothesis": "The snapshot-lane reset fix reduced startup active-gate debt and exposed cross-boundary publication/workflow backpressure. The next bounded progress mechanism is likely operation_workflow_owner / workflow_progress advance_existing_operation for the dispatch_pending planned REPLACE operation, but the first visible frontier remains publication_ack_convergence and the residuals split across workflow_progress and rebalancer_handoff.",
    "stopConditionCheck": "Use `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json` before any runtime promotion.",
    "expectedCausalModelChange": "Causal proof selects architecture-gap for direct workflow runtime promotion: the next bounded work must own the publication/workflow handoff contract before workflow_progress runtime edits can be promoted.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh artifact reports publication_ack_convergence first frontier, publication_pending dominant reason, active_gate_snapshot_coverage deferred with selectedSnapshotError cleared and snapshotCoverageNodeCount=2, workflow_progress residuals on control_plane_publications-p1 and sql_transaction_participants-p1, one rebalancer_handoff residual on control_plane_publications-p1, publication_active_gate_handoff_contract pending owner_reconcile_pending, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Do not patch topology publication, startup active-gate, readiness, or operation workflow runtime again until this causal package records why the selected residual is the owner path and what child package owns the executable fix."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "phaseChain": [
      "harness publication wrapper moved publication evidence earlier",
      "selected snapshot retry moved the active-gate snapshot error from 100ms to 3000ms",
      "snapshot-lane reset closure cleared the selected snapshot error and improved snapshot coverage from 0/5 to 2/5",
      "fresh evidence now shows publication_ack_convergence first frontier with operation_workflow_owner residuals"
    ],
    "currentFirstFrontier": "publication_ack_convergence is the visible first frontier, while priority_recovery_partition_progress is the actionable next owner path for operation_workflow_owner / workflow_progress with required action advance_existing_operation.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress has two recovering_in_flight witnesses: control_plane_publications-p1 and sql_transaction_participants-p1",
      "operation_workflow_owner / rebalancer_handoff has one recovering_in_flight witness on control_plane_publications-p1",
      "topologyOperatorCurrentStepId=dispatch_pending",
      "topologyOperatorCurrentStepState=planned",
      "topologyOperatorNextAction=advance_existing_operation"
    ],
    "missingCausalEdge": "Decide whether workflow_progress owns the next executable runtime child or whether the split residual requires an architecture stop or rebalancer_handoff successor before runtime promotion.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown",
    "boundedProgressProof": "Causal proof selected an architecture-gap stop for the bounded advance mechanism because runtimePromotionAllowed=false; no runtime edit belongs in this causal package.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "expectedObservableTransition": "architecture-gap stop for direct workflow runtime promotion, followed by a publication/workflow handoff contract package.",
    "maxProgressBound": "one causal-escalation handoff package before runtime promotion",
    "sameFrontierFallback": "If causal proof cannot distinguish workflow_progress from publication or rebalancer_handoff, stop as architecture-gap instead of opening another local runtime patch.",
    "expectedNextFrontier": "publication/workflow handoff contract ownership before operation_workflow_owner / workflow_progress runtime promotion",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260520-rolling-restart-publication-recovery-evidence-consistency.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-rolling-restart-harness-publication-pending-wrapper.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/active-20260520-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Tracker activation detected adjacent publication and active-gate owner fixes without green rolling-restart; this package is the required cross-boundary handoff before another runtime patch.",
    "handoffInvariant": "Preserve the snapshot-lane reset improvement and do not reopen topology publication or startup active-gate runtime unless fresh causal evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh artifact moved active_gate_snapshot_coverage out of first frontier but did not turn rolling-restart green",
      "visible route is topology_publication_owner / publication_convergence while nextOwnerPath points at operation_workflow_owner / workflow_progress",
      "priority recovery residual extraction split the remaining witnesses between workflow_progress and rebalancer_handoff",
      "work tracker refused direct runtime activation and required a causal-escalation handoff"
    ],
    "choices": [
      {
        "id": "workflow-progress-runtime-child",
        "summary": "Promote one bounded operation_workflow_owner / workflow_progress runtime child for dispatch_pending planned operation advancement.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "split-rebalancer-handoff",
        "summary": "Split the rebalancer_handoff witness before runtime promotion if workflow_progress is not the executable first child.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop local runtime patching if causal proof cannot separate publication convergence, workflow progress, and handoff responsibility.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json"
        ]
      }
    ],
    "selectedChoice": "architecture-gap-stop",
    "nextAction": "Open the publication/workflow handoff contract package before direct workflow runtime promotion."
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
- Inputs/signals: test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json; priority residual extraction; topology handoff probe; causal-model analysis; owner-file discovery from the workflow-progress boundary.
- State model or invariant: The operation_workflow_owner / workflow_progress decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: accept_classified_backpressure.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove or split the cross-boundary workflow residual before runtime promotion. | Select a bounded advance child, split rebalancer_handoff, migrate, or stop as architecture-gap/human escalation. | npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown`
- Success metrics: Select a bounded workflow-progress advance child, split the rebalancer_handoff witness, migrate to a different owner, stop as architecture-gap/human escalation, or later reach representative green after a promoted child.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
- Expected delta: Classify the cross-boundary publication/workflow handoff and select a bounded advance child, split rebalancer_handoff, migrate, or stop.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-handoff/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
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

- [ ] review: status: not-needed; evidence: lane permits direct implementation or package review found no required fix; next: implementation.
- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --markdown
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json
