# Topology Publication Remaining Pending Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh rolling-restart evidence cleared publication_operation_workflow_handoff_leg_missing and satisfied operation workflow, but publication_ack_convergence remains first frontier with dominant reason publication_pending. The handoff probe narrows active-gate owner reconcile debt to two nodes while the publication producer still reports four missing published nodes, so the next slice is a user-approved causal-escalation handoff package before another local runtime patch.",
  "nextAction": "Align publication convergence evidence with the remaining owner-reconcile publication pending state and rerun rolling-restart.",
  "proof": [
    "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown"
  ],
  "writeScope": [
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json"
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
      "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
      "node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
      "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Reduce publication_pending debt, migrate the owner boundary, or turn rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Use the causal-escalation handoff route to decide the publication producer/active-gate reconcile state before another runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The previous publication-owned handoff slice moved the missing workflow handoff edge, but the remaining publication_pending debt is a cross-boundary publication producer to active-gate handoff mismatch: active-gate owner reconcile debt is narrowed to two nodes while the publication producer still reports four missing published nodes.",
    "stopConditionCheck": "Use `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json`, and focused publication evidence tests before runtime edits.",
    "expectedCausalModelChange": "The next proof should align publication producer missing-published/pending state with active-gate owner reconcile handoff evidence, then either reduce publication_pending, migrate to startup active-gate snapshot coverage, or turn rolling-restart green.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh artifact reports publication_ack_convergence first frontier with publication_pending, producer missingPublishedCount 4, handoffContract pendingReconcileCount 2, activeGateOwnerCohortMissingPublishedCount 2, membershipPublicationHandoffOutcome write_deferred/enqueued, operationWorkflow satisfied, and snapshotCoverage 3/5.",
    "crossBoundaryReview": "User pre-approved architectural escalation on 2026-05-20. This package may inspect publication producer and active-gate handoff evidence, but must not patch operation workflow runtime, startup active-gate runtime, readiness runtime, or timeout budgets."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json",
    "phaseChain": [
      "snapshot-lane reset reduced selected snapshot failure and moved coverage to 2/5",
      "publication workflow handoff runtime cleared publication_operation_workflow_handoff_leg_missing and satisfied operation workflow",
      "fresh handoff probe narrows active-gate owner reconcile debt to two nodes",
      "publication producer still reports publication_pending with four missing published nodes"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending remains first frontier after the prior handoff edge cleared.",
    "knownDownstreamBlockers": [
      "publication_active_gate_handoff_contract pending owner_reconcile_pending with pendingReconcileCount 2",
      "activeGateOwnerCohortMissingPublishedCount 2",
      "membershipPublicationHandoffOutcome write_deferred and enqueued",
      "startup_active_gate_owner snapshot_coverage deferred at 3/5"
    ],
    "missingCausalEdge": "Publication convergence must normalize the remaining OPEN publication debt against active-gate owner reconcile handoff evidence before startup active-gate consumers can be selected.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "boundedProgressProof": "Focused tests must prove the publication producer and harness wrapper expose the narrowed owner-reconcile publication pending state instead of stale broad missing-published debt.",
    "boundedProgressProofArtifact": "src/control-plane/publication-recovery-evidence.js and test/distributed/harness/publication-evidence-contract.js",
    "expectedObservableTransition": "Fresh representative evidence reduces publication_pending, migrates to startup_active_gate_owner / snapshot_coverage, or turns rolling-restart green.",
    "maxProgressBound": "one causal-escalation handoff package before another same-frontier publication runtime successor",
    "sameFrontierFallback": "If fresh representative evidence returns publication_pending with no concrete metric reduction, stop as architecture-gap or human escalation instead of another local patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage, reduced publication_pending, representative-green, architecture-gap, or human stop",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260520-rolling-restart-publication-recovery-evidence-consistency.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-rolling-restart-harness-publication-pending-wrapper.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260520-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260520-topology-publication-workflow-handoff-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "The frontier returned to topology_publication_owner / publication_convergence after adjacent publication and startup active-gate fixes; this package is the required causal-escalation handoff and the user pre-approved architectural escalation while pursuing green rolling-restart.",
    "handoffInvariant": "Publication owner emits one normalized publication pending outcome and active-gate consumers consume it without reconstructing publication debt."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "direct activation as runtime-owner-boundary was refused by the tracker because the frontier returned to a recently closed related boundary",
      "publication_operation_workflow_handoff_leg_missing is cleared while publication_pending remains first frontier",
      "handoffContract pendingReconcileCount is 2 but producer missingPublishedCount remains 4",
      "user pre-approved architectural escalation while pursuing green rolling-restart"
    ],
    "choices": [
      {
        "id": "publication-pending-causal-handoff",
        "summary": "Continue inside a causal-escalation handoff package and align publication producer evidence with active-gate owner reconcile handoff state.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "startup-active-gate-migration",
        "summary": "Migrate only if focused proof or representative evidence shows publication pending is bounded and startup snapshot coverage is first executable owner.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop local runtime patching if the publication producer and active-gate handoff cannot be reconciled within this owner boundary.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json"
        ]
      }
    ],
    "selectedChoice": "publication-pending-causal-handoff",
    "nextAction": "Proceed with the causal-escalation handoff proof and the narrow publication evidence implementation surface."
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the tracker detected frontier oscillation after the handoff edge cleared, and this package must own the publication producer to active-gate handoff decision before another local runtime patch.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json; npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js; node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe; npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix through the selected causal-escalation handoff route.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Align publication convergence evidence with the remaining owner-reconcile publication pending state and rerun rolling-restart. | Reduce publication_pending debt, migrate the owner boundary, or turn rolling-restart green. | npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
- Success metrics: Reduce publication_pending debt, migrate the owner boundary, or turn rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json`
- Expected delta: Reduce publication_pending debt, migrate the owner boundary, or turn rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json`
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

1. src/control-plane/publication-recovery-evidence.js
2. test/control-plane/publication-recovery-evidence.test.js
3. test/distributed/harness/publication-evidence-contract.js
4. test/distributed/harness/__tests__/publication-evidence-open-membership.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-handoff/current-frontier`
- Output profile: `medium`
- Ambiguity score: `3`
- Owned files: `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/distributed/harness/publication-evidence-contract.js`, `test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
- Forbidden files: operation workflow runtime, startup active-gate runtime, readiness runtime, timeout budgets
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown`
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
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --handoff-probe
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-workflow-handoff-runtime-20260520T062923Z.report.json --markdown
