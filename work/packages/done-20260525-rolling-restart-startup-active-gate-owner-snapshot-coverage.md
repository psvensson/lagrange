# Artifact Triage - startup_active_gate_owner - snapshot_coverage

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative rolling-restart evidence no longer selects active_gate_snapshot_coverage as the first frontier. Active-gate evidence improved to forced_repair/fresh/ready/applied/proceed with snapshotCoverageNodeCount 2/5, while the first actionable frontier migrated to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.",
    "nextAction": "Close this active-gate architecture discriminator as owner-boundary migration and continue in work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md.",
    "closed": "2026-05-25"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/*20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
      "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
      "work/packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md",
      "work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
      "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
      "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
      "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
      "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
      "work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
      "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
      "work/packages/todo-20260519-rolling-restart-topology-publication-owner-publication-conve.md",
      "work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/sprints/active-2026-q2-rolling-restart-resume-activation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/releases/0.1-dependency-map.md",
      "work/tracks/topology-convergence.md",
      "scripts/work-sprint-remaining.js",
      "scripts/work-audit-siblings.js",
      "scripts/work-close.js",
      "scripts/work-package-cost.js",
      "work/templates/probe-package.md"
    ],
    "handoffFiles": [
      "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
      "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
      "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-handoff.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-fence.js",
      "src/control-plane/publication-active-gate-handoff-contract.js",
      "test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js"
    ],
    "commitScope": [
      "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/*20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
      "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
      "work/packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md",
      "work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
      "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
      "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
      "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
      "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
      "work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
      "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
      "work/packages/todo-20260519-rolling-restart-topology-publication-owner-publication-conve.md",
      "work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/sprints/active-2026-q2-rolling-restart-resume-activation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/releases/0.1-dependency-map.md",
      "work/tracks/topology-convergence.md",
      "scripts/work-sprint-remaining.js",
      "scripts/work-audit-siblings.js",
      "scripts/work-close.js",
      "scripts/work-package-cost.js",
      "work/templates/probe-package.md"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-migrated",
    "whyHighestLeverageNow": "This package repairs the active tracker source of truth after fresh representative evidence migrated the first frontier and active/todo packages moved to work-package-v2.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "architecture-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-owner-discriminator/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 3
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: fresh representative route npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
        "regression: active-gate topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain active_gate_snapshot_coverage",
        "supporting: causal route proof npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
        "work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
        "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
        "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
        "work/sprints/active-2026-q2-rolling-restart-resume-activation.md",
        "work/sprints/current-blocker.json",
        "work/sprints/current-blocker.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "causalGovernance": {
    "hypothesis": "The active-gate snapshot coverage blocker should either select one active-gate transition or migrate when fresh representative evidence names a different first frontier.",
    "stopConditionCheck": "Fresh route, active_gate_snapshot_coverage topology explanation, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json` proof were run before runtime promotion.",
    "expectedCausalModelChange": "The representative route migrates away from active_gate_snapshot_coverage to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh route reports active_gate_snapshot_coverage as downstream/degraded with snapshotCoverageNodeCount 2/5 and no repair defer, while priority_recovery_partition_progress is first with five operation_workflow_owner / workflow_progress witnesses.",
    "crossBoundaryReview": "Startup active-gate runtime remains frozen; the executable successor is the workflow-progress dispatch-chain package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage architecture discriminator after fresh representative rerun",
    "phaseChain": [
      "fresh rolling-restart route completed",
      "active-gate snapshot coverage improved to forced_repair/fresh/ready/applied/proceed",
      "priority_recovery_partition_progress became the first frontier",
      "workflow-progress dispatch-chain successor was opened"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate coverage"
    ],
    "missingCausalEdge": "Workflow progress must advance the fresh priority-recovery dispatch chain before active-gate coverage can complete.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "boundedProgressProof": "Fresh route names an owner-boundary migration to operation_workflow_owner / workflow_progress for a bounded dispatch/advance successor.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "expectedObservableTransition": "owner-boundary migration to the workflow-progress dispatch-chain successor",
    "maxProgressBound": "one architecture discriminator",
    "sameFrontierFallback": "Do not open another runtime patch; keep architecture experiment active until it selects one concrete transition.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress dispatch-chain successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260525-tell-tale-scenario-suite-promotion-gate.md / release_gate_owner / tell_tale_suite_repeatability / same-frontier"
    ],
    "oscillationCheck": "Frontier returned to startup_active_gate_owner / snapshot_coverage after a related runtime successor, so this package is an architecture discriminator.",
    "handoffInvariant": "Startup readiness stays downstream; this package does not edit startup active-gate runtime after fresh evidence selected workflow progress."
  },
  "boundedExperiment": {
    "hypothesis": "H1 active-gate still owns the first actionable frontier; H2 fresh workflow-progress priority recovery owns the next move; H3 evidence is stale or instrumentation-only; H4 another owner boundary owns the next move.",
    "hypothesisDiscriminator": "Fresh route, active-gate topology explanation, and causal route proof must select the current owner boundary before runtime promotion.",
    "expectedMetric": "owner-boundary migration, active-gate reason-set reduction target, or architecture-stop result",
    "inheritsFrom": "work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md",
    "timebox": "24h",
    "mergeRequirement": "canonical route, topology explanation, causal model proof, and one selected successor or explicit architecture stop",
    "killRule": "Runtime files remain out of write scope; close this discriminator once it selects migration or architecture stop."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected successor mechanism plus active_gate_snapshot_coverage reason set and snapshotCoverageNodeCount",
    "predicted": "one active-gate transition or owner-boundary migration is selected before runtime promotion",
    "observed": "fresh representative rerun improved active-gate snapshot evidence to 2/5 and migrated the first frontier to operation_workflow_owner / workflow_progress",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "owner-boundary-migration",
    "nextAction": "Continue in work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md after this discriminator closes.",
    "triggerEvidence": [
      "Fresh route selects priority_recovery_partition_progress as the first frontier.",
      "active_gate_snapshot_coverage is now downstream/degraded rather than the first actionable frontier.",
      "Workflow progress must advance before active-gate coverage can complete."
    ],
    "choices": [
      {
        "id": "owner-boundary-migration",
        "summary": "Close the active-gate discriminator and queue the workflow-progress successor as the next source-of-truth package.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
        ]
      }
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "Queue the workflow-progress successor as causal-escalation and keep runtime files out of write scope until that successor passes pre-implementation validation."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "owner-boundary-migration",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json routes first to priority_recovery_partition_progress, and active_gate_snapshot_coverage topology evidence is blocked but not the frontier."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "migrated",
    "stopMode": "owner-boundary-migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Workflow-progress successor proves the producer-consumer missing edge, reduces priority-recovery witnesses, migrates owner boundary, raises snapshot coverage, or turns rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Fresh representative route no longer selects active_gate_snapshot_coverage as the first frontier; priority_recovery_partition_progress is first with operation_workflow_owner / workflow_progress witnesses.",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
      "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-resume-activation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The active-gate discriminator started from stale rolling-restart evidence that
appeared to route to `startup_active_gate_owner / snapshot_coverage`. Fresh
representative evidence in
`test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
instead routes first to `priority_recovery_partition_progress`.

This package closes the discriminator as an owner-boundary migration and leaves
startup active-gate runtime frozen while the sprint continues in
`work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md`.

## Scope Basis

Owner-boundary migration for the rolling-restart resume activation sprint after
fresh representative evidence selected workflow progress as the next actionable
frontier.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: the package only classifies the active-gate
  discriminator outcome and queues the migrated owner-boundary successor.
  Runtime writes remain out of scope.
- Escalation trigger to a heavier lane: fresh representative evidence
  contradicts the migration or requires runtime ownership changes here.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / snapshot_coverage` stops as
  downstream/degraded evidence, and the sprint continues in
  `operation_workflow_owner / workflow_progress`.
- Inputs/signals:
  `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`,
  `priority_recovery_partition_progress`,
  `operation_workflow_owner / workflow_progress`,
  `priority_recovery_event_driven_wait`, active-gate
  `snapshotCoverageNodeCount=2/5`, and active-gate downstream/degraded state.
- State model or invariant: downstream startup readiness and active-gate
  symptoms must not be patched until workflow progress advances, migrates, or
  proves the next owner boundary.
- Non-goals and forbidden interpretations: do not edit startup readiness,
  active-gate runtime, timeout budgets, admission policy, Pro behavior, or
  Enterprise behavior from this package.
- Proof mapping: route, active-gate topology explanation, and causal model proof
  must support owner-boundary migration before the successor activates.
- Wrong-slice trigger: stop if fresh evidence again selects active-gate as first
  frontier or contradicts the workflow-progress migration.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | operation_workflow_owner owns the first actionable frontier before downstream active-gate or startup-readiness symptoms are patched | Owner-boundary migration to workflow-progress successor | Successor package proves the dispatch-chain missing edge, reduces or migrates the frontier, raises snapshot coverage, or turns representative green | npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package classifies active-gate evidence as
  downstream and hands off to the first actionable workflow-progress owner
  boundary; it does not patch downstream symptoms or widen runtime scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Competing explanations: active-gate still owns the first frontier; workflow
  progress owns a concrete dispatch-chain edge; instrumentation or stale
  evidence is misleading; a different owner boundary owns the next move.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Did fresh representative evidence keep active-gate as the
  first actionable frontier, or migrate to workflow progress?
- Architecture review: The selected route is owner-boundary migration to
  `operation_workflow_owner / workflow_progress`.
- Competing hypotheses: active-gate owns the first frontier; workflow progress
  owns a concrete dispatch-chain edge; instrumentation or stale evidence is
  misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Success metrics: owner-boundary migration is recorded, active-gate runtime
  stays frozen, and the workflow-progress successor is queued with proof before
  runtime promotion.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: Do not open another local runtime patch from the unchanged artifact;
  the successor must prove the missing edge, reduce or migrate the frontier, or
  select an architecture experiment.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Expected delta: Workflow-progress successor proves the producer-consumer
  missing edge, reduces priority-recovery witnesses, migrates owner boundary,
  raises snapshot coverage, or turns rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `migrated`
- Stop mode: `owner-boundary-migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
- Runtime promotion rule: Queue the workflow-progress successor and keep runtime
  files out of write scope until that successor passes pre-implementation
  validation.

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

- Package class: `architecture-experiment`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-owner-discriminator/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`,
  `work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md`,
  package queue and tracker handoff files in the declared write scope
- Candidate runtime files:
  `src/admin/admin-control-snapshot-publication-handoff.js`,
  `src/control-plane/publication-active-gate-handoff-contract-decision.js`,
  `src/control-plane/publication-active-gate-handoff-contract-fence.js`,
  `src/control-plane/publication-active-gate-handoff-contract.js`,
  `test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js`,
  `test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`
- Forbidden files: runtime files remain out of write scope for this
  discriminator; the successor must pass pre-implementation validation before
  runtime promotion.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership
  changes, or representative scenario evidence contradicts the migration.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md; validation: fresh representative route, active-gate topology explanation, and causal-model proof selected owner-boundary migration; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md; validation: package doctor and migration transaction before closure; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: migration transaction followed by `npm run work:repair`; outcome: validated.

## Validation

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain active_gate_snapshot_coverage`
3. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`

## Commit And Push Ledger

1. Focused package commit: bb0c0b7e856c52fbaf7ee0c505ccee8c3131566f
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
