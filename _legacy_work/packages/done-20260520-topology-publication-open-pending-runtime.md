# Topology Publication Owner Reconcile Drain Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative rerun after the selected snapshot fallback patch reduced active-gate coverage from selected source timeout 0/5 to repair-deferred 3/5, but rolling-restart remains red at publication_ack_convergence. Canonical probes report operation workflow and priority recovery satisfied with residual witnesses 0, while publication remains OPEN at epoch 2 with pendingAckCount 0, missingPublishedCount 2, owner_reconcile_pending for 11601fe0-72d6-5853-8590-ec2881853e72 and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58, and membershipPublicationHandoffOutcome write_deferred/enqueued/retryAfterMs=1000.",
  "nextAction": "Implement one bounded topology_publication_owner / publication_convergence fix for the owner-reconcile publication drain path so the accepted write_deferred handoff either makes reconcile progress or preserves structured retry state, without changing active-gate admission, query correctness policy, guardrails, timeout budgets, startup readiness, or operation workflow ownership.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --markdown",
    "npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/workflow/owner-key-reconcile-queue.test.js",
    "npm test -- test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "writeScope": [
    "work/packages/done-20260520-topology-publication-open-pending-runtime.md",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-operation-workflow-handoff-20260520T082322Z.report.json",
    "test-output/reports/rolling-restart-publication-evidence-contract-20260520T084257Z.report.json",
    "test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/cluster-segment-7.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260520-topology-publication-open-pending-runtime.md",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "topology-publication-owner-reconcile-drain/current-frontier-migration",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "write scope expands beyond publication owner reconcile drain, prior already-touched owner tests, or focused harness proof",
      "fresh representative evidence returns the same publication_pending shape with no reconcile, missing-published, or handoff metric reduction"
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
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Canonical probes migrated the owner boundary back to topology_publication_owner / publication_convergence after snapshot coverage moved; the runtime-owner-boundary write slice stays inside publication owner reconcile drain and focused owner proof."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Reduce pendingReconcileCount, missingPublishedCount, or write_deferred owner handoff debt; migrate owner boundary; or turn rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair refreshes current-blocker and Current Edge Card",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Repair owner-reconcile publication drain so accepted write_deferred handoff debt makes progress or remains explicitly retryable."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Fresh representative rerun moved snapshot coverage from selected timeout 0/5 to repair-deferred 3/5, after which canonical evidence selected publication_ack_convergence with publication_pending.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --markdown"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence remains OPEN because the accepted owner-reconcile write_deferred handoff does not drain the two remaining publication owner reconcile nodes or expose structured retry state strongly enough for the publication producer to close or reduce the debt.",
    "stopConditionCheck": "Use `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json`, and focused publication owner reconcile/drain tests before representative rerun.",
    "expectedCausalModelChange": "The next proof should reduce pendingReconcileCount, missingPublishedCount, or write_deferred handoff debt; migrate to startup active-gate snapshot coverage/readiness; or turn rolling-restart green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json reports publication_ack_convergence first, publicationStatus OPEN, pendingAckCount 0, missingPublishedCount 2, handoff pendingReconcileCount 2, membershipPublicationHandoffOutcome write_deferred/enqueued, snapshotCoverage 3/5, and one priority recovery residual at operation_workflow_owner / workflow_progress for control_plane_publications-p1.",
    "crossBoundaryReview": "User pre-approved architectural escalation on 2026-05-20. Canonical rerun evidence moved startup_active_gate_owner / snapshot_coverage from selected source timeout to reduced coverage and selected topology_publication_owner / publication_convergence as the next local runtime boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "phaseChain": [
      "publication workflow handoff runtime cleared publication_operation_workflow_handoff_leg_missing",
      "publication pending normalization narrowed stale missing-published evidence and closed the prior ACK blocker",
      "startup active-gate owner-reconcile no-ACK handoff fix improved snapshot coverage 2/5 to 3/5",
      "publication evidence contract fix cleared publication convergence and priority recovery invariants",
      "selected snapshot fallback patch moved snapshot coverage from 0/5 timeout to 3/5 repair-deferred",
      "fresh representative evidence returns to topology_publication_owner / publication_convergence / publication_pending with two owner-reconcile nodes"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json after snapshot coverage improved to 3/5 and priority residual witnesses stayed at zero.",
    "knownDownstreamBlockers": [
      "publicationStatus=OPEN at epoch 2",
      "missingPublishedCount=2",
      "publicationActiveGateHandoffPendingReconcileCount=2",
      "membershipPublicationHandoffOutcome=write_deferred/enqueued/retryAfterMs=1000",
      "snapshotCoverage=3/5 with repair_deferred stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "Publication owner must drain or preserve structured retry state for the accepted owner-reconcile handoff instead of leaving the publication producer OPEN with write_deferred debt.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "boundedProgressProof": "Focused proof must show publication owner reconcile drain success or structured retry preservation; representative proof must show reduced publication debt, owner-boundary migration, green, or architecture stop.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json",
    "expectedObservableTransition": "Fresh representative evidence reduces pendingReconcileCount, missingPublishedCount, or write_deferred handoff debt; migrates to active-gate/readiness; or turns rolling-restart green.",
    "maxProgressBound": "one topology_publication_owner / publication_convergence runtime slice before another same-frontier publication successor",
    "sameFrontierFallback": "If fresh representative evidence returns the same publication_pending shape with unchanged reconcile and handoff debt, stop for architecture or human escalation instead of another local patch.",
    "expectedNextFrontier": "reduced publication handoff debt, owner-boundary migration, representative-green, architecture-gap, or human stop",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260520-topology-publication-remaining-pending-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-startup-active-gate-owner-reconcile-pending-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "The frontier migrated from active-gate snapshot coverage back to publication convergence after concrete snapshot coverage progress; this package must prove reconcile reduction/progress, migration, green, or architecture stop before another same-frontier publication patch.",
    "handoffInvariant": "Publication owner owns owner-reconcile publication debt; startup active gate and operation workflow owners remain producers/consumers and must not be reinterpreted by the publication drain fix."
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

Rolling-restart moved past the selected-source timeout, but the first frontier is publication convergence again. Canonical evidence points at a two-node owner-reconcile write-deferred handoff, so this package owns one bounded topology_publication_owner / publication_convergence runtime slice.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence drains the accepted owner-reconcile handoff or preserves a structured retryable drain outcome for the remaining publication debt.
- Inputs/signals: test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe; npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json; focused publication owner reconcile/drain tests.
- State model or invariant: Publication convergence owns OPEN publication debt and handoff retry state; active-gate and operation workflow consumers must not reconstruct or bypass publication owner state locally.
- Non-goals and forbidden interpretations: Do not change active-gate admission, operation workflow ownership, guardrails, timeout budgets, startup readiness, or query correctness policy to mask the blocker.
- Proof mapping: Focused tests prove the publication owner reconcile/drain path; the representative rerun must show reduced publication debt, frontier migration, or green.
- Wrong-slice trigger: Stop or split if the fix needs active-gate admission relaxation, operation workflow rewrites, startup readiness changes, query retry policy changes, timeout changes, or another owner boundary.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | Publication owner owns OPEN publication debt and write_deferred owner-reconcile handoff progress. | Implement one bounded publication owner reconcile/drain fix. | Reduce pendingReconcileCount, missingPublishedCount, or write_deferred handoff debt; migrate owner boundary; or turn rolling-restart green. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe |
| scope boundary | publication owner reconcile/drain path and focused owner tests | proof that needs active-gate admission, operation workflow, startup readiness, query retry policy, timeout, or guardrail scope means this package is the wrong slice | stop, split, or architecture/human escalation | no widened runtime scope outside the selected publication owner | npm run work:advance -- --check |

- Anti-symptom rationale: This package fixes publication-owned reconcile drain/retry state; it does not admit nodes by ignoring missing coverage or changing timeout/query policy.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe`
- Competing explanations: At minimum compare owner recovery queue drain, membership publication coordinator retry, stale evidence projection, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Why does publication convergence stay OPEN when the accepted owner-reconcile handoff is enqueued for two missing published nodes?
- Architecture review: Canonical probes migrated this package back to topology_publication_owner / publication_convergence after snapshot coverage moved; runtime edits stay in that boundary.
- Competing hypotheses: owner recovery queue drain loses retry state; membership publication coordinator does not retry accepted handoff debt; publication evidence is stale after a successful drain; another owner boundary owns the remaining blocker.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe`
- Success metrics: reduce pendingReconcileCount, missingPublishedCount, or write_deferred handoff debt; migrate to active-gate/readiness; or turn rolling-restart green.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-publication-drain-20260520TNNNNNNZ.report.json --fast-local --verbose`
- Kill rule: If fresh representative evidence returns the same publication_pending shape with unchanged reconcile and handoff debt, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json`
- Expected delta: Reduce pendingReconcileCount, missingPublishedCount, or write_deferred handoff debt; migrate owner boundary; or turn rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same publication_pending plus unchanged reconcile and handoff debt triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json`
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
- Runtime promotion rule: The runtime-owner-boundary write slice stays inside topology_publication_owner / publication_convergence after canonical probes selected that boundary.

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

1. Bounded topology_publication_owner / publication_convergence runtime repair for owner-reconcile drain/retry handling.
2. Focused tests and representative evidence that show publication debt reduction, frontier migration, or rolling-restart green.

## Out Of Scope

1. Operation workflow, active-gate admission, startup readiness, query retry policy, guardrail, or timeout changes.
2. Local reconstruction of publication debt outside the topology publication owner.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `topology-publication-owner-reconcile-drain/current-frontier-migration`
- Output profile: `medium`
- Owned files: active package plus declared publication owner reconcile/drain runtime path, prior already-touched owner files, and focused tests.
- Forbidden files: operation workflow rewrites, active-gate admission relaxation, startup readiness changes, query retry policy changes, guardrail weakening, and timeout expansion.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: proof needs another owner boundary, fresh representative evidence returns unchanged publication reconcile debt, or write scope expands outside the declared runtime slice.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe`, `npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/workflow/owner-key-reconcile-queue.test.js`
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

- [x] implementation: status: validated; evidence: focused publication proof passed, fresh representative rerun `test-output/reports/rolling-restart-publication-deferred-drain-20260520T104514Z.report.json` moved the required next owner path to `operation_workflow_owner / workflow_progress`, and canonical analyzers reported one priority recovery residual; parent revalidated focused proof: yes; next: migrate to `work/packages/superseded-20260520-priority-recovery-operation-workflow-owner-workflow-progress.md`.

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: not-needed; evidence: lane permitted direct implementation after owner-boundary route was validated; next: implementation.
- [x] implementation: status: validated; evidence: focused proofs passed with `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js`, `npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/workflow/owner-key-reconcile-queue.test.js`, and prior package proofs; representative rerun `test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json` moved publication to PUBLISHED with pendingAckCount 0 and missingPublishedCount 0; parent revalidated focused proof: yes; next: successor action.
- [x] repair: status: validated; evidence: successor package `work/packages/superseded-20260520-rolling-restart-join-service-shortcut-retry.md` opened from the migrated representative frontier; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json --handoff-probe
3. npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/workflow/owner-key-reconcile-queue.test.js
4. npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-coverage-fallback-20260520T085629Z.report.json
