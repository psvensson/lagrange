---
audience: evidence
recorded: 2026-11-02
quest: replica-admission-from-committed-operation
---

# Transition record: replica admission from the committed operation; write answers at commit (C1/C10)

Worktree `lagrange-replica-admission-20261102`, branch `work/replica-admission-committed-operation-20261102`.
Base `b26d2c090` (PR #184 head: main + `learner-host-from-committed-admission`). Line numbers are of this HEAD.

This is a contract-first record. **No `src/` change has been made; the design awaits the lead's decision (section 7).**

## 1. Owner chain on HEAD

### 1a. Admitting a replica of a priority partition on a fresh formation

| # | Step | Owner, file:line | Input it decides from |
| --- | --- | --- | --- |
| 1 | The rebalancer plans ADD/REPLACE, writes the `replica_operations` row and dispatches `CREATE_REPLICA` to the target node | rebalancer / operation workflow | committed `replica_operations` row (authority of the intent) |
| 2 | The target persists PENDING/CREATING, then opens the port as a learner | `src/node/replica-handler-create-methods.js:304` (`persistReplicaCreateInitialStatus`), `:367` (`createPartitionService`) | its own request |
| 3 | The target records SYNCING, the "port opened" fact (verifier N3) | `create-methods.js:416` -> `src/node/replica-prior-existence.js:172-198` -> `replica-handler-status-methods.js:48` `persistReplicaStatusWithRetry` -> state machine -> `cdcIntegrationService.upsert/insertSystemTableRow` | `updateReplicaStatus` reads `systemTableCache.get(SERVICES, replicaId)` (`status-methods.js:115-118`) as the input to the state-machine transition. On the run, committed INSERTs for rows that already existed failed `UNIQUE` at apply on the seed (69). The exact point where INSERT is chosen over UPDATE, inside `ReplicaStateMachine.transition`, is **not yet verified**. |
| 4 | That routed write answers the writer only after its OWN node's cache shows the row: the C1 path (1c) | `src/cdc/cdc-integration-service-mutation-operations.js:275-281, 456-477`; `cdc-integration-service-mutations.js:40, 235-238` | writer-local cache |
| 5 | The services partition leader's CDC obligation lane delivers the committed services event to the propagation subscriber; that subscriber proposes it into the operational message group (mg) | `src/partition/partition-cdc-obligation-delivery.js:503-532` (`deliverObligation`); `src/bootstrap/shared/partition-cdc-propagation-subscriber.js:195-250`; `src/bootstrap/owners/seed-runtime-bridge-owner.js:200-216` -> `src/topology/cdc-group-propagation-service.js:167-179` | mg committed receipt |
| 6 | No committed receipt (mg not leader, ingress not ready, budget spent): `propagationIsProvisional` throws `cdc_committed_acceptance_unknown` with `deferRetry` | `partition-cdc-propagation-subscriber.js:183-193`; `obligation-delivery.js:491-501` (uncovered), `:576-589` (`handleDeliveryFailure`, warn `DELIVERY_HELD`), `:453-480` (`scheduleDeliveryRetry`, exponential backoff up to `CDC_BUFFER_REPLAY_MAX_DELAY_MS`) | Order is kept: every later event of that partition waits behind the head (`:500-502`). There is no deadline and no typed owner outcome. |
| 7 | mg commit, then `cdcHandler.applyImmediate` on every node: the node's `SystemTableCache` | `src/message-group/message-group-cdc-committed-acceptance.js:200-210`, `message-group-service-cdc-replication-runtime-methods.js:234` | mg log |
| 8 | **Admission trigger.** On the node hosting the target partition's leader, the cache change for `services` fires `handleSystemTableCacheChange` -> `scheduleRaftPeerReconciliation` -> `reconcileRaftPeersFromCacheForService` | `src/partition/partition-service-core-base.js:240, 627-668`; `src/partition/partition-service-raft-peer-cache-reconciliation.js:310-362`; also at init `partition-service-raft-init-base.js:567` and the re-drive `:364-382` (CONF_CHANGE_APPLIED / LEADER; it re-reads the cache) | **leader-local cache rows** filtered by `isPeerRowStatusAdmissible` (`src/rebalancer/replica-status.js:232-243`: not PENDING/CREATING/FAILED/REMOVING/REMOVED/HELD); the node id comes from the row's `address`/`node_id` (`peer-cache-reconciliation.js:78-96`) |
| 9 | Reserve the identity and admit: raft ADD with the committed admission context `{replicaIdentity, peerId, nodeId}` | `peer-cache-reconciliation.js:255-282` -> `partition-service-raft-membership-administration.js:75-87` (`groupRetiringRefusal` reads the cache too, `:56-62`) -> `src/raft/raft-rs-group-membership-admission.js:207-227` -> `proposeConfChange` | The committed `nodeId` is derived from the cache row's address, so a projection supplies a committed fact. |
| 10 | Learner catch-up, proof (committed config, `NOT_IN_CONFIGURATION` until step 9 commits), promote | `partition-service-learner-promotion-proof-methods.js` (landed learner fix) | committed configuration + progress |
| 11 | Target waits voter-ready (cache-visible role, C8, `SYNC_TIMEOUT_MS`), then `releaseFreshCreate`: an authoritative read of the committed operation (`replica-create-admission-owner.js:347-384`), then control owner first (`replica-handler-participant-cutover.js:202-238, 299`), then writes ACTIVE | `create-methods.js:445, 460, 480` | Mixed: cache (C8), then authoritative. A single deferred read fails the create terminally after admission and promotion committed (section 2). |

### 1b. Answering a routed system-table write (C1)

The caller is `insertSystemTableRow` / `updateSystemTableRow` / `upsert`. It runs `executeSQL` (routed to the table partition's leader and committed), then `waitForCacheUpdate(table, pk, expectPresent, {allowPendingVisibility, originHlc})`. The answer goes to the caller (the replica state machine, the rebalancer, provisioning and so on) only after **the writer's local cache** satisfies the expectation.

The answer has these forms:

- `buildSystemTableVisibilityResult()` (VISIBLE);
- a PENDING_VISIBILITY / DEFERRED_BY_PRESSURE result (`allowPendingVisibility`);
- a thrown timeout classified retryable (`CACHE_VISIBILITY_TIMEOUT`, `deferRetry` when `retryAfterMs`); `sql-query-engine-shared.js` maps it to retryable.

The commit's own position (`result.originHlc`, the log position in `CDC_COMMITTED_RECEIPT_FIELDS`, `src/cdc/cdc-delivery-outcome.js:50-52`) is passed to the wait but never returned as the answer.

### 1c. The cache-visibility wait and its alternate paths

All in `src/cdc/cdc-integration-service-cache-visibility-wait.js`:

- **Budget.** `timeoutMs` is `CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS` = 1000 (`src/cdc/cdc-constants.js:32`). It is split at `:155-165` into a cache-wait budget (`timeoutMs` minus the repair budget, 750 with defaults) and an authoritative repair budget (`min(authoritativeFallbackRepairBudgetMs, timeoutMs/2)`, 250).
- **Alternate 1, bootstrap bypass** `:126-128`: `if (this.bootstrapMode) return visible`. It answers success with nothing observed.
- **Alternate 2, authoritative repair fallback** `:194-233` -> `confirmCacheVisibilityHoleWithinBudget` `:350-412` (2 attempts) -> `repairCacheVisibilityHole` `:554` -> `applyAuthoritativeCacheRepair` `:701`, phase via `cdc-integration-service-cache-visibility-authority.js` (`OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK`). It writes an authoritative row into the projection and answers VISIBLE.
- **Alternate 3, `allowPendingVisibility`** `:238-253, 280-286`: a quieter PENDING answer instead of the timeout. Callers: 13 src files, including table creation, schema provisioning, managed split and merge, and the publication coordinator.
- **Plus:** `skipCacheWait` (caller opt-out, 26 src files) and three silent no-wait returns: table not cache-propagated (`:129-131`), no cache (`:132-135`).

## 2. First divergence on the Phase 0 run, tied to the chain

See `phase0-reproducer-run-2026-11-02.md` for identity and timestamps. On `b26d2c090`, 3 nodes on 3 machines, run 10:26:07Z, the verdict is RED.

- **Step 6 runs for the whole run.** The first `cdc_committed_acceptance_unknown` hold is at 10:28:35.174 on the seed and the last at 10:38:30. There are 6684 holds, and the services-p1 lane alone accounts for 2240. The seed's cache runs behind committed `replica_operations` rows: 43 cache_missing and 86 field_mismatch in the product's own authoritative-vs-cache diagnostics. This is H1 in kind.
- **Step 8 is late but not absent.**
  - Every joiner replica was admitted.
  - Learners were refused `not_in_configuration` for 0 to 30 s (205 refusals) until the leader's cache delivered their SYNCING row.
  - This differs from the learner quest's run, where admission never happened in 420 s.
  - Instance C1/C10 is therefore present and costs up to about 30 s per spread step, but **on this run it is not the terminal link**.
- **The terminal link is step 11.**
  1. At 10:29:57.228 `sql_transactions-p1-r4`, already admitted and promoted to voter at 10:29:57.126, failed its create: the authoritative `replica_operations` read inside `authorizeFreshCreate` answered deferred, which is terminal for the create.
  2. The replica service shut down while it was a committed voter.
  3. Within the same second, its cache-decided INSERT failed `UNIQUE` at apply on the seed (step 3).
  4. From 10:30:54, every fresh create of every other priority partition failed in `releaseControlOwnerFirst`. The cause is a `release_fact_unavailable` answer for the `sql_transactions-p1` control release with `hosted_replica` missing (32 occurrences), or a `replica_release_reply` missing from the seed.
  5. 23 creates failed after their grant, producing REMOVE/ADD churn and keeping the serve lane closed on every node for 180/180 polls.
- **H3' (unproven).** The dead voter `r4` stays in the committed configuration of `sql_transactions-p1`, so the control cohort cannot release. The single settling observation is named in the Phase 0 record; its status is **unknown**.

**Consequence for this quest.** Moving admission onto the committed operation (step 8) and answering writes at commit (step 4) are still owed by the class. On their own they would not turn this reproducer green: the step 11 failure (a create that fails *after* its admission and promotion committed, plus C13's release cohort) would remain the first terminal divergence. The lead must decide whether this quest absorbs step 11's "failed create after committed admission" consequence or whether that becomes a sibling quest; see section 7.

## 3. Historical precedents and what they rejected

| Record | Decided | Rejected / constraint |
| --- | --- | --- |
| CL-014 (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-014.md:7, 41-47, 80-103`) | Upsert-only authoritative hydration of all CDC tables after subscriptions arm; remote fan-out targets come from the SENDER's services cache and are skipped silently | REPLACE-moved source, subscriber loss and stale-event rejection were rejected as causes; no table-specific poll. Remote subscribers still need catch-up, so local apply must not remove it. |
| Committed-read design 2026-09-25 (`design-committed-membership-bootstrap-read-2026-09-25.md:74-76, 182, 187`) | Bootstrap = committed configuration, fails closed typed | "never falls back to services rows"; "never resolves from the cache" |
| Owner decision O1/O2/O4 2026-09-26 (`quest-records/replace-source-removal-owner/owner-decision-o1-o2-o4-committed-read-2026-09-26.md:9-12, 23, 42`) | Rows = discovery / desired topology; committed membership = participation authority; M3: legitimate joins never permanently locked out | R2 ("genesis in the log", request owner) deferred: "NOT this release" |
| **Amendment 1, A2 and Q1** (`committed-read-amendment-1-2026-09-26.md:25, 57`) | "**C1 itself stays: desired topology driving admission by the leader IS the intended split**"; "row-driven admission on the leader (site 3) is the intended split and stays"; re-drive on MEMBERSHIP_CHANGED, no poll | **This quest reverses A2/Q1. Under R09 that needs an explicit owner supersession citing :25 and :57.** CR-F1 (provisioner genesis from a lagging cache) and CR-F2 (zombie identity removal by the coordinator) stay residuals (`:129-131`). |
| Challenger A (`committed-read-challenger-a.md:64-99, 450, 618-625`) | F-A2: row-driven admission is the ONLY AddNode producer; "if the row never propagates ... no path admits the target and the gate holds forever" | Its proposal, "C1's admission trigger re-homed to an explicit request (the R2 design's request owner)", was "not proposed here" (a redesign) |
| R2 design (`design-r2-committed-membership-2026-09-23.md:88-96, 219-238, 290-298`) | One membership request owner (the only `proposeConfChange` caller): `{kind, replicaIdentity, requestId = replica_operation id, baseGeneration}` with typed outcomes NOT_LEADER, STALE_GENERATION, TRANSITION_PENDING, ALREADY_SATISFIED, PROPOSED, REFUSED; C1 classed DELETE; static guard against `systemTableCache` in `src/partition` membership decisions | Warning: deleting C1 "alone: no path admits any joiner" |
| Bounded-waits census (`census-bounded-waits-2026-10-04.md:3-9, 217, 429`) | Spent waits log ERROR; "every earlier case of a fully spent timeout hid a real bug" | `CACHE_WAIT_TIMEOUT_MS` classed `fallthrough_alternative`; its expiry rate was never measured. This run: 38 spends in about 10 min. |
| CDC D4 (`evidence/cdc-lifecycle-2026-10-26/DESIGN-cdc-d4-hydration-live-handoff-2026-10-26.md:203-221, 454-516`; `VERIFY-cdc-d4-stage-a-r1-2026-10-27.md:12-14, 126`) | Subscribe-before-hydrate at the partition boundary (stage A approved); window deletion after W-D4a and W-D4b | The **group-boundary handoff** (option a, group subscribe-before-hydrate, vs option b, positional `readHydrationImage` backfill per partition leader) is "a separate owner decision" (:506-516). No recorded owner choice was found; in `src`, `readHydrationImage` is consumed only by the seed hydration phase. D4 describes the node cache as fed ONLY through mg waves (:203-221) and never proposes apply-path local visibility. |
| Owner review decision 4 (`evidence/owner-review-2026-10-26/OWNER-REVIEW-2026-10-26.md:38-49`) | CDC D1-D4 as one completion effort, owner of the lane: "pending work under budget and backpressure never silently dropped" | Any lane change (remote-only, deadline refusal) must satisfy D1 "never silently dropped" |
| Exhausted quests | `executor-active-services-cache-handoff` (parked 07-20: symptom absent; waited for the cache instead of reading the admission); `formation-priority-spread-authoritative-{handoff,publication}-closure` (7 attempts at exact cache alignment, "ladder exhausted without metric movement"); `readiness-formation-liveness-circularity-closure` (fail-open carve-out, landed `334bbca2d`, dormant) | All four repaired inside the projection; none moved the decision onto the committed fact (SA §2) |

Origins:

- `waitForCacheUpdate`, the 1000 ms bound and the bootstrap bypass: `5b9c56b90` (2026-01-30).
- Authoritative fallback: `73ba72bda` (2026-03-02).
- In-wait repair budget (the 750/250 split) and `allowPendingVisibility`: `8f284ad8a` (2026-04-13).
- `cdc_committed_acceptance_unknown`: `54dd2d7ce` (0.2.6, 2026-10-27).

## 4. Design (SA §4 adapted to HEAD)

### 4a. Admission (step 8)

The leader admits from an explicit **admission request keyed by the committed operation**. This is the R2 request owner, limited to ADD.

- **Request.** After the target durably records SYNCING (step 3, whose answer is now the commit, 4b), it sends `ADMIT_REPLICA {partitionId, replicaIdentity, operationId}` to the partition leader. The channel has the same shape as `LEARNER_PROMOTION_PROOF`: request and answer, re-requested on the learner's existing promotion cadence and on NOT_LEADER, with no new timer.
- **Leader decision, in order:**
  1. `NOT_LEADER` (with the leader hint), checked first.
  2. A committed read of `replica_operations[operationId]` through the existing authoritative gateway (`readAuthoritativeControlPlaneRows`, as `replica-create-admission-owner.js:347` already does). It must name this partition, this `replicaIdentity` and the `targetNodeId`, at a non-terminal step. Otherwise `OPERATION_NOT_ADMITTING{operationId, step}`, or `AUTHORITY_UNAVAILABLE{reason, retryAfterMs}` when the read fails. A failed read is typed unavailability and never a create failure.
  3. `ALREADY_MEMBER` (idempotent).
  4. `IN_FLIGHT`.
  5. Reserve the identity and propose ADD with `nodeId` **from the operation row**, never from a services row.
- **Rows.** A services row never proposes a vote. `reconcileRaftPeersFromCacheForService` is deleted as an admission producer: the cache-change trigger, the init call and the re-drive's cache re-read.
- **Re-drive.** The re-drive on CONF_CHANGE_APPLIED/LEADER stays (A2's liveness), over the in-flight *requests*.
- **Unchanged.** The retirement half (`retireRaftPeerFromAuthoritativeServiceChange`) is a separate decision with its own owner and is not touched here.
- **Message groups and WASM.** These use the same group-neutral `admitGroupPeer`. Message groups keep their own reconciliation; they are a named follow-up, like the learner quest's message-group exception.

### 4b. Write answer (C1, step 4)

A routed system-table mutation answers **at commit** with `{committed: true, position: {partitionId, logIndex/originHlc}}`, the receipt the partition already returns.

- A consumer that needs its own projection to reflect the write calls one owner method, `awaitProjectionAt(table, position)`. It resolves when the local cache's applied watermark for that source partition reaches the position, it ends only at shutdown, and it has no timer.
- Consumers that today use `allowPendingVisibility` or `skipCacheWait` take the commit answer directly.
- **Deleted:** `waitForCacheUpdate`, the 750/250 split, `confirmCacheVisibilityHoleWithinBudget`, `repairCacheVisibilityHole` as a write-path step, the bootstrap bypass and `allowPendingVisibility`.
- **Kept as an R05 diagnostic only:** `Diagnosed cache visibility gap`. It is never an answer.
- **Late commits.** A write whose commit answer is late is reported as late (typed timeout of the *commit*, existing `partition_execution_deadline`). It is never converted into success by later visibility.

### 4c. CDC hold (C10, step 6)

The SA §4 direction keeps two halves:

- **(i)** The leader's local cache is applied in the apply path at commit, so local visibility follows from commit.
- **(ii)** The lane serves remote subscribers only, and "no committed receipt" becomes the typed `SUBSCRIBER_UNCONFIRMED{subscriber, position}` with an owner deadline, then a permanent typed refusal.

On HEAD the topology is different from what SA assumed: **every** node's cache is fed by the mg wave, including the seed's. The local leader's subscriber is the producer for all nodes' caches, not a remote-style consumer of one cache. So (i) is not a local change: it creates a second feed into the node cache, the apply path beside the mg wave, which D4 (:203-221) declares single. Ordering and dedup against the mg wave are then needed (`compareTimestamp`, out-of-order detection, 497 on this run).

**D4 sequencing answer:**

- **(i) local apply must NOT be done in this quest.** It changes the cache's single-feed model that D4 owns, and D4's group-boundary option (a)/(b) is still undecided. It belongs to the D1-D4 owner, after that decision.
- **This quest does not need (i).** With 4a and 4b, no admission or write-answer decision reads the cache, so cache lag no longer gates them.
- **(ii) the typed deadline outcome is lane-local.** It does not change the feed, and it is compatible with D1's "never silently dropped": the refusal is recorded, visible and owned, and the obligation is preserved, not discarded. It can be done here or handed to D1. **Recommendation: hand (ii) to the D1-D4 owner as well**, and record it here as a named obligation. Reasons: its consequence (what a permanent refusal does to the ordered lane and to the remaining obligations) is exactly the D1 reclamation contract. This quest's admission and write-answer decisions stop depending on the lane, which removes the reason C10 gates serving.

## 5. Deletion list (this quest, if Option 1 below is chosen)

- `reconcileRaftPeersFromCacheForService` as admission producer, with the `handleSystemTableCacheChange` services branch's `scheduleRaftPeerReconciliation`, `reconcileRaftPeersFromCache()` at init (`raft-init-base.js:113, 567`), the core-base call (`core-base.js:337, 660`), the re-drive's cache re-read (`peer-cache-reconciliation.js:364-382`, re-driven over requests instead), `expectedPeerAddressesOf` pushing into `replicaIds` (`:285-308`), and `resolvePeerAddressFromService` as a node source for admission (`:78-96`).
- `waitForCacheUpdate` and `CACHE_WAIT_TIMEOUT_MS` / `cdc.cacheWaitTimeoutMs`, the 750/250 split, `authoritativeFallbackRepairBudgetMs` in the write path, `confirmCacheVisibilityHoleWithinBudget`, the bootstrap bypass, `allowPendingVisibility` and its 13 producer files, and `skipCacheWait` (26 src files, which become the default).
- `CACHE_VISIBILITY_TIMEOUT` classification for writes (`sql-query-engine-shared.js`).
- **Candidate, unverified:** a cache-fed write shape in `updateReplicaStatus` / `ReplicaStateMachine.transition` (input at `status-methods.js:115-118`), the suspected source of the 69 apply-time UNIQUE failures. **Flagged for the lead:** this is probably a separate instance (state-machine owner) and must be traced before it is deleted.
- **Not deleted here:** the `cdc_committed_acceptance_unknown` backoff (hand-off to D1-D4, 4c).

## 6. Blast radius

| Surface | src files | test files |
| --- | --- | --- |
| `waitForCacheUpdate` | 4 | 70 |
| `skipCacheWait` | 26 | 29 |
| `allowPendingVisibility` / `PENDING_VISIBILITY` | 13 / 14 | 12 / 13 |
| `bootstrapMode` | 7 | 14 |
| `repairCacheVisibilityHole` | 2 | 11 |
| `CACHE_WAIT_TIMEOUT_MS` / `cacheWaitTimeoutMs` | 3 / 3 | 6 / 3 |
| `reconcileRaftPeersFromCache*` | 6 | 8 |
| `admitPartitionRaftPeer` | 2 | 7 |
| `cdc_committed_acceptance_unknown` / `CDC_COMPLETION.UNKNOWN` | 1 / 9 | 4 / 5 |

Owners: partition and raft (admission), cdc (write answer), replica handler and state machine (target request, INSERT shape), rebalancer (operation row fields read by the leader), and the harness predicate (unchanged).

Contracts to supersede under R09, explicitly:

- `architecture/runtime-contracts.md:192-193` ("CDC-propagated metadata decisions read from the cache unless the boundary explicitly declares another owner-fed read model") for gating decisions;
- amendment-1 A2 (:25) and Q1 (:57) ("row-driven admission ... stays");
- `architecture/contracts/authority-and-recovery.md` runtime bindings gain "replica admission: committed replica operation via the membership request owner".

The O1 deferral of R2 ("not this release") is partially lifted for ADD only, which needs the owner's word.

## 7. Options and recommendation

- **Option 1 (recommended): 4a + 4b in this quest; 4c (i) and (ii) handed to the CDC D1-D4 owner; step 11 as a sibling quest.**
  - Admission becomes an explicit request answered from the committed operation, and writes answer at commit.
  - Removes every cache read from these two decisions, with no new timer, and the R2 shape the owner already reviewed.
  - Requires two explicit supersessions: amendment-1 A2/Q1 and runtime-contracts :192-193.
  - The reproducer will still be RED at step 11, so the doneWhen is the instance witnesses plus "reproducer: zero `not_in_configuration` refusals beyond one request round per learner, admission without a services-row cache event", not scenario green. If the lead prefers, absorb step 11 instead (Option 3).
  - **Proposed sibling, `fresh-create-failure-after-committed-admission`:** a create whose admission and promotion committed is never failed by a deferred authority read. Deferral is typed unavailability and the create continues on the next trigger. A create that does fail removes its committed voter through the request owner (CR-F2). It is tied to SA C13 / H3'.
- **Option 2: leader reads the services row authoritatively when triggered** (keep the cache trigger, add a committed read).
  - Rejected. The trigger still depends on the projection: no cache event means no admission (challenger A F-A2). It is a mixed cache/SQL path (`runtime-contracts.md:207`).
- **Option 3: Option 1 plus step 11 in one quest.**
  - Larger blast radius (participant release, create admission owner), but it is the only scope whose acceptance can be the registered scenario turning green.
- **Option 4: local apply at commit first (SA §4 C10 half).**
  - Rejected for this quest. It is the D4 owner's single-feed model (section 4c), and it helps only when the services leader and the partition leader are co-located (true on a fresh formation, false after the first leader move). It would make the reproducer greener without fixing the class.

### Red tests to write first (Option 1)

All are `node --test` files under `test/partition/` and `test/cdc/`. Each is red on `b26d2c090` for the stated reason.

1. `replica-admission-from-committed-operation.test.js`:
   - **(a)** A leader with NO services row for the target, given an `ADMIT_REPLICA` request whose committed operation names the target, proposes ADD with the operation's `targetNodeId`. Red: no request handler exists, and nothing proposes without a cache row.
   - **(b)** A services row for a target with no committed operation (or a terminal one) proposes nothing. Red: today a row alone admits (`reconcileRaftPeersFromCacheForService`).
   - **(c)** Follower answers `NOT_LEADER` first.
   - **(d)** An authority read failure answers typed `AUTHORITY_UNAVAILABLE`, proposes nothing, and is not a refusal of the operation.
   - **(e)** A stale row naming another node does not change the committed `nodeId`. Red: today the node comes from the row.
   - **(f)** Static census: no `src/partition` membership decision reads `systemTableCache` (the R2 guard). Red: `peer-cache-reconciliation.js:322`.
2. `routed-system-table-write-answers-at-commit.test.js`:
   - **(a)** With the writer's cache never updated, an insert/update/upsert resolves with the commit position. Red: today it times out after 750 ms, then repair or PENDING.
   - **(b)** `awaitProjectionAt` resolves exactly when the applied watermark reaches the position and ends only at shutdown.
   - **(c)** A late commit answers late and typed, never VISIBLE.
   - **(d)** Static census: `waitForCacheUpdate`, `allowPendingVisibility` and the `bootstrapMode` early return are absent from `src/`.
3. A production-bound witness: a two-replica partition admits a CREATE target end to end with the CDC mg wave stopped. Red: no admission today.

## 8. Unknowns

- H1 at the exact instant of a refusal (`services` row of that learner, authority vs the seed's cache).
- H3' (the dead voter in the `sql_transactions-p1` configuration).
- Why `readAuthoritativeControlPlaneRows` for `replica_operations` failed at 10:29:57: no cause was logged at info level.
- Whether `Failed to apply committed entry` (UNIQUE on apply) leaves the services-p1 state machines divergent across replicas. This is not in this quest's scope, but it must be owned: a committed entry that fails at apply is a state-machine defect.
