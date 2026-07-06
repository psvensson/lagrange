# Eval — CHEAPEST CORRECT FORM OF PATH E (final pre-implementation check)

Scope: evaluation only, NO src changed. The self-move limit cycle's sole surviving cut is
(a) freshness / Path E (`research-SYNTHESIS.md:72-95`). Two candidate forms:
- **E-cheap (REUSE):** a cache-BYPASSING authoritative owner-RPC read of the SERVICES
  replica ROWS at the fresh leader's first count-changing plan — reusing `c7a3bf19`'s
  "read fresh at the decision point" pattern — feeding a correct `activeCount` so no phantom
  count move is minted.
- **E-watermark (BUILD):** the original E eval's form — a per-table raft commit-index/term
  CDC watermark end-to-end + gate the count move on `localFrontier >= targetFrontier`.

All claims file:line-cited. Default posture: skepticism on the reuse claim.

---

## HEADLINE VERDICT — **E-cheap (GO).** E-cheap does NOT collapse into E-watermark. (confidence ~0.8)

E-cheap is structurally viable, is a genuine reuse of an already-shipped and already-wired
in-repo mechanism (stronger reuse than even the brief claimed), and is dramatically cheaper
than E-watermark while being *more* faithful to the theory-canonical fix. The watermark was
an **artifact of the "gate on freshness" framing**; `c7a3bf19` proved the correct move is
"**read fresh at the decision point, don't detect staleness with a watermark**." The
move-planner count path HAS the async seam that makes this possible without a watermark and
without async-ifying the sync count decision.

**The decisive discovery (§1, §2):** the rebalancer ALREADY performs a cache-bypassing
authoritative owner-RPC read of the exact SERVICES replica rows E-cheap needs —
`priority-publication-safety-rows.js:59-84` `getCriticalReplicaRowsForSafety(partitionId)`
issues `readAuthoritativeControlPlaneRows(gateway, SYSTEM_TABLE_NAME.SERVICES, 'SELECT * FROM
services WHERE service_type = ? AND partition_id = ?', [PARTITION, partitionId], …)` and
merges it over the cache. This is the SAME rows (`getCurrentReplicas` reads exactly
`systemTableCache.filter(SERVICES, partitionId===entityId && serviceType===PARTITION)`,
`unified-rebalancer-replica-state.js:267-278`) that feed `activeCount`. So E-cheap is not
"build a ReadIndex" and not even "port c7a3bf19 to a new table" — it is "call an authoritative
SERVICES-row read that already exists in the rebalancer, on the count path, scoped to the
fresh-leader window."

**Two correctness must-dos before GO is unconditional** (both cheap):
1. Use **strict `OWNER_RPC_REQUIRED`**, not the safety helper's `OWNER_RPC_PREFERRED_SQL_FALLBACK`
   (§4). `c7a3bf19`'s commit is explicit: "Cache-first … would be INERT against the frozen
   cache — the DT proves the fix must **bypass** the cache." A PREFERRED_SQL_FALLBACK read can
   route to the frozen local engine and stay stale. E-cheap MUST force the owner-RPC.
2. Bounded fallback to today's cache read when the authoritative SERVICES read defers/fails in
   the narrow early-formation window where services-p1 is itself unconverged (§5) — a rare
   residual phantom, never an unbounded stall. (Identical residual to E-watermark; not a
   discriminator.)

---

## Q1 — HOW does `c7a3bf19`'s cache-bypassing read work, and is the pattern structurally portable?

**The read (`git show c7a3bf19`):** `ensureOperationLedgerSelfMoveSerialized` → new
`resolveDisruptiveSelfMoveConflict(liveOperations, partitionId)` → `isStaleTerminalLedgerSelfMoveGhost(operation)`
→ `await this.queryAuthoritativeOperationVisibilityObservation(operationId, {requireOwnerRpcRead:
true})` (`rebalance-coordinator-ledger-interlock-admission.js:161-164,258-303`;
`rebalance-coordinator-operation-read-methods.js:44-49`). That proxies to
`repository.queryAuthoritativeOperationVisibilityObservation` which, on `requireOwnerRpcRead`,
selects `REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS`
(`replica-operation-repository-read-methods.js:306-311`) = `authoritativeReadMode:
OWNER_RPC_REQUIRED` (`replica-operation-repository.js:415-418`) and calls
`readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway,
SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, SQL.SELECT_OPERATION_BY_ID, [operationId], …)`
(`replica-operation-repository-read-methods.js:92-100,313-320`).

**Surface:** the generic control-plane gateway `readAuthoritativeControlPlaneRows(gateway,
TABLE_NAME, sql, params, opts)` (`control-plane/control-plane-system-table-gateway.js:183`).
It is **table-parameterized** — the table name is an argument, not baked in.

**SYNC or ASYNC?** ASYNC — `await queryAuthoritative…`, called from the async
`resolveDisruptiveSelfMoveConflict`, called from `ensureOperationLedgerSelfMoveSerialized`
which the interlock `await`s (`…interlock-admission.js:161`). **c7a3bf19 read on an
ALREADY-async admission path.** This is the exact structural question the brief flags.

**Portability verdict: YES, the pattern transfers** — because the count path exposes the SAME
"async seam BEFORE a sync decision" shape (see Q2). The only non-trivial difference is
c7a3bf19 read the SAME partition it owns (REPLICA_OPERATIONS self-read) whereas E-cheap reads a
DIFFERENT partition (SERVICES). That difference is already dissolved: §2 shows the rebalancer
ALREADY issues authoritative cross-partition SERVICES reads through the identical gateway.

## Q2 — THE SYNC/ASYNC CRUX. Does E-cheap resolve it without building the watermark? — **YES.**

`calculateMoves` is sync (`move-planner-move-calculation-methods.js:78` `calculateMoves(currentReplicas,
targetState)`, no await; `computeInFlightAwareReplicaAccounting` runs sync over the array).
**But it does not read the cache itself — it consumes a `currentReplicas` ARGUMENT.** That
argument is produced one step earlier in the **async** `rebalance()`:
`const currentReplicas = this.getCurrentReplicas();` (`unified-rebalancer-rebalance-loop.js:143`)
→ passed into `this.movePlanner.calculateMoves(currentReplicas, targetState)` (`:161-164`).

The whole enclosing `rebalance()` is async and already `await`s freely around this point
(`:142` `await this.getPolicy()`, `:155` `await …calculateTargetState`, `:166` `await
…augmentMoves…`). **So the fresh authoritative read is threaded into the async `rebalance()`
BEFORE line 161, and `calculateMoves` stays sync consuming the already-refreshed array.** The
sync decision never becomes async; only its INPUT is refreshed asynchronously — the identical
"await-fresh-then-decide" shape c7a3bf19 used on the admission path.

This is the precise reason **E-cheap does NOT collapse into E-watermark.** E-watermark exists
only to answer "am I stale?" without re-reading — it needs a producer-stamped, contiguous,
sync-readable frontier because it assumed the count path could not re-read. E-cheap re-reads
the authoritative rows directly (the c7a3bf19 philosophy), so the "am I stale?" detector is
unnecessary. No watermark, no producer stamp, no contiguous-frontier tracking, no sync reader
of a frontier.

**Precedent alignment:** the E eval (§5) cited `getCurrentPublishedMembershipEpochSync`
(`unified-rebalancer-rebalance-loop.js:159-160,300-313`) as the only in-loop freshness read —
but that is a SYNC read of a cached epoch and only STAMPS moves (`:265-276`), it does not gate
count. E-cheap does not need that shape; it uses the async `rebalance()` seam directly.

## Q3 — FRESHNESS SUFFICIENCY. Does the authoritative SERVICES read reflect the prior REPLACE the cache lags? — **YES.**

The phantom is minted by the fresh leader of `replica_operations-p1` whose local CDC cache of
the SERVICES table is frozen from before the leadership handoff (research §2). The prior
epoch's REPLACE **wrote the new voter row into the SERVICES table**, committed on the SERVICES
partition (services-p1) BEFORE the operation terminalized — replica placement rows live in
SERVICES, the op lifecycle lives in REPLICA_OPERATIONS; the SERVICES row transitions
(learner→ACTIVE, source removal) all commit during the op, before COMPLETE. So the SERVICES
OWNER holds the committed voter row while the `replica_operations-p1` leader's SERVICES CDC
cache lags. An `OWNER_RPC_REQUIRED` read of SERVICES fetches the committed row →
`activeReplicaIds` includes the new voter (`in-flight-aware-replica-count.js:107-118,213`) →
`activeCount` correct → no phantom. **Structurally identical to c7a3bf19**, where the
authoritative op read returned the terminalized op the cache froze at STOPPING.

Does the OWNER also lag? Only in the window where services-p1 has not yet committed the row —
i.e. the REPLACE's SERVICES write is genuinely still in-flight. In that window a low
`activeCount` is CORRECT (the voter really isn't active yet), and the count-neutral REPLACE /
interlock already governs that case; the phantom the bug describes is specifically a
COMPLETED prior REPLACE the cache hasn't caught up to — which the owner read resolves. So the
owner read is strictly fresher than the frozen cache for the failure signature.

## Q4 — Both legs? — **YES, E-cheap suppresses BOTH the phantom REMOVE and the opposing ADD.**

Both count legs are pure functions of `currentReplicas`
(`in-flight-aware-replica-count.js:107`): the iteration builds `activeReplicaIds`,
`occupiedReplicaIds`, and `nonActiveOccupiedByNode` (`:107-129`); `activeCount =
activeReplicaIds.size` (`:213`). The DEFICIT leg = `activeCount + inFlightAddCount +
drainPhaseReplacementCredit` (`:225-226`) — and `drainPhaseReplacementCredit` itself is built
from `nonActiveOccupiedByNode`, also derived from `currentReplicas` (`:190-210`). The
SURPLUS/REMOVE leg keys 100% on `activeCount`/`currentReplicas` (D eval §1;
`move-planner-move-calculation-methods.js:333,360`). **Refreshing the single `currentReplicas`
array to the authoritative SERVICES view corrects the one input feeding both legs.**
E-watermark gates both legs; E-cheap corrects the shared input to both — one refresh.

**CORRECTION (post-impl verification, `verify-e-cheap-union-vs-replace.md`):** the shipped
merge is an authoritative-over-cache **UNION** (deliberate — a pure REPLACE would under-count
in the non-atomic delete-then-insert removal window and REINTRODUCE the phantom ADD). Union
fully corrects the **run-5 driver** (the stale-LOW under-count → phantom ADD) and the **soft
over-count** (authoritative row present but non-ACTIVE → field overwrite drops it). It does
**not** correct a **HARD-DELETED ghost** (stale ACTIVE cache row with no authoritative
collision survives the union) → a residual drain-handoff over-count REMOVE remains possible.
That residual is NOT the run-5 driver; the complementary fix (read the terminal-REPLACE
retirement ops authoritatively, c7a3bf19 pattern on the count path) is a tracked follow-up. So
"corrects both legs" is accurate for the run-5 driver and the soft over-count, with the
hard-delete over-count deferred.

## Q5 — Circularity / bounded deferral. — **Non-circular for the driver; bounded (same as E eval §3-4).**

Unchanged from the original E eval and re-confirmed: SERVICES is a DIFFERENT ownership domain
than the flapping `replica_operations-p1`, and is NOT a priority control-plane partition
(`system-partition-classification.js:17-23,128-131` — SERVICES absent from
`PRIORITY_CONTROL_PLANE_TABLE_IDS`), so it does not ride the `self_move_in_flight`/quorum
interlock and is not in the durability-demotion flap. Reading SERVICES freshness for
`replica_operations-p1`'s planner is therefore **non-circular for the driver** (E eval §3).
The only deferral window is early formation before SERVICES itself spreads — **bounded**
(releases on CDC/owner convergence), not D's permanent circularity. With the strict owner-RPC
read, if the SERVICES owner defers/fails, E-cheap falls back to today's cache read (Q4 of E
eval §4 — bounded fallback, rare residual phantom, never an unbounded stall). No Path-B
degeneration because the release is a concrete data event, not a timer/score.

## Q6 — Injection site, effort, DT.

**Minimal site (two viable shapes; both cheap):**
- **Shape A (inline, preferred — no stash staleness):** in async `rebalance()`
  (`unified-rebalancer-rebalance-loop.js:143`), when a "just-gained-leadership" flag is set AND
  `isControlPlanePriorityPartition()` (`move-planner-state-methods.js:174`), replace the sync
  `getCurrentReplicas()` with an `await`ed authoritative SERVICES read (strict
  `OWNER_RPC_REQUIRED`), then clear the flag; else keep today's sync cache read. `calculateMoves`
  unchanged.
- **Shape B (pre-fetch/stash on leadership gain):** in
  `unified-rebalancer-lifecycle-base.js:475-483`'s `isLeader && !wasLeader &&
  isControlPlanePriorityPartition()` branch, kick the async read and stash a fresh snapshot the
  next plan consumes (the E eval §5 site). Shape A avoids stash staleness; prefer A.

**Reusable machinery to wire in:** `readAuthoritativeControlPlaneRows`
(`control-plane-system-table-gateway.js:183`), the existing SERVICES-replica-row SQL
`SELECT * FROM services WHERE service_type = ? AND partition_id = ?`
(`operation-workflow-owner-shared.js:451-452`), and ideally the existing helper
`getCriticalReplicaRowsForSafety` (`priority-publication-safety-rows.js:59-84`) — but with
strict `OWNER_RPC_REQUIRED` options (NOT its `OWNER_RPC_PREFERRED_SQL_FALLBACK`, §Q4-must-do).
The rebalancer already reaches the gateway via `this.repository.controlPlaneSystemTableGateway`
(`priority-publication-safety-rows.js:61,112`) — one implementation-time wiring check that the
rebalancer-entity instance driving `rebalance()` has the same `repository` handle.

**Multi-node DT (binding observable).** Multi-node mandatory (single-instance shares one cache
→ false pass, E eval §8 / eval-path-b §5). Compose the existing substrate (all present):
`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js` (real coordinator +
interlock + `setLeader` re-plan) + `dt6-ledger-leader-durability-fitness.test.js` (demotion) +
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js` (the c7a3bf19
cache-first-stale-vs-authoritative-terminal model). Virtual clock past the 60s legal hold + 3×
1s strikes; seeded RNG for leadership-start jitter. Model the SERVICES cache on the fresh leader
as FROZEN behind services-p1's committed prior-REPLACE voter row (mirror c7a3bf19's cache-first-
vs-authoritative split so a cache-first "fix" stays RED). Binding observable pair:
(i) a fresh leader whose SERVICES cache is behind the committed prior-epoch REPLACE does NOT
emit a phantom count-changing ADD or REMOVE; (ii) a GENUINE deficit STILL spreads in one epoch.
**Red-on-revert** via `dt:prove` (`--test <dt> --src <the read helper + the rebalance-loop
consume site>`); scenario-harness 3×; full rebalancer + convergence suites; run-20/22 guard DTs.

---

## Head-to-head effort — E-cheap vs E-watermark

| Work item | E-cheap | E-watermark |
| --- | --- | --- |
| SERVICES CDC producer stamps raft commit index/term | — (not needed) | **NEW cross-layer** (cache producer + MG/CDC handler) |
| Cache tracks contiguous applied frontier (out-of-order-safe) | — | **NEW state + merge logic** (`system-table-cache*`) |
| Sync planner frontier reader | — | **NEW** |
| Async target-index acquisition on `setLeader` | — | **NEW** (surface services-p1 commit index via owner read) |
| Gate logic on `localFrontier >= targetFrontier` | — | **NEW** in `calculateMoves` |
| Authoritative SERVICES-row read | **REUSE** `readAuthoritativeControlPlaneRows` + existing SQL + existing helper | (subsumed by the watermark build) |
| Async pre-read on fresh-leader first plan | **~20 lines** (flag + consume at loop:143) | ~same (still needed) |
| DT-fidelity hazard (`Date.now` wall-clock watermark) | none | **present** (E eval §1 flags `lastAppliedAtMs`) |
| Multi-node DT | **shared** substrate | shared substrate |
| **Net** | **~50 lines, mostly reuse; MED risk, LOW-MED effort** | **cross-layer build; MED risk, HIGH effort** |

## Ratings

| Axis | E-cheap |
| --- | --- |
| Correct axis (services replica ROWS / `activeCount`)? | **YES** (§Q4; D eval §1 proved dominance) |
| Machinery exists to read it authoritatively from the rebalancer? | **YES — already wired** (`priority-publication-safety-rows.js:59-84`; generic gateway `control-plane-system-table-gateway.js:183`) |
| c7a3bf19 pattern actually transfers to the count path? | **YES** (§Q1-Q2 — async seam in `rebalance()` before sync `calculateMoves`; NOT a collapse) |
| Collapses into E-watermark? | **NO** (§Q2 — re-read replaces the staleness-detector; watermark was a framing artifact) |
| Freshness sufficient (owner has the committed REPLACE row)? | **YES** (§Q3 — SERVICES row commits before op-terminal; owner ahead of frozen cache) |
| Suppresses BOTH legs (phantom REMOVE + opposing ADD)? | **YES** (§Q4 — both are pure functions of `currentReplicas`) |
| Non-circular for the driving `replica_operations-p1` flap? | **YES** (§Q5 — SERVICES is a different, non-priority, non-flapping partition) |
| Degenerates to Path-B freeze? | **NO — bounded fallback** (§Q5; must implement the fallback) |
| Correctness must-dos | strict `OWNER_RPC_REQUIRED` (NOT PREFERRED_SQL_FALLBACK); bounded cache fallback |
| Risk / Effort | **MED / LOW-MED** (vs E-watermark MED / HIGH) |

## REUSED / EXTEND / NEW (E-cheap)

- **REUSED:** `readAuthoritativeControlPlaneRows` generic gateway read
  (`control-plane-system-table-gateway.js:183`); the SERVICES replica-row SQL
  `SELECT * FROM services WHERE service_type=? AND partition_id=?`
  (`operation-workflow-owner-shared.js:451`); the in-rebalancer authoritative-SERVICES-read
  precedent `getCriticalReplicaRowsForSafety` (`priority-publication-safety-rows.js:59-84`);
  the c7a3bf19 "cache-bypassing owner-RPC read at the decision point" pattern
  (`rebalance-coordinator-ledger-interlock-admission.js:258-303`); the async-seam-before-sync-
  decision structure (`unified-rebalancer-rebalance-loop.js:143→161`); fresh-leader scoping
  (`unified-rebalancer-lifecycle-base.js:475-483`, `move-planner-state-methods.js:174`).
- **EXTEND:** `getCurrentReplicas` → an authoritative variant consumed on the fresh-leader
  first plan; strict `OWNER_RPC_REQUIRED` option set analogous to
  `REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS` (`replica-operation-repository.js:415-418`).
- **NEW:** a just-gained-leadership one-shot flag/window; the bounded owner-defer fallback; the
  multi-node DT.

**c7a3bf19 reuse assessment (explicit, skeptic-tested):** the brief asked whether the pattern
"actually transfers to the SYNC count path." It does — but NOT by making the count path async.
It transfers because the count DECISION consumes an argument computed in an already-async
context (`rebalance():143`), so the fresh read lands on the input, not the decision. And the
reuse is stronger than the brief assumed: an authoritative SERVICES-row read from inside the
rebalancer is not a new port of c7a3bf19 — it is an EXISTING, wired operation
(`getCriticalReplicaRowsForSafety`) that E-cheap redirects onto the count path with strict
owner-RPC options. The only place skepticism survives is the two must-dos (strict read, bounded
fallback); both are cheap and both are already-solved patterns in the same files.
