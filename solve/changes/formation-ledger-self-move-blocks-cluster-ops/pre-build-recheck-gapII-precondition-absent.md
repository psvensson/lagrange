# Pre-build recheck: the gap (ii) create-on-missing precondition is ABSENT on the safe path

Before building the redesigned (level-triggered reap-on-timeout) gap (ii) fix, I
re-grounded the design against (a) a fresh subagent trace of the existing reaper and
(b) the freshest on-disk ledger + demo logs. The recheck **contradicts** building
gap (ii) as create-on-missing on the level-triggered path.

## What the design vetting confirmed (structurally sound parts)
- The existing level-triggered reaper `reconcileOrphanedOperations`
  (`operation-workflow-recovery-timeout.js:325-381`) DOES reach a stuck REPLACE at
  SENDING (staleness gate `shouldReconcileOrphanedOperation:396-433`, step timeout
  = `pendingTimeoutMs` 30s), is single-flight locked, self-throttled to 5s, and
  currently RE-DRIVES via `RECONCILE_REPLICA_STATUS` without ever repairing a
  divergence. So the reaper is the right *host* for a rare, safe repair.
- Reaper reads authority with `requireOwnerRpcRead:false` — genuinely cannot tell
  missing from lagging; an owner-RPC escalation would be needed.

## The fatal contradiction (E-cheap / wrong-leg trap)
The create-on-missing repair only fires when the owner-RPC authority read returns
`null` (row genuinely missing). But the missing-row window is **transient**
(formation-time participant hydration lag), and the level-triggered timing that makes
the repair *safe* (fires only after 30s staleness) is exactly what guarantees the row
has **already hydrated** by the time the reaper looks. On the safe path the row is
present → repair skipped → **structural no-op**.

Grounded evidence (freshest run, on-disk `replica_operations-p1` r2/r4/r5/r6 +
`node-*.log`, span 07:55–08:04):
- All 8 non-terminal ops' ledger rows are **present and identical on all four
  replicas** (present-but-stale, not missing). No surviving divergence.
- **Zero** `OPERATION_ROW_DIVERGENCE_REINSERT` events fired in the whole run — the
  create-on-missing path was never exercised for any stuck op.
- The two persistently-stuck REPLACEs (`07ffba1f` partitions-p1, `c5ebb424`
  latency_groups-p1) are stuck via a **different** mechanism: their coordinator
  handoff retry **"stopped at its operation budget; the operation remains for planner
  rearm / ready-node replay"** (~08:00, 5 min after create) and the planner never
  re-armed them. Their `No row found for CDC update` is on **storage_reservations-p1-r1**
  (gap iv reservation path), NOT `replica_operations`. Terminal 08:04 errors are
  shutdown noise (`QUERY_EXECUTOR_SHUTTING_DOWN` / `sqlQueryEngine not provided`).

## Consequence for "the gap II route"
Gap (ii) done *safely* (level-triggered) is very likely a **no-op** because the safe
timing never sees the row missing. Gap (ii) only "worked" in the reverted fix
(`1ce80391`) because it was on the **hot per-failure path**, catching the transient
miss — and that hot-path placement is exactly what caused the ~14× participant-failure
live regression. **The safe placement and the create-on-missing precondition are
mutually exclusive.**

## Honest candidate mechanisms the evidence actually supports
1. **Present-but-stale re-drive (gap iii)** — a stale op whose authoritative row is
   PRESENT but stuck at an earlier step: force a re-drive of the advancing/terminal
   UPDATE onto the authority (drop the stale expected-step CAS). This CAN fire on the
   safe path (row present) and can advance present-but-stale ops.
2. **Operation-budget rearm gap** — the "handoff retry stopped at operation budget →
   planner never re-armed" mechanism (matches `07ffba1f`/`c5ebb424` directly): make
   the level-triggered reaper re-arm/replay an op abandoned at its operation-budget
   deadline.
3. Both may co-bind; the reservation `No row found` is the sibling gap (iv) path.

## Recommendation
Do NOT build gap (ii) create-on-missing. Either (a) run one fresh **pre-fix (current
HEAD)** diagnostic demo and pin, per stuck op AT SETTLE (before shutdown noise),
whether the binding wedge is present-but-stale re-drive vs operation-budget-rearm; then
build that on the same safe level-triggered host — or (b) proceed directly to the
present-but-stale re-drive (gap iii) / rearm fix the evidence already points to.
Re-validate either with the mandated 2-pre-vs-2-post controlled live A/B.
