# Route evaluation synthesis — 4 fix-routes + external/industry + in-repo reuse

Six parallel adversarial subagents, all grounded in the freshest live run + on-disk
ledger. Goal: pick the correct leg for the stuck-op [2/4] blocker WITHOUT a third
wrong-leg, after the reverted hot-path gap (ii) storm (`692c9dbb`).

## Route verdicts (all live-evidence grounded)
- **Route A — present-but-stale re-drive (gap iii): NO-OP / REGRESSIVE.** The stuck
  ops never issue an advancing UPDATE, so there is no expected-step CAS to relax; the
  ledger row is present & correct. `reconcileOperationLifecycle` returns false at the
  *lifecycle-decision* layer (`RECONCILE_REPLICA_STATUS` with no actionable replica
  truth — the target replica never materialized), never reaching the persist/CAS
  layer. Force-advancing would write ledger progress the replica never made (the
  `692c9dbb` false-progress hazard).
- **Route C — gap (ii) create-on-missing on the reaper: NO-OP.** Owner-side null never
  occurs on the safe path (transient miss windows ≤13.3s close long before the ≥30s
  staleness gate); the only genuinely-missing rows are follower-side (owner has them →
  wrong precondition) and are invisible to ledger-based discovery and don't bind
  [2/4]. Zero `OPERATION_ROW_DIVERGENCE_REINSERT` fired all run.
- **Route D — throttled hot-path gap (ii): NO-OP + ADDED RISK.** Its sole
  justification (inline catch of a transient a reaper misses) is refuted: the wedged
  op stays stuck >11 min (reaper-catchable); the storm ops are backoff-healable. The
  K-attempts throttle needs a new cache (violates avoid-caches); the stateless age
  variant collapses into the reaper but runs on the worst hot path. Does not beat
  moving the repair off the hot path.
- **Route B — operation-budget rearm/reap: the ONLY non-no-op (PARTIAL → refine).**
  Real, precisely-located abandonment: the "planner rearm / ready-node replay" the
  `COORDINATOR_HANDOFF_RETRY_STOPPED` message promises never fires (lost planner edge),
  and the level-triggered reaper's rearm is gated by the SAME operation budget
  (`dispatch-rearm-evidence.js:231` `DISPATCH_REARM_BUDGET_EXHAUSTED`). Caveats it
  surfaced: (i) deeper root = the op **never dispatched during its valid 5-min
  window**; (ii) naive rearm collides with an **expired reservation** (reservation TTL
  == operation budget) → entangled with the sibling premature-orphan-release quest.

## In-repo reuse audit — the refinement that dissolves Route B's caveats
Instead of *rearming* the stale op (fights the expired reservation), **`failOperation`
the stranded op and let the existing planner re-derive the move fresh**:
- `failOperation` = existing owner-authoritative, idempotent terminal write
  (`operation-workflow-transition-persistence.js:364-459`; terminal write carries no
  expected-step CAS so it overwrites a lagging step). REUSE-AS-IS.
- The desired "fail a stale pre-sync REPLACE whose target never materialized, settle
  **FAILED** (re-plannable), never REMOVED" behavior **already exists** at
  `operation-workflow-recovery-drain.js:373-396` (`FAIL_PRIORITY_RECOVERY_DRAIN_STALE`
  + `isPriorityRecoveryDrainOwnerUnavailable` → `REMOTE_SETTLE_ALLOWED`) and
  `operation-workflow-recovery-reconcile-shared.js:471-524`
  (`TARGET_UNMATERIALIZED_STALE` → settle FAILED). It is only fenced behind the
  priority-control-plane partition gate, so non-priority `partitions-p1` /
  `latency_groups-p1` resolve to `NOOP` and never reach it.
- `isConcurrentOperationTargetUncontactable` (`recovery-timeout.js:626-638`) already
  pings the dead target.
- Once failed → in-flight-aware count (`in-flight-aware-replica-count.js:64-77`) drops
  it → deficit reappears → normal `createOperation` re-plans the move with a **fresh
  reservation** → dissolves the expired-reservation entanglement AND avoids the
  sibling orphan-release race (fail legitimately releases the old reservation).
- **The ONLY new code = a trigger predicate**, not machinery: route a budget-exhausted,
  dead-/unmaterialized-target, pre-sync remote REPLACE to `failOperation` instead of
  the current `REMOTE_OWNER_REQUIRED → SKIP_REMOTE_OWNER` dead-end
  (`recovery-drain.js:394-404`), lifting the priority-partition scope for this class.

## External/industry corroboration (cited)
The dominant pattern is **desired-state re-derivation, not persist-and-resume**:
- Kubernetes controllers are level-triggered (a lost edge is structurally harmless);
  informer resync + `SyncPeriod` + rate-limited workqueue requeue are the rare safety
  net (controller-runtime/client-go).
- CockroachDB allocator `ComputeAction` recomputes the exact repair from desired-vs-
  actual each scan (`defaultScanInterval` 10m); no persisted move to resume; slow-
  replication circuit breaker ~1m.
- TiKV **PD** (closest analog): one operator per region, on TIMEOUT it *removes*
  (cancels) the operator and regenerates next cycle — **never resurrects**. Target
  bounded by store-limit + operator-max-time, else abandoned + re-planned.
- Budget/deadline best practice = **mark-failed-and-replan** (K8s Job backoffLimit,
  Nomad blocked-eval reconcile), not resume.
- Target-never-materialized = roll back / abandon + re-plan (CRDB learner rollback +
  orphaned-learner reaper; PD store-limit abandon).
- **Global self-move interlock is the real root pathology — no mature system uses a
  global lock** (all use per-range/per-object scoping + repair priority lanes). BUT
  memory rules interlock-narrowing UNSAFE (run-20/22) + INEFFECTIVE; fail-then-replan
  clears the interlock *naturally* (op terminalizes) WITHOUT touching it. Do not
  reopen the interlock.

Industry ranked rec: (b) re-derive + fail the stuck op = best (immune to BOTH lost-edge
and dead-target); (a) PD-style reap-cancel-regenerate = correct fallback. Both map to
the SAME in-repo implementation: fail-then-replan on the level-triggered reaper.

## RECOMMENDATION
**Refined Route B = fail-then-replan (desired-state re-derivation).** Level-triggered
reaper fails a budget-exhausted, dead-target, pre-sync remote REPLACE (reusing the
existing remote-stale-fail + TARGET_UNMATERIALIZED-settle-FAILED behavior, lifting the
priority-partition gate); the existing planner re-derives the move fresh. Fires rarely,
off the hot path (no storm), fully reuse-based (one new predicate), clears the interlock
without touching it, and matches CRDB/PD/K8s.

## KEY OPEN RISK to gate the build
The deeper root is that the op **never dispatched during its valid window**. If every
re-planned move ALSO never-dispatches-in-window, fail-then-replan could loop
(fail→replan→never-dispatch→fail). Must either (1) confirm a re-planned move DOES
dispatch (the original never-dispatch was tied to the specific lost-edge/`skip_live_
deferred_retry` state, not a permanent condition), or (2) bound re-plan attempts
(K8s backoffLimit analog). Investigate during implementation; re-validate with the
mandated 2-pre-vs-2-post controlled live A/B, asserting [2/4] settles and no storm.
