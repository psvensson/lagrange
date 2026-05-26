# Rolling Restart Operation Workflow Three Theory Recovery

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-26",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "The selected-timeout owner-recovery projection bug is fixed and focused proofs pass. Fresh rolling-restart moved from the selected-timeout active-gate blocker to priority_recovery_partition_progress with 4 residual witnesses in one operation_workflow_owner / workflow_progress group; active nodes improved to 4/5 and selected snapshot coverage improved to 2/5.",
    "nextAction": "Research the revised three-theory set: H1 workflow budget/capture mismatch, H2 selected snapshot source stale or overloaded, and H3 selected-node publication/readiness evidence lagging the best control-plane view."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md",
      "work/theory-ledger.md",
      "work/sprints/active-2026-q2-rolling-restart-investigation.md",
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "test/rebalancer/priority-recovery-stale-planning-visibility.test.js",
      "test/control-plane/control-plane-snapshot-owner.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-three-theory-recovery.report.json",
      "test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json",
      "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js",
      "src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js",
      "src/rebalancer/unified-rebalancer-segment-5.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js"
    ],
    "commitScope": [
      "work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md",
      "work/theory-ledger.md",
      "work/sprints/active-2026-q2-rolling-restart-investigation.md",
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "test/rebalancer/priority-recovery-stale-planning-visibility.test.js",
      "test/control-plane/control-plane-snapshot-owner.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package is the active sprint's highest-leverage next step because the latest artifact cleared snapshot coverage and now has one priority recovery first frontier with split residuals and a repeated operation-workflow boundary.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
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
      "theory-20260526-rolling-restart-snapshot-viewpoint-backpressure",
      "theory-20260526-rolling-restart-workflow-budget-capture-mismatch",
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap"
    ],
    "proof": {
      "commands": [
        "research: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
        "falsifier: route npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown",
        "route: npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "residuals: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown",
        "focused: node test/control-plane/control-plane-snapshot-owner.test.js",
      "focused: node test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
      "focused: node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
        "representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --verbose",
        "route: npm run work:scenario-route -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "residuals: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --markdown"
      ]
    }
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
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-recovery.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Priority recovery is cleared; next work should move snapshotCoverage above 1/5, clear selected_snapshot_source_timeout, or migrate the active-gate snapshot coverage frontier.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The latest priority_recovery_event_driven_wait evidence is a classified backpressure surface caused by one of three active-gate evidence edges: H1 workflow budget/capture evidence is stale or insufficient, H2 the selected snapshot source is stale or overloaded, or H3 selected-node publication/readiness evidence lags the best available control-plane view.",
    "stopConditionCheck": "Run `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`, topology convergence, `npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`, distributed failure, and priority residual extraction; use raw artifact inspection only after canonical extractors. Do not make runtime edits unless one revised theory selects a concrete owner bug.",
    "expectedCausalModelChange": "Research selected H1 as a supported diagnostic/final-capture mismatch, H2 as supported selected-source staleness/overload, and H3 as an evidence gap that needs retained per-node probe success/freshness detail before runtime edits.",
    "representativeOutcome": "migrated",
    "causalDebt": "Operation-workflow focused proofs now pass for dispatch re-entry, timeout re-entry, serial-wait re-entry, stale planning visibility, and bounded remote handoff. The latest artifact still has 4 workflow-progress residuals but causal analysis classifies them as backpressure; workflow-step budget is unknown in causal output even though witness deadlines exist, node 7493b0ab has readiness and snapshot-lane timeout warnings, active nodes are 4/5, selected published-active coverage is 2/5, and H3 lacks retained per-node probe success/freshness proof.",
    "crossBoundaryReview": "Keep operation workflow runtime edits frozen unless a revised theory produces a concrete failing owner proof. The next executable slice should repair diagnostic/final-capture workflow budget evidence, selected snapshot source health/alternative selection, or per-node probe witness retention; do not raise timeouts or hide priority recovery blockers."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after load-mode selected snapshot owner-recovery projection fix",
    "phaseChain": [
      "publication_ack_convergence remains satisfied with PUBLISHED status and zero pending ACKs",
      "priority_recovery_partition_progress is still the only topology first frontier",
      "fresh residual extraction now reports witnessCount 4 in one operation_workflow_owner / workflow_progress group",
      "causal analysis classifies priority_recovery_event_driven_wait as backpressure with no failed invariant",
      "active nodes improved to 4/5 while selected snapshot coverage remains 2/5 and selected publication evidence is 2/5 published-active"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains next expected frontier after priority progress closes",
      "node 7493b0ab has readiness timeout and snapshot lane query timeout symptoms",
      "publication has 3 missing active nodes while priority recovery is still in needs_operation/recovering_in_flight states"
    ],
    "missingCausalEdge": "Which evidence edge must move: workflow budget/capture classification, selected snapshot source freshness/health, or selected-node versus best-view publication/readiness evidence.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "boundedProgressProof": "Focused proof selected H1 and H2 as supported and H3 as needs-rerun/evidence-gap. Next progress must make workflow timeout/reconcile budget ownership explicit, prove selected-source retry or alternative witness behavior, retain per-node viewpoint proof, refresh representative evidence, or open an architecture experiment instead of patching symptoms.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "expectedObservableTransition": "selected theory, owner-boundary migration, architecture-gap classification, fresh rerun movement, or representative green.",
    "maxProgressBound": "one causal-escalation pass covering three focused theories and one representative rerun",
    "sameFrontierFallback": "If fresh evidence remains operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait with witnessCount 11 and no theory-selected metric movement, stop for an autonomous architecture experiment.",
    "expectedNextFrontier": "representative-green, reduced priority recovery residuals, migrated owner boundary, or architecture-gap",
    "resultClassification": "reduced",
    "stopCondition": "bounded-non-frontier",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-workflow-progress-dispatch-chain.md / operation_workflow_owner / workflow_progress / migrated",
      "done-20260525-priority-recovery-operation-workflow-workflow-progress-residual-successor.md / operation_workflow_owner / workflow_progress / classification-only",
      "done-20260526-rolling-restart-three-theory-discriminator.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed only because it tests three concrete causal edges before runtime edits and has a same-frontier architecture stop rule.",
    "handoffInvariant": "Owner outcomes decide runtime progress; diagnostics and active-gate readiness observe priority recovery but must not hide or decide the operation workflow contract."
  },
  "observablePrediction": {
    "metric": "priority recovery witnessCount, ownerBoundaryGroupCount, first frontier, and rolling-restart pass/fail",
    "predicted": "A confirmed fix should reduce witnessCount below 11, reduce ownerBoundaryGroupCount below 3, migrate the first frontier, or pass rolling-restart.",
    "observed": "Focused snapshot-owner proof passed after changing applied forced repairs to stay pending when the repaired view still needs repair. Focused active-gate owner-recovery projection proof then selected H2: the real report shape carried publishedActiveNodeIds on selected owner handoff while selectedPublishedActiveNodeIds was empty. Fresh rolling-restart failed after 167.8s but moved to priority_recovery_partition_progress with 4 witnesses in one operation_workflow_owner / workflow_progress group; active nodes are 4/5, snapshot coverage is 2/5, selected timeout owner-recovery is no longer the first frontier, and priority ACK invariants pass. Follow-up research selected H1 budget/capture mismatch and H2 selected-source staleness as supported; H3 selected-view/best-view split remains needs-rerun because per-node probe witness success/freshness is not retained.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "H1 workflow budget/capture mismatch is supported: operation workflow progress is within its 30s owner budget at the captured snapshot, deadlines are past due by active-gate failure, and causal output cannot expose workflow-step budget. H2 selected snapshot source stale/overloaded is supported: selected node 7493b0ab is the selected source and has readiness/snapshot-lane timeout symptoms. H3 selected-view/best-view split is an evidence gap: selected evidence reports 2/5 published-active while active nodes are 4/5, but per-node probe witness success/freshness is not retained.",
    "hypothesisDiscriminator": "H1 selected via causal-model unknown workflow budget plus raw witness deadline comparison. H2 selected via distributed-failure selected node timeout and stale_usable selected observation. H3 rejected as proven on the current artifact because better/quorum view proof is missing despite selected-view lag symptoms.",
    "expectedMetric": "Next progress should make workflow budget ownership explicit, prove selected source health or alternative witness selection, retain per-node viewpoint proof, migrate owner boundary, classify architecture-gap, or refresh representative evidence.",
    "inheritsFrom": "work/packages/done-20260526-rolling-restart-three-theory-discriminator.md",
    "timebox": "24h",
    "mergeRequirement": "theory ledger ref, evidence summary, topology convergence, causal model, distributed failure, priority residual extraction, focused raw artifact comparison for H1/H2/H3 after canonical extractors",
    "killRule": "If all three revised theories remain unselected on the current artifact, stop as classified backpressure/needs-rerun instead of opening another local runtime patch."
  },
  "representativeResidual": {
    "status": "reduced-migrated-after-h2-fix",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "The H2 active-gate projection fix moved the failure off selected-timeout owner recovery. Remaining evidence has 4 priority recovery workflow-progress residuals but routes as classified backpressure; research budget/capture, selected snapshot source health, and selected-view versus best-view publication/readiness before further runtime edits."
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

Theory ledger: `planned-new-theory` - this package creates the fresh
operation-workflow three-theory discriminator from the latest
`rolling-restart-three-theory-recovery` artifact and will record the selected
H1/H2/H3 outcome before closure.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: the latest artifact must either select a concrete evidence owner for the classified backpressure surface, migrate to a startup active-gate snapshot/viewpoint successor, or remain needs-rerun without runtime edits.
- Inputs/signals: `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`, evidence summary, topology convergence, causal model, distributed failure, priority residual extraction, and focused raw artifact comparison after canonical extractors.
- State model or invariant: each revised theory maps to one evidence edge and one permitted action: H1 budget/capture mismatch exposes workflow deadline ownership; H2 selected snapshot source staleness/overload moves source selection or snapshot freshness; H3 selected-view/best-view split moves publication/readiness observation.
- Non-goals and forbidden interpretations: do not raise timeouts, patch startup readiness, relax publication ACKs, hide priority recovery behind active-gate projection, or reopen operation workflow runtime paths after focused proof passes.
- Proof mapping: revised H1/H2/H3 must be selected or rejected from evidence before runtime changes; fresh `rolling-restart` plus route-after-rerun proves representative movement only after a confirmed fix or stale classification refresh.
- Wrong-slice trigger: if focused proof or fresh routing selects a different owner boundary, migrate or stop; if same frontier remains unchanged with no residual reduction, open/select architecture-gap.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | operation workflow remains the first frontier, but focused owner tests pass and causal analysis classifies backpressure | Research revised H1/H2/H3 before runtime edits | selected theory, owner migration, architecture-gap, needs-rerun, or representative green | npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json |
| H1 budget/capture mismatch | workflow step budget unknown in causal output while operation snapshots carry 30s deadlines | diagnostics may be classifying a bounded in-budget wait as terminal evidence | repair diagnostic deadline evidence or classify needs-rerun | workflow budget ownership becomes explicit or theory rejected | npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json |
| H2 selected source stale/overloaded | selected node 7493b0ab is snapshot source and has snapshot-lane timeout warnings | selected snapshot source may be stale, overloaded, or the wrong observation source | repair source selection/freshness or classify node-local pressure | selected source freshness/health explains or rejects 2/5 coverage | npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json |
| H3 selected-view versus best-view split | selected published-active coverage is 2/5 while active nodes are 4/5 | selected-node publication/readiness evidence may lag a better or quorum control-plane view | repair viewpoint selection or classify selected-view lag | best/quorum view comparison selects or rejects selected-view staleness | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Which of H1 budget/capture mismatch, H2 selected snapshot source staleness/overload, or H3 selected-view versus best-view split explains the current classified backpressure surface?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: H1 workflow budget/deadline evidence is incomplete; H2 selected snapshot source health/freshness is the blocker; H3 selected-node evidence lags a better control-plane view; H4 the route is valid classified backpressure and needs a fresh rerun before runtime code should change.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`
- Success metrics: one revised theory selected/rejected, owner-boundary migration, architecture-gap classification, fresh rerun movement, or representative green; at least one concrete route, owner, evidence, or representative condition must move before runtime edits.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-revised-three-theory-refresh.report.json --verbose` only after a confirmed local fix or when the current artifact is judged stale.
- Kill rule: If all revised theories remain unselected on the current artifact, stop as classified backpressure/needs-rerun instead of opening another local runtime patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Expected delta: revised H1/H2/H3 selected or rejected, then focused proof, owner migration, needs-rerun, architecture-gap, or fresh representative evidence green/reduced/migrated.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.

## Execution Notes

- Focused H1/H2/H3 probes:
  - `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress` confirmed the baseline route with witnessCount `11`.
  - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown` split the baseline into workflow_progress `4`, rebalancer_handoff `6`, and operation_scheduling `1`.
  - `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed `72/72`, covering persisted-not-dispatched and retry-scheduled dispatch-pending re-entry.
  - `node test/rebalancer/priority-recovery-stale-planning-visibility.test.js` passed `12/12`, covering missing-operation and stale planning operation creation.
- Representative rerun:
  - Command: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-operation-workflow-three-theory-recovery-rerun.report.json --verbose`
  - Result: failed after `138.4s`.
  - Route: still `priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.
  - Metric movement: witnessCount `11 -> 6`; ownerBoundaryGroupCount stayed `3`; active nodes `0/5 -> 4/5`; snapshot coverage `5/5 -> 2/5`.
  - Residual movement: operation-scheduling witness moved from `control_plane_publications-p1` to `replica_operations-p1`; retry-scheduled handoff witnesses reduced from `6` to `1`; workflow_progress witnesses stayed `4`.
- Theory result:
  - H1 rejected as the immediate local bug by focused proof; the rerun still has a dispatch-pending workflow witness, but the owner re-entry tests pass.
  - H2 remains plausible only for the single `control_plane_publications-p1` `dispatched_waiting_progress / retry_scheduled` witness.
  - H3 remains plausible only for the moved `replica_operations-p1` `eligible_but_no_operation_created / create_recovery_operation` witness.
  - Because no focused local bug failed and the representative artifact moved but stayed same-frontier, next work should not widen this package blindly; it should either open the package's architecture-gap path or create a narrower successor from the fresh residual split.
- Snapshot freshness route:
  - Playback showed target replica progress after the selected forced-repair snapshot timestamp while the selected snapshot still reported `forced_repair/fresh/ready/applied/proceed` with `stale_replica_operations_in_flight`.
  - Changed `src/control-plane/control-plane-snapshot-owner.js` so applied forced control-snapshot repairs re-evaluate the repaired snapshot before publishing a ready/proceed observation. If the repaired view still needs repair, the owner now returns `stale_usable / pending / wait` with `refreshState: applied`.
  - Added `test/control-plane/control-plane-snapshot-owner.test.js` coverage proving an applied control repair remains pending when the repaired snapshot is still stale.
- Snapshot freshness proof:
  - `npm run work:validate -- --pre-impl work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md` passed.
  - `node test/control-plane/control-plane-snapshot-owner.test.js` passed `25/25`.
  - `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed `72/72`.
  - `node test/rebalancer/priority-recovery-stale-planning-visibility.test.js` passed `12/12`.
  - `node test/admin/admin-control-snapshot-response-contract.test.js` passed `15/15`.
  - `node test/admin/admin-control-snapshot-retry-decision.test.js` passed `31/31`.
  - Static guardrails passed: `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js`, `node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js`, `npm run audit:file-size -- src/control-plane/control-plane-snapshot-owner.js test/control-plane/control-plane-snapshot-owner.test.js`, and `git diff --check` for touched files.
- Snapshot freshness representative rerun:
  - Command: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --verbose`
  - Result: failed after `499.2s`.
  - Route: migrated to `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
  - Priority recovery residuals: witnessCount `0`, ownerBoundaryGroupCount `0`, splitRequired `false`.
  - Fresh blocker: snapshot coverage `1/5`, selected snapshot node `11601fe0-72d6-5853-8590-ec2881853e72`, selected snapshot source timeout, `repair_deferred/deferred_refresh/deferred/retry`, publication active-gate handoff `owner_reconcile_pending`, and load readiness timeout after `300000ms`.
  - Teardown: `npm run distributed:stop-containers` reported no running distributed harness processes; `docker ps` showed no running containers.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
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
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown`, `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `node test/rebalancer/priority-recovery-stale-planning-visibility.test.js`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: control_plane_snapshot_owner; files-changed: src/control-plane/control-plane-snapshot-owner.js, test/control-plane/control-plane-snapshot-owner.test.js, work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md, work/sprints/active-2026-q2-rolling-restart-investigation.md; validation: `node test/control-plane/control-plane-snapshot-owner.test.js` 25/25, `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` 72/72, `node test/rebalancer/priority-recovery-stale-planning-visibility.test.js` 12/12, static guardrails, `rolling-restart-snapshot-freshness-rerun.report.json`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md, work/sprints/active-2026-q2-rolling-restart-investigation.md; validation: `npm run work:evidence-summary`, `npm run work:scenario-route`, `npm run analyze:priority-recovery-residuals`, `npm run analyze:distributed-failure`, and `npm run analyze:topology-convergence` on `test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json`; outcome: validated-migrated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-investigation.md; validation: `npm run work:repair`; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js, test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js, work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md, work/sprints/active-2026-q2-rolling-restart-investigation.md; validation: `node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`, `node test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js`, representative `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`, route/residual/topology/causal analyzers, `npm run work:validate -- --pre-impl`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: test/distributed/harness/__tests__/active-gate-closure-classification.test.js, work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md; validation: `node test/distributed/harness/__tests__/active-gate-closure-classification.test.js` 6/6, parent revalidated focused proof: yes; outcome: validated.
- [x] action: research; owner: startup_active_gate_owner; files-changed: work/theory-ledger.md, work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md, work/sprints/active-2026-q2-rolling-restart-investigation.md; validation: `npm run work:evidence-summary`, `npm run analyze:topology-convergence`, `npm run analyze:causal-model`, `npm run analyze:distributed-failure`, `npm run analyze:priority-recovery-residuals`, `npm run work:scenario-route`, and focused raw artifact comparison on `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`; parent revalidated focused proof: yes; outcome: H1 supported as workflow budget/capture mismatch, H2 supported as selected-source staleness/overload, H3 needs-rerun because per-node probe witness proof is not retained.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json
4. node test/control-plane/control-plane-snapshot-owner.test.js
5. node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
6. node test/rebalancer/priority-recovery-stale-planning-visibility.test.js
7. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --verbose
8. node test/distributed/harness/__tests__/active-gate-closure-classification.test.js
