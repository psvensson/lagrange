# Rolling Restart Owner Recovery Queue Drain Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_owner_recovery_queue_drain",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Architecture discriminator selected owner-recovery queue drain/wake progress: ownerRecoveryQueue is observed with pendingWrites=1 and handoffOutcome write_deferred/enqueued=true/retryAfterMs=100, but pendingWriteGrowthCount=0, pendingReconcileCount=0, and snapshotCoverage=1/5 remain stuck.",
    "nextAction": "Make the queued owner-recovery write produce bounded reconcile, wake, retry, or drain progress before active-gate snapshot coverage repeats.",
    "predecessor": "work/packages/done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
    "closed": "2026-05-28",
    "successor": "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "work/packages/done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "src/admin/admin-control-snapshot-class-part-5.js",
      "src/logging/logs-table-service.js"
    ],
    "commitScope": [
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This is the concrete runtime contract selected by the architecture discriminator after ACK debt closed: the owner queue exists and is enqueued, but no drain/wake/reconcile progress appears before active-gate timeout.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "implementation needs selected-source ordering changes instead of owner queue progress",
      "implementation needs generic timeout, readiness, admin API, transport, table bootstrap, or promotion gate edits",
      "focused proof shows queued owner recovery already drains or wakes before this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: focused contract fixture for owner_recovery_queue_drain transition from write_deferred/enqueued=true/pendingWrites=1 to drain/wake/reconcile progress: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
        "regression: affected consumer proof for selected-source repair remains downstream while owner queue progress is required: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-control-snapshot-recovery.js",
        "supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
        "supporting: fresh representative route after focused proof: bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-owner-recovery-queue-drain-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output \"$REPORT\" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact \"$REPORT\" --package work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md'"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
        "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
        "work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
        "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
        "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "progressContract": {
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_owner_recovery_queue_drain",
    "state": "owner_reconcile_pending",
    "reason": "active_gate_timed_out",
    "nextAction": "drain_or_wake_owner_recovery_queue",
    "wakeSource": "active-gate",
    "retryAfterMs": 100,
    "terminalState": "satisfied",
    "evidencePath": "failureBundle.publicationConvergence.activeGate.progress",
    "blockingDependency": "owner_queue_pending_writes_without_growth_or_reconcile_progress"
  },
  "mechanismCard": {
    "failureMechanism": "transition_gap",
    "stableFacts": "startup_active_gate_owner / snapshot_coverage remains the route; snapshotCoverage=1/5, owner_reconcile_pending, write_deferred, pendingRecoveryCount=1, pendingReconcileCount=0, and selected snapshot timeout persist.",
    "changedFacts": "Compared with the admission package, owner recovery is now enqueued=true and ownerRecoveryQueue.depth.state=observed with pendingWrites=1.",
    "rejectedAlternatives": "ACK eligibility is rejected; enqueue/admission is no longer the missing edge; selected-source ordering and timeout budgets remain downstream while queued owner recovery has no drain/wake progress.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Active gate records a queued owner-recovery write but times out before reconcile, wake, retry, or coverage progress is observed.",
    "missingTransitionOrObservation": "The queued owner-recovery write must drain, wake, retry, or convert to reconcile progress before active-gate snapshot coverage repeats.",
    "smallestFalsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
    "expectedMovement": "Focused proof observes queue drain/wake/reconcile progress; representative clears owner_reconcile_pending, moves snapshotCoverage beyond 1/5, migrates, or passes.",
    "negativeResultMeans": "If queued owner recovery already drains or cannot move coverage in scope, stop as architecture-gap instead of editing selected-source or timeout scope.",
    "escalationRule": "Same-frontier representative evidence with pendingWrites=1, pendingWriteGrowthCount=0, pendingReconcileCount=0, and coverage 1/5 stops local runtime patching."
  },
  "boundedExperiment": {
    "hypothesis": "Rolling-restart remains red because the enqueued owner-recovery write is not drained or woken into reconcile / snapshot coverage progress before active-gate timeout.",
    "hypothesisDiscriminator": "H1 if focused proof fails until the owner-recovery queue path emits drain/wake/reconcile progress for write_deferred/enqueued=true/pendingWrites=1; H2 if proof shows the queue already drains and the first frontier belongs elsewhere.",
    "expectedMetric": "pendingWriteGrowthCount, pendingReconcileCount, owner_reconcile_pending, selected recovery projection, snapshotCoverageNodeCount, or representative route movement.",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner-handoff proof, selected-source regression, runtime grammar, representative route-after-rerun, current-blocker repair, and closure validation",
    "killRule": "Do not edit selected-source ordering, generic timeouts, readiness, admin API, transport, table bootstrap, or promotion gates unless focused proof migrates owner boundary."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "owner-boundary-migration",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json"
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Classify priority recovery residuals before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "The first blocking edge is owner-recovery queue drain/wake progress after write_deferred/enqueued=true handoff evidence.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json plus npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "expectedCausalModelChange": "Focused proof passed and representative route moved off startup active-gate owner recovery to priority recovery workflow progress.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence reports active nodes 5/5, snapshotCoverage=3/5, publication OPEN, pendingAck=1, and priority_recovery_partition_progress with splitRequired=true.",
    "crossBoundaryReview": "Keep startup active-gate owner recovery, selected-source ordering, generic timeout budgets, startup readiness, admin API, transport, table bootstrap, and promotion gates frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart owner recovery queue drain runtime",
    "phaseChain": [
      "pending ACK/recovery eligibility was falsified as active blocker",
      "architecture discriminator selected owner-recovery queue drain/wake progress",
      "this package implemented the selected runtime owner-boundary contract and moved representative evidence"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "selected-source timeout remains downstream until queued owner recovery progresses",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "table bootstrap remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Observed owner-recovery pendingWrites=1 must drain, wake, retry, or become reconcile progress before coverage repeats.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
    "boundedProgressProof": "Focused proof must show drain, wake, retry, or reconcile progress for write_deferred/enqueued=true owner recovery while active-gate remains blocked until coverage progress is safe.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "expectedObservableTransition": "queued owner recovery emits drain/wake/reconcile progress, owner_reconcile_pending clears, snapshotCoverage moves beyond 1/5, route migrates, or rolling-restart passes",
    "maxProgressBound": "one runtime-owner-boundary package and one representative rerun before architecture escalation",
    "sameFrontierFallback": "same-frontier with no queue or coverage movement opens architecture-gap stop instead of another local runtime patch",
    "expectedNextFrontier": "operation workflow priority recovery classification",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-owner-reconcile-admission-runtime.md / startup_active_gate_owner / snapshot_coverage_owner_reconcile_admission_contract / reduced",
      "done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md / startup_active_gate_owner / snapshot_coverage / same-frontier-h1-falsified",
      "done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "This package is the selected runtime child, not another classifier; same-frontier evidence after this child escalates.",
    "handoffInvariant": "Runtime promotion remains false until owner recovery queue progress makes snapshot coverage safe."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage_owner_recovery_queue_drain",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Focused owner-recovery queue proof passed, and fresh representative rolling-restart evidence moved all nodes active, moved snapshotCoverage from 1/5 to 3/5, and selected priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "architecture discriminator selected owner-recovery queue drain/wake progress",
      "latest handoff probe reports pendingWrites=1, pendingWriteGrowthCount=0, pendingReconcileCount=0, enqueued=true, and snapshotCoverage=1/5"
    ],
    "selectedChoice": "owner-recovery-queue-drain-runtime",
    "choices": [
      {
        "id": "owner-recovery-queue-drain-runtime",
        "summary": "Implement the selected runtime-owner-boundary drain/wake contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js"
        ]
      }
    ],
    "nextAction": "Execute the selected runtime proof and representative rerun."
  },
  "observablePrediction": {
    "metric": "owner recovery queue drain/wake progress and snapshot coverage movement",
    "predicted": "Focused proof should fail until write_deferred/enqueued=true/pendingWrites=1 owner recovery produces drain, wake, retry, or reconcile progress; representative should clear owner_reconcile_pending, move coverage beyond 1/5, migrate, or pass.",
    "observed": "Focused proof passed for write_deferred/enqueued=true/pendingWrites=1 owner recovery; representative rerun moved active nodes to 5/5, snapshotCoverage to 3/5, and migrated to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "metricDelta": 2
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "Classify whether priority recovery residuals need rerun evidence, runtime workflow progress work, or architecture escalation.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --package work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md --successor work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single selected owner-boundary runtime implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, proof, and kill rule stay as declared",
      "the executor only changes owner-recovery queue drain/wake behavior and affected focused tests",
      "runtime promotion stays false until coverage progress is safe"
    ],
    "splitTriggers": [
      "write scope expands beyond selected owner-recovery queue files/tests",
      "proof needs selected-source ordering, timeouts, readiness, admin API, transport, table bootstrap, or promotion gates",
      "representative evidence routes away before implementation"
    ],
    "childPackageCandidates": [
      "Split test-only additions if runtime behavior is already correct.",
      "Open causal escalation if representative repeats same-frontier with no queue or coverage movement."
    ]
  },
  "commitAndPushLedgerRequired": true,
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
      "work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  }
}
-->

## Why

The architecture discriminator selected a concrete local contract: owner recovery is now enqueued and visible in the owner queue, but it does not drain or wake into reconcile / snapshot coverage progress before active-gate timeout.

## Mechanism Card

- Failure Mechanism: `transition_gap`.
- Stable Facts: `owner_reconcile_pending`, `write_deferred`, `pendingRecoveryCount=1`, `pendingReconcileCount=0`, and `snapshotCoverage=1/5`.
- Changed Facts: `enqueued=true` and `pendingWrites=1` are now visible, so admission is not the missing edge.
- Rejected Alternatives: ACK eligibility, enqueue admission, selected-source ordering, and timeout budget changes are not selected.
- Owner Who Decides: `startup_active_gate_owner`.
- Current Action: active gate waits while queued owner recovery does not become reconcile or coverage progress.
- Missing Transition Or Observation: drain, wake, retry, or reconcile progress from the queued owner-recovery write.
- Smallest Falsifying Probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`.
- Expected Movement: focused queue progress proof passes and representative coverage, owner, or route moves.
- Negative Result Means: stop as architecture-gap rather than broadening runtime scope.
- Escalation Rule: no second local runtime patch if queue and coverage metrics stay unchanged.

## Core Logic Brief

- Canonical outcome: queued owner recovery emits bounded drain/wake/reconcile progress before active-gate snapshot coverage retries.
- Inputs/signals: handoff probe ownerRecoveryQueue, membershipPublicationHandoffOutcome, selected snapshot timeout, and focused owner-handoff fixtures.
- State model or invariant: `write_deferred/enqueued=true/pendingWrites=1` cannot remain terminally idle with `pendingReconcileCount=0`.
- Non-goals and forbidden interpretations: no selected-source ordering, generic timeout, readiness, admin API, transport, table bootstrap, or promotion gate changes.
- Proof mapping: focused owner-handoff proof is the falsifier; selected-source repair fixture is regression; representative route verifies movement.
- Wrong-slice trigger: if drain/wake requires a different owner or broad runtime scope, stop and migrate instead of patching symptoms.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| owner recovery queue | `pendingWrites=1`, `pendingWriteGrowthCount=0`, `enqueued=true` | queue exists but does not progress | drain/wake/retry/reconcile progress | pendingReconcile or coverage moves | `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js` |
| active gate coverage | `snapshotCoverage=1/5`, `owner_reconcile_pending` | coverage waits on owner recovery | no promotion until queue progress is visible | route reduces, migrates, or passes | representative route-after-rerun |

- Anti-symptom rationale: this targets owner recovery queue progress, not selected snapshot source symptoms.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`.
- Competing explanations: queue already drains, selected-source timeout owns next, architecture boundary missing, or stale evidence.
- Systemic interaction scan: preserve startup owner-recovery projection, selected-source repair behavior, and runtimePromotionAllowed=false.
- Ping-pong stop rule: unchanged queue and coverage metrics after this package stop local runtime patching.
- Oscillation guard: this is the selected child of an architecture discriminator, and another same-frontier symptom patch is forbidden.

## Decision Experiment Gate

- Decision question: Can startup active gate convert queued owner recovery into bounded reconcile / coverage progress inside the selected write scope?
- Architecture review: selected route is `continue-local-proof`; architecture-gap returns only if the focused proof cannot express queue progress locally.
- Competing hypotheses: missing queue drain/wake transition; queue progress already exists but is not observed; selected-source timeout owns next after queue progress.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`.
- Success metrics: queue progress, reconcile count, snapshot coverage, route migration, or representative green.
- Representative rerun: focused command: `bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-owner-recovery-queue-drain-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output "$REPORT" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact "$REPORT" --package work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md'`.
- Kill rule: unchanged same-frontier queue and coverage metrics stop local runtime work.

## Runbook

1. Run `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md`.
2. Run `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md`.
3. Implement the owner-recovery queue drain/wake contract in scope.
4. Run focused proof, regression proof, runtime grammar, representative rerun, repair, closure validation, close, commit, and push.

## In Scope

1. Owner-recovery queue drain/wake logic in `cluster-control-snapshot-recovery.js`.
2. Focused startup owner-handoff and selected-source regression tests.
3. Sprint/current-blocker updates for this package.

## Out Of Scope

1. Selected-source ordering.
2. Generic timeout budgets.
3. Startup readiness ownership.
4. Admin API, transport, table bootstrap, and promotion gates.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js, test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js, work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md; validation: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js` pass, `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js` pass, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-control-snapshot-recovery.js` pass, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js` pass; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md; validation: representative rerun `test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json` failed but route migrated to `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`, snapshot coverage moved to `3/5`, active nodes reached `5/5`, and successor entry/pre-impl validation passed; parent revalidated focused proof: yes; outcome: migrated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md; validation: `npm run work:repair` pass; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 3476bd1c93db57d22891de77d95cd206bfa08722
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md`
2. `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md`
3. `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`
4. `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
5. `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-control-snapshot-recovery.js`
6. `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`
7. `test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json` plus `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --package work/packages/active-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md`
