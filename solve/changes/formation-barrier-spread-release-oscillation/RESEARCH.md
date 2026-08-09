# Research synthesis: formation barrier spread-release oscillation

Quest: `formation-barrier-spread-release-oscillation`. Source: read-only code
trace + archived live-run evidence (2026-08-09). HEAD at research: `788682214`.

## The wait (joiner side)

- Owner: `NodeJoiningOperationLedgerFormationReadiness.awaitOperationLedgerFormationBarrier()`
  — `src/bootstrap/node-joining-operation-ledger-formation-readiness.js:423-480`.
  Polling `while(true)` loop, 500ms poll, 5s discovery, **120s timeout** that
  THROWS (`OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT`, retryable) — it never
  degrades. Called from `signalReadyForReplicas`
  (`src/bootstrap/node-joining-ready-signal-readiness.js:409`) as the last gate
  before READY-lease publication; time attributed to `joining:readiness-convergence`.
- Release legs (ALL must hold in one iteration): engagement latch (>=3
  candidates, >=2 pre-ready); spread proof — `replica_operations-p1` at >=3
  voters, >=3 distinct nodes, unconcentrated, proven via OWNER_RPC_REQUIRED
  read (`src/rebalancer/operation-ledger-quorum-concentration.js:334-429`);
  zero in-flight ledger ops. Iteration 1 structurally cannot satisfy (drain
  observation only enabled once engaged), so engaged release >= 500ms + 2 RPCs.
- **Bimodality proof:** green joins measure 4-8ms — only possible via the
  hard guards at the top (durable-rejoin, or startup-authority snapshot absent)
  or when the barrier never engages. When engaged, in observed reds it NEVER
  releases: barrier logs oscillate `waiting_for_ledger_spread` ↔
  `waiting_for_ledger_observation`, `observedVoterCount:3`,
  `authoritativePlacementSource:"owner_rpc_lane"`, `spreadProofComplete`
  flapping true/false, `inFlightOperationCount:null` (drain leg never
  completes) — all 3 abfix red runs, e.g.
  `test-output/reports/.playback/ec-abfix-20260809T174802Z/.full-logs/`.
- The waiter is passive-plus-heartbeat (republishes CONNECTED heartbeat-only);
  it CAN host replicas while waiting (CREATE_REPLICA has no ready-lease gate).

## The spread (seed side)

- Owner: per-entity `UnifiedRebalancer` + `MovePlanner`; spread requirement
  `analyzePrioritySpread` (`src/rebalancer/move-planner-state-methods.js:559-587`);
  cures in `move-planner-priority-spread-cure.js` (REPLACE/ADD/REMOVE).
- Placement DOES target JOINING nodes for priority control-plane partitions
  (`src/rebalancer/unified-rebalancer-available-nodes.js:186-245` →
  `startup-authority-placement-eligibility.js:10-13,45-72`) — the intended
  circularity cut, first-class and always on.
- **Owner disagreement:** the admission hold's feasibility scan
  (`operation-ledger-quorum-concentration.js:80-107` via
  `operation-ledger-hold-policy.js:282-294`) counts only
  `connection_state === 'ready'` nodes (no placementEligibleNodeIds supplied)
  → during formation `spreadActionable=false`, hold disengaged — while the
  joiner barrier blocks on bare concentration. Two owners, two truths.

## Where the circle re-closes (candidate links)

- **Link A (primary): ledger-write self-dependency.** Every spread op's
  progress write goes into `replica_operations-p1` itself through a system
  write session (`replica-operation-repository-mutation-gateway-methods.js:507-522,589-600`)
  whose bookkeeping persists into `sql_transactions` /
  `sql_transaction_participants` / `sql_write_operations`
  (`distributed-transaction-coordinator.js:380-447`) — all six unspread,
  seed-led. Participant misses surface as `DISTRIBUTED_PARTICIPANT_FAILURE`,
  classified retryable-forever (`...gateway-methods.js:358-397`).
  NOTE: `disableSystemWriteSession:true` exists and is already used by the
  execution lane (`operation-workflow-owner-execution-lane.js:566`) and
  terminal repair — a session-bypass lane for formation-time spread-op
  progress writes is a candidate relief.
- **Link B: STOPPING observation never escalates.**
  `observeStoppingReplicaProgress` → anything not OBSERVED/ABSENT becomes
  `control_plane_pressure_degraded` deferRetry forever
  (`operation-workflow-recovery-observation.js:534-586`).
- `DISTRIBUTED_PARTICIPANT_FAILURE` is the generic ">=1 participant statement
  failed" wrapper, emitted even single-partition
  (`query-executor-sql-command-rendering.js:449-462` etc.) — unspread
  transaction tables are amplifier, not fault; the fault is
  unavailability/pressure of seed-led participants.

## July fixes (wired, different shapes)

- self-move ghost re-verify: `rebalance-coordinator-ledger-interlock-admission.js:275-347`
  — engages only on `waiting_for_idle_ledger`.
- `drainPhaseReplacementCredit`: now `src/rebalancer/replica-inventory.js:441-467`
  — suppresses spurious ADDs; irrelevant when ops cannot execute.

## Minimal deterministic repro (extend, don't build)

Extend `test/convergence/dt-formation-priority-placement-before-active.test.js`
(real barrier + real MovePlanner + virtual clock + SystemTableCache formation
fixture; green-path case at :565, tick driver :283-375). Three deltas:
1. Shrink cohort to seed + 2 pre-ready joiners (docker shape), replica_count 3,
   all voters on seed; assert engagement latch.
2. Make execution fail production-shaped in the tick driver: ledger progress
   write returns `DISTRIBUTED_PARTICIPant_FAILURE` while
   `isLedgerQuorumConcentratedPartition === true`; second variant returns
   `control_plane_pressure_degraded` at the STOPPING step. (Fault-model
   precedent: `dt6-formation-ledger-quorum-spread-first.test.js:14-45`.)
3. Do not stub the owner-RPC lane green — fail it under "pressure" so the
   cache-lane release-evidence path is exercised.

RED: barrier rejects `OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT` at 2/3
distinct nodes with >=1 op stuck STOPPING and no joiner ready lease.
GREEN: relief turns the same fixture into 3/3 + SATISFIED inside budget.
Guards: keep `:680,715,752` (two-node bypass, sequential growth, durable
rejoin) fail-closed.

## Field discriminator (live)

Grep joiner logs for `"Join priority-placement formation barrier"`; read
`state`, `spreadProofComplete`, `authoritativePlacementSource`,
`inFlightOperationCount`.
