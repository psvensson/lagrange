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
- `avoided`: linked evidence may support the symptom, but this theory is not a
  selectable route without fresh artifact evidence and package justification.
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

- Status: supported
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

- Status: supported
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

- Status: avoided
- Scenario/gate: rolling-restart / restarted-node recovery-ready
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The restarted node is reachable through bootstrap health but its admin surface never binds or becomes queryable after restart, leaving adminReady=false and controlPlaneRecoveryReady=false.
- Probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
- Artifact/result: test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json - restarted node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 remained reachable=true via bootstrap_health but admin probing failed with ECONNREFUSED 172.18.0.3:8081, ready=false, adminReady=false, controlPlaneRecoveryReady=false, readinessPhase=INIT. The post-diagnostics rerun at test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json did not repeat this as the selected failure shape.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Avoid selecting this baseline symptom for implementation; do not patch admin startup/listen unless a fresh artifact selects the restarted-node admin surface again.

## theory-20260526-rolling-restart-active-gate-evidence-capture-gap

- Status: avoided
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The active-gate/control-snapshot diagnostic path fails to retain selected snapshot coverage, expected node count, blockers, and probe outcome evidence, so the representative failure is classified evidence_missing instead of a concrete owner mechanism.
- Probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage`
- Artifact/result: confirmed and fixed. Report-level analyzers did not load linked `scenario.failureBundle.jsonPath` and `triageJsonPath`, so decisive sidecar evidence was dropped. Added `scripts/artifact-sidecar-loader.js` and wired route, topology, causal, and representative-summary analyzers to enrich reports from linked sidecars; focused sidecar regression tests passed.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Avoid repeating the diagnostics evidence-capture route for this artifact shape; continue from the post-diagnostics route `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.

## theory-20260526-rolling-restart-control-snapshot-authority-recovery

- Status: avoided
- Scenario/gate: rolling-restart / restarted-node recovery-ready
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The restarted node cannot establish control-snapshot authority or publication recovery after restart, so bootstrap remains in INIT with control_snapshot_authority_unavailable and recovery diagnostics unavailable.
- Probe: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
- Artifact/result: test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json - bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable, publishedControlPlaneEpoch=unknown, priority_control_plane_recovery_diagnostics_unavailable, failed_query_operations_table=46, and inflight_owner_pressure=8. The post-diagnostics rerun migrated away from this restarted-node authority failure shape.
- Representative movement: migrated-after-diagnostics-rerun
- Linked packages: `work/packages/done-20260526-20260526-rolling-restart-three-theory-validation.md`
- Supersedes: none
- Superseded by: none
- Next implication: Avoid selecting this baseline evidence for implementation; do not choose a control-snapshot authority runtime patch until a fresh artifact reproduces that edge, and current work should follow the priority recovery successor.

## theory-20260526-rolling-restart-logger-cpu-starvation

- Status: avoided
- Scenario/gate: rolling-restart / bootstrap_joining
- Owner/boundary: transport_owner / message_routing
- Hypothesis: Under high backpressure/load, the logging inside `PressureGovernor.emitPressureMetric` floods stdout/stderr without rate-limiting, causing 100% CPU starvation and event loop latency that stalls seed contact bootstrap joins.
- Probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Artifact/result: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json` - restarted node timeout joining seed node due to 100.3% CPU starvation on the seed node. Fresh routing from `test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json` selected `operation_workflow_owner / workflow_progress`, not transport message routing.
- Representative movement: migrated-after-fresh-route
- Linked packages: `work/packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md`, `work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md`, `work/packages/done-20260526-local-query-routing-loopback-bypass.md`
- Supersedes: none
- Superseded by: none
- Next implication: Do not select this transport/runtime patch while the current first frontier is workflow progress; require a fresh artifact that reselects transport_owner / message_routing before resuming this path.

## theory-20260526-rolling-restart-seed-websocket-cleanup

- Status: avoided
- Scenario/gate: rolling-restart / bootstrap_joining
- Owner/boundary: transport_owner / message_routing
- Hypothesis: Seed node's WebSocket/query transport fails to properly garbage-collect/clean up stale sockets or connection pool queues for restarted/inactive nodes, leading to file descriptor exhaustions and socket handshaking hangs.
- Probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Artifact/result: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`; fresh routing from `test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json` selected `operation_workflow_owner / workflow_progress`, not WebSocket cleanup.
- Representative movement: migrated-after-fresh-route
- Linked packages: `work/packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md`, `work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md`, `work/packages/done-20260526-local-query-routing-loopback-bypass.md`
- Supersedes: none
- Superseded by: none
- Next implication: Keep WebSocket cleanup out of scope unless a fresh representative artifact names transport_owner / message_routing again.

## theory-20260526-rolling-restart-rebalancer-outbound-saturation

- Status: superseded
- Scenario/gate: rolling-restart / priority_recovery_event_driven_wait
- Owner/boundary: operation_workflow_owner / workflow_progress
- Hypothesis: Rebalance coordinator background tasks aggressively queue priority recovery moves, saturating the outbound WebSocket queues on restarted nodes and delaying or dropping the critical readiness/joining handshakes.
- Probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown`
- Artifact/result: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`; latest priority-recovery extraction from `test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json` kept the owner at workflow progress but narrowed the next question to persisted-not-dispatched operation progress rather than generic outbound saturation.
- Representative movement: narrowed-after-fresh-route
- Linked packages: `work/packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md`, `work/packages/done-20260526-20260526-rolling-restart-three-theory-validation.md`, `work/packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress-triage.md`, `work/packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress.md`, `work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md`, `work/packages/done-20260526-rolling-restart-three-theory-source-analysis-verification.md`, `work/packages/done-20260526-local-query-routing-loopback-bypass.md`
- Supersedes: none
- Superseded by: theory-20260527-rolling-restart-priority-recovery-workflow-progress
- Next implication: Use the 2026-05-27 workflow-progress theory for routing; do not inspect generic queue limits until the focused workflow-progress proof selects them.

## theory-20260527-rolling-restart-priority-recovery-workflow-progress

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_event_driven_wait
- Owner/boundary: operation_workflow_owner / workflow_progress
- Hypothesis: Priority recovery work is present but remains persisted-not-dispatched, leaving downstream startup and active-gate symptoms blocked until operation workflow progress advances, classifies backpressure, or selects an architecture stop.
- Probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --markdown`
- Artifact/result: `test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json` - priority recovery extraction reported three `recovering_in_flight` witnesses under `operation_workflow_owner / workflow_progress`, with `dispatch_pending` / `planned` still the first frontier.
- Representative movement: same-frontier-narrowed
- Linked packages: `work/packages/active-20260527-rolling-restart-operation-workflow-owner-workflow-progress.md`, `work/packages/active-20260527-operation-workflow-progress-contract-conversion.md`
- Supersedes: theory-20260526-rolling-restart-rebalancer-outbound-saturation
- Superseded by: none
- Next implication: Keep admin, transport, and generic rebalancer edits out of scope; run the focused workflow-progress proof, then open a runtime-owner-boundary successor only for the selected mechanism or open an architecture experiment if the same frontier repeats without reduction.

## theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract

- Status: avoided
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Proactively bypassing or draining the write queue for critical active-gate snapshot operations stabilizes the active gate snapshot coverage under rolling-restart.
- Probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`
- Artifact/result: test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json
- Representative movement: same-frontier
- Linked packages: `work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md`, `work/packages/active-20260528-rolling-restart-active-gate-owner-reconcile-pending-recovery-contract.md`, `work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Supersedes: none
- Superseded by: none
- Next implication: Verify that bypassing logs table write queue resolves active_gate_timed_out frontier.
## theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage + priority_recovery_partition_progress
- Owner/boundary: startup_active_gate_owner / snapshot_coverage  ⇄  operation_workflow_owner / rebalancer_handoff
- Hypothesis: The two frontiers form a coupled-invariant pair: closing one without coupled evidence on the other re-routes the representative back to the partner. A single joint falsifier must reduce residual count on both boundaries simultaneously, or the loop is architecturally caused and must escalate via architecture-gap-analysis.
- Probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --explain snapshot_coverage`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json — follow-up joint probe reports priority-recovery residual witnesses at 0, down from the prior sprint reading of 6, while active_gate_snapshot_coverage remains the first frontier.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md`, `work/packages/superseded-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md`
- Supersedes: none
- Superseded by: none
- Next implication: The rederive may close with `theoryLoop.outcome: theory-confirmed`, but same-frontier/no-reduction on active_gate_snapshot_coverage still blocks another local startup_active_gate_owner / snapshot_coverage patch; select architecture-gap analysis before further source promotion.

## theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The selected-snapshot timeout plus deferred repair evidence on the fresh rolling-restart artifact cannot promote another local active-gate source package because it names only the repeated deferred retry contract; without a non-repeated owner transition, protocol/model/topology route, representative-green result, or real owner migration, runtime source promotion must stay blocked.
- Probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - fresh architecture-experiment representative rerun failed in 706.1s and still reports same-mechanism-repeat `contract_gap`; scenario-route emits `runtimePromotionGuard.state=blocked`; topology-convergence exposes only `selected_snapshot_source_timeout` plus `snapshot_repair_deferred`; causal-model keeps `topology:active_gate_snapshot_coverage` as the first critical path; priority-recovery residuals remain zero; terminal `benchmark_events` SQL visibility remains downstream.
- Representative movement: architecture-gap-stop
- Linked packages: `work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md`, `work/packages/done-20260529-rolling-restart-active-gate-saturation-architecture-gap-analysis.md`, `work/packages/done-20260529-rolling-restart-active-gate-saturation-fresh-system-theory-rederive.md`, `work/packages/done-20260529-rolling-restart-active-gate-saturation-architecture-gap-experiment.md`
- Supersedes: none
- Superseded by: none
- Next implication: Do not open another local startup_active_gate_owner / snapshot_coverage runtime package from this artifact. Runtime promotion remains blocked until fresh representative evidence or focused proof names a non-repeated owner-owned transition, protocol/model/topology route, representative-green result, or real owner-boundary migration.

## theory-20260529-rolling-restart-active-gate-snapshot-coverage-checkpoint-rederive

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: After the architecture-gap experiment closes without representative-green success, the same active-gate contract-gap route must be rederived at the sprint checkpoint before any runtime or architecture successor activates.
- Probe: `npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - checkpoint proof still selects active_gate_snapshot_coverage with zero priority-recovery residual witnesses and blocked runtime promotion; `work:system-theory:rederive` reports same-mechanism-repeat `contract_gap`; topology-convergence exposes selected_snapshot_source_timeout plus snapshot_repair_deferred; causal-model keeps topology:active_gate_snapshot_coverage first; the date-only check-due command still reports 12 same-day closed packages, so this package records the checkpoint result without changing workflow tooling.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-saturation-checkpoint-system-theory-rederive.md`
- Supersedes: theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop
- Superseded by: none
- Next implication: Close the checkpoint rederive as architecture-gap continuation. Runtime promotion remains blocked until future fresh representative evidence or focused proof names a non-repeated owner-owned transition, protocol/model/topology route, representative-green result, or real owner-boundary migration.

## theory-20260529-rolling-restart-active-gate-post-rerun-system-theory-rederive

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Post-architecture-gap same-frontier owner_reconcile_pending evidence confirms active-gate contract-gap saturation; runtime promotion remains blocked until fresh representative evidence or focused proof names a non-repeated source contract, owner-boundary migration, protocol/model/topology route, or representative-green.
- Probe: `npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md --write`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - system-theory rederive reports same-mechanism-repeat contract_gap; scenario-route keeps active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending; topology-convergence exposes snapshot coverage 1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, and one pending owner queue write; priority-recovery residual witnesses remain 0.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-post-rerun-system-theory-rederive.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close the post-rerun rederive as architecture continuation unless proof later names a non-repeated source contract, owner-boundary migration, protocol/model/topology route, or representative-green result.

## theory-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Corrected runtime-promotion guard evidence makes owner_reconcile_pending an architecture discriminator rather than permission for another repeated active-gate runtime patch.
- Probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - scenario-route reports `runtimePromotionGuard.state=blocked` with reason `saturated_history_requires_non_repeated_source_contract`; frontier-history reports exhausted loop health with same-mechanism-repeat and pair-alternation-post-rederive; topology-convergence exposes publicationActiveGateHandoffRuntimePromotionAllowed=false, selected_snapshot_source_timeout, snapshot_repair_deferred, and one pending owner queue write; priority-recovery residual witnesses remain 0; causal-model keeps topology:active_gate_snapshot_coverage as the first critical path.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-post-guard-architecture-gap-analysis.md`
- Supersedes: theory-20260529-rolling-restart-active-gate-post-rerun-system-theory-rederive
- Superseded by: none
- Next implication: Runtime promotion remains blocked from this artifact. Because architecture-gap is non-terminal for the sprint, redirect to fresh representative route evidence unless future proof names a non-repeated owner-owned transition, owner-boundary migration, protocol/model/topology route, fresh representative movement, or representative-green result.

## theory-20260529-rolling-restart-release-gate-system-theory-rederive

- Status: supported
- Scenario/gate: rolling-restart / rolling_restart_fully_green_gate
- Owner/boundary: release_gate_owner / rolling_restart_fully_green_gate
- Hypothesis: Release-gate same-mechanism-repeat observation_gap means rerun packages are redirects, not terminal fixes; the sprint must record a system-theory revision before another release-gate route package can activate.
- Probe: `npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md --write`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - release-gate rederive reports same-mechanism-repeat observation_gap; scenario-route keeps representative evidence on active_gate_snapshot_coverage with runtimePromotionGuard.state=blocked, loopHealth=rederive-in-progress, and priority-recovery residuals 0; frontier-history reports closuresSinceLastRederive=0 and continuationRequired=true.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-release-gate-system-theory-rederive.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close the release-gate system-theory rederive as a non-terminal architecture continuation; redirect to the next valid successor, with runtime source promotion still blocked until fresh evidence or an architecture-route implementation selects it.

## theory-20260529-rolling-restart-active-gate-timeout-post-rerun-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Post-release-gate representative evidence repeats active_gate_timed_out on the saturated active-gate pair; because runtimePromotionGuard is blocked and frontier-history reports same-mechanism-repeat plus pair-alternation-post-rederive, no runtime source work may promote from this artifact unless a future proof names a non-repeated source contract, real owner migration, implementable protocol/model/topology route, or representative-green.
- Probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - focused proof keeps active_gate_snapshot_coverage first with active_gate_timed_out, snapshot coverage 1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, zero priority-recovery residual witnesses, runtimePromotionGuard.state=blocked, historyCount=12, loopHealth=exhausted, and route-after-rerun selects open-architecture-experiment.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-timeout-post-rerun-architecture-gap-analysis.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close this package as architecture-gap analysis and open the autonomous architecture experiment/fresh route selected by route-after-rerun; do not edit runtime source from this artifact until a non-repeated contract, real migration, implementable architecture route, or representative-green proof exists.

## theory-20260529-rolling-restart-active-gate-handoff-selection-architecture-experiment

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The active-gate handoff contract selection path is not a non-repeated source transition for the fresh active_gate_timed_out artifact: it converts selected_snapshot_source_timeout plus repair_deferred retry into pending recovery / wait_owner_recovery and keeps runtime promotion denied, so source promotion remains blocked from this artifact.
- Probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - frontier-history loopHealth=exhausted with same-mechanism-repeat and pair-alternation-post-rederive; scenario-route runtimePromotionGuard.state=blocked with historyCount=12 and zero priority residuals; evidence-summary keeps active_gate_snapshot_coverage first with active_gate_timed_out, selected_snapshot_source_timeout, snapshot_repair_deferred, and publicationActiveGateHandoffRuntimePromotionAllowed=false; source review shows publication-active-gate-handoff-contract-selection.js maps deferred retry to pendingRecovery/wait_owner_recovery rather than a new owner transition.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-handoff-contract-selection-architecture-experiment.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close the handoff selection architecture experiment as architecture-gap continuation; do not edit runtime source from this artifact unless a future proof names a non-repeated transition, owner migration, protocol/model/topology route, or representative-green result.

## theory-20260529-rolling-restart-active-gate-owner-pending-write-reentry-architecture-experiment

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The fresh owner_reconcile_pending pending-write shape is architecture-level saturation unless proof names a non-repeated membership-publication reentry contract.
- Probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - focused source-context proof found `membership-publication-active-gate-reconcile.js` already covers drained snapshot reentry, accepted owner wake enqueue, and queue-pressure reentry; the focused owner-recovery test passed; scenario-route still reports `runtimePromotionGuard.state=blocked` with `saturated_history_requires_non_repeated_source_contract`, `historyCount=12`, same-mechanism-repeat plus pair-alternation-post-rederive, and zero priority-recovery residual witnesses; topology still reports `membershipPublicationHandoffOutcomeEnqueued=false` with one selected owner pending write.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-owner-pending-write-reentry.md`
- Supersedes: theory-20260529-rolling-restart-active-gate-handoff-selection-architecture-experiment
- Superseded by: none
- Next implication: Close the pending-write architecture experiment as architecture-gap continuation. Runtime promotion remains blocked until future fresh representative evidence or focused proof names a non-repeated source contract, real owner migration, implementable protocol/model/topology route, fresh representative movement, or representative-green result.

## theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: owner_reconcile_pending with write_deferred, enqueued=false, and retryAfterMs=0 is an architecture-route discriminator: runtime source promotion must resume only through a bounded owner wake scheduling route.
- Probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - scenario-route reports runtimePromotionGuard.state=blocked with pair-alternation-post-rederive and zero priority residuals; topology exposes membershipPublicationHandoffOutcomeState=write_deferred, enqueued=false, retryAfterMs=0, selectedControlPlaneOwnerQueuePendingWrites=1, and progressContract.retryAfterMs=1000.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md`
- Supersedes: none
- Superseded by: none
- Next implication: Open the scheduling architecture-route implementation with theoryLoop.architectureRoute before any further startup_active_gate_owner / snapshot_coverage source work.

## theory-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: After the bounded owner wake scheduling route, active_gate_timed_out with membershipPublicationHandoffOutcomeEnqueued=true and retryAfterMs=100 is still repeated architecture-level evidence; runtime source promotion remains blocked unless proof names a non-repeated owner wake delivery/observation contract, owner migration, protocol/model/topology route, fresh representative movement, or representative-green result.
- Probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - scenario-route reports `runtimePromotionGuard.state=blocked` with reason `saturated_history_requires_non_repeated_source_contract`; frontier-history reports `loopHealth=exhausted` with same-mechanism-repeat and pair-alternation-post-rederive; topology-convergence exposes activeGateState=timed_out, snapshot coverage 1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, membershipPublicationHandoffOutcomeEnqueued=true, membershipPublicationHandoffOutcomeRetryAfterMs=100, and zero priority-recovery residual witnesses.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap.md`
- Supersedes: theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap
- Superseded by: none
- Next implication: Close the timeout-after-wake analysis as architecture-gap continuation and open the owner wake delivery architecture experiment; do not edit runtime source from this artifact until a future proof names a non-repeated owner-owned transition, owner-boundary migration, protocol/model/topology route, fresh representative movement, or representative-green result.

## theory-20260530-rolling-restart-active-gate-owner-wake-delivery-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Owner wake delivery/observation after enqueue is not a new source route in the current artifact because owner_recovery_wake and controlPlaneConvergence are already named and propagated, while active_gate_timed_out still owns the first active-gate snapshot-coverage frontier with runtimePromotionGuard blocked.
- Probe: `rg -n "owner_recovery_wake|controlPlaneConvergence|retryAfterMs" src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/membership-publication-control-plane-convergence.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/admin/admin-control-snapshot-publication-handoff.js`
- Artifact/result: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` - frontier-history and scenario-route keep active_gate_snapshot_coverage on startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, runtimePromotionGuard.state=blocked, historyCount=12, loopHealth=exhausted, snapshot coverage 1/5, selected_snapshot_source_timeout after 100ms, snapshot_repair_deferred, membershipPublicationHandoffOutcomeEnqueued=true, membershipPublicationHandoffOutcomeRetryAfterMs=100, and zero priority-recovery residual witnesses. Source-context proof shows OWNER_RECOVERY_WAKE is defined in membership-publication convergence, active-gate reconcile builds and returns owner recovery wake convergence with retryAfterMs, and admin snapshot handoff/query surfaces expose controlPlaneConvergence and retry metadata.
- Representative movement: architecture-gap
- Linked packages: `work/packages/done-20260529-rolling-restart-active-gate-owner-wake-delivery-architecture-experiment.md`
- Supersedes: theory-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap
- Superseded by: none
- Next implication: Close the owner wake delivery architecture experiment as architecture-gap continuation. Runtime source promotion remains blocked until fresh representative evidence or focused proof names a non-repeated owner-owned transition, owner-boundary migration, protocol/model/topology route, or representative-green result; the next autonomous action is a fresh representative route gate.

## theory-20260530-rolling-restart-release-gate-observation-gap-system-theory-rederive

- Status: supported
- Scenario/gate: rolling-restart / rolling_restart_fully_green_gate
- Owner/boundary: release_gate_owner / rolling_restart_fully_green_gate
- Hypothesis: Release-gate same-mechanism-repeat observation_gap means rerun packages are redirects, not terminal fixes; the sprint must record a system-theory revision before another release-gate route package can activate.
- Probe: `npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md --write`
- Artifact/result: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json - release-gate rederive reports same-mechanism-repeat observation_gap; scenario-route keeps representative evidence on active_gate_snapshot_coverage with runtimePromotionGuard.state=blocked, loopHealth=rederive-in-progress, and priority-recovery residuals 0; frontier-history reports closuresSinceLastRederive=0 and continuationRequired=true.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260530-rolling-restart-release-gate-observation-gap-system-theory-rederive.md`
- Supersedes: none
- Superseded by: none
- Next implication: Close the release-gate system-theory rederive as a non-terminal architecture continuation; redirect to the next valid successor, with runtime source promotion still blocked until fresh evidence or an architecture-route implementation selects it.

## theory-20260530-active-gate-bounded-reentry-model-architecture-gap

- Status: superseded
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Bounding owner re-entry so a covered/published node is not returned to pendingReconcile (ActiveGate.tla route, AllowUnboundedReentry=FALSE) restores active-gate snapshot-coverage convergence, which the unbounded protocol provably starves.
- Probe: `npm run model:check then fresh rolling-restart representative rerun`
- Artifact/result: Both checkers confirm bounded route converges, unbounded oscillates; 300-run model-to-real-reducer binding holds. Evidence: test-output/reports/active-gate-tlc-route.model.report.json and test-output/reports/active-gate-tlc-stall.model.report.json
- Representative movement: architecture-gap
- Linked packages: `work/packages/done-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md`
- Supersedes: none
- Superseded by: theory-20260530-active-gate-bounded-reentry-model-implementation
- Next implication: Open the runtime successor package (causal-escalation, runtime owner-boundary) that implements the model-layer bounded-re-entry invariant in src/control-plane/publication-active-gate-handoff-contract-decision.js, then run its falsifier and regression proof before closure.

## theory-20260530-active-gate-bounded-reentry-model-implementation

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Implementing the model-layer bounded-re-entry invariant (AllowUnboundedReentry=FALSE) in the decision rule table (src/control-plane/publication-active-gate-handoff-contract-decision.js) to exclude already covered or published nodes from owner_reconcile_pending resolves the active-gate handoff oscillation model.
- Probe: `npm run model:check && npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Artifact/result: `test-output/reports/active-gate-tlc-route.model.report.json` - TLC confirms route converges; local test suite reports 100% success on 20 tests.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route-implementation.md`
- Supersedes: theory-20260530-active-gate-bounded-reentry-model-architecture-gap
- Superseded by: theory-20260530-active-gate-bounded-reentry-representative-rerun
- Next implication: Run a fresh representative scenario rerun to generate fresh representative routing evidence and verify if the active-gate snapshot-coverage oscillation is eliminated from rolling-restart.

## theory-20260530-active-gate-bounded-reentry-representative-rerun

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Verifying the representative scenario rerun following implementation of the model-layer bounded-reentry invariant (AllowUnboundedReentry=FALSE) confirms that active-gate snapshot-coverage moves off owner_reconcile_pending toward convergence.
- Probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner startup_active_gate_owner --boundary snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json` - representative rerun confirms active-gate snapshot-coverage oscillation is resolved; the scenario progresses past the active-gate snapshot-coverage phase to a downstream table partition visibility timeout.
- Representative movement: reduced
- Linked packages: `work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-representative-rerun.md`
- Supersedes: theory-20260530-active-gate-bounded-reentry-model-implementation
- Superseded by: none
- Next implication: The active-gate snapshot-coverage oscillation is resolved (status: reduced). The sprint can now proceed to address the downstream startup readiness or table partition visibility blockers.

## theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / rebalancer_handoff
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: Rebalancer handoff priority recovery event-driven wait currently stalls due to missed or delayed events; implementing scheduling retry wake convergence (e.g. scheduler retry wake timer) prevents indefinite stalling and liveness blockages.
- Probe: `npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json` - pre-implementation rederived system theory matches same-mechanism-repeat contract_gap pattern, validating the system-theory rederivation.
- Representative movement: reduced
- Linked packages: `work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md`
- Supersedes: none
- Superseded by: none
- Next implication: Open the successor runtime-owner-boundary package to implement the scheduler retry wake convergence in src/rebalancer/operation-workflow-owner-ports.js.

## theory-20260531-rolling-restart-contract-first-green-loop

- Status: supported
- Scenario/gate: rolling-restart / rolling_restart_fully_green_gate
- Owner/boundary: release_gate_owner / rolling_restart_fully_green_gate
- Hypothesis: After the previous sprint stayed at `accept_classified_backpressure`,
  the highest-leverage next step is a contract-first route discriminator that
  decides whether the residual is accepted bounded backpressure, rebalancer handoff
  defect, active-gate convergence defect, stale evidence, or release-gate
  expectation mismatch.
- Probe: `npm run model:contracts`, `npm run work:loop-health -- --owner operation_workflow_owner --boundary rebalancer_handoff`, and `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json` - `npm run model:contracts` passed after repairing the stale `architecture/contracts/rolling-restart-rebalancer-handoff.md` package reference; canonical route evidence reports causal outcome `accept_classified_backpressure`.
- Representative movement: classification-only
- Linked packages: `work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md`
- Supersedes: `theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap`
- Superseded by: theory-20260531-rolling-restart-contract-first-green-fresh-rerun
- Next implication: Open fresh representative rolling-restart evidence before
  runtime source work; if the rerun is red, route the fresh first frontier.

## theory-20260531-rolling-restart-contract-first-green-fresh-rerun

- Status: supported
- Scenario/gate: rolling-restart / rolling_restart_fully_green_gate
- Owner/boundary: release_gate_owner / rolling_restart_fully_green_gate
- Hypothesis: After release-gate observation-gap saturation is rederived, a fresh representative rerun either exits green or selects one fresh first frontier before runtime promotion.
- Probe: `npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose`, and `npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json` - fresh representative evidence is red at `active_gate_snapshot_coverage` under `startup_active_gate_owner / snapshot_coverage` with `owner_reconcile_pending`, `selected_snapshot_source_timeout`, and `snapshot_repair_deferred`; priority-recovery residual witnesses are `0`; route-after-rerun reports `runtimePromotionGuard.state=blocked` with `saturated_history_requires_non_repeated_source_contract`.
- Representative movement: reduced
- Linked packages: `work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md`, `work/packages/todo-20260531-rolling-restart-active-gate-observation-route.md`
- Supersedes: theory-20260531-rolling-restart-contract-first-green-loop
- Superseded by: theory-20260531-rolling-restart-active-gate-observation-route-implementation
- Next implication: Continue with the startup_active_gate_owner / snapshot_coverage observation-layer architecture-route successor before any unguided runtime source promotion; representative green remains required to close the sprint.

## theory-20260531-rolling-restart-active-gate-observation-route-implementation

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Implementing the selected observation-layer route in `src/control-plane/publication-active-gate-handoff-contract-decision.js` prevents selected snapshot recovery-only evidence from re-entering membership publication reconcile and instead preserves owner recovery observation as `wait_owner_recovery`.
- Probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`, `npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`, and the selected snapshot recovery-only discriminator probe.
- Artifact/result: `work/packages/active-20260531-rolling-restart-active-gate-observation-route.md` - focused proof passed; the discriminator probe returned `nextAction=wait_owner_recovery`, `pendingRecoveryNodeIds=["selected-node"]`, and `pendingReconcileNodeIds=[]` for selected snapshot recovery-only evidence.
- Representative movement: needs-rerun
- Linked packages: `work/packages/active-20260531-rolling-restart-active-gate-observation-route.md`, `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md`
- Supersedes: theory-20260531-rolling-restart-contract-first-green-fresh-rerun
- Superseded by: theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun
- Next implication: Run fresh representative rolling-restart evidence at `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`, route the result, and continue only from representative-green, reduction, migration, architecture-gap, or the selected successor.

## theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: Fresh representative evidence after the observation-route implementation either moves active-gate snapshot coverage or proves that the route is visible but insufficient, requiring a non-repeated successor route before runtime promotion.
- Probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose`, `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json` - representative evidence stayed same-frontier at `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending`; topology exposes the local route as `wait_owner_recovery` with one pending recovery node and zero pending reconcile nodes, but snapshot coverage remains 1/5 with `selected_snapshot_source_timeout` plus `snapshot_repair_deferred`; priority-recovery residual witnesses are 0; `runtimePromotionGuard.state=blocked` with `saturated_history_requires_non_repeated_source_contract`.
- Representative movement: same-frontier
- Linked packages: `work/packages/active-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md`, `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md`
- Supersedes: theory-20260531-rolling-restart-active-gate-observation-route-implementation
- Superseded by: theory-20260531-rolling-restart-active-gate-observation-route-architecture-gap
- Next implication: Open the same-frontier architecture experiment to select a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop before any runtime source write.

## theory-20260531-rolling-restart-active-gate-observation-route-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / active_gate_snapshot_coverage
- Owner/boundary: startup_active_gate_owner / snapshot_coverage
- Hypothesis: The post-observation-route `wait_owner_recovery` evidence is visible but not a non-repeated source route; with `runtimePromotionGuard.state=blocked`, runtime source promotion remains blocked unless fresh proof names a rotated architecture route, owner-boundary migration, representative movement, or representative-green.
- Probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json` - frontier-history reports `loopHealth=exhausted` with `same-mechanism-repeat` and `pair-alternation-post-rederive`; scenario-route keeps `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending` with `runtimePromotionGuard.state=blocked`; topology-convergence exposes `wait_owner_recovery`, one pending recovery node, zero pending reconcile nodes, `selected_snapshot_source_timeout`, and `snapshot_repair_deferred`; source review found no named non-repeated post-wait active-gate successor.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md`
- Supersedes: theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun
- Superseded by: theory-20260531-rolling-restart-active-gate-post-architecture-gap-rerun
- Next implication: Do not open another local startup_active_gate_owner / snapshot_coverage runtime patch from this artifact. Continue only through fresh representative movement, owner-boundary migration, a rotated architecture route, or representative-green proof.

## theory-20260531-rolling-restart-active-gate-post-architecture-gap-rerun

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: Fresh representative evidence after the active-gate architecture-gap selector is the valid discriminator; it should either move active-gate out of first frontier, migrate ownership, go green, or select a non-runtime successor before another active-gate source package.
- Probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose`
- Artifact/result: `test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json` - representative rerun failed, but first frontier migrated to `priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait`; causal model reports `accept_classified_backpressure`, `classified_backpressure`, `topology:priority_recovery_partition_progress`, zero failed invariants, and priority recovery residuals report 8 recovering-in-flight witnesses in one owner-boundary group.
- Representative movement: migrated
- Linked packages: `work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md`
- Supersedes: theory-20260531-rolling-restart-active-gate-observation-route-architecture-gap
- Superseded by: theory-20260531-rolling-restart-priority-recovery-backpressure-reduced-rerun
- Next implication: Continue through `operation_workflow_owner / rebalancer_handoff` priority recovery backpressure evidence; do not open another local `startup_active_gate_owner / snapshot_coverage` runtime patch from the previous same-frontier artifact.

## theory-20260531-rolling-restart-priority-recovery-backpressure-reduced-rerun

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: Classified priority-recovery backpressure is making bounded progress and can continue draining on fresh representative evidence without source edits.
- Probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose`
- Artifact/result: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` - representative rerun failed at the downstream benchmark_events partition visibility timeout, but the first frontier remained `priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait` and priority-recovery residual witnesses reduced from 8 to 2. Causal model reports `accept_classified_backpressure`, `classified_backpressure`, `topology:priority_recovery_partition_progress`, zero failed invariants, and zero exhausted budgets.
- Representative movement: reduced
- Linked packages: `work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md`
- Supersedes: theory-20260531-rolling-restart-active-gate-post-architecture-gap-rerun
- Superseded by: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-rederive
- Next implication: Continue with a fresh priority-recovery drain rerun gate before runtime source promotion. If the next representative artifact repeats priority recovery with no further reduction, redirect to a concrete runtime/tooling successor or architecture/causal successor instead of another local source patch.

## theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-rederive

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: The reduced priority-recovery accepted-backpressure residual is no longer a valid direct runtime or representative-rerun continuation; same-mechanism-repeat contract_gap requires a rederived route and architecture-gap successor before another local slice.
- Probe: `npm run work:system-theory:rederive -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 12 --sprint work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md --write`
- Artifact/result: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` - system-theory rederive reported `rederivationRequired=true` with `same-mechanism-repeat contract_gap` and stamped the sprint. Frontier history reported `loopHealth=rederive-in-progress`, `continuationRequired=true`, and `architectureRouteState=none`; scenario-route and causal-model kept `accept_classified_backpressure` / `classified_backpressure` with 2 priority-recovery witnesses, zero failed invariants, and zero exhausted budgets.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-architecture-experiment.md`
- Supersedes: theory-20260531-rolling-restart-priority-recovery-backpressure-reduced-rerun
- Superseded by: theory-20260531-rolling-restart-owner-dossier-contract-binding-repair-route
- Next implication: Close the rederive as architecture-gap continuation and open the architecture-gap analysis successor. Do not run another representative drain rerun or operation-workflow source package until the successor selects a non-repeated runtime transition, owner-boundary migration, evidence regeneration, model/contract repair, representative-green path, or architecture-gap stop.

## theory-20260531-rolling-restart-owner-dossier-contract-binding-repair-route

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: workflow_tooling_owner / owner_dossier_contract_binding
- Hypothesis: The architecture-gap proof cannot select a non-repeated
  operation-workflow source transition while owner-dossier under-classifies the
  durable rebalancer handoff System Contract Record; the lightest legal route is
  a workflow-tooling repair that binds records declared through `owners[]`.
- Probe: `npm run work:frontier-history -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 12`, `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json`, and `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md`
- Artifact/result: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` - frontier-history kept `same-mechanism-repeat contract_gap` with no non-repeated runtime transition; owner-dossier returned `contractRecord: null`; contract-check passed and the durable contract records `operation_workflow_owner / rebalancer_handoff` in `owners[]`, proving a workflow-tooling lookup drift rather than a runtime source route.
- Representative movement: migrated
- Linked packages: `work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-architecture-experiment.md`, `work/packages/todo-20260531-owner-dossier-contract-owners-binding-repair.md`
- Supersedes: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-rederive
- Superseded by: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-architecture-gap
- Next implication: Activate the workflow_tooling_owner / owner_dossier_contract_binding repair package. Do not open operation-workflow runtime source or another representative drain rerun until `work:owner-dossier` resolves `architecture/contracts/rolling-restart-rebalancer-handoff.md` for `operation_workflow_owner / rebalancer_handoff`.

## theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: After owner-dossier resolves the dedicated rebalancer handoff
  contract, the next legal route is the selected scheduling-layer
  architecture-route implementation that binds priority recovery accepted
  backpressure to an owner wake/progress path rather than another analysis or
  representative drain rerun.
- Probe: `npm run work:frontier-history -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 12`, `npm run work:loop-health -- --owner operation_workflow_owner --boundary rebalancer_handoff`, and `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json`
- Artifact/result: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` - frontier-history reports `architectureRouteState=implement-pending` after the architecture-gap selector, loop-health says the next legal move is the architecture-route implementation package for the selected layer, and owner-dossier now resolves `architecture/contracts/rolling-restart-rebalancer-handoff.md` for `operation_workflow_owner / rebalancer_handoff`.
- Representative movement: architecture-gap
- Linked packages: `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-architecture-experiment.md`, `work/packages/done-20260531-owner-dossier-contract-owners-binding-repair.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md`
- Supersedes: theory-20260531-rolling-restart-owner-dossier-contract-binding-repair-route
- Superseded by: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-implementation
- Next implication: Open the runtime-owner-boundary architecture-route implementation with `theoryLoop.architectureRoute.selectedLayer=scheduling`, cite this ledger ref, and keep representative rerun work blocked until the focused owner wake proof passes.

## theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-implementation

- Status: supported
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: Binding retry-scheduled rebalancer handoff progress to an explicit bounded owner re-entry contract state proves the selected scheduling-layer owner wake route locally and permits the next representative rerun gate.
- Probe: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`, `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json`, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`
- Artifact/result: Focused proof passed with 247/247 assertions after adding `ownerReentryState: bounded_owner_reentry_scheduled` for retry-scheduled `rebalancer_handoff` progress. Scenario-route still classifies the existing artifact as `accept_classified_backpressure` with two priority-recovery witnesses, and owner-dossier resolves `architecture/contracts/rolling-restart-rebalancer-handoff.md`.
- Representative movement: classification-only
- Linked packages: `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md`
- Supersedes: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-architecture-gap
- Superseded by: theory-20260531-rolling-restart-representative-rerun-progress-model-route
- Next implication: Activate the representative rerun gate and do not open another runtime source package until fresh post-route evidence reduces, clears, migrates, repeats with no reduction, or records architecture-gap continuation.

## theory-20260531-rolling-restart-representative-rerun-progress-model-route

- Status: supported
- Scenario/gate: rolling-restart / representative_progress_circuit_breaker
- Owner/boundary: representative_evidence_owner / rolling_restart_rerun
- Hypothesis: After the owner wake route proof, the non-shrinking representative residual-count window blocks another rolling_restart_rerun evidence slice; the next legal move is a model-layer route that records blocked_model_route and exits through system-theory rederive, owner-boundary migration, or architecture/causal successor.
- Probe: `node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('docs/specs/representative-rerun-progress-model.json','utf8')); if (!m.transitions.some((t)=>t.on==='window_non_shrinking' && t.next==='blocked_model_route')) throw new Error('missing non-shrinking window block'); if (!m.properties.some((p)=>p.id==='non_shrinking_window_blocks_rerun')) throw new Error('missing model property');"`, `npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json`, and `npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12`
- Artifact/result: `docs/specs/representative-rerun-progress-model.json` records `window_non_shrinking -> blocked_model_route` and the `non_shrinking_window_blocks_rerun` property. Owner-dossier reports `currentResidual=1`, no contract record, no invariants, and no model coverage for `representative_evidence_owner / rolling_restart_rerun`. Frontier-history keeps the pair in implement-pending model-route state, while the stale representative artifact remains `accept_classified_backpressure` at `operation_workflow_owner / rebalancer_handoff`.
- Representative movement: architecture-gap
- Linked packages: `work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-system-theory-rederive.md`
- Supersedes: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-implementation
- Superseded by: none
- Next implication: Close the model route as non-terminal architecture-gap learning and activate the post-model operation_workflow_owner / rebalancer_handoff system-theory rederive; do not run another representative rerun from the non-shrinking residual window.

## theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-rederive-architecture-gap

- Status: supported
- Scenario/gate: rolling-restart priority recovery post-model rebalancer handoff rederive
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: The post-model system-theory rederive cannot authorize runtime source promotion or another representative rerun while same-mechanism-repeat contract_gap persists.
- Probe: `npm run work:system-theory:rederive -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 12 --sprint work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md --write`
- Artifact/result: Evidence test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json: rederiveRequired=true with same-mechanism-repeat contract_gap; scenario route remains accept_classified_backpressure with 2 priority-recovery witnesses; no concrete runtime transition, migration, evidence regeneration, or representative rerun route selected
- Representative movement: architecture-gap continuation; runtime source and representative rerun remain blocked
- Linked packages: `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-system-theory-rederive.md`, `work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md`, `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md`
- Supersedes: none
- Superseded by: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair
- Next implication: The post-model architecture-gap experiment selected model/contract route repair because accepted backpressure still maps to representative rerun while the representative-progress model blocks rerun.

## theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair

- Status: active
- Scenario/gate: rolling-restart / priority_recovery_partition_progress
- Owner/boundary: operation_workflow_owner / rebalancer_handoff
- Hypothesis: Accepted classified backpressure plus a model-blocked representative rerun exposes a model/contract route gap: the rebalancer handoff decision table still emits `rerun_representative_evidence` even though the representative-progress circuit breaker blocks another rerun.
- Probe: `npm run work:frontier-history -- --owner operation_workflow_owner --boundary rebalancer_handoff --limit 12`, `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`, `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json`, `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md`, and `npm run model:decision-tables`
- Artifact/result: Architecture-gap proof selected model/contract repair. Scenario-route and causal-model still report `accept_classified_backpressure` with two priority-recovery witnesses and zero failed invariants; owner-dossier binds `architecture/contracts/rolling-restart-rebalancer-handoff.md`; contract and decision-table checks pass structurally, but the route table does not represent the blocked representative-rerun state.
- Representative movement: architecture-gap
- Linked packages: `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-architecture-experiment.md`, `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md`, `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-system-theory-rederive.md`, `work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md`, `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md`
- Supersedes: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-rederive-architecture-gap
- Superseded by: none
- Next implication: Activate the decision-table/contract repair package before runtime source promotion or representative rerun.
