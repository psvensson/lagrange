# Readiness observation currency - verified plan (Q6 family)

Owner epic: [`core-architecture-convergence`](../core-architecture-convergence.md),
planned quest family Q6 `core-convergence-readiness-lifecycle`
(execution manual section 9 in [`design.md`](design.md)).

**Provenance.** Census of the readiness-currency defect class plus an
independent adversarial verification, both 2026-10-03, measured on
`ec63fbb00` (origin/main). The verifier's verdict was APPROVE WITH THE
LISTED CHANGES; every correction is applied in place below and marked
`[corrected]`. Where the original census and the verification disagreed,
this record states the verified form only. Paths are relative to `src/`
unless they start with `test/` or `scripts/`. A short name (for example
`available-nodes.js`, `evaluator.js`) is the file-name suffix of the full path
given earlier in the same row or section. Line numbers are as of
`ec63fbb00`; the current source always wins (R18), so each slice re-reads
its rows before acting.

**Status.** Planning record only. No quest is sealed or started by it, and
no planned id below is a declaration. The gate is in section 10.

## 0. Owner directive (2026-10-03, verbatim)

> "make the systematic view default for all problems from now on unless they
> can strongly prove they are local. It is always more expensive to optimize
> for simple local changes in a distributed system."

Applied here: every slice in section 7 carries a locality check (section 8).
A slice is only treated as local when a consumer census and the fix history
both show no sibling.

## 1. The class

A decision is made on an observation that is not current as of the source
revision the decision is about.

Verdict: **SYSTEMIC.**

- 21 prior fixes moved or closed one window at a time (section 3).
- About 55 decision sites read derived readiness/routing views (section 4);
  27 `getNodeReadinessSync` call sites in 22 files, all censused.
- None of those sites can name the source revision its view reflects.
- "Not computed yet" is delivered as data: an all-false placeholder. Callers
  interpret it in at least four incompatible ways: as a negative, as a
  positive, by matching reason-code strings, or through the canonical
  predicate.

## 2. Observed instances (2026-10-02/03)

- `4f61b4a32` (synchronous apply-time classification) and `ec63fbb00`
  (deferred-delivery frontier gating the routed-read bridge) are the most
  recent instances of the class. `4f61b4a32` made "unclassified" stop meaning
  "deferred invalidation pending", which broke the routed-read bridge's proxy
  signal; `ec63fbb00` added a per-table deferred-delivery frontier to restore
  it. The brief that commissioned this record numbers them instances 20 and
  21; the census table (section 3) counts them together as chain 21 (see
  section 12, item 1).
- Lagrange-Images #316 M6.3: the provisioning throw "Insufficient admissible
  provisioning targets" (empty candidates, zero rejections) appeared in 5 of
  5 runs on both measured heads. Cause: the provisioning trust view read the
  planning placeholder (about 9% of about 1,500 attempts) combined with the
  capture-then-wait in `provisionInitialTablePartition`, driven by six schema
  jobs retrying every ~2 s because replica count 3 can never converge on one
  node. These are census rows Q1, Q3, Q4 and the S3' loop.

## 3. History: 21 fixes, moved not closed

Confirmed by the verifier on 15 spot-checked commits.

| # | commit / quest | date | window closed or moved |
|---|---|---|---|
| 1 | 95bc5e752, CL-012 ph1 | 06-11 | Stored-snapshot reuse moved ahead of evidence build; opens "serve last stored evaluation". |
| 2 | 8e3edfef3, CL-010 | 06-11 | Observation time removed from the recovery-epoch semantic key. |
| 3 | fde3a0552, CL-019 | 06-11 | Watermark-equality reuse, cache-change marker, publication cluster invalidation, `buildStartedAtMs` stamp. |
| 4 | 6940fdb8a, deleted 8e742e6eb | 06-15/06-26 | Bounded-stale serve tried, then deleted. |
| 5 | bb4ba2caa | 07-02 | CL-019 regression: live-transport drift veto. |
| 6 | 88750b499 | 07-05 | Admission taken from one sample during a transient hold; re-wait added. |
| 7 | dd54c8276 | 07-08 | DDL targets read CDC-lagged `connection_state`; live-transport OR-rescue. |
| 8 | 99ff77806 -> bcca17fa9 | 07-09/10 | Progress-gated re-wait, then one parent deadline. |
| 9 | 4b9a8642e | 07-11 | Trust view centralized plus `provisioningTrustGraceByNodeId` stale-negative rescue. |
| 10 | 43b2efb3b | 07-18 | Monotonic `getTableMutationVersion`; SERVICES version witness on stored reuse. |
| 11 | b0ee1bd98 | 08-04 | CL-033/034 memos served stale projections after invalidation. |
| 12 | 5d60eb451 | 08-15 | Planning snapshot owner plus `buildDeferredSnapshot` all-false placeholder (stale-positive traded for stale-negative). |
| 13 | 3fda9b056 / 8b5c81f66 | 08-15 | `isEvidenceAbsentReadinessDenialSnapshot` carve-out (12's negatives deadlocked formation); placeholder memo. |
| 14 | 334bbca2d | 08-15 | System-table leader fail-open on evidence-absent denial (repairs 12 again). |
| 15 | 68276ed78 / 739e38113 | 08-15 | Floored 250 ms generation latch (wall-clock currency). |
| 16 | 405caf2e0 | 08-17 | Reuse conflated lag with removal: `isClusterInvalidatedMissingRowReuse`. |
| 17 | 91c216d15 / a42e8fc77 | 08-30 | Memo freshness moved from a live probe to a stored version key. |
| 18 | 6f18f0f68 | 08-31 | Completed build discarded for the placeholder when the token moved mid-flight. |
| 19 | f2b3916f7 / c81554f14 + 105f9d722 | 09-03/04 | Content-only evidence key with a sync publication-version stamp; one liveness TimeSource. |
| 20 | f95fccaf0 -> d0516be76 -> 0d749c1ff | 09-05 | Semantic planning identity; saturation memo fallback the same day; routed-read bridge; `isStoredSnapshotEvidenceNewer`; `isSameLivenessState`. |
| 21 | 4f61b4a32 -> ec63fbb00 (#316) | 10-02/03 | Apply-time sync classification broke the bridge proxy; per-table deferred-delivery frontier added. |

Not window fixes: 003c65b89 (09-19, observability after a joiner was denied
173 s on a deferred snapshot) and 1aea11baf (09-30, placeholder memo keyed by
dimension; trust membership from the published read).

Moved, not closed:

- CL-012 -> CL-019 -> transport / services-version / removal / liveness
  vetoes: four follow-ups, each a new witness on the same stored slot.
- Placeholder (12) -> carve-out (13) -> fail-open (14) -> discarded builds
  (18) -> the 09-04 GCP stall (deferred read as `node_ready_lease_incomplete`)
  -> the 173 s deferred denial.
- Semantic identity (20) -> saturation memo fallback -> saturation at
  admission (`4f61b4a32`) -> bridge proxy broke (`ec63fbb00`).
- Provisioning waits: 6 -> 8 -> today's last-sample-wins poll.

Closed only for their own owner: the build-start stamp (3), the SERVICES
witness (10), the A3 publication stamp (19). Recommended but never done:
stamping stored-snapshot reuse with the CONTROL_PLANE_PUBLICATIONS version
(`control-plane/control-plane-readiness-stored-snapshot-reuse.js:35-48`
checks only SERVICES version, transport and watermark; publications
invalidate only on the deferred channel).

### Parallel currency mechanisms alive at ec63fbb00 (introducing commit)

1. Stored-snapshot lag bridge `getFresherStoredReadinessSnapshot` (95bc5e752).
2. Wall-clock maps `lastReadinessSnapshotInvalidatedAtMsByNodeId` /
   `...ClusterInvalidatedAtMs` plus `isReadinessSnapshotInvalidated` (fde3a0552).
3. `buildStartedAtMs` stamp (fde3a0552).
4. Transport-drift veto (bb4ba2caa).
5. SERVICES version witness `lastReadinessSnapshotServicesVersionByNodeId` (43b2efb3b).
6. Missing-row versus removal discrimination (405caf2e0).
7. Persistence guard `isStoredSnapshotEvidenceNewer` / `isSameLivenessState` (d0516be76, 0d749c1ff).
8. `allowStaleOnCacheChange` + `maxCachedAgeMs` read options (about 15 callers).
   `[corrected]` These implement the sealed CL-033 5 s staleness bound.
9. Placeholder `buildDeferredSnapshot` + `buildMemoizedDeferredSnapshot` +
   `deferredSnapshotMemoByOwnerKey` (5d60eb451, 8b5c81f66).
10. Evidence-absent carve-out (3fda9b056) plus the inline duplicate in
    `query/query-executor-partition-routing-snapshot.js:81-89`.
11. System-table leader fail-open (334bbca2d).
12. Floored 250 ms latch + membership-planning version key
    (`control-plane/membership-planning-version-key.js:32,51-57`) (68276ed78).
13. Memo stale-grace `isReadinessPlanningMemoWithinStaleGrace`, CL-033/CL-034
    memos and the context WeakMap
    (`control-plane-readiness-participation-base.js:182-202`).
14. Semantic planning identity / saturation / rebaseline (f95fccaf0).
15. Routed-read bridge `bridgeRoutedReadSnapshot` +
    `hasNodeTableOnlyUnclassifiedChange` (d0516be76).
16. Apply-time sync channel `onCacheApplyChange` (4f61b4a32).
17. Deferred-delivery frontier `deferredDeliveredSourceRevisions` (ec63fbb00).
18. Publication-diagnostics `memoStamp` plus a deferred-channel null
    (`control-plane-readiness-publication-diagnostics.js:95-128`).
19. Provisioning trust grace (4b9a8642e), live-transport rescue (dd54c8276),
    transient-hold re-wait (88750b499), parent deadline (bcca17fa9).
20. Routing metadata overlay
    (`query/sql-query-engine-routing-metadata-methods.js:186-260`).
    `[corrected]` A row-level read-your-writes bridge; it needs its own census
    (sibling N3, section 4).

Twenty mechanisms, each with its own validity rule: wall-clock ms, watermark,
table version, floored latch, semantic identity, deferred frontier, or object
identity.

## 4. Consumer census

### Shared mechanics

- `getNodeReadinessSync` goes through the planning owner
  (`control-plane/control-plane-readiness-service-node-methods.js:581-596` ->
  `readiness-planning-snapshot-owner.js:515-614`). With no completed record
  (:556-572), a source change still unclassified (:544-555), or a stale
  identity (:595-613) it enqueues a build and returns the placeholder.
  Exception: the CL-012 bridge serves `participationKind ROUTED_READ` only.
- Variants are keyed by the build-options key
  (`control-plane-readiness-snapshot-store.js:488-503`): dimension,
  allowStale, planning source, and so on; up to 16 per node. The same node
  can be current in one variant and placeholder in another. The provisioning
  trust view is its own variant (`DIRECT_PUBLICATION_ROW`), so it is
  placeholder after every identity rotation.
- The placeholder (`readiness-planning-publication-contract.js:375-422`):
  every dimension false, `processAlive:false`,
  `routerConnectionState:'unavailable'`, `runtimeAuthority.state
  UNAVAILABLE`, reasons `[planning_snapshot_refresh_pending]` plus the prior
  denial reasons when the completed record was a denial,
  `readinessPlanningTokenStatus:'stale'`.
- Canonical predicate `isDeferredReadinessPlanningSnapshot`
  (`readiness-planning-version-contract.js:103`).
- Stored-snapshot invalidation runs only on the DEFERRED cache channel
  (`control-plane-readiness-snapshot-store.js:565-632` ->
  `stored-snapshot-reuse.js:148-169`), uses wall-clock ms and covers only
  NODES, SERVICES and PUBLICATIONS.
- No consumer receives a source revision with its view.

`[corrected]` Reliance on the placeholder's shape, from the verification:

- Sites relying on all-false **failing closed**: R2, R7, R8, R16, R23, R28,
  Q12, Q14, Q21, Q22.
- Sites relying on evidence-absent **failing open**: R1 (formation), R12, Q9,
  Q13.

Columns: site | decision | view(s) | currency knowledge | capture-then-wait
(c-t-w) | deferred -> | closed/open | on behind view | exposure | sub-patterns.

### Rebalancer / partition (R rows)

| # | site | decision | view(s) | currency | c-t-w | deferred -> | closed/open | on behind | exposure | sub-pattern |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | rebalancer/unified-rebalancer-available-nodes.js:198-290 `getAvailableNodesConstrainedToNodeIds` | placement-target eligibility | NODES + readiness + startup authority + liveness | none | no | negative; POSITIVE for priority/formation (:255-264); absent authority drops the cohort constraint (:276-290) | both | next tick | liveness + safety-lite | placeholder-neg/pos, reason sniff, absent-as-unconstrained |
| R2 | available-nodes.js:398-412 `isNodeProcessAlive` -> unified-rebalancer-budget-planning.js:416-425 | replica alive (over-replication deficit) | readiness processAlive | none | no | negative ("dead") | open (ADD re-minted) | silent | resource / liveness | placeholder-neg |
| R3 | available-nodes.js:488-572 priority planning snapshot | non-blocking priority set | planning answer memo | 250 ms latch | no | absent -> "not priority" | open | silent | liveness | wall-clock latch, absent-as-neg |
| R4 | available-nodes.js:438-484 -> unified-rebalancer-priority-readiness.js:426-441 | non-blocking set across partitions | AVAILABLE planning surface | none | YES | - | - | silent | liveness | c-t-w |
| R5 | unified-rebalancer-priority-readiness.js:466-560 spread blocker | hold non-priority work | planning answer + R1 + R6 | three channels | no | absent -> null blocker | OPEN | silent | ordering | dual-channel, absent-as-unconstrained |
| R6 | rebalancer/priority-placement-observation-memo.js:55-110,181-201 | learner readiness map | readSync per learner + rows | memo key omits the readiness token | YES (memo freezes the placeholder) | negative, frozen until a table version rotates | closed | silent | liveness | revision-omitted-key, placeholder-neg |
| R7 | rebalancer/unified-rebalancer-critical-topology-methods.js:65-105,441-454 | critical settling blocker | NODES + readiness + authority | none | no | UNREADY_ACTIVE | closed | tick | liveness | placeholder-neg |
| R8 | rebalancer/unified-rebalancer-local-serve-readiness.js:29-36,126-153 | local leader may plan system work | own readiness | none | no | BLOCKING_REASON_PRESENT; missing snapshot = no blocker | closed | tick | liveness | reason sniff, placeholder-neg |
| R9 | rebalancer/unified-rebalancer-replica-state.js:73-140 `isNodeReady` | move target ready | readiness + authority + ping | none | YES | negative | closed | - | liveness | c-t-w |
| R10 | replica-state.js:202-235 (rebalance-loop:119, move-execution:212-226,527-561, follow-up-move:742) | skip batch / target | readiness read twice across an await | none | YES | misattributed STATUS_NOT_ACTIVE / LEASE_EXPIRED | closed | debug | liveness + diagnostics | c-t-w, proxy |
| R11 | rebalancer/unified-rebalancer-follow-up-move.js:136-148,433-488 | follow-up cure target | readiness + NODES + liveness | none | no | node dropped | closed | - | liveness | placeholder-neg, dual-channel |
| R12 `[corrected]` | rebalancer/priority-publication-safety-topology.js:141-182 -> operation-workflow-remove-safety-evaluator.js:533-593 | REMOVE/REPLACE quorum floor | SERVICES rows + readiness | none | no | with a prior-ELIGIBLE verdict the evidence-absent placeholder is counted as a voter (priority-publication-safety-topology.js:153-163), but both tiers then ping projected peers (operation-workflow-remove-safety-universal-tier.js:93-127,196-202; evaluator.js:728-734), so a dead node yields DEFERRED; with a prior DENIAL, SAFE is the same answer the completed record gives | closed for currency (residuals in S7a are not currency-specific) | silent | safety-lite (was "SAFETY"; downgraded) | placeholder-pos, reason sniff |
| R13 | rebalancer/priority-publication-safety-rows.js:303-341 `isNodeReadyForRouting` -> rebalance-coordinator-priority-budget-admission.js:253; operation-workflow-recovery-timeout.js:931 | occupied-alive count; drain-owner availability | readiness | none | no | negative -> hold lifted / owner unavailable | open (lease-fenced in the timeout case) | silent | safety-lite | placeholder-neg |
| R14 | rebalancer/operation-workflow-replace-owner-wake.js:121-150,303-312 | REPLACE wake level | owner completions; deferred bit named | follows owner | no | NAMED | - | event-driven | none | **correct pattern** |
| R15 | rebalancer/operation-workflow-priority-recovery-errors.js:41-99 + superseded-target-decision.js:84-118 | fail vs defer a recovery op | AVAILABLE cohort + readiness | none | via R4 | processAlive false -> DEFER (correct by accident) | closed (cohort may be behind -> wrong FAIL) | - | liveness | proxy, dimension sniff |
| R16 | rebalancer/rebalance-coordinator-ledger-interlock-hold-state.js:259-310 -> operation-ledger-hold-policy.js:390-396 | ledger self-move hold vs REGISTERED | readiness + bootstrap allowlist | none | no | not admissible -> REGISTERED; dispatch reads at a different moment | open toward the run-20 hazard | silent | safety / liveness (ledger) | placeholder-neg, dual-read, reason sniff |
| R17 | transition-persistence.js:105-133, transition-orchestration.js:228-250, operation-creation.js:696-712 | audit stamp | readiness summary | - | - | placeholder persisted as "readiness at decision" | - | - | forensics | placeholder-as-data |
| R18 | replica-operation-repository-read-methods.js:138-178 | issue owner read? | participation reasonCode | none | no | stale prior reason propagates | mixed | - | liveness / noise | reason sniff |
| R19 | replica-operation-repository-visibility-methods.js:372-447,727-789 + incomplete-read-methods.js:370-445 | trust an empty or failed op read, else substitute cached | planning snapshot after await, query latency, wall-clock grace | none | YES | named deferredOutcome | open (stale set) | warn / error | safety / liveness | proxy (latency), wall-clock, c-t-w |
| R20 | rebalancer/storage-admission-service.js:255-305 | admission per candidate | async `getNodeReadiness(allowStaleOnCacheChange:true, maxCachedAgeMs)` | wall clock | YES (serial awaits) | stale positive admitted | open | - | safety-lite | wall-clock, c-t-w |
| R21 | rebalancer-priority-recovery-planning-gate-methods.js:340-405,505-560,667-680 | operation-creation gate | planning answer memo | 250 ms latch | no | null -> no gate | closed (lost wakeup) | diag :676 | liveness | wall-clock, absent-as-neg |
| R22 | rebalance-coordinator-topology-guard-methods.js:88-111; operation-ledger-quorum-concentration.js:84-112 | spread-cure exemption | NODES `connection_state` or authority | none | no | not represented | either | - | safety-lite | proxy, dual-channel |
| R23 | partition/partition-service-learner-promotion-count-check-methods.js:63-176 + learner-promotion-methods.js:175-226 | overflow voter budget | local readiness + planning answer (ambient `Date.now()`) + per-learner readSync | none | no | NOT_RECOVERY_ELIGIBLE (mislabelled) | closed | DEFERRED_RECHECK timer | liveness | dual-channel, placeholder-neg |
| R24 | partition/managed-split-workflow.js:202-213 -> 280-313,371-377,533-573 | split admission + child targets | routable set (RECOVERY_ELIGIBLE) | none | YES (5+ awaits, then persisted) | not routable; `normalizeNodeIdList` falls back to the old list | both | - | liveness | c-t-w, absent-as-old-view |
| R25 | partition/managed-merge-workflow.js:288-300 -> :394,429-606 | merge targets | routable set | none | YES | as R24 | as R24 | - | liveness | c-t-w |
| R26 | partition/managed-split-workflow-cutover-readiness-methods.js:61-145 | cutover promotion | one routing snapshot re-decided in the owner lane | - | no | typed CHILD_LEADER_NOT_ROUTABLE | closed | bounded wait | - | **correct pattern** (merge cutover sibling gap at partition/managed-merge-workflow-execution-gate-methods.js:544-590: F8) |
| R27 | cluster-readiness-signal.js:150-169 | "cache hydrated" | core tables non-empty | - | - | - | - | - | noise | proxy |
| R28 | unified-rebalancer-priority-readiness.js:600-608 -> control-plane/control-plane-mutation-readiness.js:274-330 | local mutation blocker | own readiness | none | no | every dimension fails | closed | tick | liveness | placeholder-neg |

### Query / bootstrap / admin / control-plane (Q rows)

| # | site | decision | view(s) | currency | c-t-w | deferred -> | closed/open | on behind | exposure | sub-patterns |
|---|---|---|---|---|---|---|---|---|---|---|
| Q1 | query/sql-query-engine-provisioning-methods.js:155-225 <- control-plane-readiness-service-node-methods.js:362-399 + node-trust-state.js:243-338 | provisioning targets | trust view -> readSync (DIRECT_PUBLICATION_ROW variant) | cacheWatermark captured, never compared | no | state UNKNOWN with `transport_unknown`, `readiness_revision_unknown`, `process_not_alive`, `readiness_not_repair_eligible` (8 reasons in all, incl. `planning_snapshot_refresh_pending`), dropped by `serveEligible===true` | closed | polled | liveness (CREATE TABLE ~9%) | placeholder-neg |
| Q2 | node-methods.js:135-164,189-199 -> node-liveness-semantic-projection-owner.js:235-248 | trust grace start / liveness evidence write | deferred transport | - | - | grace reset; a READ writes into the liveness owner (also admin-control-snapshot-local-diagnostics-methods.js:484-490) | open (grace extended) | - | safety + liveness; re-deferral loop plausible, not verified (F4) | observer-mutates-source |
| Q3 | query/sql-query-engine-provision-target-methods.js:90-229 `waitForProvisionTargetNodeIds` | convergence wait | Q1 + admission probe | timer poll | last-sample-wins | yes | closed | warn on timeout, returns empty | liveness | poll-a-derived-view |
| Q4 | query/sql-query-engine-initial-partition-provisioning.js:134 -> :257-278,389,431,442,510 | requiredNewReplicaCount, candidate exclusion | routing snapshot | none | YES (up to 10 s + re-wait) | - | both | throws :437/:572 | safety (extra replica, ADD to a node already hosting one) + liveness | c-t-w |
| Q5 | query/sql-query-engine-provisioning-admission-methods.js:393-485 (:397), merged at initial-partition:296-301 | admission convergence | routable set in the DEFAULT dimension vs the context dimension at :134 | none | merged unfiltered | - | open (double count) | - | safety | dual-view mismatch |
| Q6 | admission-methods.js:10-30,207-277 | transient-shortfall classification | rejection reason strings | - | - | deferral is not a reason; empty list -> not transient | closed | - | liveness | reason sniff |
| Q7 | admission-methods.js:285-324 throw | client error | - | - | - | error carries no trust diagnostics | - | retryable error | triage noise | diagnostics gap |
| Q8 | query/query-executor-partition-service-resolution.js:118-338 `evaluatePartitionServiceRoutability` | per-service routability | participation / readSync; CL-012 bridge for routed reads | bridge gated by the frontier (ec63fbb00) | no | NODE_NOT_ELIGIBLE; `deferred` diagnostic only (:325) | closed (open :197-211 without a readiness service) | callers poll | liveness | placeholder-neg |
| Q9 `[corrected]` | query/query-executor-partition-routing-snapshot.js:81-115 | system-table leader fail-open | reasonCodes | - | - | inline duplicate set of evidence-absent codes (R03 / R06); its inline comment is wrong: an empty reason list fails CLOSED | open by design | - | safety if it drifts | reason sniff |
| Q10 | query-executor-partition-routing-snapshot.js:439-494 `maybeAwaitDeniedPartitionRoutingRepair` | repair then recheck | async `getNodeReadiness` (stored path, not the owner) | none | - | - | - | poll | liveness | proxy |
| Q11 | query/sql-query-engine-partition-routing-readiness.js:388-428,437-489,538-588 | provisioning completion waits | routing snapshot / leader | timer poll | no | negative | closed | timeout throw; errors swallowed :423-426 | liveness | poll-a-derived-view |
| Q12 | control-plane/control-plane-readiness-participation-base.js:568-740 `buildControlPlaneParticipation` | READY / DEFER / BLOCKED | readSync | none | no | BLOCKED (:718); DEFER only for local transport | closed | - | liveness / noise | placeholder-neg |
| Q13 `[corrected]` | control-plane/control-plane-mutation-readiness.js:220-249 `isPriorityRecoveryWriteLaneOpen` | open the priority write lane | readSync | none | no | positive when `operationCreationAuthority`, which is a constant `true` stamped on priority-recovery follow-up moves (unified-rebalancer-follow-up-move.js:93); placeholder + flag skips only a local admission pre-check (control-plane-mutation-readiness.js:214-217,51-54); the operation still passes operation creation, the workflow owner, remove-safety and leader-only conf-change admission | closed for safety | - | pre-check bypass only (was "safety rests on the authority"; downgraded) | deferred-as-positive |
| Q14 | control-plane-mutation-readiness.js:277-331 <- query/sql-query-engine-write-failure-methods.js:78,201 | classify write failure | readSync | none | no | failed dimensions | closed | retryable | misattribution | placeholder-neg |
| Q15 | control-plane-mutation-readiness.js:367-430; control-plane-kernel-ingress.js:430-545 | mutation routing-gap / ingress | rows (apply) + readiness (owner) | mixed | no | partial | closed | - | liveness | dual-channel |
| Q16 | replica-dispatch-reconcile-callbacks.js:113-122,343-350 -> replica-dispatch-readiness-capture.js:314-340 | ready-node dispatch retry | readSync from the DEFERRED `onCacheChange` (replica-dispatch-service-lifecycle.js:280-285) | none | no | false -> retry dropped, watermark cleared | closed | next heartbeat | liveness (ADD cadence) | dual-channel, placeholder-neg |
| Q17 | replica-dispatch-readiness-capture.js:359-453 + replay-health :249-286 | dispatch now | sync value, then async refresh; timeout falls back to the sync value | none | YES | - | open (stale positive) | - | safety (moderate) | c-t-w, proxy |
| Q18 `[corrected]` | membership-publication-coordinator-planning.js:51-60,180-245 | publication candidate | `getAllNodeReadinessSync` (node-methods.js:296-360) + live rows | mixed revisions | no | never receives the placeholder: the bulk path bypasses the owner and forces `allowStaleOnCacheChange:true`; a node is OMITTED only when it has no cached/stored snapshot | either | - | safety (publication) | dual-channel, wall-clock |
| Q19 | control-plane-readiness-publication-planning-snapshot.js:386-484 | priority-recovery / startup-authority answer | memo with stale grace + 250 ms latch + sticky "more recent active" | latched | no | - | open (sticky) | - | liveness / safety | wall-clock |
| Q20 | `getStartupAuthoritySnapshotSync` consumers: join-readiness-snapshot-methods.js:511-543,588-610; node-joining-ready-signal-readiness.js:238-276; bootstrap-api-readiness-methods.js:121-150; bootstrap-cluster-view-owner.js:77-98; node-reintegration-reconciliation.js:13-50 (missing service = SATISFIED) | join / formation / rejoin admission | Q19 | inherited | no | `authorityAvailable:false` named | mixed; fail-open in reintegration | - | liveness / safety | wall-clock (inherited) |
| Q21 | bootstrap/join-readiness-snapshot-methods.js:560-586 | active peer set for join | readSync per node | none | no | excluded; partial set accepted if non-empty (:533-538) | partial | - | safety (wrong cohort) | placeholder-neg |
| Q22 | bootstrap/owners/bootstrap-cluster-view-owner.js:100-162 | ready nodes served to joiners | readSync | none | no | negative | closed | - | liveness | placeholder-neg |
| Q23 | admin/admin-websocket-load-lane-admission.js:47-109 | load-lane admission | async `getNodeReadiness(maxCachedAgeMs)` | wall clock, deferred invalidation | no | - | open <= 1 macrotask | retryable throw | minor | wall-clock, dual-channel |
| Q24 | bootstrap/node-joining-backfill-merge-and-status.js:139-160 | backfill targets | routable services | - | no | empty -> null | closed | - | noise | placeholder-neg |
| Q25 | message-group-forwarding-owner-routing-methods.js:250-285 | CDC forward candidates | routing snapshot | - | no | no candidates | closed | - | liveness | placeholder-neg |
| Q26 | cache/system-table-cache.js:558-575 `clear()` (only production caller bootstrap/phases/seed-cleanup-handler.js:217) | - | zeroes `mutationVersionByTableName`; consumers semantic-generation.js:203-215, the deferred frontier, stored services-version equality (ABA), global-topology-blocking-operation-view.js:16-30, membership-planning-version-key.js:60-65 | - | - | - | - | - | low today | revision-reset |
| Q27 | control-plane-readiness-service-node-methods.js:331-358 bulk, :410-437 async, :529 missing-row, :626 sync fast path | stored-snapshot reuse outside the bridge | stored slot | wall clock, deferred invalidation; no frontier gate | - | - | open <= 1 macrotask | - | consumed by Q18, Q23, R20 | dual-channel, wall-clock |

### Siblings not censused `[corrected]`

Each needs its own census row before the slice that would touch it.

| # | site | why it is a sibling | needed by |
|---|---|---|---|
| N1 | query/query-executor-write-retry-routing.js:253 | async forced refresh on the write-retry path | S7d |
| N2 | admin/admin-control-snapshot-readiness-diagnostics-methods.js | admin bulk readiness diagnostics | S4a (bulk path), S7d |
| N3 | query/sql-query-engine-routing-metadata-methods.js:186-260 | routing metadata overlay: a row-level read-your-writes bridge; own census (F6) | S4b, S7d |

### Sub-pattern counts

Rows carry several tags; counts overlap.

| sub-pattern | count | rows |
|---|---|---|
| placeholder-as-negative | 23 | R1,2,6,7,8,9,11,13,16,23,24,28; Q1,8,12,14,16,21,22,24,25; plus R17 and Q11 |
| evidence-absent fail-open `[corrected]` | 4 | R1 (formation), R12, Q9, Q13; R12 and Q13 exposure downgraded (rows above) |
| capture-then-wait / capture-then-reuse | 12 | R4,6,9,10,19,20,24,25; Q3,4,17; plus R6's memo freeze |
| dual-channel lag | 12 | R1,5,10,11,16,22,23; Q5,15,16,18,23 (+Q27) |
| wall-clock currency | 9 | R3,6,19,20,21; Q18,19,20,23 (+Q27) |
| reason-code sniffing | 9 | R1,8,12,15,16,18; Q6,9,14 |
| proxy signal | 8 | R10,15,19,22,27; Q10,15,17 (+ the historical "unclassified => invalidation pending", ec63fbb00) |
| absent-as-unconstrained / negative / old view | 6 | R1,3,5,7,21,24 |
| poll-a-derived-view | 4 | Q1,3,10,11 |
| observer-mutates-source | 1 | Q2 (two call paths) |
| revision-reset / key omits input | 2 | Q26, R6 |
| correct pattern | 2 | R14 (subscribed wake), R26 (re-decided in lane) |

**Exposure `[corrected]`.** Safety exposure remains at Q18 (publication),
Q4/Q5, R16, Q17 and R19. R12 and Q13 are downgraded: there is **no safety
defect requiring a fix before the raft-rs cutover**. The product symptoms seen
so far (Q1, Q3, Q4) are the liveness tip of the class.

## 5. Contract (verified form)

The census's original section C (a raw per-table revision vector `asOf`,
CURRENT/UNAVAILABLE states, cohort CURRENT at one `asOf`) was judged UNSOUND
as written and is replaced by the following.

### Owner

The existing `ReadinessPlanningSnapshotOwner`
(`control-plane/readiness-planning-snapshot-owner.js`) with its
`ReadinessPlanningSemanticGenerationTracker`
(`readiness-planning-semantic-generation.js`). It already owns the classified
frontier, the typed planning identity, `captureToken`, completion admission
(`publishCompleted` / `captureCompletionCurrency`), the build queue
(`OwnerKeyReconcileQueue.enqueueAndWait`,
`workflow/owner-key-reconcile-queue.js:305`) and the completion event
(`subscribe` / `notifySnapshotPublished`). **No new owner.**

### Currency key, not a raw revision vector

A readiness answer and a stored snapshot are current against a
**relevance-filtered currency key**:

- the tracker's **semantic planning generation**, global and per node (it
  already folds the liveness generation);
- a **transport generation** for router transport drift, which is not a
  table (no symbol of that name exists at `ec63fbb00`; S4a names its owner,
  F15);
- the **SERVICES revision of the answered node** (per node, not global);
- the **PUBLICATIONS revision** (publication-derived dimensions are baked
  into every stored snapshot).

The raw per-table revision vector is used **only** for the "classified?"
barrier: has the tracker classified every applied revision.

Why the raw vector is rejected:

- Excessive. REPLICA_OPERATIONS, STORAGE_RESERVATIONS and PARTITIONS are
  formation-hot and do not feed the stored snapshot; today's stored
  invalidation covers only NODES, SERVICES and PUBLICATIONS
  (`control-plane-readiness-stored-snapshot-reuse.js:148-169`). An exact
  per-write key was measured as "the dominant residual seed freeze"
  (`membership-planning-version-key.js:22-31`), the reason the 250 ms latch
  exists. A raw vector would reintroduce that storm.
- Insufficient. Router transport drift is not a table, and live-evidence
  expiry is wall-clock (`readiness-planning-publication-contract.js:364-375`).
  The key must rotate on expiry through the liveness generation; S4a proves
  this with a witness rather than assuming it.

### Answer vocabulary

Reuse `OWNER_CONTRACT_STATE` / `OWNER_CONTRACT_NEXT_ACTION`
(`control-plane/owner-contract-outcome.js`) instead of inventing new states
(R08). Proposed mapping, confirmed in S7a against that module:

| census term | contract state | next action | meaning |
|---|---|---|---|
| CURRENT | `ready` | `proceed` | snapshot built at a key >= the classified frontier |
| PENDING | `pending` | `wait` | reason `source_unclassified`, `build_queued`, `identity_rotated` or `transport_topology_invalid`; carries the frontier the answer will be current at and `ready` |
| (deadline) | `deferred` | `retry` | caller deadline reached while still pending; typed reason, never a fabricated negative |
| UNAVAILABLE | `blocked` | `stop` | owner stopped (queue shutdown rejects waiters), baseline unestablished, or no readiness service |

Rules:

- **A placeholder that looks like data is never returned.** PENDING is named;
  each consumer decides on it explicitly (wait, defer with a typed reason, or
  an owner-approved carve-out named in code). Never inferred from
  `dimensions.x === false` or reason strings (R07, R11).
- **`ready` resolves on build completion, not on currency.** Completion
  admission can discard a build, so under heartbeat churn a waiter can wake to
  PENDING repeatedly. A waiter re-asks after every wake; the caller's deadline
  is the only bound, and the outcome at the deadline is the typed `deferred`
  state above. Queue shutdown rejects waiters => `blocked` / `owner_stopped`.
- **Cohorts use per-member frontiers.** `answerCohort(nodeIds)` is `ready`
  only when every member is `ready` at a key >= the frontier captured when the
  cohort was asked. "All current at one shared revision" is unsatisfiable
  across N nodes under churn and is not the rule. The cohort answer carries
  `pendingNodeIds`.
- **Derived views carry their inputs' currency.** Routing snapshots, the
  provisioning trust view and routable sets keep `pendingNodeIds`; a derived
  view is `ready` only if its inputs are.
- **Capture-then-wait re-asks.** A decision spanning an `await` or timer holds
  the captured key; after the last await and before acting it calls
  `isCurrentAt(capturedKey)`, a cheap comparison against the semantic
  generation and transport generation (not the raw vector), and recomputes
  when false. Replaces the ad-hoc re-reads (Q4, R4, R9, R10, R24, R25, Q17).
- **Waiting is `await answer.ready`** bounded by the caller's deadline
  (bcca17fa9 semantics). Timer polling of derived views (Q3, Q11) is deleted.
- **Carve-outs are typed decisions on PENDING**, enumerated in one place
  (`readiness-denial-classification.js` grows
  `classifyPendingAdmissibility(decisionKind)`): system-table fail-open (Q9),
  remove floor (R12), write lane (Q13), formation targets (R1).
- **`lastCurrent` is confined.** It is the CL-012 bridge renamed; it is
  exposed only to an explicit allowlist of consumers (today the routed-read
  bridge, `participationKind ROUTED_READ`), never presented as current, and
  its reads are ratcheted (section 9) (R11).
- **Stored snapshots are key-stamped.** Reusable iff the stamped
  relevance-filtered key equals the current one; non-semantic NODES churn and
  formation-hot tables do not invalidate. One predicate for every reuse path.
- **Revisions are monotonic.** `SystemTableCache.clear()` does not reset
  `mutationVersionByTableName` (S5), removing Q26.

## 6. Deleted, relocated, superseded, kept

| item | disposition | slice | condition |
|---|---|---|---|
| `buildDeferredSnapshot`, `buildDeferredNodeEvidence/RuntimeAuthority/ProjectionContract`, `buildMemoizedDeferredSnapshot`, `deferredSnapshotMemoByOwnerKey`, `TOKEN_STATUS.STALE`, `isDeferredReadinessPlanningSnapshot` (publication-contract ~:200-422) | delete | end of S7 | production placeholder consumers reach zero |
| `planning_snapshot_refresh_pending` arm of `isEvidenceAbsentReadinessDenialSnapshot`; inline duplicate at query-executor-partition-routing-snapshot.js:81-89 | delete | S7a | each carve-out restated as a typed PENDING decision |
| wall-clock maps `lastReadinessSnapshotInvalidatedAtMsByNodeId`, `lastReadinessSnapshotClusterInvalidatedAtMs`, `isReadinessSnapshotInvalidated`, `invalidateReadinessSnapshotsForCacheChange` / `invalidateNodeReadinessSnapshot`, `isClusterInvalidatedMissingRowReuse`, `buildStartedAtMs`, `lastReadinessSnapshotServicesVersionByNodeId` | shadow in S4a, delete in S4b | S4a / S4b | the S4a shadow-compare shows no divergence on a lab formation |
| deferred-delivery frontier `deferredDeliveredSourceRevisions`, `recordDeferredSourceDelivery`, `hasNonNodeTableDeferredDeliveryPending` (ec63fbb00) | delete | S4b | as above |
| readiness's DEFERRED cache subscription (`handleCacheChange` second transaction) | delete | S6 | `onCacheChange` subscriber census done; fail-closed rule re-implemented (F3, F13, F16) |
| `allowStaleOnCacheChange`, `maxCachedAgeMs`, stale-grace `isReadinessPlanningMemoWithinStaleGrace` | **supersede** (R09) | S7b (Q18/R20/Q23 migration), S8 | an explicit supersession record for the sealed CL-033 5 s staleness bound; removing it early makes the bulk path omit nodes so membership publication can shrink (`active-node-projection.js:152-170`); Q18 behaviour unchanged until then |
| 250 ms floored latch (`membership-planning-version-key.js`, 68276ed78) | delete | S8 | memos key on the semantic generation; REPLICA_OPERATIONS / NODES churn witness shows 0 misses |
| publication-diagnostics deferred-channel memo null | delete | S8 | after S6 |
| `provisioningTrustGraceByNodeId` / trust grace | **relocate** to the liveness owner | S1b | it is an input to the liveness semantic signature (`node-liveness-semantic-projection.js:241-248,564-565`, from 105f9d722); F4 and F11 answered |
| read-side `recordProvisioningTrustGraceEvidence` (Q2) | delete | S1b | grace owned by the liveness owner |
| dd54c8276 live-transport rescue | keep until decided | S1b | F11 |
| transient-hold re-wait (88750b499) | **keep** | - | a rebalancer fact, not covered by readiness PENDING |
| provisioning last-sample poll (`waitForCondition` in `waitForProvisionTargetNodeIds`) | delete | S2 | replaced by owner-completion await |

Kept: the `SystemTableCache` apply channel and monotonic revisions; the
semantic generation tracker (classified frontier, shadow impact classifier,
rebaseline); planning identity, completion admission and live veto;
`OwnerKeyReconcileQueue`; `subscribeReadinessPlanningSnapshots` (R14 is the
template); the node-liveness semantic projection owner; the
`isStoredSnapshotEvidenceNewer` guard restated on the key; the
transport-drift veto (a live-evidence input).

## 7. Slices (corrected order)

**Order:** S0 -> S5 -> S1a -> S2 -> [owner decides F10] S3' -> S4a -> S4b ->
S7a -> S6 (after the subscriber census, merged with S1b) -> S7b..S7e -> S8.

Planned ids are not declarations; they follow the family root, e.g.
`core-convergence-readiness-lifecycle-currency-s0`.

**Wide net** for every slice touching rebalancer, bootstrap, partition,
control-plane readiness or provisioning (join-core coupling directive): the
`readiness-versioned-planning-liveness` impact contract's tests
(`test/shards/impact-contracts.json:164-224`), plus `core-system-logic` and
`committed-bootstrap-stamp` where touched; the node-joining, operation-ledger,
formation, spread, replica-recovery and learner-promotion globs (~87 files);
`test/control-plane/readiness-routing-heartbeat-window.test.js`,
`readiness-planning-identity-churn-currency.test.js`,
`readiness-planning-deferral-bounded.test.js`; `npm run -s test:duplication`.
All on lab hosts.

### S0 - currency counters and lab baseline (new)

- Statement: counters for stored-reuse hits/misses, completion reuse,
  placeholder serves per variant, and trust-PENDING attribution; a
  lab-formation baseline recorded in this folder. No behaviour change.
- Owner files: `control-plane-readiness-stored-snapshot-reuse.js`,
  `readiness-planning-snapshot-owner.js`, completion admission methods,
  `node-trust-state.js`; template: the A3 `reuseCount` in
  `projection-readiness-evidence-owner.js:117-231`.
- Red-first witness: unit tests assert each counter increments on its path
  (red today: no stored-reuse counter exists).
- Wide net: the impact contract above; `npm run check:formation` on a lab host
  produces the baseline, including the M6.3-style ~9% trust-placeholder rate
  (F5).
- Prerequisites: the gate (section 10).

### S5 - monotonic cache revisions across `clear()`

- Statement: `SystemTableCache.clear()` keeps `mutationVersionByTableName`
  monotonic.
- Owner: `cache/system-table-cache.js:558-575`.
- Witness (`test/cache/`): set versions, `clear()`, apply once => version
  greater than the pre-clear value. Red today: 1.
- Wide net: `test/cache/*`, bootstrap seed-cleanup tests.
- Prerequisites: none beyond the gate. Removes Q26.

### S1a - the trust view names PENDING

- Statement: a provisioning trust entry whose readiness is the planning
  owner's deferred answer has trust state `pending` with reason
  `readiness_planning_pending` only; never `transport_unknown`,
  `process_not_alive` or `readiness_not_repair_eligible`. Uses
  `isDeferredReadinessPlanningSnapshot` as the only recognizer (R03).
- Owners: `control-plane/node-trust-state.js`,
  `control-plane-readiness-service-node-methods.js:84-232,362-399`,
  `query/sql-query-engine-provisioning-methods.js:155-225` (adds
  `pendingNodeIds`).
- Red-first witness (`test/control-plane/node-trust-state.test.js` plus a new
  provision-target pending-trust test): (a) placeholder => `state==='pending'`,
  reasons deep-equal `['readiness_planning_pending']`; red today:
  `buildDeferredSnapshot` -> `buildNodeTrustState` gives `unknown` with 8
  reasons incl. `planning_snapshot_refresh_pending`. (b)
  `resolveProvisionTargetNodeDiagnostics` with self pending =>
  `pendingNodeIds==['self']`, `selectedNodeIds==[]`.
- Wide net: query provisioning tests + the wide net (admin diagnostics read
  the trust view).
- Prerequisites: S0 baseline. Converts Q1.

### S2 - provisioning decides once, after the last await, on one cohort answer

- Statement: `provisionInitialTablePartition` computes the routable set,
  candidates, `requiredNewReplicaCount` and the probe from one read taken
  after the convergence wait, in one routing dimension. The wait awaits owner
  completion and SERVICES/PARTITIONS row arrival (not only owner completion),
  keeping the strongest evidence rather than the last sample. Empty
  candidates with zero rejections and nonzero pending is a typed `pending`
  outcome `provisioning_targets_pending`, not "Insufficient admissible
  provisioning targets".
- Owners: `query/sql-query-engine-initial-partition-provisioning.js:114-450`,
  `sql-query-engine-provision-target-methods.js:90-229`,
  `sql-query-engine-provisioning-admission-methods.js:285-324,393-485`.
- Red-first witness (extend
  `test/query/sql-query-engine-provision-partition-waits.test.js`; fake
  executor whose routable set changes between calls): (a) routable `[]` at
  entry then `[n1]` after the wait => `createOperation` calls targeting n1 = 0,
  asserted at the provisioning level because whether a duplicate ADD is
  refused downstream is undetermined (F14); (b) trust view pending at the
  last wait => outcome `pending` / `provisioning_targets_pending`, insufficient
  -targets throw calls = 0; (c) the probe's routable dimension equals the
  context dimension.
- Keeps the transient-hold re-wait (88750b499); proven unaffected by
  `test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js`.
- Wide net: `committed-bootstrap-stamp` pair tests, `test/query/*provision*`,
  the wide net.
- Prerequisites: S1a. Converts Q3, Q4, Q5, Q6, Q7.

### S3' - schema provisioning completes under-replicated; the rebalancer converges

- Statement: a schema job whose replica target exceeds current membership
  completes with a typed under-replicated outcome; the unified rebalancer
  converges RF. An explicit-minimum create that is unsatisfiable gets a typed
  refusal. Default RF above membership is NOT rejected at DDL time (normal
  during formation).
- Why not the census's S3 (durable `AWAITING_MEMBERSHIP` that re-runs
  provisioning): `provisioning-completion-summary.js:1-6` already says full RF
  is the rebalancer's obligation, and the unified rebalancer already parks on
  `targetReplicaCount` / `NO_AVAILABLE_NODES` with a `NODE_BECAME_READY` wake.
  Re-running provisioning would make the schema job a second ADD-minting
  convergence driver (R01).
- Owners: `query/schema-provisioning-job-owner.js`,
  `schema-provisioning-job-constants.js`, `provisioning-completion-summary.js`,
  the shortfall stamp in `sql-query-engine-initial-partition-provisioning.js`.
- Red-first witness (in-memory repository, recording timer): default RF 3 on
  one node => job terminal with the typed under-replicated outcome, retry-timer
  arms = 0, executor calls = 1 (red today: PENDING, ~2 s retry, 4
  `schema_operations` writes and 2 warns per cycle); explicit minimum 3 on one
  node => typed refusal; the rebalancer's existing park/wake witness stays
  green.
- Wide net: `test/query/*schema-provisioning*`,
  `durable-provisioning-job-owner-*`, the wide net.
- Prerequisites: **owner decision F10** (it changes the client contract). The
  other fixed-timer structural-retry loops (priority partitions, leader
  placement cure, managed split/merge, membership publication TARGET_BLOCKED)
  are recorded as follow-up candidates (R17), not absorbed.

### S4a - relevance-filtered stamp in shadow mode

- Statement: a stored readiness snapshot carries the relevance-filtered key
  (semantic generation, transport generation, SERVICES for its node,
  PUBLICATIONS); one predicate decides reuse on every path (bridge, bulk,
  missing-row, sync, async: Q27). The wall-clock maps stay, in shadow-compare
  mode, counting divergences. Q18 behaviour unchanged.
- Owners: `control-plane-readiness-stored-snapshot-reuse.js`,
  `control-plane-readiness-snapshot-store.js`,
  `readiness-planning-completion-admission-methods.js:247-305`,
  `readiness-planning-semantic-generation.js:142-147,327-358`,
  `readiness-planning-semantic-currency-methods.js:379-390`.
- Red-first witnesses (synchronous, no macrotask between apply and read): (a)
  a PUBLICATIONS change then an immediate single-node read => the stored
  snapshot is not served; (b) the same for the async read with
  `maxCachedAgeMs`; (c) a PARTITIONS or REPLICA_OPERATIONS change does not
  refuse reuse; (d) a live-evidence expiry rotates the key; (e) the shadow
  counter reports zero divergence on the deterministic suite.
- Wide net: `readiness-routing-heartbeat-window.test.js`, the whole impact
  contract, the wide net, a lab formation (`npm run check:formation`).
- Prerequisites: S0, S5; transport-generation owner named (F15). Risk high
  (routed-read hot path, heartbeat window, formation routing).

### S4b - delete the wall-clock maps and the deferred-delivery frontier

- Statement: remove the items marked S4b in section 6.
- Owners: as S4a.
- Witness: zero reads of the deleted symbols (absent); a throw inside
  invalidation leaves no table pending (structural); S4a witnesses stay green.
- Prerequisites: S4a shadow shows no divergence on a lab formation; N3
  censused (F6).

### S7a - safety carve-outs as typed PENDING decisions

- Statement: R12, Q13, R1 (priority/formation) and Q9 each restated by its
  owner as a typed decision in `classifyPendingAdmissibility`; the
  `planning_snapshot_refresh_pending` arm and the Q9 inline set deleted.
- Falsifiable claim, recorded as a witness to add (green today): voters A, B,
  C; A and B ready; C a placeholder with a prior-eligible verdict;
  `router.pingNode(C)` false => `evaluateRemoveSafety(REMOVE A)` is DEFERRED.
- Residuals for the owner (not currency-specific; decide here or record per
  R17): asymmetric reachability (the evaluator can ping C, the raft leader
  cannot); a stale-denied but raft-healthy voter's removal is SAFE with no
  floor check (3 voters, B dead, C stale-denied: removing C loses quorum);
  `raft-rs-conf-change-admission.js` has no quorum/liveness check.
- Wide net: the wide net plus lab formation and rejoin batch; assume coupled.
- Prerequisites: S4b; the answer API (`answer` / `answerCohort` /
  `isCurrentAt`) introduced here with the vocabulary mapping of section 5
  confirmed.

### S6 + S1b - one cache channel for readiness; grace ownership

- Statement: liveness and capacity semantic recording move to the apply
  channel and readiness unsubscribes from the deferred `onCacheChange`; the
  trust grace moves into the liveness owner and no read writes liveness
  evidence.
- Status: **UNDETERMINED** until a census of `onCacheChange` subscribers.
  Apply-listener throws are swallowed by the cache
  (`system-table-cache-observation-methods.js:348-355`), so the deferred
  path's fail-closed rule (`semanticSourceOwnerFailed ? null : revision`) must
  be re-implemented; liveness reprojection fans out synchronously and arms
  timers inside the apply (`node-liveness-semantic-projection-owner.js:355-385`);
  batch-apply visibility is unverified.
- Owners: `control-plane-readiness-snapshot-store.js:445-632`, the liveness and
  capacity recorders, `node-trust-state.js`, `node-methods.js:135-199`.
- Witnesses: readiness listener count on the deferred channel = 0; liveness
  identity rotates in the apply turn; a throwing apply listener leaves the
  revision unclassified (fail closed); `recordProvisioningTrustGraceEvidence`
  calls on a trust read = 0 (red today: 1 per node).
- Prerequisites: subscriber census (F13), F3, F16, F4, F11. Converts Q2, Q16.

### S7b..S7e - consumer batches

Each its own quest; each converted site's PENDING input yields its declared
decision, asserted on the returned state, with zero `.dimensions` reads on a
PENDING answer.

- S7b placement / rebalancer: R1, R2, R6, R7, R8, R9, R10, R11, R13, R16,
  R23, R28; plus the CL-033 supersession for Q18, R20, Q23 (section 6). R17
  audit stamps after F9.
- S7c join / bootstrap: Q12, Q20, Q21, Q22.
- S7d query routing: Q8, Q10, Q11, Q14, Q24, Q25, N1, N2.
- S7e partition: R24, R25 re-ask `isCurrentAt` before persisting the topology
  snapshot.
- Risk highest for S7b. Wide net plus lab formation and rejoin batch before
  each land.

### S8 - memos key on the semantic generation

- Statement: the CL-033/CL-034, publication-diagnostics and
  placement-observation (R6) memos key on the semantic generation, never the
  raw vector.
- Witness: REPLICA_OPERATIONS / NODES churn causes 0 memo misses; a semantic
  change causes exactly 1; R6: an owner completion after a placeholder causes
  a miss.
- Deletes: the 250 ms latch, stale grace, the deferred-channel memo null.
- Prerequisites: S6; measure cost on a lab formation (seed-starvation
  history).

## 8. Locality check

| slice | evidence that would prove it local | exists? |
|---|---|---|
| S1a | no other consumer renders the placeholder as negative | No: 23 sites; S1a is the first instance of S7, landed early for the symptom. |
| S2 | no other decision spans an await over a readiness-derived view | No: 12 capture-then-wait sites (R24/R25 identical). |
| S3' | no other loop retries a structural shortfall on a fixed timer | No: 4 more loops (follow-up candidates). |
| S4a/b | only the bridge reuses stored snapshots | No: Q27 lists 4 more paths; 6 history fixes touched this slot. |
| S5 | `clear()` has no production caller whose cache object survives | Partly: local fix, low exposure. |
| S6 | no other owner listens on both channels for one decision | Unknown: Q16 does; subscriber census required. |
| S7, S8 | - | systemic by construction. |

## 9. Fence ratchets (one-way)

Counting `getNodeReadinessSync` call sites alone is too weak (baseline 27 in
22 files; kept as one ratchet). Add one-way ratchets on:

1. `.dimensions` reads of readiness objects outside the owner;
2. uses of `isDeferredReadinessPlanningSnapshot` and
   `isEvidenceAbsentReadinessDenialSnapshot`;
3. the `allowStaleOnCacheChange` and `maxCachedAgeMs` options;
4. reads of `lastCurrent` outside its allowlist.

## 10. Gate

Owner decision 2026-10-03, honouring this epic's own gate: no slice starts
until the `raft-rs-full-cutover` epic closes **and** Q0
(`core-convergence-rs-raft-readiness-baseline`) re-measures
`READY_FOR_CORE_CONVERGENCE`. Nothing here is a safety defect that must be
fixed before the cutover (section 4, exposure).

## 11. Open questions

| # | question | blocks |
|---|---|---|
| F1 | R12 remove floor. Answered by verification (row R12); residuals listed in S7a. | S7a (owner judgment on residuals) |
| F2 | Q13 write lane. Answered by verification (row Q13). | - |
| F3 | Is liveness / capacity recording safe synchronously inside `SystemTableCache` apply (timer arming, fan-out, nested reads)? | S6 |
| F4 | Q2 re-deferral loop end to end (trust read -> grace evidence -> liveness signature -> planning identity). | S1b |
| F5 | Attribution of the ~9% rate between the trust-variant placeholder and the Q2 loop. | measured by S0 |
| F6 | Routing metadata overlay (N3): second currency bridge for partition creation? | S4b, S7d |
| F7 | Membership publication `TARGET_BLOCKED` 1 s retry driver not traced. | S3' follow-up candidate |
| F8 | Merge cutover (`partition/managed-merge-workflow-execution-gate-methods.js:544-590`) lacks the split cutover's routability gate; reachability not established. Own quest candidate (R17). | none in this family |
| F9 | Does the deferred marker survive `compactSnapshotSummary` (R17 audit stamps)? | S7b (R17 row) |
| F10 | S3' owner decision: complete under-replicated with a typed outcome (verified recommendation) versus keep the PENDING client contract. | S3' |
| F11 | Are the dd54c8276 live-transport rescue and the trust grace window still needed once the trust view names PENDING? | S1b |
| F12 | Line references: 15 rows sampled by the verifier, 12 fully right, 3 corrected; the rest are re-read by each slice (R18). | each slice |
| F13 | Census of `onCacheChange` subscribers. | S6 |
| F14 | Is a duplicate ADD refused downstream of provisioning? | S2 (witness placement) |
| F15 | Which owner holds the transport generation? | S4a |
| F16 | Batch-apply visibility on the apply channel. | S6 |

## 12. Inputs that did not reconcile cleanly

1. Instance numbering: the commissioning brief calls `4f61b4a32` and
   `ec63fbb00` instances 20 and 21; the census history counts them together
   as chain 21 (chain 20 is f95fccaf0 -> d0516be76 -> 0d749c1ff). The table
   above keeps the census numbering (21 chains).
2. Vocabulary: the verifier requires reusing `OWNER_CONTRACT_STATE` and also
   names an UNAVAILABLE outcome for queue shutdown; that module has no
   `unavailable` state. Section 5 maps it to `blocked` / `stop` as a proposal
   for S7a to confirm.
3. The census's S4 witness (a) (bulk `getAllNodeReadinessSync` must not serve
   the stored snapshot after a PUBLICATIONS change) conflicts with the
   verified requirement that Q18 behaviour stay unchanged in S4a; it is moved
   to the single-node read path, and the bulk path changes only with the
   CL-033 supersession in S7b.
4. Relation to Q1: the epic orders Q1 (owner census) before Q6; the owner's
   2026-10-03 sequencing names only the cutover and Q0. This record treats its
   census as Q1's input for the readiness concern and does not decide whether
   S0 must wait for Q1.
