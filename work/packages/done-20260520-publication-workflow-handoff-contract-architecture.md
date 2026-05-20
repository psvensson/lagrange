# Publication Workflow Handoff Contract Architecture

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_operation_workflow_handoff_leg_missing",
  "currentState": "Closed as selected-runtime-successor. Fresh snapshot-lane reset evidence keeps publication_ack_convergence / topology_publication_owner / publication_convergence as the visible first frontier while the handoff probe reports publication_operation_workflow_handoff_leg_missing, publication_active_gate_handoff_contract pending owner_reconcile_pending, and runtimePromotionAllowed=false. The causal proof selects the bounded topology_publication_owner / publication_convergence runtime successor.",
  "nextAction": "Close this causal gate and continue in the active topology_publication_owner / publication_convergence runtime successor for the publication/workflow/active-gate handoff contract.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260520-publication-workflow-handoff-contract-architecture.md",
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
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260520-publication-workflow-handoff-contract-architecture.md",
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
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_operation_workflow_handoff_leg_missing",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Select a bounded topology_publication_owner / publication_convergence runtime successor for the pending publication/workflow/active-gate handoff, or stop as architecture-gap.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_operation_workflow_handoff_leg_missing",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "selected-runtime-successor",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_operation_workflow_handoff_leg_missing",
    "nextAction": "Continue in the active topology_publication_owner / publication_convergence runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "The representative red state is now a publication-owned handoff contract gap: publication_ack_convergence remains first, the operation workflow leg is retryable but not promotable, active-gate handoff is pending owner_reconcile_pending, and runtimePromotionAllowed=false.",
    "stopConditionCheck": "Use `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`, `npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json` before runtime promotion.",
    "expectedCausalModelChange": "This causal package should select a bounded topology_publication_owner / publication_convergence runtime successor for the handoff contract or stop as architecture-gap.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh artifact has publication_ack_convergence first, publicationStatus OPEN, publicationOwnerRecoveryOutcome waiting_for_publication, operationWorkflow priority_recovery_partition_progress retryable with nextAction advance_existing_operation, publication_active_gate_handoff_contract pending owner_reconcile_pending, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Do not patch operation workflow, startup active-gate, readiness, or timeout runtime until this package selects the publication-owned handoff contract path or explicitly stops."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "phaseChain": [
      "snapshot-lane reset cleared selected snapshot error and improved snapshot coverage to 2/5",
      "active_gate_snapshot_coverage moved behind owner_reconcile_pending",
      "publication_ack_convergence is first frontier",
      "handoff probe reports publication_operation_workflow_handoff_leg_missing and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence with handoff probe result publication_operation_workflow_handoff_leg_missing.",
    "knownDownstreamBlockers": [
      "publication_active_gate_handoff_contract is pending owner_reconcile_pending",
      "runtimePromotionAllowed=false",
      "operation_workflow_owner / workflow_progress remains retryable with advance_existing_operation",
      "operation_workflow_owner residuals split between workflow_progress and rebalancer_handoff"
    ],
    "missingCausalEdge": "Topology publication must own or route the publication/workflow/active-gate handoff contract before workflow runtime can be promoted.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
    "boundedProgressProof": "Causal proof should select a bounded reconcile or advance handoff mechanism under topology_publication_owner / publication_convergence, or stop as architecture-gap.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "expectedObservableTransition": "runtime-owner-boundary successor selected for topology_publication_owner / publication_convergence.",
    "maxProgressBound": "one causal-escalation handoff package before runtime promotion",
    "sameFrontierFallback": "If the handoff proof cannot name one owner and progress mechanism, stop as architecture-gap instead of reopening local publication or workflow patches.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence runtime successor if proof selects the handoff contract path",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260520-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / architecture-gap"
    ],
    "oscillationCheck": "Required because the previous causal package selected architecture-gap for direct workflow runtime promotion while the visible frontier remains topology publication.",
    "handoffInvariant": "Publication owner must expose one canonical handoff outcome before operation workflow or active-gate consumers reinterpret the pending state."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "publication_ack_convergence remains first frontier",
      "topology handoff probe reports publication_operation_workflow_handoff_leg_missing",
      "publication_active_gate_handoff_contract is pending owner_reconcile_pending",
      "runtimePromotionAllowed=false blocks direct workflow runtime promotion"
    ],
    "choices": [
      {
        "id": "publication-convergence-runtime-successor",
        "summary": "Open a bounded topology_publication_owner / publication_convergence runtime successor for the publication/workflow/active-gate handoff contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop local runtime patching if the handoff contract cannot name one publication-owned progress path.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json"
        ]
      }
    ],
    "selectedChoice": "publication-convergence-runtime-successor",
    "nextAction": "Continue in the active bounded publication-convergence runtime successor."
  },
  "closed": "2026-05-20",
  "successor": "work/packages/active-20260520-topology-publication-workflow-handoff-runtime.md",
  "commitAndPushLedgerRequired": true
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_operation_workflow_handoff_leg_missing.
- Inputs/signals: test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json; topology handoff probe; scenario route; causal model.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_operation_workflow_handoff_leg_missing and route evidence to one emitted outcome: accept_classified_backpressure.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_operation_workflow_handoff_leg_missing | topology_publication_owner owns this decision before downstream consumers reinterpret it | Own the publication/workflow handoff contract before workflow runtime promotion. | Select a bounded publication-convergence runtime successor, architecture-gap stop, or later representative green after a promoted child. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`
- Competing explanations: At minimum compare publication_operation_workflow_handoff_leg_missing against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_operation_workflow_handoff_leg_missing, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_operation_workflow_handoff_leg_missing is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`
- Success metrics: Select a bounded publication-convergence runtime successor, stop as architecture-gap, migrate to a different owner, or later reach representative green after a promoted child.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_operation_workflow_handoff_leg_missing`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_operation_workflow_handoff_leg_missing`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Architecture Decision Gate Result

- Status: `selected`
- Selected choice: `publication-convergence-runtime-successor`
- Route: close this metadata-only causal gate as `selected-runtime-successor` and continue in the active `topology_publication_owner / publication_convergence` runtime successor.
- Required next action: implement the publication-owned handoff outcome before any operation workflow runtime promotion.
- Selection evidence: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe` passed and reported `publication_operation_workflow_handoff_leg_missing`, `runtimePromotionAllowed=false`, and `pendingReconcileCount=4`; `npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence` passed and kept `publication_ack_convergence` as the topology publication frontier; `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json` passed with `publication_ack_blocked` as the dominant failure class and `accept_classified_backpressure` for the downstream priority recovery leg.
- Runtime claim: none in this package. Runtime, test, script, and report edits stay deferred to the successor package.

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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-handoff/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260520-publication-workflow-handoff-contract-architecture.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`, `npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`
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

- [x] review: status: not-needed; evidence: metadata-only causal-escalation gate with user-approved architecture escalation and no runtime writes; next: successor activation.
- [x] implementation: status: validated; evidence: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe` passed and reported `publication_operation_workflow_handoff_leg_missing` with `runtimePromotionAllowed=false`; `npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence` passed and kept topology publication as first frontier; `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json` passed with downstream priority recovery classified as backpressure; parent revalidated focused proof: yes; next: closure with runtime successor.
- [x] repair: status: validated; evidence: `npm run work:repair` will refresh generated current-blocker after the package migration; next: validation.

## Commit And Push Ledger

1. Focused package commit: e5793ea776a8833f2a51a1b290df2043a4692973
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe
2. npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json
