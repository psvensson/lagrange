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
    "nextAction": "Use the fresh artifact to decide a narrow operation_workflow_owner / workflow_progress successor for the remaining 4 priority recovery residuals, or accept the classified backpressure stop if no local runtime bug is selected."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md",
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
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
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
    "hypothesis": "The current priority_recovery_event_driven_wait is caused by one of three bounded edges: H1 event-driven workflow progress does not re-enter dispatch for persisted dispatch_pending operations; H2 dispatched handoff progress is retrying but the progress observer/readback path never records completion or target progress; H3 the rebalancer leader sees eligible control_plane_publications recovery but does not create the next operation after terminal removed operations.",
    "stopConditionCheck": "Run scenario route, priority residual extraction, `npm run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-recovery.report.json`, and focused owner tests before runtime edits; then rerun rolling-restart after any confirmed fix.",
    "expectedCausalModelChange": "The package either reduces priority recovery residual witness count, migrates the first frontier, reaches representative green, or stops as architecture-gap if all three focused theories are rejected.",
    "representativeOutcome": "migrated",
    "causalDebt": "Snapshot freshness fix moved the fresh rerun from priority_recovery_partition_progress to active_gate_snapshot_coverage. Priority recovery residuals are now witnessCount=0, ownerBoundaryGroupCount=0, splitRequired=false; rolling-restart still fails on startup_active_gate_owner / snapshot_coverage / active_gate_timed_out with selected snapshot source timeout and snapshot repair deferred.",
    "crossBoundaryReview": "Keep startup active-gate snapshot coverage, publication ACK convergence, timeout ceilings, and harness teardown frozen. The only widened runtime scope is the shared control-plane snapshot observation owner because playback shows a forced-repair snapshot freshness contract breach."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after load-mode selected snapshot owner-recovery projection fix",
    "phaseChain": [
      "publication_ack_convergence remains satisfied with PUBLISHED status and zero pending ACKs",
      "priority_recovery_partition_progress is still the only topology first frontier",
      "fresh residual extraction reduced witnessCount from 11 to 6 but kept ownerBoundaryGroupCount at 3",
      "active nodes improved to 4/5 while active_gate_snapshot_coverage regressed to 2/5",
      "startup readiness times out downstream of priority recovery and snapshot coverage backpressure"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains next expected frontier after priority progress closes",
      "node 7493b0ab has readiness timeout and snapshot lane query timeout symptoms",
      "publication has 3 missing active nodes while priority recovery is still in needs_operation/recovering_in_flight states"
    ],
    "missingCausalEdge": "Which concrete owner edge must move: dispatch-pending event-driven re-entry, handoff progress observation/readback, or rebalancer leader operation creation.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-recovery.report.json",
    "boundedProgressProof": "Focused tests must reproduce and prove the selected dispatch, retry, reconcile, drain, delivery, timer, advance, or snapshot observation freshness mechanism before representative rerun; unchanged same-frontier with no residual reduction opens/selects architecture-gap instead of another local patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-three-theory-recovery.report.json",
    "expectedObservableTransition": "priority recovery witness count drops below 11, ownerBoundaryGroupCount drops below 3, first frontier migrates, or rolling-restart passes.",
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
    "observed": "Focused snapshot-owner proof passed after changing applied forced repairs to stay pending when the repaired view still needs repair. Focused active-gate owner-recovery projection proof then selected H2: the real report shape carried publishedActiveNodeIds on selected owner handoff while selectedPublishedActiveNodeIds was empty. Fresh rolling-restart failed after 167.8s but moved to priority_recovery_partition_progress with 4 witnesses in one operation_workflow_owner / workflow_progress group; active nodes are 4/5, snapshot coverage is 2/5, selected timeout owner-recovery is no longer the first frontier, and priority ACK invariants pass.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "H1 selected snapshot source admin-health reachability masks snapshot-lane timeout; H2 owner_reconcile_pending plus write_deferred/enqueued=false loses bounded owner-recovery progress; H3 control-plane SQL/CDC pressure starves snapshot/publication repair paths.",
    "hypothesisDiscriminator": "H1 is selected if snapshot source selection trusts admin_health without a usable snapshot/publication cohort. H2 is selected if owner handoff carries the published-active cohort and bounded recovery state, but active-gate projection ignores it when selectedPublishedActiveNodeIds is empty. H3 is selected if pressure evidence remains after H1/H2 projection consumes the bounded owner-recovery state.",
    "expectedMetric": "H1/H2/H3 selected or rejected with focused proof, then representative rerun movement in snapshot coverage, selected timeout handling, first frontier, or pass/fail.",
    "inheritsFrom": "work/packages/done-20260526-rolling-restart-three-theory-discriminator.md",
    "timebox": "24h",
    "mergeRequirement": "scenario route, priority residual extraction, causal model, focused owner tests, rolling-restart rerun, route-after-rerun summary",
    "killRule": "If all three theories are rejected or fresh rerun stays same-frontier with no residual reduction, stop for architecture-gap instead of opening another local runtime patch."
  },
  "representativeResidual": {
    "status": "reduced-migrated-after-h2-fix",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "The H2 active-gate projection fix moved the failure off selected-timeout owner recovery. Remaining evidence has 4 priority recovery workflow-progress residuals and routes as classified backpressure; investigate a narrow operation-workflow successor before further runtime edits."
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

- Canonical outcome: operation_workflow_owner / workflow_progress must either advance the dispatch-pending priority recovery chain, migrate to the concrete owner boundary that can do so, or stop as architecture-gap with unchanged same-frontier evidence.
- Inputs/signals: `test-output/reports/rolling-restart-three-theory-recovery.report.json`, scenario route, priority residual extraction, causal model, focused operation workflow re-entry tests, and focused priority planning visibility tests.
- State model or invariant: each theory maps to one owner edge and one permitted action: H1 dispatch-pending event-driven re-entry advances existing operations; H2 handoff retry progress observes or waits for bounded target progress; H3 rebalancer leader creates a recovery operation when no current operation exists and the partition remains eligible.
- Non-goals and forbidden interpretations: do not raise timeouts, patch startup readiness, relax publication ACKs, or hide priority recovery behind active-gate projection.
- Proof mapping: focused owner tests must select or reject H1/H2/H3 before runtime changes; fresh `rolling-restart` plus route-after-rerun proves representative movement.
- Wrong-slice trigger: if focused proof or fresh routing selects a different owner boundary, migrate or stop; if same frontier remains unchanged with no residual reduction, open/select architecture-gap.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | operation_workflow_owner owns the current first frontier, but residuals are split and must select one causal edge before runtime edits | Test H1/H2/H3, fix only confirmed bug, rerun rolling-restart | witnessCount `< 11`, ownerBoundaryGroupCount `< 3`, first frontier migration, or representative green | npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress |
| H1 dispatch re-entry | persisted_not_dispatched + dispatch_pending + event_driven + advance_existing_operation | existing operation should re-enter operation workflow owner without relying on active-gate retry | advance existing operation or prove already covered | focused re-entry proof passes/fails and residual count moves after fix | node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js |
| H2 handoff progress readback | dispatched_waiting_progress + retry_scheduled + wait_for_operation_progress | retry-scheduled handoff must either observe target progress or remain bounded with visible timer | wait for bounded progress or repair progress observation/readback | rebalancer_handoff witnesses reduce or classify bounded | npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown |
| H3 operation creation | needs_operation + eligible_but_no_operation_created + action_required | rebalancer leader must create a new recovery operation after terminal removed operations when spread remains blocked | create recovery operation or repair planning gate | control_plane_publications-p1 operation_scheduling witness disappears or migrates | node test/rebalancer/priority-recovery-stale-planning-visibility.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Which of H1 dispatch re-entry, H2 handoff progress readback, or H3 operation creation is the current causal edge for priority_recovery_event_driven_wait?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: H1 event-driven workflow progress does not re-enter dispatch; H2 dispatched operations retry but progress readback never observes target progress; H3 rebalancer leader fails to create a missing control-plane publication recovery operation; H4 the route is stale diagnostics and no runtime code should change.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown`
- Success metrics: witnessCount `< 11`, ownerBoundaryGroupCount `< 3`, first frontier migration, selected architecture-gap, or representative green; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Expected delta: H1/H2/H3 selected or rejected, then fresh representative evidence green, reduced, migrated, same-frontier with architecture-gap, or contradictory.
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

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json
4. node test/control-plane/control-plane-snapshot-owner.test.js
5. node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
6. node test/rebalancer/priority-recovery-stale-planning-visibility.test.js
7. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --verbose
8. node test/distributed/harness/__tests__/active-gate-closure-classification.test.js
