# Impl report — Path E-cheap (fresh-leader authoritative count read)

Quest: `formation-ledger-self-move-blocks-cluster-ops`. Fix implemented DT-FIRST.
NOT committed — supervisor reviews and commits.

## Verdict

- New DT `red-on-revert-proven` via `dt:prove` (GREEN with fix, RED on revert of
  the `:143` wiring line only, GREEN on restore).
- Local gates GREEN: `eslint` (touched files) clean, `test:complexity` ratchet OK
  (1857/1857, no new violations).
- Regression: full `test/rebalancer/` = 5396 pass / 56 skip / 0 fail (209 files);
  all `test/convergence/dt6-*` = 605 pass / 0 fail.

## The bug (as diagnosed)

During cold formation, a fresh leader of a priority control-plane partition
(`replica_operations-p1`) inherits a STALE CDC cache of the committed SERVICES
replica rows across a leadership handoff. `getCurrentReplicas()`
(`unified-rebalancer-replica-state.js`) miscounts `activeCount`, so the move
planner mints a PHANTOM count-changing move (an opposing count-increasing ADD, or
a spurious REMOVE) that fights the in-progress spread REPLACE → the ledger
self-move limit cycle → demo dies.

## The fix (E-cheap)

Refresh the single `currentReplicas` input the count decision consumes, only on
the fresh-leader window of a priority control-plane partition, via a
CACHE-BYPASSING authoritative owner-RPC read of the SERVICES replica rows. This
is the commit-`c7a3bf19` "read fresh at the decision point" pattern applied to the
count path (the async `rebalance()` seam feeds a sync `calculateMoves`, so only
the input is refreshed asynchronously — no watermark, no sync decision made async).

### Diff (files + line ranges)

1. `src/rebalancer/unified-rebalancer-rebalance-loop.js` — the WIRING (:143)
   - `const currentReplicas = this.getCurrentReplicas();`
     → `const currentReplicas = await this.resolveFreshCurrentReplicasForCountDecision();`
   - This single line is the red-on-revert lever.

2. `src/rebalancer/unified-rebalancer-replica-state.js`
   - Added import `readAuthoritativeControlPlaneRows` from
     `../control-plane/control-plane-system-table-gateway.js`; destructured
     `CONTROL_PLANE_AUTHORITATIVE_READ_MODE` + `CONTROL_PLANE_READINESS_DIMENSION`
     from the shared bundle.
   - New module consts `FRESH_LEADER_COUNT_DECISION_REPLICA_ROW_SQL` (mirrors
     `REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS`) and
     `FRESH_LEADER_COUNT_DECISION_READ_QUERY_OPTIONS`
     (`authoritativeReadMode: OWNER_RPC_REQUIRED`, strict — NOT the safety
     helper's `OWNER_RPC_PREFERRED_SQL_FALLBACK`, which is inert against a frozen
     cache).
   - `getCurrentReplicas()` PARTITION branch refactored to call a new private
     `getRawPartitionReplicaCacheRows()` (unfiltered rows), so the terminal-REPLACE
     retirement filter is applied once over the merged set.
   - New `async resolveFreshCurrentReplicasForCountDecision()`: off the hot path
     (non-partition / window disarmed / non-priority / no gateway) returns
     `getCurrentReplicas()` unchanged; else issues the strict owner-RPC SERVICES
     read, merges authoritative-over-cache, applies the terminal-REPLACE filter,
     and self-releases the window when the authoritative view agrees with the
     cache. Bounded fallback to `getCurrentReplicas()` on owner defer/failure/empty.
   - New private helpers `mergeAuthoritativeReplicaRowsOverCache()` (same
     union/authoritative-preferred semantics as `mergeReplicaRowsForSafety`) and
     `authoritativeReplicaViewAgreesWithCache()` (active-replica-id set equality).

3. `src/rebalancer/unified-rebalancer-lifecycle-base.js`
   - Ctor: initialize `this.freshLeaderAuthoritativeCountReadArmed = false`.
   - `setLeader()` `isLeader && !wasLeader` + `isControlPlanePriorityPartition()`
     branch: set `this.freshLeaderAuthoritativeCountReadArmed = true` (re-armable
     on each leadership gain — the durability flap re-elects leaders).

4. `test/convergence/dt6-formation-fresh-leader-stale-view-phantom-count-move.test.js`
   (NEW) — multi-node-fidelity DT modelled on the cache-bypass harness. The stale
   local cache and the authoritative owner view are DISTINCT sources (the split is
   the multi-node fidelity; a single shared cache would false-pass). Drives the
   REAL `rebalance()` and captures the `currentReplicas` fed to `calculateMoves`
   at `:161` (sourced from `:143`).

### Binding observable pair (asserted)

- (i) A fresh leader whose SERVICES cache lags the committed prior REPLACE (2
  voters cached, 3 committed) does NOT mint a phantom count-increasing ADD; the
  count decision consumes the fresh 3-voter view; the read used
  `OWNER_RPC_REQUIRED` against `services`. An inline control proves the STALE view
  genuinely produces the phantom ADD (defect reproduced, not a vacuous pass).
- (ii) A GENUINE deficit (authoritative view also short, 1 voter) STILL mints the
  spread ADDs — the fix does not over-suppress.
- Guard: a non-priority partition issues NO owner-RPC read and returns the cache
  view unchanged (no behavior change off the hot path).

## REUSED / EXTEND / NEW

- REUSED: `readAuthoritativeControlPlaneRows` generic gateway helper
  (`control-plane-system-table-gateway.js`); the `OWNER_RPC_REQUIRED` read-mode
  contract (`control-plane-system-table-gateway-read-contracts.js` →
  `requireOwnerRpcRead:true, allowSqlFallback:false`); the c7a3bf19 cache-bypass
  "read-fresh-at-the-decision-point" pattern; the async-seam-before-sync-decision
  structure (`rebalance():143 → calculateMoves:161`); the fresh-leader scoping
  (`setLeader` `isControlPlanePriorityPartition()`); the SERVICES replica-row SQL
  shape (mirrors `REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS`); the merge
  semantics of `mergeReplicaRowsForSafety`; the DT harness factories from
  `unified-rebalancer-test-support.js`.
- EXTEND: `getCurrentReplicas` → an authoritative variant
  (`resolveFreshCurrentReplicasForCountDecision`) consumed on the fresh-leader
  first plans; a strict `OWNER_RPC_REQUIRED` option set analogous to
  `REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS`.
- NEW: the `freshLeaderAuthoritativeCountReadArmed` runtime window (real state,
  not a flag/test-flag); the bounded owner-defer fallback + self-release; the
  merge/agreement private helpers; the multi-node DT.

## Guardrail compliance

- Did NOT modify the shared `REMOVE_SAFETY_READ_QUERY_OPTIONS` constant (other
  callers depend on its `PREFERRED_SQL_FALLBACK`); used a separate strict-mode
  option set for the count path per MUST-DO #1.
- No new flags, no test-only flags in prod. The fresh-leader window is real
  runtime state.
- Strict `OWNER_RPC_REQUIRED` confirmed via the read-mode contract
  (`resolveAuthoritativeReadModeContract`: `requireOwnerRpcRead:true`,
  `allowSqlFallback:false`).

## Evidence

- `dt:prove` artifact:
  `solve/changes/dt-prove/dt6-formation-fresh-leader-stale-view-phantom-count-move.test.js-2026-07-06T06-29-55-986Z.json`
  (`verdict: red-on-revert-proven`, fixRunExit 0 / revertRunExit 1 / restoreRunExit 0).
- New DT alone: 13/13 assertions GREEN with fix; on manual revert of ONLY `:143`,
  6 assertions go RED (phantom ADD reappears + no owner-RPC read).
- `eslint` touched files: clean. `test:complexity`: 1857/1857 (no new violations).
- `test/rebalancer/`: 5396 pass / 56 skip / 0 fail. `test/convergence/dt6-*`:
  605 pass / 0 fail.
