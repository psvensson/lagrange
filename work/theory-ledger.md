# Experiment And Theory Ledger

This ledger is an evidence-linked index for current experiments, causal
theories, and superseded hypotheses. It is not an authority over package
status, current-blocker routing, representative artifacts, or runtime behavior.

Packages, generated current-blocker files, and artifacts remain canonical.
Ledger entries help agents find the theory trail before they choose or resume
work.

## Contract

1. Use one `## theory-YYYYMMDD-short-slug` heading per entry.
2. Preserve old entries. When a theory is replaced, mark it `superseded` and
   link the replacing entry instead of rewriting history.
3. Update the ledger only at package closure, representative rerun routing,
   architecture gate decisions, or deliberate seed/backfill packages.
4. Do not invent proof. If evidence is uncertain or stale, use `needs-rerun` or
   `stale` and link the package or artifact that shows the uncertainty.
5. Package evidence remains primary. A ledger entry can summarize or point; it
   cannot close a package, override the current blocker, or promote runtime
   work by itself.

## Status Values

- `active`: the theory is currently guiding work.
- `supported`: linked evidence supports the theory, but the package/artifact
  remains the source of truth.
- `falsified`: linked evidence contradicts the theory.
- `superseded`: a newer linked theory replaces this one.
- `stale`: the theory may still matter, but current evidence is too old or
  incomplete for routing.
- `needs-rerun`: the theory needs fresh proof before it should guide work.

## Required Entry Fields

Each entry must include these labels:

- `Status`
- `Scenario/gate`
- `Owner/boundary`
- `Hypothesis`
- `Probe`
- `Artifact/result`
- `Representative movement`
- `Linked packages`
- `Supersedes`
- `Superseded by`
- `Next implication`

## Entries

## theory-20260522-experiment-theory-memory

- Status: supported
- Scenario/gate: none / workflow_tooling
- Owner/boundary: workflow_tooling_owner / experiment_theory_memory
- Hypothesis: a compact advisory theory ledger lets agents find current experiments and superseded theories without replacing package or artifact truth.
- Probe: `npm run work:theory-ledger -- validate`
- Artifact/result: `work/packages/active-20260522-experiment-theory-ledger-foundation.md` - foundation package created the ledger contract and template.
- Representative movement: none
- Linked packages: `work/packages/active-20260522-experiment-theory-ledger-foundation.md`, `work/packages/todo-20260522-experiment-theory-ledger-tooling.md`, `work/packages/todo-20260522-experiment-theory-ledger-tracker-integration.md`, `work/packages/todo-20260522-experiment-theory-ledger-initial-seed.md`
- Supersedes: none
- Superseded by: none
- Next implication: implement tooling, tracker integration, and conservative seed entries before runtime stability work resumes.

## theory-20260522-node-failure-acceptance-hardening

- Status: supported
- Scenario/gate: node-failure-rebalance / scenario_acceptance
- Owner/boundary: distributed_harness_scenario_owner / node_failure_rebalance_acceptance
- Hypothesis: node-failure rebalance must prove acked-write visibility, rebalance closure, owner/fencing diagnostics, and client error classification instead of passing on total operations plus final consistency.
- Probe: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario node-failure-rebalance`
- Artifact/result: `work/packages/done-20260522-node-failure-rebalance-acceptance-hardening.md` - focused package proof passed while representative runner timeouts remained a separate blocker.
- Representative movement: representative-green
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-acceptance-hardening.md`
- Supersedes: none
- Superseded by: none
- Next implication: keep acceptance checks as release-gate guardrails while startup active-gate snapshot coverage remains the next runtime blocker.

## theory-20260522-snapshot-watch-fixture

- Status: superseded
- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: a replayable WebSocket-closed selected-source fixture is sufficient to classify the active-gate snapshot coverage blocker before runtime edits.
- Probe: `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture`
- Artifact/result: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md` - fixture preserved selectedSnapshotReachableBy=admin_ws and alternative witness evidence but left the frontier unchanged.
- Representative movement: same-frontier
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md`
- Supersedes: none
- Superseded by: theory-20260522-snapshot-watch-handoff-contract
- Next implication: fixture evidence is retained, but typed owner handoff contract emission is now the active theory.

## theory-20260522-snapshot-watch-handoff-contract

- Status: stale
- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: WebSocket-closed selected snapshot source evidence with admin_ws reachability and an alternative witness remains blocked because startup_active_gate_owner / snapshot_coverage does not emit a typed snapshot/watch owner handoff contract.
- Probe: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`
- Artifact/result: `test-output/report.json` - handoff probe reports handoffContract absent and runtimePromotionAllowed=false while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true.
- Representative movement: pending-before-probe
- Linked packages: `work/packages/done-20260522-node-failure-rebalance-active-gate-snapshot-architecture-experiment.md`, `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`, `work/packages/active-20260523-recovery-reason-taxonomy-handoff-semantics.md`
- Supersedes: theory-20260522-snapshot-watch-fixture
- Superseded by: none
- Next implication: resume the paused typed handoff contract runtime package after the ledger sequence closes.

## theory-20260513-rolling-restart-preflight-green-gate-confirmation

- Status: supported
- Scenario/gate: rolling-restart / release_gate
- Owner/boundary: release_gate_owner / rolling_restart_green_gate_confirmation
- Hypothesis: Executing the representative rolling-restart scenario after all focused proof packages are closed will confirm whether the system is stable or identify residual active_gate_snapshot_coverage debt.
- Probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json --fast-local --verbose`
- Artifact/result: `test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json`
- Representative movement: same-frontier
- Linked packages: `work/packages/done-20260513-rolling-restart-preflight-green-gate-confirmation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close the confirmation package as same-frontier, and proceed with successor package work for active_gate_snapshot_coverage_incomplete.

## theory-20260523-rolling-restart-recovery-reconcile-recursion-fix

- Status: supported
- Scenario/gate: rolling-restart / release_gate
- Owner/boundary: operation_workflow_owner / workflow_progress
- Hypothesis: The sequential rolling restart triggers an infinite loop or call stack exhaustion in OperationWorkflowRecoveryReconcile getPriorityRecoveryDecisionSnapshotForPartitionOperations during re-entry reconcile checks.
- Probe: npm run work:advance -- --check
- Artifact/result: test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json
- Representative movement: representative-green
- Linked packages: work/packages/done-20260523-rolling-restart-recovery-reconcile-recursion-fix.md, work/packages/done-20260523-priority-recovery-operation-workflow-owner-workflow-progress.md, work/packages/done-20260523-rolling-restart-priority-recovery-event-wait-architecture-experiment.md, work/packages/done-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md
- Supersedes: none
- Superseded by: none
- Next implication: Successfully stabilized the rolling-restart scenario.

## theory-20260525-steering-stack-collapse-decision

- Status: supported
- Scenario/gate: none / workflow_tooling
- Owner/boundary: workflow_steering_owner / steering_stack_collapse_decision
- Hypothesis: compiling source steering files into specialized, single-file LLM steering packs (architecture, testing, style, governance) eliminates drift while keeping LLM context window load sizes minimal and highly readable.
- Probe: `npm run steering:check`
- Artifact/result: `package.json` and `AGENTS.md` - established LLM steering pack compiler, simplified load sequence, and added CI command `npm run steering:check` to prevent drift.
- Representative movement: none
- Linked packages: `work/packages/done-20260525-steering-stack-collapse-decision.md`
- Supersedes: none
- Superseded by: none
- Next implication: CI workflow checks steering packs for synchronization; no human or LLM drift is possible anymore.

## theory-20260525-priority-spread-triage-stub

- Status: supported
- Scenario/gate: rolling-restart / publication_convergence
- Owner/boundary: topology_publication_owner / publication_convergence
- Hypothesis: Triaging the priority spread timeout will expose whether the bottleneck is an ACK gap, rebalancer starvation, or subscriber initialization delay.
- Probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain priority_control_plane_spread_pending`
- Artifact/result: `work/packages/done-20260525-priority-spread-triage.md` - triage completed; fresh representative rerun showed that the frontier migrated back to the startup active gate owner due to incomplete snapshot coverage.
- Representative movement: none
- Linked packages: `work/packages/done-20260525-priority-spread-triage.md`
- Supersedes: none
- Superseded by: none
- Next implication: Stabilize startup active gate snapshot coverage under the active successor package.

## theory-20260526-rolling-restart-snapshot-viewpoint-backpressure

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_view_freshness
- Hypothesis: After operation-workflow focused proofs pass, the remaining rolling-restart red state is most likely a three-way active-gate evidence problem: workflow budget evidence is stale or unknown, the selected snapshot source is stale or overloaded, and selected publication/readiness evidence lags the best available control-plane view.
- Probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`
- Artifact/result: test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json - priority recovery has four workflow-progress residuals classified as backpressure, workflow-step budget is unknown in causal output despite partition witness deadlines, selected snapshot node 7493b0ab has snapshot-lane timeout warnings, active nodes are 4/5, and selected published-active coverage is 2/5.
- Representative movement: needs-rerun
- Linked packages: `work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md`
- Supersedes: none
- Superseded by: none
- Next implication: Continue from the three child theories: `theory-20260526-rolling-restart-workflow-budget-capture-mismatch`, `theory-20260526-rolling-restart-selected-snapshot-source-staleness`, and `theory-20260526-rolling-restart-selected-view-best-view-evidence-gap`; rerun rolling-restart only after a confirmed local fix or when refreshing stale classification.

## theory-20260526-rolling-restart-workflow-budget-capture-mismatch

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: diagnostics_owner / workflow_budget_accounting
- Hypothesis: The visible priority_recovery_event_driven_wait surface is partly a budget/capture mismatch: causal analysis reports workflow_step_timeout as unknown even though partition witnesses carry workflow deadlines, and the selected witness snapshot was captured before deadlines that had expired by the active-gate failure point.
- Probe: `npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`
- Artifact/result: `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json` - causal budget accounting reports `workflow_step_timeout` as `unknown`; raw partition evidence shows `replica_operations-p1` at 18483/30000ms and `sql_transactions-p1` at 9596/30000ms when captured, but their deadlines were respectively 10281ms and 1394ms past due by the active-gate timeout.
- Representative movement: needs-rerun
- Linked packages: `work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md`
- Supersedes: none
- Superseded by: none
- Next implication: Repair or extend diagnostic/final-capture evidence before assigning another operation workflow runtime bug; a fresh rerun is useful only after workflow budget ownership is explicit or the artifact is judged stale.

## theory-20260526-rolling-restart-selected-snapshot-source-staleness

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_source_health
- Hypothesis: The selected snapshot source is stale, overloaded, or the wrong source for terminal classification; node 7493b0ab is both the selected snapshot source and the node with readiness/snapshot-lane timeout symptoms.
- Probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`
- Artifact/result: `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json` - selected node `7493b0ab-a054-5fad-a91b-5e331db29304` timed out readiness probing, final playback warned that the snapshot lane query timed out after 15000ms, selected snapshot observation was `forced_repair/stale_usable/pending/applied/wait`, and log patterns included `failed_query_operations_table=46` and `query_timeout_5000ms=4`.
- Representative movement: needs-rerun
- Linked packages: `work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md`, `work/packages/active-20260526-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Supersedes: none
- Superseded by: none
- Next implication: Focus the next proof on selected-source health, retry behavior, and alternative witness selection before changing operation workflow runtime code.

## theory-20260526-rolling-restart-selected-view-best-view-evidence-gap

- Status: needs-rerun
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / viewpoint_selection
- Hypothesis: Selected-node publication/readiness evidence lags a fresher best or quorum control-plane view, but the current artifact does not preserve enough per-node probe detail to prove the better view.
- Probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json`
- Artifact/result: `test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json` - selected publication evidence reports 2/5 published-active and 3 missing IDs while active nodes are 4/5 and activeGateOwnerCohort missing/pending counts are zero. Per-node disagreement is concentrated on selected node 7493b0ab, but probe witness success/freshness detail is not retained, so the better-view theory remains unproven.
- Representative movement: needs-rerun
- Linked packages: `work/packages/active-20260526-rolling-restart-operation-workflow-three-theory-recovery.md`
- Supersedes: none
- Superseded by: none
- Next implication: Preserve or extract per-node snapshot probe witness success/freshness/publication evidence on the next pass; do not treat empty disagreement sets from failed probes as proof of a healthy best view.

## theory-20260526-rolling-restart-restarted-node-admin-surface

- Status: supported
- Scenario/gate: rolling-restart / restarted-node recovery-ready
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The restarted node is reachable through bootstrap health but its admin surface never binds or becomes queryable after restart, leaving adminReady=false and controlPlaneRecoveryReady=false.
- Probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
- Artifact/result: test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json - restarted node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 remained reachable=true via bootstrap_health but admin probing failed with ECONNREFUSED 172.18.0.3:8081, ready=false, adminReady=false, controlPlaneRecoveryReady=false, readinessPhase=INIT. The post-diagnostics rerun at test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json did not repeat this as the selected failure shape.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Keep this as a supported baseline symptom only; do not patch admin startup/listen unless a fresh artifact selects the restarted-node admin surface again.

## theory-20260526-rolling-restart-active-gate-evidence-capture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The active-gate/control-snapshot diagnostic path fails to retain selected snapshot coverage, expected node count, blockers, and probe outcome evidence, so the representative failure is classified evidence_missing instead of a concrete owner mechanism.
- Probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage`
- Artifact/result: confirmed and fixed. Report-level analyzers did not load linked `scenario.failureBundle.jsonPath` and `triageJsonPath`, so decisive sidecar evidence was dropped. Added `scripts/artifact-sidecar-loader.js` and wired route, topology, causal, and representative-summary analyzers to enrich reports from linked sidecars; focused sidecar regression tests passed.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Continue from the post-diagnostics route `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`; H2 no longer blocks active-gate evidence classification for this artifact shape.

## theory-20260526-rolling-restart-control-snapshot-authority-recovery

- Status: supported
- Scenario/gate: rolling-restart / restarted-node recovery-ready
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The restarted node cannot establish control-snapshot authority or publication recovery after restart, so bootstrap remains in INIT with control_snapshot_authority_unavailable and recovery diagnostics unavailable.
- Probe: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
- Artifact/result: test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json - bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable, publishedControlPlaneEpoch=unknown, priority_control_plane_recovery_diagnostics_unavailable, failed_query_operations_table=46, and inflight_owner_pressure=8. The post-diagnostics rerun migrated away from this restarted-node authority failure shape.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Keep this as supported baseline evidence, but do not select a control-snapshot authority runtime patch until a fresh artifact reproduces that edge; current work should follow the priority recovery successor.
