# Design: durable voter-visibility — the raft_role actual must land and re-assert

Quest: `formation-ledger-post-spread-voter-visibility-latency` (rung 1 design).

## v2 — POST-VET AMENDMENTS (vet verdict AMEND->GO, all seven MANDATORY;
## rulings in vet-durable-voter-visibility-design.md)

- **A1 (CRITICAL)**: F1a's unconfirmed path must feed the authoritative row from the
  confirm read into the NEXT flush's CAS guard. Guarding on the merged cache row
  (which the CL-035 seed wins via newer updated_at — system-table-cache.js:788-799 +
  row-merge.js:33-58) zero-rows forever: permanent 30s-backoff spin. This also repairs
  the run-15 CAS-refresh recovery for seeded rows.
- **A2**: capability-gate the authoritative confirm — wasm helpers inject a transport
  shim as cdcIntegrationService (wasm-service-replica.js:270,308) with no
  authoritative-read methods; helpers without the hook keep legacy dedup. prepareFlush
  skip decided BEFORE paying the read.
- **A3**: comparison source = read-only executeAuthoritativeSystemTableRead point read
  (API exists — the design's open seam question resolved). NOT
  refreshAuthoritativeCacheRow (boolean, cache-writing, HLC-precedence/clock-skew
  clobber vectors against the seed).
- **A4 (budget honesty)**: the "cure planned at the :22:06.855 pass" claim is REFUTED —
  drain-inclusive REPLACE serialization cap (move-planner-move-calculation-methods.js:523-540)
  AND the disruptive-branch idle-ledger admission (ledger-interlock-admission.js:160-171)
  both wait on op-1's ops-row TERMINAL visibility (~6.5s measured, not ~2s). The
  blind-ADD elimination stands (op-2 disappears). Honest projection: release ~28-35s
  into a ~29.8s budget — coin-flip. IN-CLASS FALLBACK PRE-REGISTERED (implement only on
  run-28 miss with the floor measured binding): condition the 5s
  LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS for the spread-cure REPLACEMENT
  (permitted by c-class with evidence; stability purpose must be preserved).
  Successor leads: ops-row terminal-visibility repair latency; op-1 dispatch gap.
- **A5 (F2 retarget)**: logSkippedMoveOutcome already prints admission fields; the real
  drop is unified-rebalancer-move-execution.js:96-98 (rebalanceSkipReason branch returns
  WITHOUT attaching error.admissionResult). rebalance-loop.js:191/231 are genuine
  budget-lane skips — inapplicable there.
- **A6**: F1d scope = isPriorityControlPlanePartition (getMetadataPublicationWorkClass
  keys on ALL system-p1 partitions, ~20+; leader helper ships the broader scope as
  precedent — we take the narrow one).
- **A7 (DT fidelity)**: repro 3 must flow services-row role updates through the REAL
  helper+seed machinery (the dt6 driver applies rows by fiat — tautology hazard);
  repro 4 must assert via the skip-outcome path (the error object already carries the
  reason on head — cannot be RED).

Confirmed-safe by the vet: F1b re-entrancy/shutdown, hold safety (no learner counted),
actuals-only, no-new-read-path ruling, untouched run-20/22 semantics/floor/TOCTOU/wait.

Inputs: `research-run27-tail-timeline.md`, `research-hold-release-code-map.md`,
`research-phantom-budget-leg.md`, rung-0 Solver findings (leg-A root cause).

## Corrected head (one class, three surfaces)

Run-27's demo CREATE failed because the quorum-spread hold — evaluating fresh,
coordinator-local, from services-row ACTUALS — never saw the spread progress that had
physically happened. Root: the durable `services.raft_role` write for a promoted
priority-control-plane replica is SILENTLY LOST to a three-writer provenance tangle:

1. **Role helper** (partition-service-core-base.js:579-648, the intended durable owner):
   CAS-guards on the local cached row; dedups via `syncFromCache`
   (authoritative-row-mutation-helper.js:191-203) — ANY cache row equal to pending is
   treated as persisted and clears pending.
2. **CL-035 voter-ready seed** (replica-handler-create-methods.js:483-523): upserts
   `raft_role=follower, updated_at=now` into the SAME local cache row → the helper's
   flush/retry reads the seeded value and NOOPs. Durable write never (re)attempted;
   zero log lines. (The seed's own comment promises "superseded later by the durable
   write's CDC round-trip" — the seed prevents that round-trip.)
3. **CL-021 lifecycle UPSERT** (replica-state-machine-transition.js:487-513): preserves
   `raft_role` FROM THE CACHED ROW and clears the local-only marker on success — racing
   the seed it durably freezes `learner` and stops the CL-016/021 reconcile.

Terminal state: local cache=follower (seed wins merges via newer updated_at), durable
row=learner-or-missing, nothing pending anywhere, no level-triggered re-assert.
Downstream (all evidenced in run-27): hold never releases even as spread progresses;
planner `overTarget` computed false (hid the drain cure); planner picked a blind
count-increasing ADD (op-2) instead of the count-neutral REPLACE; every dependent
control-plane move deferred; the cure REPLACE at 13:22:17.488 and all "budget_exceeded"
skips were interlock rejections MISLABELED by `createOperationLedgerInterlockError` →
`createConcurrentOperationBudgetError(type, 1, ...)` (ledger-interlock-admission.js:322-339)
— reason code sits unprinted in `error.admissionResult.reason`.

Physical truth check (settles the two research agents' conflict): r2 AND r3 were
bootstrap-created on node-0 (node-0 log 13:21:30.388/13:21:31.986); after op-1+op-2 the
ledger had 4 raft voters with 2 on the seed — the hold was CORRECT under fresh actuals,
and ONE count-neutral cure REPLACE off the seed was still physically required. With
honest visibility from op-1's completion (3 voters, 2 on seed, at-target), the planner's
existing evidence path (`isOperationLedgerQuorumConcentratedForPartition`,
interlock-admission.js:269-274) plans exactly that cure; after it, 3 voters / max 1 per
node → hold releases arithmetically.

## Fix surfaces (REUSED / EXTENDED / NEW)

### F1 — the durable role write must be un-maskable (core)

**F1a. Helper dedup honesty.** `AuthoritativeRowMutationHelper.syncFromCache` may only
satisfy a pending value from cache when that observation is DURABLY grounded. Change
(EXTENDED, helper-generic): the helper tracks whether it has ever APPLIED the pending
value (`persistedValue` set only by an APPLIED write result or authoritative
confirmation). On the dedup path for a never-applied pending value, require one
authoritative confirmation before clearing: reuse the existing
`refreshObservedRow`/authoritative-read flow (cdc-integration-service-authoritative-read-flow.js)
— read the AUTHORITATIVE row (not the merged cache, which the local seed wins by
newer updated_at) and compare the field; if the authority already shows the value,
dedup honestly (this preserves syncFromCache's legitimate restart/re-election purpose);
if not, proceed with the durable write. Design constraint: the helper is shared (role,
leader-pointer, others) — the confirm-before-dedup applies uniformly; it costs one
authoritative point read only when cache == pending without a prior APPLIED.
- Open seam question for vet: exact authoritative-read API returning the row (the
  boolean `refreshAuthoritativeCacheRow` refreshes the merged cache, which the seed
  out-versions — MUST NOT be the comparison source).

**F1b. Seed nudges the owner (level-trigger).** At the CL-035 seed seam
(`waitForVoterReadyActivation` → `seedLocalPriorityReplicaRaftRole`,
replica-handler-voter-readiness-methods.js:155-161), after seeding the local row, the
handler re-asserts the durable write through the owner: `getTrackedService(replicaId)`
(replica-handler-runtime-methods.js:527-539) already returns the partition-service
instance → call its existing `queueRoleUpdate(currentRole)`/`flushRoleUpdate()`
(partition-service-metadata-delivery-methods.js:23-42). With F1a in place this queue
cannot be dedup-masked. (REUSED wiring + EXTENDED call; NEW = nothing.)

**F1c. Lifecycle preserve must not fight the owner.** CL-021's `buildCreateCdcData`
preserves `raft_role` from the cached row — with the seed applied this now propagates
`follower` (good). The residual race (lifecycle UPSERT built BEFORE the seed applies →
durably freezes `learner` while clearing the local-only marker) is closed by F1a+F1b:
the seed-time re-assert lands the correct role regardless of what the lifecycle write
carried. No change to the lifecycle path itself beyond what F1a/F1b give. (Decision:
do NOT add a second writer or ordering protocol here — single owner stays the helper.)

**F1d. Delivery class.** Priority control-plane partitions' role writes currently ride
`deliveryPriority/workClass BACKGROUND, allowPressureDefer:true`
(partition-service-core-base.js:600-607) — pressure-deferrable during exactly the
formation window that needs them. EXTEND `buildUpdateOptions` to use the existing
`getMetadataPublicationWorkClass` CRITICAL branch
(partition-service-metadata-delivery-methods.js:90-99) for priority control-plane
partitions. (Not evidenced as the run-27 loss cause, but it is the same class of
"the visibility write loses to the churn it must describe".)

### F2 — interlock label fidelity (forensics-cost defect, small)

`MOVE_SKIPPED` logs print `reason=budget_exceeded, admissionDecisionType=null` for
interlock rejections while the true reason code (`operation_ledger_self_move_waiting_...`,
`..._in_flight`, `..._quorum_concentrated`) sits in `error.admissionResult.reason`.
EXTEND the skip-logging site (unified-rebalancer skip path; phantom-budget report cites
unified-rebalancer-follow-up-move.js:623-643 and the two skip sites in
unified-rebalancer-rebalance-loop.js:191,231) to include
`admissionReasonCode: error.admissionResult?.reason || null`. NO behavior change —
the typed channels (rebalanceSkipReason / admissionResult) stay exactly as-is
(run-20/22/25 consumers untouched).

### Explicit non-fixes (scope discipline, recorded as leads)

- The 5s `LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS` floor: NON-BINDING in run-27
  (inside op-1's window; r5 had no learner phase). Untouched.
- Interlock/admission semantics (run-20 serialization, run-22 spread-first, cure
  exemption shape): untouched. The run-27 cure rejection at :22:17.488 is expected to
  dissolve with honest visibility (cure planned ~14s earlier, into an idle ledger);
  if run-28 shows the cure still interlock-blocked, that is a recorded successor, not
  a mid-quest scope widen.
- Progress-aware provisioning transient wait: untouched (fixed budget stays; the
  no-budget-raise constraint and internal-pacing successor line own it).
- op-1's 10.9s creation→dispatch gap (13:21:46.059 → 13:21:56.954): measured lead on
  the dispatch-arming lineage; run-28 will re-measure. Not chased here.

## Budget math for the demo clause (run-28 projection)

CREATE budget ~30s from ~formation+4s. With F1: op-1 completes ~13s in (incl. its
10.9s pre-dispatch gap), roles visible ≤1-2s later, cure REPLACE planned immediately
(planner evidence path already exists), admitted into idle ledger (ops-row terminal
visibility has its own repair machinery, ~2s), executes ~7-12s (5s floor + drain),
role visible +1s → hold releases ~24-29s in. MARGINAL against the 30s budget but
inside; the blind-ADD churn (op-2) and its deferrals disappear, which is additional
slack. If run-28 still misses, the measured residual leg (dispatch gap / floor /
transient-wait shape) becomes the successor with numbers in hand.

## DT reproduction plan (c-dt-first, RED on head before any src change)

Composition bases: `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js`
(hold + planner-gate scenarios), `test/partition/partition-service-learner-promotion.test.js`
(promotion seams), helper unit seams (authoritative-row-mutation-helper).

1. **Helper-mask repro (unit-DT)**: pending role write; CAS zero-row first attempt
   (row not yet durable); local seed applies between retry schedule and retry flush;
   HEAD: pending cleared, no durable write, durable row never converges → RED assert
   "durable raft_role converges". FIX: authoritative-confirm dedup + re-assert lands it.
2. **Lifecycle-race repro**: lifecycle ACTIVE UPSERT built pre-seed (preserves learner),
   marker cleared; HEAD: durable row frozen learner with nothing pending → RED.
   FIX: seed-time re-assert converges it.
3. **Hold-release scenario (dt6 composition)**: concentrated bootstrap → spread moves
   complete physically → promoted replica's role write masked (head behavior injected
   via the real seams, not stubs) → HEAD: `evaluateOperationLedgerQuorumConcentration`
   never releases within the scenario budget → RED. FIX: releases promptly after the
   cure completes and roles land.
4. **Label fidelity**: interlock rejection surfaces reason code in the skip record.
   (Assertion on the logged/returned skip diagnostics.)

Scenario runner: `scripts/run-formation-ledger-post-spread-voter-visibility-latency-scenarios.js`
(doneWhen probe target, consecutive 3). dt:prove red-on-revert across touched src.

## Vet questions (attack lines requested, per quest c-vet)

1. F1a changes a SHARED helper's dedup semantics — enumerate the other
   AuthoritativeRowMutationHelper users (leader-pointer at least) and attack: can the
   confirm-before-dedup deadlock when the authority is unreadable mid-move (the ledger
   moving itself)? The helper must degrade to scheduleRetry, never to a synchronous
   block, and the run-15 CAS-refresh semantics must be preserved.
2. Does the authoritative confirm re-introduce the CL-035 problem in reverse — i.e.
   refreshing the merged cache row from authority OVERWRITING the local seed and
   flapping the remove-safety gate mid-REPLACE? (The comparison must NOT write the
   authority's stale role over the seeded local row; read-only compare, or refresh
   that respects the newer-updated_at merge.)
3. F1b calls the partition service from the handler's voter-ready poll loop — attack
   re-entrancy (queueRoleUpdate during checkLearnerPromotion), double-queue (promotion
   itself already queued), and shutdown ordering (helper shutdown vs seed).
4. F1d CRITICAL class for role writes: can this starve genuinely-background metadata
   under pressure, or amplify the run-22 concentration (more critical writes into the
   moving ledger... no — services table, not the ops ledger; verify the table).
5. The claim "leg B/C dissolve with visibility" — attack with the run-27 numbers: if
   ops-row terminal visibility takes ~7s (op-1 completed :03.5, repair-confirmed
   :10.2), the cure admission (disruptive branch requires NO live op in observation)
   may still start ~:10-12 → done ~:19-24 → MISSES the budget end :19.6. Is the demo
   clause actually reachable without touching the transient wait? Quantify honestly;
   if not reachable, the design must say what else is in-class (e.g. the cure being
   plannable DURING op-1's drain via the existing planner evidence, or op-2-as-REPLACE
   landing the spread in ONE move — with visibility the :22:06.855 planner pass plans
   the cure instead of the ADD, saving the whole second move).
6. DT plan fidelity: are the repro seams the REAL production seams (no fixture-only
   shortcuts that would green regardless)?
