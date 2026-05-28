# Rolling Restart Load Snapshot Remaining Witness Concurrency Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_load_remaining_witness_concurrency",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Focused proof validated bounded load-mode remaining-witness snapshot probes, but fresh representative evidence stayed on startup_active_gate_owner / snapshot_coverage with snapshotCoverageNodeCount=1/5 and activeGate attempts=1/8.",
    "nextAction": "Open an autonomous architecture experiment for the active-gate snapshot coverage retry-cadence and budget contract before another local runtime patch.",
    "closed": "2026-05-28",
    "successor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json",
      "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js"
    ],
    "commitScope": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "fresh-representative-rerun"
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
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: focused contract fixture proves load-mode snapshot coverage transitions from concurrent remaining-witness fanout to bounded remaining-witness probing after selected-source timeout: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "regression: affected consumer proof selected-source forced-transport and alternative-witness behavior remains intact: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js",
        "supporting: static guardrail proof for startup active-gate snapshot coverage owner: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js",
        "supporting: representative evidence baseline before rerun: npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/harness/cluster-segment-7-class-5.js",
        "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "theoryLedger": "no ledger update: existing theory refs still cover selected-source staleness, viewpoint evidence, and active-gate evidence capture; this closure records a package-local same-frontier handoff."
  },
  "boundedExperiment": {
    "hypothesis": "Load-mode snapshot coverage currently fans out all remaining admin-ready witness snapshot queries after the selected-source timeout; bounding those remaining probes should let an alternative witness return or at least reduce active-gate snapshot-lane pressure without weakening startup retry behavior.",
    "hypothesisDiscriminator": "H1 selected if the focused fixture observes at most one remaining witness snapshot query in flight after the selected-source timeout and can choose a later successful witness; H2 selected if bounded probing still cannot obtain any query-success witness.",
    "expectedMetric": "remaining witness maximum in-flight snapshot queries, selected alternative witness success, and representative snapshotCoverageNodeCount",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md",
    "timebox": "24h",
    "mergeRequirement": "focused remaining-witness contract fixture, forced-transport consumer regression, runtime grammar guardrail, and representative rolling-restart route-after-rerun",
    "killRule": "If bounded remaining-witness probing cannot move focused witness success or representative snapshot coverage, stop for an autonomous architecture experiment instead of another local patch."
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open an autonomous architecture experiment for the active-gate snapshot coverage retry-cadence and budget contract before another local runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "After reachability prefiltering, all remaining admin-ready witnesses are queried under the same pressure window; load-mode snapshot coverage should bound remaining witness probes after the first selected-source timeout so one timeout does not fan out pressure across every snapshot-lane query.",
    "stopConditionCheck": "The predecessor ran scenario-route, `npm run analyze:causal-model -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json`, and topology handoff probe before selecting this runtime child.",
    "expectedCausalModelChange": "Focused proof shows remaining load-mode witness snapshot probes are bounded after the first selected-source timeout; representative proof must move snapshotCoverageNodeCount beyond 1/5, migrate owner boundary, or pass rolling-restart.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Focused proof validated bounded load-mode remaining-witness concurrency and alternative-witness selection, but fresh representative evidence still shows active_gate_timed_out, selected_snapshot_source_timeout, owner_reconcile_pending, snapshotCoverageNodeCount=1/5, activeGate elapsedMs=72494, attempts=1/8, and no query-success alternative witness. The remaining gap is the active-gate snapshot coverage retry-cadence or budget contract, not another unreviewed local concurrency patch.",
    "crossBoundaryReview": "Do not edit table bootstrap, admin API, transport, generic timeout budgets, promotion gates, or unrelated active-gate runtime files in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart load snapshot remaining-witness concurrency runtime proof",
    "phaseChain": [
      "reachability-prefilter runtime proof passed locally",
      "fresh representative rerun moved probe ordering to admin-ready witnesses",
      "fresh representative rerun stayed on active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5",
      "causal escalation selected load remaining-witness concurrency as the next runtime child",
      "bounded load-mode remaining-witness concurrency focused proof passed locally",
      "fresh representative rerun after bounded concurrency stayed on active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5, activeGate elapsedMs=72494, and attempts=1/8"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency / active_gate_timed_out; fresh representative route remains startup_active_gate_owner / snapshot_coverage",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate no-progress",
      "benchmark table bootstrap error text remains downstream while active-gate snapshot coverage is incomplete",
      "all admin-ready snapshot witnesses remain unavailable to the active gate after the selected source timeout",
      "active-gate retry attempts remain unused because one snapshot coverage pass consumes the active-gate timeout budget"
    ],
    "missingCausalEdge": "The active gate needs an explicit snapshot coverage retry-cadence and budget contract so a selected-source timeout or bounded remaining-witness sweep cannot consume the entire active-gate window before another attempt can run.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "boundedProgressProof": "Focused fixture proved bounded remaining-witness probing and existing selected-source forced-transport behavior stayed green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "expectedObservableTransition": "Representative rerun was expected to pass rolling-restart, move snapshotCoverageNodeCount beyond 1/5, or route to a different owner boundary; it did none of these.",
    "maxProgressBound": "one runtime-owner-boundary package plus one representative rerun before another local patch",
    "sameFrontierFallback": "If fresh representative evidence repeats the same frontier with no metric movement, open/select an autonomous architecture experiment rather than another local runtime patch.",
    "expectedNextFrontier": "architecture experiment selects active-gate snapshot coverage retry-cadence runtime work, owner-boundary migration, or architecture-gap stop",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-load-owner-recovery-bounded-return-runtime.md / startup_active_gate_owner / snapshot_coverage_load_owner_recovery_bounded_return / same-frontier",
      "done-20260528-rolling-restart-load-snapshot-reachability-prefilter-runtime.md / startup_active_gate_owner / snapshot_coverage_probe_reachability_prefilter / same-frontier",
      "done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "This package is the selected runtime child after a required causal escalation, not another adjacent patch from the unchanged artifact.",
    "handoffInvariant": "Runtime promotion remains blocked while snapshot coverage is incomplete; this package changes only load-mode witness probing pressure."
  },
  "observablePrediction": {
    "metric": "load remaining-witness max in-flight snapshot probes and representative snapshot coverage",
    "predicted": "Focused proof shows load-mode remaining-witness snapshot probes are bounded after the first selected-source timeout, and representative rerun moves snapshotCoverageNodeCount beyond 1/5, migrates owner boundary, or passes.",
    "observed": "Focused proof passed and showed bounded load-mode remaining-witness snapshot probes plus later-witness selection, but the fresh representative rerun stayed on active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5, activeGate elapsedMs=72494, attempts=1/8, selected_snapshot_source_timeout, and owner_reconcile_pending.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; npm run work:scenario-route -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "metricDelta": 0
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "architecture-gap-stop",
    "nextLane": "bounded-experiment",
    "expectedDelta": "Same-frontier representative evidence with no snapshotCoverageNodeCount movement triggers the package kill rule; the successor must decide the active-gate snapshot coverage retry-cadence/budget contract before another runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "open an autonomous architecture experiment because the package kill rule fired on same-frontier/no-metric-movement evidence",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh generated current-blocker handoff via npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "fresh representative rerun stayed same-frontier at active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5 and no metric movement",
      "active-gate elapsedMs=72494 and attempts=1/8 show one snapshot coverage pass consumed the active-gate timeout budget before retry cadence could run",
      "package kill rule requires an autonomous architecture experiment before another local runtime patch"
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Continue local runtime proof only if canonical evidence shows metric movement or a focused retry-cadence edge is already selected.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate owner boundary only if fresh evidence names a non-active-gate first frontier.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open a bounded autonomous architecture experiment for the active-gate snapshot coverage retry-cadence and budget contract.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Escalate only if evidence is contradictory, blocked, or unavailable.",
        "route": "human-escalation",
        "proof": [
          "npm run work:advance -- --check"
        ]
      }
    ],
    "nextAction": "Open the autonomous architecture experiment package before runtime implementation resumes."
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "theoryLedger": "no ledger update: existing theory refs still cover selected-source staleness, viewpoint evidence, and active-gate evidence capture; this closure records a package-local same-frontier handoff.",
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency emits Bound load-mode remaining admin-ready snapshot witness probes after the first selected-source timeout, then rerun rolling-restart. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json; falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; regression: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js; supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Bound load-mode remaining admin-ready snapshot witness probes after the first selected-source timeout, then rerun rolling-restart..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Bound load-mode remaining admin-ready snapshot witness probes after the first selected-source timeout, then rerun rolling-restart. | Load-mode snapshot coverage probes remaining admin-ready witnesses without concurrent fanout after the first selected-source timeout; representative rerun should move snapshotCoverageNodeCount beyond 1/5 or pass rolling-restart. | falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
- Success metrics: Load-mode snapshot coverage probes remaining admin-ready witnesses without concurrent fanout after the first selected-source timeout; representative rerun should move snapshotCoverageNodeCount beyond 1/5 or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_load_remaining_witness_concurrency --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json`
- Expected delta: Load-mode snapshot coverage probes remaining admin-ready witnesses without concurrent fanout after the first selected-source timeout; representative rerun should move snapshotCoverageNodeCount beyond 1/5 or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage_load_remaining_witness_concurrency`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage_load_remaining_witness_concurrency`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
3. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js
4. work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md
5. work/packages/done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md
6. work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md
7. work/sprints/current-blocker.md
8. work/sprints/current-blocker.json

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js`, `work/packages/active-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md`, `work/packages/done-20260528-rolling-restart-active-gate-snapshot-timeout-post-prefilter-causal-escalation.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `regression: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js`, `supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-segment-7-class-5.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js; validation: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`; outcome: validated focused bounded-concurrency contract.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json`; outcome: representative same-frontier, architecture experiment selected.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair` during successor migration; outcome: pending transaction refresh.

## Commit And Push Ledger

1. Focused package commit: 4668b9101e8a60884f1364ecb50a78c19919bcdf
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
2. regression: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js
3. supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json
5. npm run work:scenario-triage -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-load-snapshot-reachability-prefilter-20260528T022826Z.report.json --markdown
