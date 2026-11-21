# W4 — Fallback-read closure: design investigation

Source read: `/tmp/lagrange-core-three-repairs-composed-20261121` at f580579a5 ("the collected runtime").
Read-only; no tests were run; nothing was written in any worktree.

Marking: **[V]** = read in code at f580579a5 (file:line given). **[I]** = inferred, not traced end to end.
A code path can be [V] while its production reachability is [I]; both are stated where they differ.
Two forked sub-investigations supplied sections B, C and the inputs to D; I spot-checked their
load-bearing claims (`authorizeLegacyRuntimeRemoval`, `allowCacheFallbackOnReadFailure`) in code.

Contents: 0 Summary and safety findings · A Read-mode families 1-4 · B Capability probes ·
C Legacy shapes · D Honest closure probe · E Slice plan · F Prior art · G Not checked · H Decisions needed.

---

## 0. Summary

1. **There is no linearizable read anywhere in this path, and only one read shape that is leader-qualified.**
   `OWNER_RPC_REQUIRED` + `leaderMode: REQUIRED` routes only to the canonical leader and rejects an
   answer without the serving replica's leader witness [V `cdc-integration-service-owner-rpc-read-execution.js:92-116,449-451`,
   `query-executor-partition-routing-candidates.js:167-190`]. The witness is the serving replica's own
   status snapshot (role, term, applied/commit index, clock) [V `partition-service-remote-query-methods.js:192-216`];
   it is not a ReadIndex round. `check_quorum` is on [V `raft-rs-group-constants.js:22`], so a deposed
   leader's answers are stale for at most one election timeout. Every other mode can return rows from a
   follower, a co-located lagging replica, or the SQL engine, without saying so in a way consumers check.
2. **Every "local" read is local-leader-else-any-local-replica.** The gateway ingress defaults
   `replicaFallbackConsistency` to `any_replica` on every read [V `control-plane-system-table-gateway-read-dispatch.js:78-86`],
   and the CDC flow retries the local read at that consistency when no local leader service exists
   [V `cdc-integration-service-authoritative-read-flow.js:561-588`]. `OWNER_LOCAL_ONLY` therefore means
   "whatever replica this node hosts".
3. **`OWNER_RPC_PREFERRED*` answers from the local replica when the owner RPC fails**
   [V `...authoritative-read-flow.js:716-724, 751-753`], and from the SQL engine with `preferLeader: false`
   when there is no local replica [V `...owner-rpc-read-execution.js:164-204, 225, 230-272`].
   The repository's own comment records the hazard
   [V `rebalance-coordinator-ledger-interlock-admission.js:499-502`].
4. **Unknown or missing modes normalise to a weaker default instead of failing**: no mode → `OWNER_LOCAL_ONLY`;
   strategy AUTHORITATIVE with no mode → `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK`; read profiles PLANNING,
   REPAIR_REQUIRED, TABLE_LIFECYCLE → `OWNER_RPC_PREFERRED_SQL_FALLBACK`; unknown leader mode → ANY
   [V `control-plane-system-table-gateway-read-contracts.js:74-82, 133-149, 446-516`]. Consumers get a
   fallback mode without naming one. Name-counting detectors cannot see these.
5. **The model strict read has two liveness prerequisites that the fallback modes do not**: the routing
   projection must name a canonical leader (`LEADER_GAP_REASON_OWNER_MISSING` → no candidates)
   [V `query-executor-partition-routing-candidates.js:172-190`], and the strict mode skips the in-process
   leader replica entirely [V `...authoritative-read-flow.js:615-617`]. Deleting fallbacks without
   removing those two prerequisites makes recovery reads depend on leader publication and query
   routing — the circular prerequisite the contract forbids. See E, slice S0.

### Safety findings (fallback arm authorises an effect or retires an obligation)

| # | Finding | Path | Reachability |
| --- | --- | --- | --- |
| SF-1 | A dispatch claim (and any non-terminal step transition) is treated as already committed from a stale non-leader row; no write is made | [V] | [I] |
| SF-2 | REPLACE source removal proceeds on a stale STOPPING-with-intent row after authority has gone terminal | [V] | [I] |
| SF-3 | Runtime-service STOP admitted by `authorizeLegacyRuntimeRemoval` on a leader-ANY read | [V] | [I] |
| SF-4 | Ledger quorum-spread hold released on a follower-served services read (leader PREFERRED) | [V] | [I], low during formation |
| SF-5 | "Absence confirmed" accepted from non-leader data; currently fenced downstream at every consumer I traced | [V] | latent |
| SF-6 | Unavailable authority collapses into a decision outcome (`supersessionChanged`, "no create-admission winner", `[]`, `0`) | [V] | divergence, see A.1 |

Interleavings:

**SF-1.** `claimPriorityDispatchTransition` (`operation-workflow-transition-persistence.js:153-172`) →
`resolveOperationTransitionBeforeWrite` (`operation-workflow-transition-orchestration.js:134-156`) →
`observeOperationTransition` (`replica-operation-repository-mutation-update-methods.js:141-164`) → dual read.
1. Operation O was claimed (row at SENDING), then durably FAILED on the ledger leader.
2. A caller on node N still holds a PENDING copy and asks for the claim.
3. Arm A (local): N's co-located ledger replica lags and shows SENDING. It differs from the PENDING copy, so arm B runs.
4. Arm B: the owner RPC fails (leader change, timeout). The CDC flow returns the local read
   (`ownerRpcResult.success !== true && preferOwnerRpcRead && localRead.available`).
5. `durable.workflowStep === SENDING`, not terminal → `IDEMPOTENT_REPLAY`, `persisted: true`.
6. The claim returns the operation because `replay.operation.completedAt === null`; dispatch proceeds for a
   terminally failed operation, and no CAS write was issued that could have refused.
The same replay branch serves every `updateStep`-style transition; `Object.assign(operation, observation.operation)`
also overwrites the caller's copy with the stale row (`...transition-orchestration.js:149`).

**SF-2.** `ensureReplaceRemovalIntentRecorded` (`operation-workflow-recovery-reconcile.js:606-643`).
1. O (partition REPLACE) reaches STOPPING with a durable intent entry.
2. Authority later records terminal FAILED with `TARGET_DEAD_SOURCE_RETAINED` (another owner after lease
   expiry, or this owner through a detached copy).
3. The old owner's read is served by its stale local replica or the SQL engine (arm A exact match, or arm B after RPC failure).
4. Non-terminal STOPPING with intent → `adoptDurableReplaceIntent` → returns true → the STOPPING owner continues toward source removal.
The contract names this class: "a generic target-removal rollback must never destroy the surviving
replacement after source removal" and its mirror. Whether the REMOVE dispatch's own safety gates refuse was not traced [I].

**SF-3.** `authorizeLegacyRuntimeRemoval` (`src/control-plane/replica-dispatch-service.js:48-80`).
The read sets `OWNER_RPC_REQUIRED` but no `leaderMode`; it normalises to ANY, so `preferLeader=false`
and no witness is enforced. A lagging follower (possibly the node's own replica) still shows the REMOVE
incomplete → ADMITTED → `admitGenericRemoval` stops the runtime for an already-terminated REMOVE.

**SF-4.** `isOperationLedgerQuorumSpreadAuthoritativelyConfirmed`
(`rebalance-coordinator-ledger-interlock-admission.js:506-541`) reads services rows with `OWNER_RPC_REQUIRED`,
`leaderMode: PREFERRED`. `getAuthoritativeEntityServiceRowsObservation` requires the leader witness only when
the caller passed REQUIRED (`rebalance-coordinator-operation-read-methods.js:516-531`), and the placement
predicate requires only `source === owner RPC` and a complete row set (`operation-ledger-quorum-concentration.js:339-342`).
A follower-served SPREAD answer releases the hold. Spread grows monotonically during formation, so the
unsafe direction (stale SPREAD after an un-spread) is unlikely there; it is still a hold released on non-leader data.

**SF-5.** `requireAbsenceConfirmation` only turns a *failed* read into a deferral. A *successful empty* read is
returned as `{operation: null, deferredOutcome: null}` without checking `rowSetComplete` or the witness
(`replica-operation-repository-read-methods.js:417-479`). Arm B's success can be a follower-served RPC, the
local any-replica read, or the SQL engine. Consumers traced: `observeOperationTransition` (proceeds to a CAS
write, which arbitrates), `resolveUncountedOperationUpdate` (REFUSED), `confirmRetainedOperationRow`
(→ `repairRetainedOperation`, which re-reads strictly through `readRetainedRepairDecision`,
`replica-operation-repository-retained-placement-repair.js:136`). No unfenced consumer found; the mechanism is wrong.

---

## A. Read-mode families 1-4

### A.0 Gateway mode decision tables (family 2) — the substrate for everything else

All [V] in `cdc-integration-service-authoritative-read-flow.js:519-772`,
`cdc-integration-service-owner-rpc-read-execution.js:164-272, 388-503`,
`control-plane-system-table-gateway-read-contracts.js:151-212`.

Arms:
- **L** = in-process read of this node's replica: local-leader consistency first; if none, the
  `replicaFallbackConsistency` (default `any_replica`). "Available" = at least one usable local service answered.
  A leader here is the service's own role belief (`resolveLeaderRole`), no quorum confirmation.
- **R** = owner RPC through `queryExecutor.executeOnPartition`; `preferLeader` is true unless leader mode is ANY.
  With REQUIRED, routing admits only the canonical leader and a success without a valid leader witness is turned into a failure.
  With PREFERRED or ANY, a follower-served success is accepted as is.
- **S** = SQL engine `executeQuery` with `preferLeader: false` and a suffixed session id.

| Mode | Order | When the next arm runs | What "empty" means |
| --- | --- | --- | --- |
| `OWNER_LOCAL_ONLY` | L | never; L unavailable → `AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE` (or a transport-not-ready deferral) | empty on some local replica |
| `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK` | L, then R | R only when L is unavailable | empty on a local replica, or on whichever replica served R |
| `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC` | L, then R | R when L is unavailable **or** L is available and empty; a failed R is returned as failure | non-empty answers may still be any local replica; empty is R's answer |
| `OWNER_RPC_PREFERRED` | L (kept aside), then R | R always attempted; if R fails or is absent and L was available → **L is returned**; if transport is not ready and L available → L | empty on R's replica, or on the local replica after R failed |
| `OWNER_RPC_PREFERRED_SQL_FALLBACK` | L (kept aside), R, then S | as above; if R fails retryably and there is no L → S | as above, or empty on whichever replica the SQL engine picked |
| `OWNER_RPC_REQUIRED` | R only | never; R absent → unavailable | with leader REQUIRED: empty at the witnessed leader. With PREFERRED/ANY: empty on whichever replica served |

Further [V]:
- A second SQL fallback sits in the gateway itself when the CDC service lacks the method
  (`control-plane-system-table-gateway-read-strategies.js:385-422`); production always has the method [I], so this is fixture-keeping.
- The arm that answered is reported (`source`, `localReadHit`, `localReplicaFallbackHit`, `usedSqlFallback`) but
  the family-1 and family-3 consumers do not read those fields.
- `authoritativeObservationScope: COMPLETE_TABLE` already forces `OWNER_RPC_REQUIRED` + leader REQUIRED at ingress
  (`...read-dispatch.js:23-36`): the gateway already has one place where a requirement overrides the caller's mode.
- Same-family consumers outside the brief's census (not investigated): `query/sql-query-engine-transaction-persistence-methods.js:325`,
  `query/sql-query-engine-metadata-authority-refresh.js:436`, `query/sql-query-engine-select-execution.js:495-517`,
  `query/sql-query-engine-transaction-set-methods.js:19`, `partition/partition-service-metadata-mutation-helpers.js:160`,
  `cdc/cdc-integration-service-cache-visibility-authority.js:26`, `cdc/cdc-integration-service-authoritative-catchup.js:220`,
  `control-plane/authoritative-control-plane-view.js:85` (default for every view read), `policy/table-policy-resolution.js`,
  eleven files using read profiles. Also `allowLivenessFallbackProjection` (12 hits, control-plane),
  `allowPrioritySpreadLivenessFallbackProjection`, `allowSingleReplicaFallback` and `usedDegradedFallback` (query).

### A.1 Family 1 — the dual read behind operation-row authority

Definition [V] `replica-operation-repository-mutation-persistence-methods.js:447-507`:

| Step | Read | Returned when |
| --- | --- | --- |
| A | `OWNER_LOCAL_ONLY`, no retry | A's row satisfies `isReplicaOperationVisibilitySatisfied(expected, row)` (identity, exact step and status, durable content) |
| B | `OWNER_RPC_PREFERRED_SQL_FALLBACK`, leader PREFERRED, bounded retry | B returned any row |
| — | A's differing row | B returned no row but A had one |
| — | B's observation (`operation: null`, maybe a `deferredOutcome`) | neither had a row |

- Arm B runs when A is absent, different, or failed.
- A `deferredOutcome` exists only when one of three options asked for it; with none, failure and absence are indistinguishable.
- `queryReplicaOperationPersistenceAuthorityOperation` reduces the answer to `observation?.operation || null`,
  discarding the deferral: absent, unavailable and deferred are one value.
- Disagreement rule: an exact local match wins without asking the leader; otherwise any RPC/local/SQL row wins over a differing local row.
- `row = rows.find(id match) || rows[0]` (`replica-operation-repository-read-methods.js:481-484`) is a further two-source read.

`confirmReplicaOperationVisibility` (`...persistence-methods.js:564-664`) repeats A then B in a poll loop until
`isAppliedReplicaOperationWriteVisible` or the visibility timeout; outcome CONFIRMED / DEFERRED / MISSING.

Consumers. "Replacement" names one of two canonical reads defined in E/S0:
**OWNER-FACT** (leader-witnessed, typed `READY | UNAVAILABLE`) or **HINT** (explicitly non-authoritative, may only schedule).

| Consumer | Decision it feeds | Authority required | Today on disagreement / unavailable | Replacement | Flags |
| --- | --- | --- | --- | --- | --- |
| `observeOperationTransition` `...mutation-update-methods.js:141-164` (callers: `resolveOperationTransitionBeforeWrite` `operation-workflow-transition-orchestration.js:134`; terminal repair `operation-workflow-terminal-transition-repair.js:439`; `dispatchObservedTerminal` `operation-workflow-create-satisfied-response.js:12`; executor step notification `operation-workflow-executor-outcome-reconcile-methods.js:709`; `resolveUncountedOperationUpdate` `:388`) | "This step is already durable; skip the write" or "a terminal already won" | Durable owner fact, leader witness. Replay of a non-terminal step is non-monotonic; a terminal row is monotonic | Stale same-step row → replay, `persisted: true`. Failed arm B → deferral (thrown, or rearm). Successful-empty arm B → proceeds to CAS write | OWNER-FACT. UNAVAILABLE → existing continuations: thrown deferral into the transition retry timer; `rearmTerminalTransitionRepairIfHeld`; `deferObservedProgressRetry`; `scheduleExecutorOutcomeRetry` [V they exist; I that they cover every caller] | **Safety SF-1.** In the in-flight update path |
| `resolveZeroChangeOperationUpdate` `:564-650` | After a zero-row CAS: replay, a different terminal won, or the row vanished (→ re-insert) | Durable owner fact with a floor at the write's own log index | Stale equal row → `IDEMPOTENT_REPLAY persisted: true`. Null (absent **or** unavailable) → `repairRetainedOperation` or REFUSED | OWNER-FACT with `minimumIndex` = the mutation answer's index, or better: the mutation answer carries the committed row and this read is deleted | Safety class of SF-1; re-insert is fenced by the retained owner's strict read. In-flight update path |
| `queryConflictingTerminalAuthorityOperation` / `shouldRejectConflictingTerminalTransitionMutation` `:663-689` | — | — | — | **Delete**: no caller in `src` [V by grep] | dead |
| `runFailedCreateCleanupReleaseAttempt` `operation-workflow-terminal-transition-repair.js:520-549` | Deliver the failed-create cleanup release to the target | Durable terminal fact (monotonic) | Null → rearm. Row differs → throws | OWNER-FACT; UNAVAILABLE → `rearmTerminalTransitionRepairIfHeld` (exists) | Effect on a positive terminal row; safe only while terminal rows are immutable and never re-created under the same id [I] |
| `observeConcurrentCreateAdmissionWinner` `operation-workflow-transition-persistence.js:107-131` | After a refused failure write: did a CREATE admission win? | Durable owner fact | Null/stale → "no winner" | OWNER-FACT; UNAVAILABLE → typed deferral, not "no winner" | SF-6 divergence |
| `ensureReplaceRemovalIntentRecorded` `operation-workflow-recovery-reconcile.js:606-643` | Is the removal intent durable → proceed to source removal | Durable owner fact, leader witness (non-monotonic: the row can go terminal) | Null or terminal → false (wait). Stale STOPPING-with-intent → true | OWNER-FACT; UNAVAILABLE → false with `REPLACE_WAIT_REASON`, re-driven by the timeout sweep's replace-owner route (`operation-workflow-recovery-timeout.js:264`) [V exists] | **Safety SF-2** |
| `admitReplaceTerminalFailure`, supersession branch `operation-workflow-replace-terminal-admission.js:206-225` | Admit a terminal FAILED for priority-recovery supersession | Durable owner fact | Null (incl. unavailable) → `admitted: false, supersessionChanged: true`. Stale row → admitted, then CAS with the same predicate | OWNER-FACT; UNAVAILABLE must be its own outcome | SF-6: unavailable reported as "supersession changed". CAS fences the stale-admit case |
| `readReplaceDurableStep` `:157-165` (+ `typeof` probe) | D2 boundary step for a terminal FAILED | Durable owner fact | Null → caller's in-memory step; write is a CAS on that step | OWNER-FACT; UNAVAILABLE → refuse and retry. Delete the probe | Documented as CAS-fenced [V comment; I that every write is the CAS] |
| `resolveIntentCommitIndex` `operation-workflow-replace-intent.js:100-111` (+ probe) | C0 witness commit index when the copy lacks the entry | Durable step metadata, immutable once written | Null → NaN (fails closed) | OWNER-FACT; delete the probe | none found |
| `confirmRetainedOperationRow` `replica-operation-repository-retained-placement-repair.js:82-92` | EXACT / CHANGED / ABSENT / UNAVAILABLE before a retained repair | Durable owner fact | Deferred → UNAVAILABLE. Successful-empty → ABSENT → strict re-read downstream | Use the retained owner's own strict read for the first stage too | SF-5 latent. In-flight retained writer |
| `confirmReplicaOperationVisibility` / `confirmReplicaOperationPersistence` `...persistence-methods.js:509-664` (via `confirmPersistenceThroughWitness`, post-insert `:426`, post-update `...update-methods.js:427`) | Return the committed winner row after a changed-row write | The write's own committed answer | Poll A then B until visible; DEFERRED keeps the witness; MISSING throws | The mutation answer returns the committed row and index (the canonical mutation port), deleting the poll; or OWNER-FACT with `minimumIndex` | **Liveness**: see below. In-flight insert and update paths |
| `operation-workflow-stranded-remove-repair.js:49,80` | — | — | — | Not a consumer at f580579a5: the file reads through `readRequiredEntityOperationRows` (leader REQUIRED, complete) [V `:87`, `replica-operation-repository-entity-read-methods.js:226-236`]. Already canonical | census entry is stale for this head |

A second dual read of the same kind, not in the brief: **`getOperationByIdVisibilityObservation`**
[V `replica-operation-repository-read-methods.js:600-628`]: authoritative observation, then the owner-persisted
transition memo, then `queryOperationById` (cache first, then `OWNER_RPC_PREFERRED_SQL_FALLBACK`,
`:312-331`, failure → null). Thirteen `src` call sites: `operation-workflow-dispatch-response-reconcile.js:225,1073`,
`-transition-retry.js:105`, `-owner.js:316`, `-ambiguous-create-delivery.js:45`, `-dispatch-rearm-evidence.js:517,582`,
`-executor-outcome-reconcile-methods.js:515`, `-observed-progress-retention.js:307`,
`rebalance-coordinator-reservation-lifecycle-methods.js:550`,
`control-plane/replica-dispatch-service-dispatch-observation-methods.js:265` (with its own `typeof` probe).
Most pass no mode, so the first arm is `OWNER_RPC_PREFERRED_SQL_FALLBACK` with leader ANY. Their individual
decisions were sampled, not traced: several feed "is the operation still current, non-terminal and locally
owned → resume" (`-transition-retry.js:103-118`, `-dispatch-response-reconcile.js:1072-1086`), which is a
scheduling turn only if the resumed work re-reads strictly before its effect [I].

Liveness dependence on the fallback arm:
- **Post-write confirmation** on a coordinator that is not the ledger leader progresses today through arm A as soon
  as the co-located replica applies. With a strict-only read and the leader briefly unreachable it would defer.
  Continuation exists: `UPDATE_CONFIRMATION_UNRESOLVED` with `deferRetry`, and `CONFIRMATION_FAILED` re-arms the
  terminal repair (`operation-workflow-terminal-transition-repair.js:503-506`) [V]. Cleaner: no confirmation read at all.
- **Leader-unreachable windows** (ledger election, ledger self-move): SF-1 and SF-2 consumers progress today on local data.
  Under OWNER-FACT they wait; each has a timer or sweep that re-drives it [V the timers exist; I that none is missing].
- **Circular prerequisite**: the strict read needs a canonical leader in the routing projection and a routed
  transport even when this node is the leader (summary point 5). The seed during cold formation is the sole
  ledger leader; if its strict reads wait on leader publication, and publication waits on control-plane work
  that issues strict reads, formation stalls. The fallback modes hide this today. S0 must remove it before any
  consumer slice lands. Not verified: whether `executeOnPartition` already serves a local leader without the
  routed transport.

### A.2 Family 2 — gateway modes

Tables in A.0. Canonical replacement: the enum keeps two values. OWNER-FACT is today's
`OWNER_RPC_REQUIRED` + leader REQUIRED + witness. HINT is an explicitly named non-authoritative read whose
result type cannot be passed where an owner fact is required. `OWNER_LOCAL_ONLY`, the four fallback modes,
`leaderMode`, `replicaFallbackConsistency`, `allowSqlFallback`, `allowOwnerRpcFallback`, the SQL-fallback stage
and the read-profile defaults are deleted; an unrecognised mode throws instead of normalising.

### A.3 Family 3 — repository read modes

`REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK` is the default for every caller that
names no mode [V `replica-operation-repository.js:434-442`]. In `queryIncompleteOperations`
[V `replica-operation-repository-incomplete-read-methods.js:402-520`]:

| Condition | Answer |
| --- | --- |
| cache has ≥ 1 incomplete operation | the cached set, treated as the whole set |
| cache empty, inside the SQL retry backoff | cached set, else the last observation if reusable, else `[]` |
| cache empty | read with `OWNER_RPC_PREFERRED_SQL_FALLBACK`, leader ANY |
| that read fails, deferral applies | fallback set plus a recorded deferred outcome |
| that read fails, no deferral | `[]` |
| read succeeds but "empty during priority recovery" | fallback set plus deferral |

"Empty" therefore means cache-empty and read-empty on some replica, or a non-deferred failure.
`OWNER_RPC_REQUIRED` / `OWNER_RPC_SINGLE_ATTEMPT` skip the cache but pass no leader mode → leader ANY, no witness.

| Consumer | Decision | Authority required | Today | Replacement |
| --- | --- | --- | --- | --- |
| Timeout sweep `operation-workflow-recovery-timeout.js:236-247` | Which operations get a timeout turn | HINT. It already re-reads each row strictly before any effect ("The census schedules the turn. The exact current row authorizes lifecycle effects", `:274-286`) | Cache set, optionally supplemented by an owner read | HINT census + periodic OWNER-FACT census for completeness. This is the model consumer |
| Orphan sweep `...recovery-timeout.js:370-380` | Which owned operations to reconcile; fenced adoption | HINT for the turn; OWNER-FACT before adoption | Cache set when non-empty; no supplement, so a durable operation missing from a non-empty cache gets no turn | HINT + OWNER-FACT census on a timer. Liveness gap today, not safety [I: `reconcileOperationLifecycle`'s own reads not traced] |
| Startup recovery `operation-workflow-recovery-reconcile.js:333-345` | The set of incomplete operations to recover | OWNER-FACT complete census: this discovers retained obligations | Cache set when non-empty | OWNER-FACT census; UNAVAILABLE → recovery stays pending and the recovery timer retries. Must not need full readiness (see A.1 circularity) |
| Concurrent REMOVE / ADD budget `rebalance-coordinator-priority-budget-helper.js:404-430, 700-775` | Admit another REMOVE or ADD | If the limit is a safety bound: OWNER-FACT count. If it is a throttle: HINT | `cachedCount > 0 && cachedCount < max` → admit on cache alone; strict recheck only on saturation | Decision needed (H). Formation-relevant either way |
| `coordinator.queryIncompleteOperations` `rebalance-coordinator-operation-read-methods.js:114-131` | Feeds the above; under local router pressure answers from cache | — | Pressure changes which source answers (R12) | Pressure may delay the OWNER-FACT read, never substitute the source |
| `getOperationsByEntity` `rebalance-coordinator-recovery-helper.js:108-116`, repository `getOperationsByEntity` / `getAllOperations` `replica-operation-repository-entity-read-methods.js:159-212` | Planning inputs | HINT, unless a caller acts on absence | cache, else fallback read, failure → `[]` | Split: HINT method named as such; `getRequiredOperationsByEntity` (already exists, `:238`) for decisions |
| `queryOperationById` `replica-operation-repository-read-methods.js:312-331` | see A.1 | — | cache, else fallback read, failure → null | delete; callers choose HINT or OWNER-FACT |
| `queryExistingInFlightOperation` `...read-methods.js:640-699` | Create dedupe | OWNER-FACT complete rows | on read failure answers from cache unless the mode is REQUIRED (`allowCacheFallbackOnReadFailure`, default on) | OWNER-FACT only. In the in-flight creation-support writer's path |
| repository `getConcurrentRemoveCount` `...entity-read-methods.js:357-382` | — | — | failure → `0` | **Delete**: the coordinator binds the helper version; no `src` caller of the repository method [I by grep] |
| `REPLICA_STATUS_READ_QUERY_OPTIONS` / `..._CANONICAL_STATUS_...` (`OWNER_RPC_PREFERRED`) `replica-operation-repository.js:344-348, 409-412` | Replica lifecycle status observations | not traced | not traced | not traced (G) |
| `STORAGE_RESERVATION_READ_QUERY_OPTIONS` (`OWNER_RPC_PREFERRED_SQL_FALLBACK`) `rebalance-coordinator-shared.js:199-206`, used by the reservation sweep `rebalance-coordinator-reservation-lifecycle-methods.js:692-709` | Nominate ACTIVE reservations for expiry or orphan release | HINT for nomination; the release decision reads the operation with leader REQUIRED (`:549-556`) and the transition is a CAS | fallback census | Rename the census HINT. The stated reason for the fallback ("instead of leaving stale reservations behind") is liveness only |

### A.4 Family 4 — leader PREFERRED and the membership-publication read sources

| Site | Decision | Today | Authority required | Replacement | Flags |
| --- | --- | --- | --- | --- | --- |
| `isOperationLedgerQuorumSpreadAuthoritativelyConfirmed` `rebalance-coordinator-ledger-interlock-admission.js:506-541` | Release the ledger quorum-spread hold | follower-served owner RPC accepted | OWNER-FACT | leader REQUIRED; the callee already enforces the witness then | **SF-4**, formation path |
| `observeAuthoritativeOperationObservationForReservation`, `adoptAuthoritativeReservationForOperation` `rebalance-coordinator-reservation-adoption.js:89-125, 171-185` | Adopt, or (with `allowConfirmedAbsentReservation`) create a reservation; gate storage-increasing dispatch | empty follower-served read → `RESERVATION_ABSENT` → `createReservationForOperation` (`rebalance-coordinator-reservation-lifecycle-methods.js:455-470`) | OWNER-FACT | leader REQUIRED | Create is keyed by the operation-derived id, so a duplicate converges [V comment `:433-437`]; stale "ALREADY_ACTIVE" for a since-released reservation would pass the dispatch gate [I] |
| `resolveNewOperationInsertCollision` `replica-operation-repository-mutation-persistence-methods.js:256-300` | Which row holds the colliding key | `OWNER_RPC_REQUIRED`, leader PREFERRED, complete exact key | OWNER-FACT | leader REQUIRED | in-flight insert path |
| `queryAuthoritativeOperationByTargetClaimKey`, `...ByMessageGroupMembershipLane` `replica-operation-repository-read-methods.js:537-598` | Name the conflicting holder; membership-lane recovery (`operation-workflow-message-group-membership-recovery.js:361`) | failure and absence both → null | OWNER-FACT | leader REQUIRED; typed UNAVAILABLE | SF-6 |
| `queryAuthoritativeMessageGroupMembershipDebtOperations` `replica-operation-repository-message-group-membership-methods.js:44-61` | Census of membership debt | typed `available: false` already; follower-served census accepted | OWNER-FACT complete census | leader REQUIRED + `rowSetComplete` | a stale census omits debt → liveness |
| `LOCAL_PREFERRED_AUTHORITATIVE_READ_OPTIONS` `replica-operation-repository-entity-read-methods.js:99-104` → `queryTerminalReplicaCleanupOperations` `:107-122`, `getEntityInFlightReplicaIds` `:130-154` | Cleanup-release recovery set; replica-id allocation exclusion set (`rebalance-coordinator-replica-identity-methods.js:444`) | Resolves to `OWNER_LOCAL_ONLY` (the `undefined` mode is deleted, strategy is owner-local): any local replica. Failure throws | Terminal set: monotonic facts, HINT is enough, missing rows are liveness. Id allocation: OWNER-FACT | split accordingly | the name says "authoritative"; the read is not |
| `getOperationsByEntityAuthoritativeObservation` `...entity-read-methods.js:263-350` | Entity operation census for planning and priority recovery (`priority-recovery-observation.js:516`, `rebalance-coordinator-operation-read-methods.js:237`) | leader PREFERRED; incomplete → deferral carrying cached + owner-persisted operations | OWNER-FACT for decisions; `readRequiredEntityOperationRows` exists | route decisions to the required reader; keep the projection as HINT | — |
| `refreshDeferredPublicationsFromAuthority`, `refreshDeferredPropagatedCachesFromAuthority` `membership-publication-coordinator-reconcile.js:95-180` | Cache hydration | `OWNER_RPC_PREFERRED`, leader PREFERRED | Refresh (add/update): HINT is acceptable. Sweep of a missed DELETE: OWNER-FACT complete read | two explicit calls | the comment already says only a leader-witnessed complete read may sweep deletes [V `:141-147`; I that the hydrator enforces it] |
| `resolveAuthoritativeNodeEndpointRows…` `unified-rebalancer-critical-topology-methods.js:505-520` | Critical-system endpoint visibility → topology settling gate | `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK` | Gate that releases placements: OWNER-FACT | OWNER-FACT; UNAVAILABLE keeps the gate held with the existing settling-blocker reason | formation path [I on what the gate releases] |
| Membership publication `readTableRows` `membership-publication-coordinator-reads.js:187-252` | Rows for the publication planning snapshot: NODES, NODE_ENDPOINTS, SERVICES, PARTITIONS, REPLICA_OPERATIONS → the published active node set | see below | Publishing or retiring members: OWNER-FACT. Acknowledgement candidate lookup and diagnostics: HINT | see below | formation path |

Membership-publication decision table [V `membership-publication-coordinator-reads.js:187-252`,
`membership-publication-planning-evidence.js:238-303`, `membership-publication-coordinator-planning.js:76-117`,
`authoritative-control-plane-view.js:73-88`]:

1. Preloaded rows, if non-empty (or empty and explicitly allowed).
2. For the publications table with a direct owner: `fetchDirectOwnerRows`.
3. The authoritative view. Mode by read source: `AUTHORITATIVE_PREFERRED` → `OWNER_RPC_PREFERRED_SQL_FALLBACK` for
   NODES, `OWNER_RPC_PREFERRED` otherwise; `CACHE_PREFERRED` → `OWNER_LOCAL_ONLY`. On success, non-planning reads may
   merge cache rows into the result (`mergePlanningEvidenceRows`).
4. On view failure: a PLANNING-profile read throws typed unavailability; any other read falls to
   `systemTableCache.getAll`, and to `[]` without a cache.

The read source itself is chosen by a predicate over the rows already read (`shouldPreferAuthoritativeMembershipState`,
`membership-publication-candidate-derivation.js:173-185`), so which authority answers depends on data.
Callers that force `AUTHORITATIVE_PREFERRED`: owner reconcile (`membership-publication-coordinator-reconcile.js:449-452`),
scheduled reconcile (`heartbeat-service-lifecycle-methods.js:424-428`), active-gate reconcile and readback
(`membership-publication-active-gate-reconcile.js:316-318, 615-621`). `getAcknowledgementCandidateForNode` reads the
cache first and the owner only on a miss (`membership-publication-coordinator-reads.js:402-420`).
Individual publication decisions were not traced (G).

What the fork found on the August decision (section D.4): the leader row was made canonical on the write side,
no unit owned moving the readers, and `raft_role` is still read in 55 `src` files. The epic lists "remote ledger
routing from the first SERVICES row" as a live path. This is the same failure shape as family 4.

---

## B. Family 5 — capability probes

Production construction [V]: the workflow owner receives `repository: this.repository`
(`rebalance-coordinator-lifecycle.js:381`), which is `options.repository || new ReplicaOperationRepository(...)`
(`:351-353`), the only construction in `src`. Every probed repository method is on the prototype through mixins
applied unconditionally (`replica-operation-repository.js:584-758`). **No probe below guards a genuinely optional
production capability.** All are fixture-keeping: delete the probe, migrate the reduced fixtures to the real
construction. No port needs to become "two named owners".

| Probe site | Probed method | Else-branch today | Reduced fixtures (estimate) |
| --- | --- | --- | --- |
| `operation-workflow-owner-execution-lane.js:171,191` | `getActualReplicaObservation` | falls to `getObservedReplicaStatusFromCache` (`:203`) — weaker answer | 1: `test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js` |
| `...execution-lane.js:631` | `touchOperationOwnerLease` | returns false; the lease is silently not renewed | 1: `test/rebalancer/replace-owner-lease-causal.test.js` |
| `operation-workflow-recovery-observation.js:205,224` | `getObservedReplicaStatusFromCache` | false / an explicit OBSERVED_TARGET_UNAVAILABLE constant | 1: `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js` |
| `...recovery-observation.js:239,420` | `rowToOperation` | `[]` / `null`; the cache-change wake is dropped | 0 by function name; 28 of 33 hand-built-repository test files lack the method |
| `...recovery-observation.js:553` | `getActualReplicaObservation` | uses `getActualReplicaStatus`; a null status becomes ABSENT (`:571-583`) | 3: `committed-node-remove-safety-wake.test.js`, `replace-real-group-scheduling.test.js`, `rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js` |
| `operation-workflow-recovery-timeout.js:47` | `queryOrphanAdoptableOperations` | `[]`: fenced orphan adoption off | 5: `replace-owner-recovery-equivalence.test.js`, `replace-real-group-scheduling.test.js`, `replace-real-group-harness.js`, `remove-active-dispatch-redrive.test.js`, `test/convergence/formation-joint-admission-rounds.js` |
| `...recovery-timeout.js:397` | `touchOperationOwnerLease` | false | counted with `:47` |
| `operation-workflow-recovery-status-reconcile.js:208` (and `:221`) | `getObservedReplicaRowFromCache` | false = "source not visible in cache"; raw `row.status` | 0 by function name |
| `operation-workflow-gate-operation-row-repair.js:16` | `ensureRetainedOperationRow` | false; fail-closed | 1: `test/rebalancer/reservation-fail-closed-dispatch-gate.test.js` |
| `operation-workflow-replace-terminal-admission.js:159` | `queryReplicaOperationPersistenceAuthorityOperation` | authority null → caller's in-memory step | 3: `strict-operation-outcomes.test.js`, `test/node/fresh-create-resumed-syncing-claim.test.js`, `test/scripts/check-operation-dispatch-completion-owner.test.js` |
| `operation-workflow-replace-intent.js:104-109` | same | `fromCopy` (NaN) | 1: `test/rebalancer/replace-in-flight-blocks-planning.test.js` |
| `control-plane-system-table-gateway.js:192-217` (`readAuthoritativeControlPlaneRows`) | `readAuthoritativeRows` → `executeRead` → `executeAuthoritativeSystemTableRead` → `readRows` | each lower arm is a different read ingress | see below |
| `...gateway.js:229-248` (`readProjectionControlPlaneRows`) | `readProjectionRows` → `executeRead` → `readRows` | same | see below |

All else-branches [V]; all fixture counts are grep estimates (method: test files naming the enclosing function or
module, not naming the probed method, and not constructing the real coordinator or repository).

Notes:
- Two else-branches are also live in production because the method can return what the else returns:
  `readReplaceDurableStep` (null on unavailable) and `getReconciledReplicaStatus` (falls to cache whenever the
  authoritative observation is not OBSERVED, `:184-203`). Deleting the probe does not remove those; they belong to slice S1.
- `observeStoppingReplicaProgress`'s else-branch is the only one that could turn "unavailable" into ABSENT for a
  source-removal input; it is dead in production [I].
- Gateway helpers: the one production gateway (`control-plane-runtime-bundle.js:41`) has `readAuthoritativeRows`
  and `readProjectionRows` [V `control-plane-system-table-gateway-query-execution.js:504, 511`]. Arms 2-4 are
  fixture-keeping. `readAuthoritativeControlPlaneRows` is called from 32 `src` files. Blast radius in tests is
  large: mock names appear in 201 (`readAuthoritativeRows`), 85 (`readRows`), 69
  (`executeAuthoritativeSystemTableRead`), 14 (`executeRead`), 4 (`readProjectionRows`) test files; how many define
  only the lower arms was not computed.
- Fixture landscape: 64 test files construct the real `RebalanceCoordinator`, only 3 inject `repository:` or
  `workflowOwner:`. 33 test files hand-build a repository in a workflow or coordinator context; 19 do so alongside
  the workflow owner. Top: `rebalancer-entity-interaction-contract.test.js`,
  `priority-remove-safety-spread-nonregression.test.js`, `operation-workflow-remove-safety-universal-floor.test.js`,
  `coordinator-created-operation-progress-remote-handoff.test.js`,
  `executor-outcome-redrive-untouched-payload-retry-owner.test.js`. One test deletes a repository method outright:
  `required-entity-operation-observation.test.js`.
- The seams that admit reduced fixtures are the constructor options `options.repository ||`,
  `options.workflowOwner ||`, `options.controlPlaneSystemTableGateway ||`.
- Adjacent probes of the same kind (not investigated): `operation-workflow-owner-ports.js:654-681`,
  `replica-dispatch-service-dispatch-observation-methods.js:209-218, 262-269`,
  `sql-query-engine-transaction-persistence-methods.js:315`, `partition-service-metadata-mutation-helpers.js:104,130`,
  `cdc-integration-service-local-system-table-routing.js:486-497` (`executeLocalQuery` → `db.prepare` → `executeQuery`),
  `rebalance-coordinator-reservation-adoption.js:76-86`, `rebalance-coordinator-operation-read-methods.js:176-184`.

---

## C. Family 6 — legacy shapes and paths

| Item | Can a current writer or store still produce it? | Feeds a decision? | Verdict |
| --- | --- | --- | --- |
| `adaptLegacyReplaceSourceShape` `in-flight-aware-replica-count.js:8-27` | The module's only export has no `src` or `scripts` caller [V]; the row encoder writes `source_replica_id` (`replica-operation-repository-mutation-row-methods.js:54`) | no (dead) | **Delete** the module and its 4 test files (23 references), or re-point them at `buildReplicaInventorySnapshot`. No transition |
| `authorizeLegacyRuntimeRemoval` `control-plane/replica-dispatch-service.js:48-80` | Not provably dead. Reached only when the memo or cached services row has no `create_attempt_token` and the replica id is not `entityId` / `${entityId}-rN`. The allocator emits only `-rN` ids, but `wasm-instance-<digest>-rN` is a current non-canonical shape (`runtime-service-replica-identity.js:77-87`) | **yes**: ADMITTED → runtime STOP (SF-3) | Immediately: leader REQUIRED + witness + exact-key read. Then a one-time explicit transition: stamp or retire token-less opaque rows, after which the arm is deleted. Tests: `test/control-plane/replica-dispatch-reservation-identity.test.js`; coupled pair `runtime-service-legacy-removal-authority` |
| `legacyReusable` `control-plane/readiness-planning-completion-admission-methods.js:606-613` | Gated on `!semanticPlanningEnabled`, itself a capability probe (`readiness-planning-snapshot-owner.js:121-123`); production always creates the semantic owner with `subscribe` [V] | no in production; would return a stale completed snapshot as current | **Delete** the flag and every false arm (`:385, :570-572, :652`, `readiness-planning-semantic-currency-methods.js:88,194`). Fixtures: 9 of 12 test files constructing the snapshot owner or readiness service never mention the semantic owner (estimate); top `test/helpers/readiness-service-fixture.js` |
| Operation-progress compatibility projection `rebalancer/operation-progress-observer.js:25-145`, used at `control-plane/priority-recovery-snapshot-actuation.js:432-451` | The only `src` caller never passes `operationProgressRecord` [V `priority-recovery-snapshot-burndown.js:214`]; nothing persisted | would set `nextRequiredAction` (decision-bearing) but the branch is dead | **Delete** the branch, the option (`:523`) and the import; keep or rename the projection as a diagnostic only |
| `FALLBACK_LANE` `replica-operation-repository-mutation-transition-methods.js:3,50-53` | In-memory serialisation key used when a transition has no operation id; all five `src` callers pass one [V] | no | **Delete** the arm; a missing id throws a typed error. Other callers of `resolveReplicaOperationTransitionLane` not checked |

Adjacent, still live and not in the brief: the row decoder derives a REPLACE source from `steps_history` when
`source_replica_id` is null (`replica-operation-repository-row-methods.js:60-74, 208`). Whether stored rows with a
null column exist was not checked; if they can, that is the one place a one-time data transition is needed.
`repairStrandedRemoveAfterResponse` ("the recorded REMOVE/ACTIVE contradiction from the July run-1 failure",
`operation-workflow-stranded-remove-repair.js:103-109`) is a historical-correction path of the same kind; it
already reads canonically. Whether any current writer can still produce REMOVE/ACTIVE was not checked.

---

## D. An honest closure probe

### D.1 What the current checker proves (all [V] unless noted)

`scripts/checks/check-repository-legacy-fallback-closure.js`:
- Three AST detectors over `src`: an `||`/`??` chain with two differently-rooted member terms; a typeof-function
  test **with an else** (an early-return probe is not matched); a catch that returns an inert default.
- Exact-equality inventory constants (2674 census sites, 2637 active, 47 retired). A deletion fails it as an
  addition does: it is not a ratchet.
- Every site must have a label. The classification file has 2684 entries, seven reason templates, one
  `classifiedBy`/`verifiedBy`/timestamp for all of them; the label is a function of the detector row. All 460
  typeof-with-else probes are labelled "named state at owner".
- Eleven literal strings substring-searched in the top-level files of three directories; six test files checked
  with `existsSync`.
- Not wired into `package.json`, `test:static` or CI; reached only through one unit test and the quest receipt.
- **It is red on f580579a5**: 2622 active (expects 2637), 76 retired (expects 47), 14 unclassified sites, nine of
  them in `src/rebalancer`. (Computed by the fork by calling the audit functions read-only; the wrapping test was not run.)

It proves that, on the head where the constants were set, sites of three syntactic shapes carried a label. It
proves nothing about read modes, option flags, early-return probes, sequential dual reads, implicit defaults, or
behaviour. **Families 1-4 are invisible to all three detectors.**

### D.2 Detector set

Principle from the recurrence history (D.4): count the mechanism, not the name; delete the mode at its owner so no
caller can ask for it; no label can retire a site.

| Row | Detector | Baseline on f580579a5 | Target |
| --- | --- | --- | --- |
| `fallback_read_mode_members` | AST member access or enum member: the four fallback authoritative modes | 38 hits / 15 files in `src` (control-plane 22, rebalancer 8, query 5, cdc 2, partition 1) + 4 enum members | 0, enum members deleted |
| `non_required_leader_mode` | `LEADER_MODE.PREFERRED` accesses and the PREFERRED / ANY enum members; plus authoritative read option objects with an owner mode and no leader mode | 15 / 8 (rebalancer 11, control-plane 4); the second part needs the AST row, not yet counted | 0 |
| `repository_read_source_modes` | `CACHE_PREFERRED_SQL_FALLBACK`, `CACHE_PREFERRED`, `AUTHORITATIVE_PREFERRED`, `AUTHORITATIVE_SUPPLEMENT` | 46 / 16 (control-plane 22, rebalancer 9, admin and rest 15) | 0 |
| `fallback_contract_flags` | identifiers matching `/(allow|use|prefer)\w*Fallback\w*|\w*Fallback(On\w+|Predicate|Consistency|Hit)|usedSqlFallback|preferOwnerRpcRead|confirmEmptyLocalReadWithOwnerRpc/` | 57 / 15 for the narrower set the fork counted (control-plane 39, cdc 12) | 0 |
| `fallback_identifiers` | AST identifiers, property keys and string literals matching `/fallback/i` | 1486 / 357 by line-grep (rebalancer 235, control-plane 325, cdc 165, partition 116) | one-way down, per directory |
| `sequential_dual_read` | AST: a function containing an authoritative-read callee and a cache-read callee, or two authoritative-read calls with different mode arguments, where the later call is control-dependent on the earlier result | not yet counted; known members: the two family-1 functions, `getOperationByIdVisibilityObservation`, `queryOperationById`, `queryExistingInFlightOperation`, `queryIncompleteOperations`, `getAllOperations`, `getOperationsByEntity`, `readTableRows` | 0 in census directories |
| `unavailable_collapsed_to_value` | AST: `return []`, `null`, `0`, `false`, `{}` directly inside an `if` whose test negates `.success` | ≥ 7 rebalancer, ≥ 2 control-plane, ≥ 2 query (narrow regex, lower bound) | 0 in census directories |
| `owner_port_feature_detection` | existing AST row: every `typeof <member> === 'function'`, with or without else; excluding by construction a test whose only consequent is a `throw` | 1981 (rebalancer 294, control-plane 308, bootstrap 355, query 194, partition 112) | one-way down, per directory |
| `legacy_term_identifiers` | existing AST row | 2774 (query 428, control-plane 379, rebalancer 306) | one-way down, per directory |
| `implicit_mode_defaults` | the normalisers: any branch of `resolveAuthoritativeReadMode`, `normalizeReadLeaderMode`, `resolveReplicaOperationVisibilityReadMode`, `resolveReadProfileOptions` that returns a mode for an absent or unknown input | 4 functions | 0: unknown input throws |
| `reduced_owner_fixtures` (test tree) | test files that hand-build a repository, workflow owner or gateway literal | 33 repository files; gateway mocks up to 201 files | one-way down |

Ratchet rules:
- One baseline file, cells keyed by row × directory. A cell may only decrease. Model:
  `scripts/checks/no-legacy-consensus-reference-ratchet.js`, which checks the baseline's own git history for any
  increase and refuses a missing baseline. `check-guideline-navigability.js --update-baseline` already refuses to
  raise but is whole-`src` only.
- No dispositions and no free-text reasons. A site leaves a cell only by ceasing to match.
- Allow-list only for a pattern proven to be something else. Each entry is `{row, file, symbol, test}`; the script
  fails unless the named test file exists, names the symbol, and has a passing receipt. A structural exclusion
  that the AST can prove (typeof test whose consequent only throws) needs no entry.
- Adding a matching site anywhere fails, including in a directory whose cell is already zero.

### D.3 `doneWhen` in the existing probe kinds

Four kinds exist [V `scripts/solve/schema.js:75-80`, `scripts/solve/probes.js`]: `test-receipt`,
`scenario-harness`, `oracle`, `script`. All are "metric ≤ target". There is no native count, ratchet,
per-directory or allow-list kind; a `script` probe must live under `scripts/checks/`, prints its metric as the
last numeric stdout line, and runs under `LAGRANGE_PROBE=1` (R27: it reads the tree only).

- Per-slice quest: `{"probe":"script","args":{"command":"node scripts/checks/fallback-read-closure.js --metric --rows <rows> --scope <files or dirs>","target":0}}`.
  The metric is the number of selected cells above zero. It is red today for every slice, so the quest can seal.
  This is the form `live-dual-path-classification` and `partition-service-constructor-injection` already use
  against `code-navigability-budget.js`.
- The behavioural witness (R19) does not fit in the same `doneWhen`: a quest has one. Either the slice uses a
  `test-receipt` whose required receipts include both the red-witness test and a test that wraps the cell check,
  or the script probe is the `doneWhen` and the witness is required by the verification record. The first keeps
  both inside the sealed predicate; I recommend it for the safety slices.
- Epic closure: the `script` probe over all family rows and census directories at zero, plus the ratchet check in `test:static`.

### D.4 What each number proves and does not prove

| Number | Proves | Does not prove |
| --- | --- | --- |
| Mode-member rows at 0 in a directory | no code there requests a fallback mode by its enum member | that none is requested by string literal or reached by default. Closed only by deleting the enum members and making the normalisers throw (`implicit_mode_defaults` = 0), which is proof by construction for all of `src` |
| `sequential_dual_read` = 0 | no function of the recognised shape reads two sources | a dual read split across two functions or hidden behind a callee the detector does not list. The callee list is the detector's scope and must be stated in its output |
| `unavailable_collapsed_to_value` = 0 | no read function of that shape returns an empty value on failure | collapses written as `?.rows || []`, or done by the caller |
| typeof row | the count of capability probes | whether a remaining probe guards a real optional capability; B answers that by reading the constructions, the count cannot |
| `fallback_identifiers`, `legacy_term_identifiers` | naming only | behaviour. `allowCacheFallbackOnReadFailure` survived a word-boundary blocklist for two names; a rename to "supplement", "degraded", "best effort" or "preferred" would survive this row too |
| any row | a property of the tree | runtime behaviour. Each safety slice needs its executed witness: with the owner RPC failing and a stale local replica present, the read returns UNAVAILABLE and no effect is issued |
| scope | `src` for decision paths, `test` for the fixture row | scripts, harnesses, and anything generated |

Recurrence, and what it changes (from the quest logs, read by the fork):
- `canonical-replica-completion-observation` (landed 2026-11-10): deleted two option names, held by a regex for
  those names. A same-shape sibling under another name stayed default-on; the "removed" SQL constant is still
  defined in two files; the canonical arm accepted incomplete row sets until two re-fixes on 2026-11-20.
  → Delete the mode value at the owner; detect the mechanism.
- `committed-readiness-fixture-custody` (sealed 2026-11-06, never landed, 15 log entries): reduced fixtures were
  what kept the retired fallbacks exercised; the first frozen run broke 14 of 192 caller files and the work drifted.
  → Fixture migration is the bulk of each slice; list the fixtures up front; migrate fixtures with zero `src`
  delta first, then delete the arm with zero test delta.
- `repository-legacy-fallback-closure` (sealed and landed six minutes apart, one attempt): the receipt is labels,
  literals and file existence. The epic now calls it historical and lists four live paths.
  → A probe that can be satisfied by writing a label will be.
- The August leader-publication work hardened the writer; no unit owned the readers. [I]
  → A slice that makes an owner canonical must carry its consumers or name the unit that does.

---

## E. Slice plan

Other writers to avoid for now:
- Retained-repair owner: `src/rebalancer/replica-operation-*retained*`.
- Placement admission owner: `src/partition/partition-placement-admission*`.
- Canonical mutation port + placement route: `replica-operation-repository-mutation-gateway-methods.js`,
  `...mutation-persistence-methods.js` (insert path), `...mutation-update-methods.js` (update path),
  `replica-placement-owner-transport.js`, `rebalance-coordinator-operation-creation-support.js`.
- A fourth, not in the brief: the main checkout's working tree on `candidate/reconciliation-20261119` has
  uncommitted changes (quest `strict-operation-outcomes`) in at least `operation-workflow-recovery-reconcile.js`,
  `-terminal-transition-repair.js`, `-transition-persistence.js`, `-transition-orchestration.js`,
  `-owner-execution-lane.js`, `-recovery-observation.js`, `-recovery-status-reconcile.js`,
  `-replace-owner.js`, `rebalance-coordinator-reservation-lifecycle-methods.js`,
  `rebalance-coordinator-recovery-helper.js` and the three mutation method files (from the session's git status;
  the list was truncated). Slices S1, S6 and S8 touch those files.

Sizes are source-line estimates for `src`; fixture work is listed separately because it dominates.
"Pre" = must precede the physical three-host formation acceptance.

### S-P — the closure probe and ratchet (no `src`) · first · ~350 lines scripts + baseline
- Files: new `scripts/checks/fallback-read-closure.js`, new baseline under `data/`, new
  `test/scripts/fallback-read-closure.test.js`; reuse `scripts/checks/code-navigability-detectors.js`.
  Retire `check-repository-legacy-fallback-closure.js` and its red test in the same slice.
- Red witness: the probe prints a non-zero metric on f580579a5; the old checker exits 1.
- Parallel with everything.

### S0 — the two canonical reads, without circular prerequisites · **pre**, precedes S1-S6 · ~250 lines
- Goal: one OWNER-FACT read and one HINT read as owner-defined functions, and the OWNER-FACT read able to reach
  the leader without leader publication or routed transport when this node hosts the leader replica.
- Design: `readOwnerFact(table, sql, params, {minimumIndex, minimumTerm, completeRows})` →
  `{state: READY, rows, witness} | {state: UNAVAILABLE, reason, retryAfterMs}`; the witness predicate is the one in
  `replica-operation-retained-repair-authority.js:46-53` (valid leader witness, `commitIndex === appliedIndex`,
  index and term floors). Source selection is routing to the same authority, not a second algorithm: the
  in-process leader replica when this node hosts it, else the owner RPC; candidates may be widened because the
  witness is verified at the receiver and a non-leader refuses.
- Files: new `src/control-plane/control-plane-owner-fact-read.js`; `cdc-integration-service-authoritative-read-flow.js`
  (in-process leader arm for the required mode); `query-executor-partition-routing-candidates.js` (leader
  discovery for a required read); new repository mixin `replica-operation-repository-owner-fact-read-methods.js`
  and its one-line registration in `replica-operation-repository.js`. None is in an in-flight writer's list.
- Red witness: with the routing snapshot lacking a canonical leader and this node hosting the ledger leader, a
  leader-REQUIRED read returns unavailable today.
- Coupled: `readiness-versioned-planning-liveness` and `active-gate-convergence` if gateway read-contract or
  dispatch files are touched; the two cdc read-flow files have no declared contract owner, so name the selection
  by hand (`test/cdc/cdc-integration-service-authoritative-reads.test.js`, `test/control-plane/control-plane-system-table-gateway.test.js`,
  `test/control-plane/readiness-owner-authority-contract.test.js`).
- Decision needed first: H1 and H2.

### S1 — workflow effect-gating reads to OWNER-FACT · **pre** · ~120 lines · fixtures ~8 files
- Files: `operation-workflow-recovery-reconcile.js` (`ensureReplaceRemovalIntentRecorded`),
  `operation-workflow-terminal-transition-repair.js` (`runFailedCreateCleanupReleaseAttempt`),
  `operation-workflow-transition-persistence.js` (`observeConcurrentCreateAdmissionWinner`),
  `operation-workflow-replace-terminal-admission.js` (supersession branch, `readReplaceDurableStep`, probe),
  `operation-workflow-replace-intent.js` (probe).
- Tests: `test/rebalancer/replace-source-removal-owner.test.js`, `replica-operation-terminal-cas.test.js`,
  `terminal-failed-add-target-cleanup.test.js`, `replace-real-group-scheduling.test.js`,
  `replace-replica-workflow-create-replay-test-cases.js`, `quorum-conditioned-remove-safety-tail-fixture-builders.js`,
  `strict-operation-outcomes.test.js`, `replace-in-flight-blocks-planning.test.js`.
- Red witness: SF-2 (stale STOPPING-with-intent row adopted after RPC failure); supersession refusal reporting
  "changed" when the read was unavailable.
- Coupled pairs: `failed-create-target-authoritative-cleanup`, `storage-reservation-operation-and-retry-authority`,
  `message-group-registered-learner-read`, `router-envelope-rebalancer`; contract `replica-operation-state`
  (prefix selects all of `test/rebalancer/`).
- Collides with the `strict-operation-outcomes` working tree; sequence after it or hand it these five edits.

### S2 — delete the dual read itself and the confirmation poll · **pre** · ~250 lines net deletion · fixtures ~10 files
- Files: `replica-operation-repository-mutation-persistence-methods.js:447-507, 509-664`,
  `replica-operation-repository-mutation-update-methods.js:141-200, 388-395, 564-689`,
  `replica-operation-repository-retained-placement-repair.js:82-92`,
  `replica-operation-repository-read-methods.js:312-331, 340-520, 600-628`.
- All but the last are inside in-flight writers. **This slice belongs to the canonical-mutation-port writer or
  must follow its landing**: the mutation answer carrying the committed row removes the confirmation read.
- Tests: `test/rebalancer/replica-operation-confirmation-authority-read.test.js`,
  `replica-operation-repository-deferred-visibility-test-cases.js`, `...-incomplete-visibility-test-cases.js`,
  `replica-operation-insert-retry-idempotency.test.js`, the 15 files naming `getOperationByIdVisibilityObservation`.
- Red witness: SF-1.
- Coupled pairs: `storage-reservation-operation-and-retry-authority`, `partition-write-answer-retry-classification`,
  `failed-create-target-authoritative-cleanup`, the three message-group learner pairs.

### S3 — leader PREFERRED / ANY → REQUIRED at the named sites · **pre** · ~60 lines · fixtures ~6 files
- Files: `rebalance-coordinator-ledger-interlock-admission.js`, `rebalance-coordinator-reservation-adoption.js`,
  `replica-operation-repository-read-methods.js:537-598`, `replica-operation-repository-message-group-membership-methods.js`,
  `replica-operation-repository-entity-read-methods.js:99-154, 263-270`, `src/control-plane/replica-dispatch-service.js:68-79`.
  (`resolveNewOperationInsertCollision` goes with S2.)
- Tests: `test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js`,
  `test/rebalancer/coordinator-reservation-lifecycle.test.js`, `replica-operation-repository.test.js`,
  `required-entity-operation-observation.test.js`, `test/control-plane/replica-dispatch-reservation-identity.test.js`.
- Red witness: SF-3 and SF-4 (a follower-served answer is accepted).
- Coupled pairs: `operation-ledger-self-move-hold-dispatch`, `storage-reservation-operation-and-retry-authority`,
  `runtime-service-legacy-removal-authority`, `router-envelope-control-plane`; contracts
  `storage-reservation-authoritative-adoption`, `runtime-service-bound-creation-route`.
- Requires S0: these sites gain a hard dependency on reaching the leader.
- Writer set disjoint from S1, S4, S5.

### S4 — membership-publication read sources · **pre** · ~300 lines · fixtures ~17 files
- Files: `membership-publication-row-contract.js`, `-coordinator-reads.js`, `-coordinator-planning.js`,
  `-planning-evidence.js`, `-candidate-derivation.js`, `-active-gate-reconcile.js`, `-coordinator-reconcile.js`,
  `heartbeat-service-lifecycle-methods.js`, `authoritative-control-plane-view.js`; `src/admin/admin-control-snapshot*.js`
  for the diagnostic readers.
- Tests: the 7 files naming the read sources, the 17 naming `readSource:`, `test/control-plane/authoritative-control-plane-view.test.js`,
  `membership-publication-deferred-catchup.test.js`, `publications-catchup-leader-pinned-read.test.js`.
- Red witness: with the view read failing, a non-planning reconcile read plans from `systemTableCache.getAll`.
- Coupled: contract `active-gate-convergence`; no coupled pair names these files, so name the selection by hand.
- Highest liveness risk: this is the published active-node set. Needs S0 and a traced list of which publication
  decisions run before the publications partition has a published leader (G).

### S5 — critical-topology endpoint visibility · **pre** · ~30 lines · fixtures ~3 files
- Files: `unified-rebalancer-critical-topology-methods.js`.
- Tests: `test/rebalancer/critical-topology-committed-lease.test.js`, `unified-rebalancer-triggers-scheduling.test.js`.
- Coupled: pair `readiness-freshness-macrotask-bound`, contract `readiness-versioned-planning-liveness`.

### S6 — repository visibility modes: census is HINT, decisions are OWNER-FACT · budget part **pre** if H3 says the limits are safety bounds, else post · ~250 lines · fixtures ~13 files
- Files: `replica-operation-repository.js:372-442`, `-incomplete-read-methods.js`, `-visibility-methods.js`,
  `-entity-read-methods.js:159-212, 357-382`, `rebalance-coordinator-operation-read-methods.js`,
  `rebalance-coordinator-priority-budget-helper.js`, `rebalance-coordinator-recovery-helper.js`,
  `operation-workflow-recovery-reconcile.js:333-345`, `operation-workflow-recovery-timeout.js`,
  `unified-rebalancer-budget-planning.js`, `control-plane/replica-dispatch-replay-readiness.js`,
  `rebalance-coordinator-shared.js:199-206`.
- Tests: the 13 files naming `visibilityReadMode`,
  `rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js`.
- Red witness: a durable incomplete operation absent from a non-empty cache gets no recovery turn; a REMOVE is
  admitted on an undercounting cache.
- Shares `operation-workflow-recovery-reconcile.js` with S1 (different functions): serialise S1 → S6.

### S7 — delete the gateway modes · post · ~400 lines net deletion · fixtures ~25 files
- Files: `control-plane-system-table-gateway-constants.js`, `-read-contracts.js`, `-read-dispatch.js`,
  `-read-strategies.js`, `cdc-integration-service-authoritative-read-flow.js`,
  `cdc-integration-service-owner-rpc-read-execution.js`, `cdc-terminal-gate.js` (the SQL-fallback stage), and the
  remaining consumers in `src/query`, `src/partition`, `src/cdc`, `src/policy`, `src/admin`.
- Tests: `test/cdc/authoritative-owner-rpc-sql-fallback.test.js` (deleted), `control-plane-system-table-gateway.test.js`,
  `control-plane-read-authority-token.test.js`, `read-model-contract.test.js`, the 10 files naming
  `replicaFallbackConsistency`.
- Needs a consumer census of `src/query`, `src/partition`, `src/cdc` that this investigation did not do.
- This is the slice that makes the others hold: once the enum members are gone no caller can ask.

### S8 — capability probes and their fixtures · post, parallel · ~80 lines `src` · fixtures 15-20 files, gateway helpers up to ~100
- Three sub-slices with disjoint files: repository probes in the `operation-workflow-*` files of section B;
  gateway helper ladders in `control-plane-system-table-gateway.js`; the adjacent probes.
- Order inside each: migrate the reduced fixtures to the real construction with zero `src` delta, then delete the
  probe with zero test delta.
- Collides with the `strict-operation-outcomes` working tree on three files.

### S9 — dead legacy paths · post, parallel · ~350 lines deletion
- Files: `in-flight-aware-replica-count.js` + 4 tests; the `semanticPlanningEnabled` false arms; the
  operation-progress branch in `priority-recovery-snapshot-actuation.js`; `FALLBACK_LANE`; the unused
  `queryConflictingTerminalAuthorityOperation` pair and repository `getConcurrentRemoveCount` (the last two sit in
  in-flight or S6 files; fold them there).
- `authorizeLegacyRuntimeRemoval`'s deletion waits on the one-time row transition (H5); its hardening is in S3.

Pre/post split: **pre** = S-P, S0, S1, S2, S3, S4, S5 (and S6's budget part pending H3). **Post** = S6 census
part, S7, S8, S9. Parallel sets once S0 has landed: {S1}, {S3}, {S4}, {S5} have disjoint writer sets;
S2 is serialised behind the mutation-port writer; S-P, S8 (gateway sub-slice) and S9 can run at any time.

---

## F. Prior art (only what changes the design)

- **etcd / Raft**: reads are linearizable by default through ReadIndex (the leader confirms leadership with a
  quorum before answering); serializable reads are a separate request option the caller must choose. There is no
  automatic downgrade. → The read's consistency is part of the request type; our witness is weaker than ReadIndex
  and should be named as such (H1).
- **CockroachDB**: consistent reads are served by the leaseholder; a non-leaseholder answers
  `NotLeaseHolderError` with a hint and the client retries. Follower reads exist only as an explicit,
  timestamp-bounded statement form. The allocator plans from gossip (a hint) but every replica change is a
  conditional write on the range descriptor. → Route by hint, verify at the receiver, and let a conditional
  committed write be the grant: this is what S0's widened candidates and the retained-repair model already do.
- **Kubernetes**: controllers act from an informer cache but every write carries a `resourceVersion`
  precondition, and a conflict forces a live GET. The garbage collector does a live quorum read to confirm an
  owner is absent before deleting dependents; a cache miss is never proof of absence. → Exactly SF-5: absence
  needs the authority.
- **FoundationDB**: recovery reads the coordinated state from a quorum of coordinators and locks the previous
  generation before proceeding; it does not consult cached cluster state. Read versions are confirmed against the
  current generation. → Recovery's minimal facts come from the smallest authoritative set, not from serving
  readiness; the same non-circularity S0 has to establish.
- **Shared rule**: staleness is chosen by the caller in the request and carried in the result; a stale read may
  schedule or propose, never authorise; absence is asserted only by the authority; the effect is granted by a
  conditional commit, and an unreachable authority is an answer of its own.

---

## G. Not checked

- No test was run; every reachability claim for SF-1 to SF-4 is inferred from code paths.
- Whether `executeOnPartition` serves a local leader without the routed query transport; whether any strict read
  is issued before the ledger or publications partition has a published canonical leader during cold formation.
- The dispatch-side fences behind SF-1 and SF-2 (epoch gate, create admission, quorum-conditioned remove safety).
- The thirteen `getOperationByIdVisibilityObservation` consumers individually; only five were sampled.
- Individual membership-publication decisions behind `readTableRows`; what the critical-topology endpoint gate releases.
- `REPLICA_STATUS_READ_QUERY_OPTIONS` / `getActualReplicaObservation` (`OWNER_RPC_PREFERRED`) consumers.
- Family-2 consumers in `src/query`, `src/partition`, `src/cdc`, `src/policy`, `src/admin`, `src/bootstrap`.
- `classifyOperationAdoptionError` and the dispatch gate's use of a stale `ALREADY_ACTIVE` reservation.
- Whether terminal operation rows can be deleted and re-created under the same id (retention), which the
  "terminal rows are monotonic" argument depends on.
- Whether stored rows with a null `source_replica_id`, token-less opaque runtime-service rows, or REMOVE/ACTIVE rows can exist.
- Exact fixture breakage per probe; the split of gateway-mock test files into lower-arm-only and full.
- The `sequential_dual_read` and leader-mode-absent detector counts (proposed, not implemented).
- `reconcileOperationLifecycle`'s own reads in the orphan sweep.
- The brief's raw counts were for a five-directory scope; the table in D.2 uses whole-`src` and per-directory
  counts from the fork and does not reproduce the brief's totals exactly.
- User memory files, the in-flight branches themselves, and anything outside the collected runtime checkout.

---

## H. Decisions needed from the lead

1. **What "owner fact" means.** Accept the leader-local witness (`check_quorum` bound: stale for at most one
   election timeout after a partition) with the rule that a read only ever authorises a conditional committed
   write, or add a ReadIndex round to the required mode. The first needs every effect in A.1 to be behind a CAS;
   SF-1 and SF-2 show two that are not.
2. **Non-circular leader discovery for the strict read** (S0): allow the in-process leader arm and widened
   candidates with receiver-side witness verification. Without it, deleting fallbacks makes recovery reads depend
   on leader publication.
3. **Are `maxConcurrentRemoves` / `maxConcurrentAdds` safety bounds or throttles?** Decides whether budget
   admission needs an owner-fact count (and moves S6's budget part before formation).
4. **Who writes S2.** The dual read's definition and the confirmation poll sit inside the canonical-mutation-port
   writer's files. Either that writer takes S2, or S2 waits for its landing. Same question for S1 against the
   `strict-operation-outcomes` working tree.
5. **`authorizeLegacyRuntimeRemoval`**: harden now (S3) and schedule the one-time transition of token-less
   opaque rows, or prove no such row can exist and delete.
6. **Shared primitive now or later.** Extract `readOwnerFact` into a new file in S0 and have the retained-repair
   owner adopt it after it lands, or wait for that owner and extract from it.
7. **Retire the 2026-11-10 checker** in S-P (it is red on this head and unwired), replacing it with the ratchet.
