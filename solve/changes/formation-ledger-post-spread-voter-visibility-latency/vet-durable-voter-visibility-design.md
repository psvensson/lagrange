# Adversarial vet: design-durable-voter-visibility.md

Quest: `formation-ledger-post-spread-voter-visibility-latency` (rung 1, pre-implementation).
Vetter: read-only adversarial pass, 2026-07-05. Every ruling file:line-cited against HEAD
(a08a886e) and the archived run-27 logs
(`solve/changes/formation-ledger-spread-window-follow-up-latency/run27-node-logs/`).

Verdict summary: **AMEND->GO** — the root-cause diagnosis and F1's architecture are
correct and verified against code and logs, but F1a as drafted converts the silent
mask into a CAS-starvation live-lock (Finding V-1, mandatory amendment), the vet-Q5
budget claim is refuted in its strong form (Finding V-4), and F2 targets the wrong
line (Finding V-5). Amendments listed at the end.

---

## 0. Ground truth re-verified from primary logs (settles the research conflict)

The two research reports disagree on run-27's post-op-2 physical layout
(`research-run27-tail-timeline.md` §"HEADLINE CORRECTION": r2+r3 still on node-0, hold
correct; `research-phantom-budget-leg.md` §Q2: "{node-0: r3, node-3: r4, node-2: r5} =
3 voters, max 1 per node — NOT concentrated"). Verified directly from
`run27-node-logs/node-0.log.gz`:

- 13:21:27.122 `[replica-create] replica=replica_operations-p1-r1 stage=starting` (node-0, bootstrap)
- 13:21:30.388 `replica=replica_operations-p1-r3 stage=starting` (node-0, bootstrap)
- 13:21:31.986 `replica=replica_operations-p1-r2 stage=starting` (node-0, bootstrap)

All three bootstrap replicas were on node-0. op-1 replaced only r1; op-2 was an ADD.
So after op-1+op-2 the true voter layout was r2,r3 @node-0 + r4 @node-3 + r5 @node-2 =
4 voters, 2 on the seed → by the predicate
(`src/rebalancer/operation-ledger-quorum-concentration.js:129-131`: outside = 4-2 = 2 <
majority 3) **still concentrated — the design's "physical truth check" is CORRECT and
the phantom-budget report's "not concentrated" claim is REFUTED (it missed r2)**. One
count-neutral REPLACE off the seed was physically required; after it, 3 voters / max 1
→ outside 2 ≥ majority 2 → release. The design's corrected head stands.

Root-cause chain also re-verified in code:

- `syncFromCache` (`src/raft/authoritative-row-mutation-helper.js:191-203`) sets
  `persistedValue = cachedValue` and clears pending on equality — any cache row equal
  to pending is treated as durably persisted. Called on every flush (line 218).
- CL-035 seed (`src/node/replica-handler-create-methods.js:483-523`) UPSERTs
  `raft_role, updated_at: Date.now()` into the same local SERVICES row the helper's
  `readValueFromCache` reads (`src/partition/partition-service-core-base.js:615-618`)
  → the seeded value satisfies the dedup and the durable write is never re-attempted.
  Confirmed mask.
- CL-021 lifecycle preserve (`src/node/replica-state-machine-transition.js:495-513`)
  copies `raft_role` from the cached row into the full-row UPSERT; marker cleared on
  success (`src/node/replica-state-machine.js:396-399`). Race as described.
- Run-27: 2 dropped CDC updates for r4's row (node-0 13:21:58.291, 13:22:02.165 "No
  row found for CDC update"), no r4/r5 role update observed through teardown.

---

## Rulings on the design's six vet questions

### Q1 — F1a shared-helper dedup semantics (deadlock / starvation / run-15 lineage)

**Verdict: AMEND (two mandatory amendments; without them REFUTED by a live-lock).**

Enumerated `AuthoritativeRowMutationHelper` construction sites (grep, complete):

| # | site | table | refreshObservedRow | cdcIntegrationService |
|---|---|---|---|---|
| 1 | `src/partition/partition-service-core-base.js:580` (role) | services | YES (:622-626) | real |
| 2 | `src/partition/partition-service-core-base.js:650` (leader-pointer) | partitions | YES (:699-703) | real |
| 3 | `src/message-group/message-group-service-metadata-publication.js:114` (role) | services | NO | real |
| 4 | `src/message-group/message-group-service-metadata-publication.js:172` (leader) | message_groups | NO | real |
| 5 | `src/wasm-service/wasm-service-replica.js:270` (role) | services | NO | **transport shim** (`this.roleMutationTransport`, only `updateSystemTableRow`) |
| 6 | `src/wasm-service/wasm-service-replica.js:308` (leader) | services | NO | **transport shim** |

(a) **THE CRITICAL ATTACK — CAS-starvation live-lock (Finding V-1).** F1a says: when
the confirm shows the authority does NOT hold the pending value, "proceed with the
durable write". But the write's CAS guard is built from the MERGED CACHE row
(`mutationContext.cachedRow` from `readRowFromCache`, helper :267-274; whereClause
includes `raft_role` + `updated_at` from that row, core-base.js:582-594). In exactly
the run-27 shape the cache row is the SEED (`raft_role=follower, updated_at=T_seed`)
while the authority holds learner/older. The CAS UPDATE matches zero rows →
`recoverFromObservedStateChanged` → `refreshObservedRow` →
`refreshAuthoritativeCacheRow`
(`src/cdc/cdc-integration-service-cache-visibility-wait.js:399-424`) → UPSERT into the
cache via `applySystemTableChange` — whose stale-guard
(`src/cache/system-table-cache.js:788-799` UPSERT branch →
`isStaleForExistingRecord`, `src/cache/system-table-cache-row-merge.js:33-58`, newer
updated_at/HLC wins) REFUSES to overwrite the newer seeded row (backfill-only). The
guard row therefore never converges to observed authoritative state, every retry
CAS-misses, and the helper spins at `maxRetryDelayMs=30s` forever. **F1a as drafted
replaces the silent mask with a permanent retry loop that still never lands the
durable write.** Note this also means the run-15 CAS-refresh recovery is ALREADY
broken on HEAD for any CL-035-seeded row — the seed defeats the exact mechanism the
helper's own doc-comment (:366-378) promises ("re-read the authoritative row into the
cache so the next flush guards against current observed state").
**Mandatory amendment A1**: the confirm read returns the authoritative row — when it
does not match pending, that row (not the merged cache row) MUST feed the CAS guard
(pass it as `mutationContext.cachedRow` / an override consumed by
`buildWhereClause`). With A1, the retry guards `{raft_role: learner/absent,
updated_at: T_auth}` → matches → write lands → APPLIED. A1 simultaneously repairs the
run-15 lineage for seeded rows. When the authoritative row is entirely absent (run-27
early window), the UPDATE still zero-rows; convergence then arrives via CL-021's
`_reconcileLocalOnlyServiceRows` UPSERT (`src/node/replica-state-machine.js:417-499`),
which post-seed carries the preserved follower
(`replica-state-machine-transition.js:495-513`) — the helper's next confirm then
dedups honestly. No deadlock; bounded backoff (helper :400-433) throughout.

(b) **Deadlock when the authority is unreadable mid-move**: no synchronous block
exists anywhere in the proposed flow — the confirm is one point read on the existing
authoritative-read channel; on failure the honest degradation is "unconfirmed →
attempt the write", and the write path already degrades to `scheduleRetry` on
DEFERRED/OWNER_NOT_READY/REJECTED gateway outcomes (helper :299-315) and on
`isWriteReady()===false` (:255-261). CONFIRMED-SAFE provided the implementation
routes confirm-read failure to the write/retry path, never to a wait.

(c) **Blast radius / capability heterogeneity (Finding V-2).** Sites 5-6 inject a
transport SHIM as `cdcIntegrationService` — it has no
`executeAuthoritativeSystemTableRead`/`refreshAuthoritativeCacheRow`. If
confirm-before-dedup is unconditional, wasm helpers either crash or (if "cannot
confirm → write") lose dedup entirely: every wasm replica restart re-writes rows that
were already durable. Sites 3-4 have a real service but no configured refresh hook.
**Mandatory amendment A2**: gate the confirm on an explicitly configured
authoritative point-read hook (new option, wired only for sites 1-2, the two seams
with `refreshObservedRow` today); helpers without it keep the legacy dedup unchanged.
This confines the semantic change to the partition-service role and leader-pointer
helpers, matching the design's actual target.

(d) **Ordering with `prepareFlush`**: the leader-pointer helper clears pending via
`prepareFlush.clearPending` when `!this.isLeader` (core-base.js:689-695; message-group
:141-147, wasm :338-341 similar). The confirm must run AFTER the prepareFlush skip
decision (or be short-circuited by it) so a non-leader/disabled instance never pays an
authoritative read to dedup a value that prepareFlush is about to discard.
Implementation note, folded into A2.

(e) **Cost on hot paths**: the confirm fires only when `cache == pending` AND the
value was never APPLIED by this instance. Normal promotion (queue at `becomeFollower`,
`partition-service-learner-promotion-methods.js:441`) hits the write path directly
(cache still learner) — zero added reads. Election churn queues DIFFERENT values
(real writes today, no dedup involved). Warm-restart dedup costs exactly one point
read per helper instance per value. Bounded. CONFIRMED-SAFE.

### Q2 — does the authoritative confirm reverse-break CL-035 (seed overwritten, remove-safety gate flap)?

**Verdict: CONFIRMED-SAFE with the read-only-compare amendment (A3); the "refresh"
variant the design leaves open is NOT safe to pick.**

- The comparison source exists as a row-returning API: the cdc-integration service's
  `executeAuthoritativeSystemTableRead(tableName, sql, params)`
  (`src/cdc/cdc-integration-service-authoritative-read-flow.js:272-497`; already
  called for point reads at `cache-visibility-wait.js:404-408`). This resolves the
  design's open seam question — no new API needed, and it does NOT write the cache.
  **Mandatory amendment A3: use it read-only; do NOT use
  `refreshAuthoritativeCacheRow` as the comparison source** (it returns boolean and
  writes the cache).
- If a refresh-based compare were used anyway: the cache UPSERT stale-guard mostly
  protects the seed (newer updated_at wins,
  `system-table-cache-row-merge.js:50-58`), BUT two real flap vectors exist:
  (i) `isStaleForExistingRecord` prefers HLC over updated_at when BOTH rows carry one
  (:36-47) — the seed row merges into an existing row and may retain the OLD row HLC
  while carrying new updated_at, so an authority row with a newer HLC but stale
  raft_role could clobber the seeded follower and flip
  `isVoterReadyReplicaTopology` mid-REPLACE; (ii) cross-node clock skew on updated_at
  (node-2 logged "Excessive clock drift detected" ×3 at 13:22:07.825-828 in this very
  run). Read-only compare (A3) eliminates both by construction.
- F1c (no lifecycle change) is consistent: post-seed lifecycle UPSERTs carry the
  preserved follower (`replica-state-machine-transition.js:499-513`) — no new writer,
  single owner preserved. CONFIRMED-SAFE.

### Q3 — F1b re-entrancy / double-queue / shutdown ordering

**Verdict: CONFIRMED-SAFE (one style note).**

- The poll loop seeds and RETURNS on first success
  (`replica-handler-voter-readiness-methods.js:153-167`) — the seed+re-assert fires
  once per `waitForVoterReadyActivation`, which is called once per gated CREATE
  (`replica-handler-create-methods.js:818-829`). Re-invocation on idempotent
  CREATE_REPLICA retries re-queues the same value → deduped by
  `persistedValue`/pending equality (helper :173-175, :240-253). Verified.
- `queue()` never awaits its `flush()` (fire-and-forget with `.catch`, :186-189);
  concurrent flushes are excluded by `inFlight` (:212-215) and stacked retries by the
  `retryTimer` guard (:401-403); a second queue during in-flight schedules exactly one
  microtask follow-up (:435-455). Double-queue with the promotion path's own
  `queueRoleUpdate` (learner-promotion-methods.js:441) is same-value and benign.
- Shutdown: `queue()` and `scheduleRetry()` no-op when `shuttingDown` (:170-172,
  :401); `getTrackedService` (`replica-handler-runtime-methods.js:527-539` via
  :480-506) returns null for an untracked/shut-down service and F1b must null-check
  (it does per design: "already returns the partition-service instance").
- Learner-safety: F1b executes inside the `isReplicaVoterReady` branch
  (voter-readiness-methods.js:155), which requires a non-learner tracked role
  (:188-192); the seed itself re-checks (`create-methods.js:504-507`). An unpromoted
  learner can never be published as a voter through F1b. (Also relevant to Q re
  hold-safety, see G.)
- Style note (non-blocking): `queueRoleUpdate`/`flushRoleUpdate` are `@private` on the
  partition service (`partition-service-metadata-delivery-methods.js:17-51`); the
  handler-side call should go through a small public wrapper to keep the owner
  boundary explicit.

### Q4 — F1d CRITICAL work-class for role writes

**Verdict: AMEND (scope honesty, A6).**

- Table verified: the role helper writes `SYSTEM_TABLE_NAME.SERVICES`
  (core-base.js:581) — NOT the operation ledger. No feedback into the moving
  `replica_operations` raft group; the run-22 concentration concern is vacuous.
- What the branch changes: `deliveryPriority: critical`, `workClass: CRITICAL`,
  `allowPressureDefer: false`
  (`partition-service-metadata-delivery-methods.js:90-104`). Volume is one write per
  role CHANGE per replica — bounded; and the leader-pointer helper ALREADY ships this
  exact class selection (core-base.js:670-676), so there is direct precedent that it
  does not starve background metadata.
- **Scope defect**: `getMetadataPublicationWorkClass` keys on
  `CONTROL_PLANE_PARTITION_IDS` = ALL `INITIAL_PARTITION_IDS` — every system table's
  p1 (`partition-service-shared.js:194-196`), ~20+ partitions — NOT the design's
  stated "priority control-plane partitions" (5 tables,
  `system-table-schemas-constants.js:144-150`). Implementing F1d by calling the
  existing method silently broadens the CRITICAL class far beyond the design text.
  **Amendment A6**: either scope with `isPriorityControlPlanePartition` or state the
  broader (leader-helper-consistent) scope explicitly in the design and change record.

### Q5 — THE BUDGET-MATH ATTACK: does the demo CREATE fit 30s without touching the transient wait?

**Verdict: REFUTED in its strong form; the honest projection is coin-flip marginal.
AMEND (A4) — the design must carry the honest math and pre-register the in-class
fallback.**

The design's key lever claim — "at 13:22:06.855 an honest view plans the count-neutral
cure REPLACE instead of the blind ADD — saving the entire second move" — fails against
the planner and admission code:

1. **The blind-ADD half of the claim HOLDS.** With honest rows at 06.855 (r2,r3
   @node-0 + r4 = 3 voters, activeCount 3 = target 3), the planner pairs the spread
   ADD with a node-0 REMOVE into a REPLACE, and any unpaired count-increasing ADD is
   deferred by the at/over-target reconcile guards
   (`src/rebalancer/move-planner-move-calculation-methods.js:560-582, 625-646`).
   op-2 (the 4th replica) and all its downstream churn genuinely disappear.
2. **The "plans the cure instead" half FAILS.** The critical-partition REPLACE
   serialization cap counts ALL-PHASE in-flight REPLACEs — explicitly drain-INCLUSIVE
   by design comment (`move-planner-move-calculation-methods.js:507-540`,
   `replaceCount = min(natural, max(0, 1 - inFlightReplaceCount))`). op-1's ledger row
   was non-terminal in node-3's cache until ~13:22:08.1-10.2 (terminal write repair:
   node-2 "repair scheduled" 09.625 → "Operation completed" 09.987 → confirmed 10.220;
   extracted by node-3 CDC 10.139 — measured ~6.5s after physical completion 03.527).
   So at 06.855 the honest planner plans NOTHING for the ledger (ADD deferred,
   REPLACE capped) — not the cure.
3. **Admission has the same dependency.** The cure is a disruptive self-move: B1
   admits only into an idle observed ledger
   (`rebalance-coordinator-ledger-interlock-admission.js:160-171`) over
   cache-preferred ops rows — blocked until the same ~10.1-10.2 terminal visibility.
   Additionally the synchronous gate can bounce the cure for a tick whenever a
   dependent create is mid-async-check (`assertOperationLedgerSelfMoveGateOpen`,
   :465-480 — dependent creates increment `otherCreatesInFlight` BEFORE their own B3
   rejection): the run-27 17.488/17.490 same-tick collision shape persists under
   honest visibility, since dependents keep being planned each tick and rejected at
   admission.
4. **Honest run-28 projection** (budget starts ~13:21:49.76, expires 19.6 = 29.8s;
   all numbers run-27-measured):
   op-1 physically done 13.8s in → +6.5s ops-row terminal repair → cure plannable
   ~20.4s in; next planner tick (observed cadence 5.2s: 06.85→12.06→13.30→17.37) →
   cure created 20.4-25s in; dispatch gap 0.25s (op-2) to 10.9s (op-1) → +5s learner
   floor (a REPLACE replacement joining an existing priority group takes the
   priority-formation delay,
   `partition-service-learner-promotion-methods.js:84-101, 120-126`) + drain ~1-2s →
   physically done ~27-33s+ in → role visible +1-2s (F1) → release ~28-35s in vs
   budget end 29.8s. **Only the best case fits; any one of {ops-row repair at
   measured 6.5s + unlucky tick, a 10.9s-class dispatch gap, one sync-gate
   collision} blows the budget.** The design's "~2s" for ops-row visibility is
   contradicted by the measured 6.5s in this exact run; its "cure REPLACE planned
   immediately" is contradicted by (2)-(3).
5. **What IS in-class if run-28 misses.** The residual serial legs are: (i) ops-row
   terminal-visibility repair (~6.5s) — NOT one of the quest's enumerated tail legs;
   honest disposition = recorded successor, as the design already half-does for the
   interlock case; (ii) the cure replacement's 5s learner floor — this IS an
   enumerated leg ("learner-promotion floor applicability to a spread-relief
   promotion") and c-class explicitly permits scoping/conditioning it with
   vet-approved evidence that it is binding and stability-preserving (the research
   map already names the mechanism: catch-up-driven first check extending
   `resolveLearnerPromotionDelayMs`,
   `partition-service-learner-promotion-methods.js:84-101`); (iii) the dispatch gap —
   owned by the dispatch-arming lineage (measured lead). **Amendment A4**: replace the
   budget paragraph with this math; pre-register (ii) as the in-class fallback lever
   (its own DT + floor-purpose vet required) and (i)/(iii) as successors, so a run-28
   miss is a planned branch, not a goalpost move.

Note: F1 remains necessary regardless of the marginal math — run-27 §2a's release
arithmetic shows release requires BOTH the physical cure AND truthful roles; without
F1 no timeline ever releases.

### Q6 — DT plan fidelity (real seams, no fixture shortcuts)

**Verdict: AMEND (A7) — repro 3 and repro 4 have concrete fixture-tautology risks;
repros 1-2 are sound.**

- Repro 1 (helper mask) and repro 2 (lifecycle race) exercise the REAL
  `AuthoritativeRowMutationHelper` (injectable gateway/timers, constructor
  :70-96 — no production shortcut needed) and the real
  `seedLocalPriorityReplicaRaftRole` / `buildCreateCdcData` seams. RED on head is
  structurally guaranteed (the dedup at :191-203 fires deterministically once the
  seed lands between schedule and retry). Sound.
- Repro 3 (dt6 composition): the dt6 base applies services rows BY DRIVER FIAT —
  "Membership/placement effects of completed moves are applied to the shared services
  rows by the driver (production: CDC)"
  (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:29-42`). A
  scenario where the driver simply never writes the promoted role is red on head AND
  red after the fix (or green by fiat in reverse) — a tautology that never touches
  F1a/F1b. **The scenario must derive the promoted replica's services-row role update
  from the real helper+seed machinery** (instantiate the real role-mutation helper +
  seed path per promoted replica and let ITS outcome, not the driver, decide whether
  the row updates), so the fix flips the outcome. This is the design's own "real
  seams, not stubs" requirement made concrete.
- Repro 4 (label fidelity): asserting on `createOperationLedgerInterlockError` output
  is green on HEAD already (the error carries `admissionResult.reason`,
  `ledger-interlock-admission.js:322-339`). The assertion must go through the SKIP
  OUTCOME path (`executeMoveViaCoordinator` →
  `unified-rebalancer-move-execution.js:96-98` → `logSkippedMoveOutcome`) where the
  reason is actually dropped today (see A5/Finding V-5). Otherwise the repro cannot be
  RED on head.

---

## Additional attack lines (per vet tasking)

### A. F1a shared-helper semantics — covered under Q1. AMEND (A1, A2, A3).

### B. Cache-flap hazard — covered under Q2. CONFIRMED-SAFE with A3 (read-only compare); refresh-based compare rejected (HLC-precedence + clock-skew vectors documented there).

### C. F1b re-entrancy / poll-loop multiplicity — covered under Q3. CONFIRMED-SAFE (loop returns after first success, verified at voter-readiness-methods.js:155-167).

### D. F1d work-class — covered under Q4. AMEND (A6, scope honesty only; mechanism safe, precedented by the leader helper).

### E. Budget math — covered under Q5. REFUTED-as-stated / AMEND (A4).

### F. DT plan — covered under Q6. AMEND (A7).

### G. Constraint compliance

- **No client budget raises**: CONFIRMED-SAFE. The design touches neither
  `TABLE_CREATE_PROVISION_TIMEOUT_MS` nor the transient-wait shape
  (`sql-query-engine-initial-partition-provisioning.js:673-729` untouched; explicit
  non-fix recorded).
- **Hold safety (a genuinely concentrated ledger still holds; no unpromoted learner
  counted as voter)**: CONFIRMED-SAFE. F1 changes only WHEN truthful roles become
  durably visible, never the predicate: learners still never count
  (`operation-ledger-quorum-concentration.js:27-29, 48-55`), and every F1 publication
  is gated on a raft-committed non-learner tracked role (seed guard
  `create-methods.js:504-507`; F1b inside the `isReplicaVoterReady` branch,
  voter-readiness-methods.js:155,188-192; `becomeFollower` runs only after the
  promotion guards, learner-promotion-methods.js:437-443). Verified arithmetic: with
  fully honest run-27 data the hold correctly stayed engaged until the cure (§0) —
  earlier truthful visibility cannot re-create the run-22 wedge because it never
  reports a spread that has not physically happened (actuals of committed raft
  decisions only).
- **Promote-before-remove / run-21 even-voter guard**: CONFIRMED-SAFE (untouched —
  ordering already promote-first via the voter-ready gate,
  `replica-handler-transition-policy.js:44-47` + `create-methods.js:818-829`; the
  single-replacement overflow allowance
  `learner-promotion-methods.js:497-500, 525-539` is not modified).
- **5s floor**: untouched in this design — CONFIRMED-SAFE here; flagged in A4 as the
  pre-registered in-class fallback, which will need its own floor-purpose vet before
  any conditioning.
- **TOCTOU hold-evaluation vs admission**: unchanged; the synchronous accounting gate
  with post-await re-validation (`ledger-interlock-admission.js:355-453`) is not
  modified. CONFIRMED-SAFE.
- **Progress-aware wait as unbounded hang**: not implemented (explicit non-fix).
  Vacuously safe.
- **Actuals-only ARCH-0080/0084**: CONFIRMED-SAFE. The hold's inputs are unchanged
  (cache-only, `quorum-concentration.js:170-208`); F1a's confirm reads the committed
  authoritative row — an actual, not a target-based witness.
- **"Is the authoritative point read a new read path?" — ruling**: NO new cache and
  no new read path in the directive's sense. The helper ALREADY invokes this exact
  authoritative-read channel on its CAS-miss recovery path
  (`refreshObservedRow` → `refreshAuthoritativeCacheRow` →
  `executeAuthoritativeSystemTableRead`, wired core-base.js:564-578 + 622-626 since
  run-15). F1a adds one more invocation site of the same flow inside the same helper,
  bounded to the cache==pending-never-applied case — this is "fixing the gap that
  stops the existing mechanism", not a secondary read surface. Honest caveat recorded:
  it is additional authoritative-read traffic during formation; bounded to at most one
  read per queued value.
- **run-20 serialization / run-22 spread-first semantics untouched**: CONFIRMED-SAFE
  for F1 (no interlock code touched). For F2 see V-5 — after the amendment it is
  log/outcome-field-only; `rebalanceSkipReason` and `error.admissionResult` channels
  byte-identical.

---

## Findings register

- **V-1 (CRITICAL, blocks GO)**: F1a-as-drafted → permanent CAS-starvation loop when
  the seed out-versions the authority (the run-27 shape). Fix = amendment A1
  (authoritative row feeds the CAS guard on the unconfirmed path). Evidence:
  helper :267-274 + core-base.js:582-594 (guard from merged cache) vs
  `system-table-cache.js:788-799` + `row-merge.js:33-58` (stale-guard preserves seed)
  vs `cache-visibility-wait.js:399-424` (repair goes through that stale-guard).
- **V-2 (HIGH)**: F1a blast radius on helpers without an authoritative-read-capable
  service (wasm shim :270,308; message-group :114,172 without refresh hook). Fix =
  A2 (capability-gated confirm; legacy dedup elsewhere; prepareFlush short-circuit
  first).
- **V-3 (MEDIUM)**: comparison source must be read-only
  `executeAuthoritativeSystemTableRead` (A3); refresh-based compare has HLC-precedence
  and clock-skew clobber vectors against the seed (Q2).
- **V-4 (HIGH, honesty)**: vet-Q5 strong claim refuted — serialization cap
  (`move-planner-move-calculation-methods.js:523-540`) + B1 idle-ledger admission
  (`ledger-interlock-admission.js:160-171`) both wait on op-1's ops-row terminal
  visibility (measured ~6.5s, design assumed ~2s). Demo clause coin-flip marginal
  under F1 alone. Fix = A4 (honest math + pre-registered in-class fallback:
  floor conditioning for the cure replacement; successors: ops-row repair latency,
  dispatch gap).
- **V-5 (MEDIUM, F2 mis-target)**: `logSkippedMoveOutcome` ALREADY prints
  `admissionReason`/`admissionBlockingReasonCodes`
  (`unified-rebalancer-follow-up-move.js:622-634`, landed in e633ad76). The actual
  drop is upstream: `unified-rebalancer-move-execution.js:96-98` returns the skip
  outcome from `error.rebalanceSkipReason` WITHOUT attaching `error.admissionResult`
  (the :99-108 branch is unreachable for interlock errors because
  `rebalanceSkipReason` is always set,
  `rebalance-coordinator-concurrent-budget-gate.js:75-92`). Fix = A5. The two
  rebalance-loop sites (`unified-rebalancer-rebalance-loop.js:188-195, 218-235`) are
  genuine budget-lane skips (serial gate / global in-flight budget) with NO admission
  error present — the design's proposal to add `admissionReasonCode` there is
  inapplicable; if touched at all, surface the budget numbers
  (inFlightCount/effectiveBudget/reservedSlots) instead, or drop them from F2.
- **V-6 (LOW)**: F1d scope — `getMetadataPublicationWorkClass` covers ALL system-p1
  partitions, not only the 5 priority ones (Q4). Fix = A6.
- **V-7 (MEDIUM)**: DT repros 3 and 4 fixture-tautology risks (Q6). Fix = A7.
- **V-8 (INFO)**: research-phantom-budget-leg.md §Q2/Q4 "spread physically complete /
  not concentrated" is factually wrong (missed r2 on node-0 — primary-log verified
  §0); its Q1/Q3 (interlock mislabel, authoritative-fallback bypass) findings stand.
  Future readers of that report should be pointed at the design's corrected framing.

## Overall verdict: **AMEND -> GO**

Mandatory amendments (all rung-1 design-text + implementation-shape changes; none
require a new quest or class change):

1. **A1** — F1a unconfirmed path: the authoritative row from the confirm read MUST
   become the CAS-guard context for the subsequent write (never the merged cache
   row). This is the difference between fixing the bug and converting it into a
   live-lock.
2. **A2** — capability-gate the confirm (configured point-read hook; sites 1-2 only);
   legacy dedup preserved for message-group/wasm helpers; prepareFlush skip decided
   before any confirm read.
3. **A3** — comparison source = read-only `executeAuthoritativeSystemTableRead` point
   read (API exists; resolves the design's open seam question); NOT
   `refreshAuthoritativeCacheRow`.
4. **A4** — replace the budget-math section with the honest projection (ops-row
   terminal-visibility ~6.5s measured; serialization-cap + B1 dependencies; release
   ~28-35s in vs 29.8s budget). Pre-register the in-class fallback (5s-floor
   conditioning for the cure replacement, per c-class evidence rules) and the
   successors (ops-row repair latency; dispatch gap) so run-28's outcome routes to a
   planned branch either way.
5. **A5** — F2 re-target: attach `error.admissionResult` to the skip outcome at
   `unified-rebalancer-move-execution.js:96-98` (additive field; typed channels
   unchanged); drop or re-scope the rebalance-loop.js:191/231 part (no admission
   error exists there).
6. **A6** — F1d scope: `isPriorityControlPlanePartition` scoping, or explicitly
   document the broader CONTROL_PLANE_PARTITION_IDS scope (leader-helper precedent).
7. **A7** — DT plan: repro 3's services-row role updates must flow through the real
   helper+seed machinery inside the dt6 driver (not driver fiat); repro 4 must assert
   through the move-execution skip-outcome path, not the error object.

Non-blocking notes: public wrapper for the F1b cross-module call (Q3 style note);
record V-8's research-report correction alongside the design.
