# Topology Publication Workflow Handoff Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-20",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_operation_workflow_handoff_leg_missing",
  "currentState": "Causal handoff proof selected topology_publication_owner / publication_convergence as the bounded runtime successor. The fresh artifact keeps publication_ack_convergence first, reports publication_operation_workflow_handoff_leg_missing, keeps publication_active_gate_handoff_contract pending owner_reconcile_pending, and blocks direct workflow runtime promotion with runtimePromotionAllowed=false.",
  "nextAction": "Implement the publication-owned handoff contract path so publication convergence exposes the owner outcome needed before workflow runtime promotion.",
  "proof": [
    "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe"
  ],
  "writeScope": [
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "work/packages/done-20260520-publication-workflow-handoff-contract-architecture.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "commitScope": [
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js"
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
      "npm run work:advance -- --check"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_operation_workflow_handoff_leg_missing",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Move publication_operation_workflow_handoff_leg_missing by emitting or preserving the publication-owned handoff outcome, reducing pending reconcile debt, migrating owner boundary, or turning rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_operation_workflow_handoff_leg_missing",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_operation_workflow_handoff_leg_missing",
    "nextAction": "Implement the publication-owned handoff outcome and rerun rolling-restart."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence is not surfacing a durable handoff outcome that reconciles OPEN publication debt with active-gate pending owner reconcile and the retryable operation workflow leg. The publication owner must emit one canonical outcome instead of leaving consumers to reconstruct publication/workflow state.",
    "stopConditionCheck": "Use `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json`, and focused publication evidence tests before runtime edits, then rerun rolling-restart.",
    "expectedCausalModelChange": "The handoff probe or representative rerun should move from publication_operation_workflow_handoff_leg_missing to a reduced publication-owned handoff state, owner-boundary migration, or green rolling-restart.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has publicationStatus OPEN, missingPublishedCount 4, publicationOwnerRecoveryOutcome waiting_for_publication, membershipPublicationHandoffOutcome write_deferred/enqueued, active-gate owner_reconcile_pending pendingReconcileCount 4, and operation workflow retryable advance_existing_operation evidence.",
    "crossBoundaryReview": "Do not patch operation workflow, startup active-gate, readiness, timeout budgets, or analyzer-only routing in this runtime package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json",
    "phaseChain": [
      "snapshot-lane reset reduced active-gate selected snapshot failure",
      "workflow runtime promotion was blocked by runtimePromotionAllowed=false",
      "publication/workflow handoff causal gate selected topology_publication_owner / publication_convergence",
      "runtime package now owns the publication evidence handoff outcome"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence with handoff probe result publication_operation_workflow_handoff_leg_missing.",
    "knownDownstreamBlockers": [
      "publication_active_gate_handoff_contract pending owner_reconcile_pending",
      "membershipPublicationHandoffOutcome write_deferred and enqueued",
      "activeGateOwnerCohort missingPublishedCount 4",
      "operation_workflow_owner workflow_progress retryable advance_existing_operation"
    ],
    "missingCausalEdge": "Publication convergence must emit one owner outcome for the publication/workflow/active-gate handoff instead of leaving direct workflow promotion blocked.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "boundedProgressProof": "Focused tests should prove the publication owner aligns stale OPEN debt with active-gate handoff evidence and emits the structured reconcile/defer outcome.",
    "boundedProgressProofArtifact": "src/control-plane/publication-recovery-evidence.js and focused publication evidence tests",
    "expectedObservableTransition": "publication_operation_workflow_handoff_leg_missing reduces, pending reconcile debt shrinks, owner boundary migrates, or rolling-restart turns green.",
    "maxProgressBound": "one topology_publication_owner / publication_convergence runtime slice before representative rerun",
    "sameFrontierFallback": "If focused proof passes but representative evidence returns unchanged publication_operation_workflow_handoff_leg_missing with no metric reduction, stop for architecture instead of another local publication patch.",
    "expectedNextFrontier": "representative-green, reduced publication handoff debt, or owner-boundary migration",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / architecture-gap",
      "work/packages/done-20260520-publication-workflow-handoff-contract-architecture.md / topology_publication_owner / publication_convergence / selected-runtime-successor"
    ],
    "oscillationCheck": "Allowed because the active causal package selected this publication runtime successor and blocked direct workflow promotion.",
    "handoffInvariant": "Publication owner emits the handoff outcome; operation workflow and active-gate consumers consume it without reproducing publication debt logic."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "publication_ack_convergence remains first frontier",
      "publication_operation_workflow_handoff_leg_missing is reported by the handoff probe",
      "runtimePromotionAllowed=false blocks direct workflow runtime edits",
      "publication/workflow causal gate selected topology_publication_owner / publication_convergence"
    ],
    "choices": [
      {
        "id": "publication-owned-handoff-runtime",
        "summary": "Implement one bounded publication-convergence runtime slice for the handoff outcome.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop if the publication evidence path cannot own the handoff without changing workflow or active-gate runtime contracts.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "publication-owned-handoff-runtime",
    "nextAction": "Implement the bounded publication evidence handoff slice and rerun rolling-restart."
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_operation_workflow_handoff_leg_missing.
- Inputs/signals: test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json; topology handoff probe; focused publication evidence tests.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_operation_workflow_handoff_leg_missing and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_operation_workflow_handoff_leg_missing | topology_publication_owner owns this decision before downstream consumers reinterpret it | Implement the publication-owned handoff contract path selected by the causal gate. | Reduce missing handoff evidence, shrink pending reconcile debt, migrate owner boundary, or turn rolling-restart green. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe |
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
- Success metrics: Reduce publication_operation_workflow_handoff_leg_missing, reduce pending reconcile debt, migrate owner boundary, or turn rolling-restart green.
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
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
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
- Owned files: `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/distributed/harness/publication-evidence-contract.js`, `test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
- Forbidden files: operation workflow runtime, startup active-gate runtime, readiness runtime, timeout budgets
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe`
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

## Execution Evidence

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [ ] review: status: not-needed; evidence: lane permits direct implementation or package review found no required fix; next: implementation.
- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js
2. node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-lane-reset-close-20260520T055140Z.report.json --handoff-probe
