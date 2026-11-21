# S0 transition record — the canonical owner-fact read and the explicit hint read

Slice S0 of the fallback-read closure (`w4-fallback-read-closure.md`, rulings H1, H2, H6 in `lead-rulings.md`).
Worktree `/mnt/data/peter/projects/.worktrees/owner-fact-read-20261121`, branch `work/owner-fact-read-20261121`,
source read at b638284d1; branch head 8d4fd93d7 (pushed). Stage 1: this record and red witnesses only; no `src`
change. Stage 2 is implemented by another writer from sections 2, 7, 8 and 14.

Marking: **[V]** read by me at b638284d1 · **[F]** read by one of my two read-only forks (file:line given, not
re-read by me) · **[I]** inferred · **[X]** executed on the lab (see section 15).

Contract applied: `architecture/contracts/authority-and-recovery.md` (one owner per fact, no circular recovery
prerequisite, a refusal has an owned consequence), steering R03, R07, R10, R11; checklist of
`docs/steering/workflow-guidelines/solver-quests.md` "Contract-first owner work".

Affected decision: which replica may answer a control-plane/system-table read whose answer an owner will
schedule or propose on. Production path: `gateway.readAuthoritativeRows` → `executeAuthoritativeSystemTableRead`
→ (`executeAuthoritativeOwnerRpcRead` → `QueryExecutor.executeOnPartition` →) `PartitionService.handleRemoteQuery`.

Writable set as assigned: new `src/control-plane/control-plane-owner-fact-read.js`;
`src/cdc/cdc-integration-service-authoritative-read-flow.js`; `src/query/query-executor-partition-routing-candidates.js`;
new `src/rebalancer/replica-operation-repository-owner-fact-read-methods.js` + one registration line in
`replica-operation-repository.js`; tests under `test/{control-plane,cdc,query,rebalancer}`.
**The transition below cannot be completed inside that set**: section 13 lists the further files and why.
Exclusions: no consumer migration, no deletion of fallback modes, no edit of retained-repair files.

---

## 1. Producers and consumers

Existing producers (unchanged owners):

| Symbol | Role | Where |
| --- | --- | --- |
| `PartitionService.buildRemoteReadAuthorityWitness` | the only witness producer: state, partitionId, servingNodeId, servingReplicaId, term, appliedIndex, commitIndex, role, observedAtMs | [V] `src/partition/partition-service-remote-query-methods.js:192-216` |
| `PartitionService.handleRemoteQuery` | the receiver of every routed read; builds the witness, then executes | [V] same file `:329-385` |
| `raft.readStatus()` | the consensus core's own view: outcome, term, commitIndex, appliedIndex, role, leaderId, leaderAddress, lifecycleIncarnation, runtimeGeneration | [V] `src/raft/raft-rs-status-observation.js:66-175` |
| `isValidLeaderReadAuthorityWitness` | witness shape predicate (observed, partition, role leader, serving identity, observedAt) | [V] `src/control-plane/control-plane-authoritative-read-witness.js:22-26` |
| `isCompleteAuthoritativeReadResult` | success, `rowSetComplete === true`, rows array, no partial/failure evidence | [V] `src/control-plane/control-plane-system-table-gateway-read-strategies.js:62-67` |
| `executeAuthoritativeSystemTableRead` | CDC read flow; the required mode skips every local arm | [V] `src/cdc/cdc-integration-service-authoritative-read-flow.js:519-772`, skip at `:615-617` |
| `enforceRequiredLeaderReadAuthority` | today's only leader check: applied by the **caller** after `executeOnPartition` returned | [V] `src/cdc/cdc-integration-service-owner-rpc-read-execution.js:97-116`, used `:482-502` |
| `resolvePartitionServiceCandidates` | leader-required read ⇒ only the published canonical leader's services; none ⇒ no candidates | [V] `src/query/query-executor-partition-routing-candidates.js:167-190` |

New producers (stage 2):

| Symbol | File |
| --- | --- |
| `readOwnerFact(readLeaderRows, draft)`, `buildOwnerFactRequest(draft)`, `ownerFactWitnessRefusal(witness, expectation)`, `isOwnerFactAnswer`, `ownerFactRows`, `readHint(readProjectionRows, draft)`, the constants of section 2 | `src/control-plane/control-plane-owner-fact-read.js` |
| `ReplicaOperationRepository.readOwnerFact(draftWithoutTable)` = `readOwnerFact((_t, sql, params, o) => this.executeReplicaOperationsRead(sql, params, o), {tableName: REPLICA_OPERATIONS, ...})` | `src/rebalancer/replica-operation-repository-owner-fact-read-methods.js` |
| in-process leader arm of the required mode | `cdc-integration-service-authoritative-read-flow.js` |
| leader discovery for a required read | `query-executor-partition-routing-candidates.js` |

Consumers in S0: none migrated. First adopter: `readRetainedRepairAuthority`
([V] `src/rebalancer/replica-operation-retained-repair-authority.js:79-95`), diff in section 12.
Affected without code change: every existing `OWNER_RPC_REQUIRED` + `leaderMode: REQUIRED` caller (45 sites in `src`
by grep [V], and `authoritativeObservationScope: COMPLETE_TABLE`, which forces that pair
[V] `control-plane-system-table-gateway-read-dispatch.js:23-36`): they share the substrate, so they gain the
in-process arm and the discovery, and (if section 9 is adopted for the mode, not only for the function) the
`commit === applied` refusal. Census by caller class in section 11.

---

## 2. Owner-defined shapes

All in `control-plane-owner-fact-read.js`; no other file restates them.

**Request** (frozen; built only by `buildOwnerFactRequest`, closed key set):

```
{ tableName: string            // must have an owner partition: INITIAL_PARTITION_IDS[tableName]
  sql: string, params: Array   // the statement; one single-partition system table
  minimumIndex: integer >= 0   // caller's floor on the serving leader's applied index (0 = no prior knowledge, said explicitly)
  minimumTerm:  integer >= 0   // caller's floor on the serving leader's term
  expectedReplica?: {nodeId, replicaId}   // caller-pinned serving replica (the retained owner's expectedOwner)
  timeoutBudget?: TimeoutBudget }         // the caller's deadline, passed through unchanged
```

There is **no mode field**. Any other key is refused, including `authoritativeReadMode`, `leaderMode`, `strategy`,
`readProfile`, `localReadConsistency`, `replicaFallbackConsistency`, `preferLeader`, whatever their value
(also `REQUIRED`, also `undefined`). A missing or non-integer floor is refused, not defaulted.

**Construction refusal**: `throw new OwnerFactRequestRefusal(code, field)` (a programming error, never a runtime
answer; no read is issued). Codes `OWNER_FACT_REQUEST_REFUSAL`:
`UNKNOWN_FIELD`, `FLOOR_REQUIRED`, `STATEMENT_REQUIRED`, `TABLE_NOT_OWNER_READABLE`, `EXPECTED_REPLICA_MALFORMED`,
`READER_REQUIRED` (the reader port is not a function).

**Reader port**: `readLeaderRows(tableName, sql, params, readOptions) → Promise<gateway read result>`.
`readOptions` is a frozen constant shape the function builds, never derived from caller input:
`{authoritativeReadMode: OWNER_RPC_REQUIRED, leaderMode: REQUIRED, ownerFactFloor: {minimumIndex, minimumTerm}, timeoutBudget?}`.

**Answer** (frozen, and recorded in a module-private `WeakSet`: identity, not shape):

```
{state: 'ready', rows: Array, witness: Witness}
{state: 'unavailable', reason: OWNER_FACT_UNAVAILABLE_REASON[...], retryAfterMs?: integer > 0}
```

`retryAfterMs` is present only when the authority or the transport named a delay; absent means "the caller's own
cadence". Unavailability has no `rows` field. `isOwnerFactAnswer(x)` is the identity test;
`ownerFactRows(x)` returns the rows of a READY answer and throws for anything else (a hint, a look-alike, an
UNAVAILABLE answer). A consumer that requires an owner fact takes its rows only through `ownerFactRows`.

**Reasons** (`OWNER_FACT_UNAVAILABLE_REASON`; the receiver's refusal `failureCode` uses the same values):

| Reason | Meaning | Continuation |
| --- | --- | --- |
| `owner_fact_read_failed` | the read threw or answered failure with no typed owner-fact refusal (no candidate, transport, pressure deferral, deadline) | try again (the owner's existing timer/sweep); `retryAfterMs` when named |
| `owner_fact_not_leader` | the answer's witness is not a valid leader witness for the partition / every candidate refused as non-leader | try again; routing, not data, is unsettled |
| `owner_fact_apply_behind_commit` | a leader whose `appliedIndex !== commitIndex` | try again shortly |
| `owner_fact_below_index_floor` | leader's `appliedIndex < minimumIndex` | try again; a stale or lagging leader |
| `owner_fact_below_term_floor` | leader's `term < minimumTerm` | try again; a deposed leader still answering |
| `owner_fact_unexpected_serving_replica` | witness serving identity ≠ `expectedReplica` | the caller's pin is stale: re-derive it, then try again |
| `owner_fact_incomplete_row_set` | the serving leader did not declare the row set complete | **not here in this shape**: retrying the same statement cannot help; narrow it |

**Witness** (as produced by the serving replica, frozen):
`{state: 'observed', partitionId, servingNodeId, servingReplicaId, term, appliedIndex, commitIndex, role: 'leader', observedAtMs}`.

**Witness predicate** — one function, used by the receiver on its own status and by `readOwnerFact` on the
returned witness: `ownerFactWitnessRefusal(witness, {partitionId, minimumIndex, minimumTerm, expectedReplica}) → null | reason`:
`isValidLeaderReadAuthorityWitness(witness, partitionId)` else `not_leader`; `appliedIndex`, `commitIndex`, `term`
safe integers and `commitIndex === appliedIndex` else `apply_behind_commit`; `appliedIndex >= minimumIndex` else
`below_index_floor`; `term >= minimumTerm` else `below_term_floor`; `expectedReplica` absent or equal to
(`servingNodeId`, `servingReplicaId`) else `unexpected_serving_replica`. This is the retained owner's
`currentWitness` ([V] `replica-operation-retained-repair-authority.js:40-53`) term for term, with the partition a
parameter instead of `LEDGER_PARTITION_ID`.

**Hint** (`readHint(readProjectionRows, {tableName, cachePredicate?})`): a different state vocabulary and no
identity: `{state: 'hint_observed', rows}` | `{state: 'hint_unavailable', reason}` (`CONTROL_PLANE_HINT_STATE`).
`isOwnerFactAnswer(hint) === false`; `ownerFactRows(hint)` throws. Source: the node's projection through
`gateway.readProjectionRows` ([V] `control-plane-system-table-gateway-query-execution.js:511-516`), one source.
Open question Q5 (section 13): whether a hint over a non-propagated table needs the local replica as its source.

**Wire** (receiver-side refusal, section 9): request field `ownerFactRead: {minimumIndex, minimumTerm}`;
refusal answer `{success: false, failureCode: <reason>, partitionId, readAuthorityWitness, retryAfterMs?, redirect?, leaderAddress?}`
with no `rows`/`rowSet`.

---

## 3. Identity and generation

| Hop | Carried | Meaning |
| --- | --- | --- |
| request | `tableName` → `INITIAL_PARTITION_IDS[tableName]` | subject: one system table = one partition = one raft group [V `cdc-integration-service-authoritative-read-flow.js:265-288`] |
| request | `minimumIndex`, `minimumTerm` | a **read version floor**: a position in that group's log (index) and the newest term the caller has seen. Not a routing or membership epoch. Source: the caller's own last committed mutation answer (`logIndex`, `term`; the retained owner does this [V] `replica-operation-repository-retained-placement-repair.js:188-189, 314-316`) or a previous witness |
| request | `expectedReplica` | authority identity pin, optional |
| witness | `servingNodeId`, `servingReplicaId`, `partitionId` | who executed the read |
| witness | `term`, `appliedIndex`, `commitIndex` | the core's `readStatus()` values [V `:197-209`] |
| witness | `role` | **today the service's event-derived field `this.role`** [V `:210`], set by port events and able to lag or diverge from the core ([F] `src/raft/replica-leadership-state.js:62-66, 94-98, 158-186`, `partition-service-raft-lifecycle-wiring.js:188-197`). Stage 2 must take role (and a `CORE_OK` outcome) from the same `readStatus()` observation as the indices; one observation, one source. Producer file is outside the writable set (section 13) |
| witness | `observedAtMs` | the serving replica's clock; diagnostic only, never compared across nodes |
| not carried | boot incarnation | the raft owner has `lifecycleIncarnation` and `runtimeGeneration` in `readStatus()` [V `raft-rs-status-observation.js:155, 174`]; the witness producer forwards neither. Not needed for the floor: (term, index) is a position in the group's log, the same for every incarnation of every replica. Proposed (Q4): forward `lifecycleIncarnation` so `expectedReplica` can pin an incarnation |
| routing | published `leader_node_id` | a **routing hint** only (ordering of candidates); never part of the answer's authority |

---

## 4. Ordering and freshness

What READY guarantees (mechanism in brackets):
1. The rows are the result of the statement on the state machine of the replica named in the witness, at a log
   position **at or after** `witness.appliedIndex` [the witness is taken before the read executes and applied
   index is monotonic: receiver order at `partition-service-remote-query-methods.js:369-381` [V]; the in-process
   arm must use the same receiver entry — the existing local path takes its witness **after** an awaited read
   ([V] `cdc-integration-service-authoritative-read-flow.js:316-334`), which can overstate the rows' position
   against a floor, so the in-process arm must not reuse it].
2. At witness time that replica held the leader role in `term` by its own consensus core and had applied
   everything it knew committed (`commitIndex === appliedIndex`).
3. `appliedIndex >= minimumIndex`: a caller that passes the log index of its own committed write reads a state
   that contains that write [a leader's commit index only covers quorum-committed entries, and a committed
   entry is in every later leader's log].
4. `term >= minimumTerm`: no answer from a leader of a term older than one the caller has already seen.

What it does **not** guarantee:
- That the serving replica was still the leader when it answered. No ReadIndex round is made. With
  `check_quorum` on ([V] `src/raft/raft-rs-group-constants.js:18-23`) a leader cut off from its quorum steps
  down after one election timeout ([F]: `electionTick = max(4, ceil(electionMinMs / tick))`, tick 50 ms,
  `electionMinMs` 1000 ms + 2500 ms per replica index, `src/raft/raft-rs-runtime-tuning.js:14-37`,
  `src/raft/constants.js:36-46`; that the bound uses the non-randomised timeout is [I]). Honest wording for the
  contract text: **an owner fact is the leader's applied state, stale by at most the check_quorum bound at the
  moment it was answered, plus the answer's transit time, which the caller's own read deadline bounds.**
- Linearizability, a consistent cut across partitions or tables, or any cross-node clock relation.
- Anything about what happens after the read. Therefore (H1): an owner fact may schedule or propose; **it never
  authorises an effect**. Every effect is granted by a conditional committed write.

Durable commit point: none. This transition is a read; it persists nothing and creates no authority.

---

## 5. Absent versus unavailable

- **Absent** = `{state: 'ready', rows: []}` and nothing else: a complete, empty row set asserted by the leader
  whose witness the answer carries.
- Every other outcome is `{state: 'unavailable', reason}`. There is no `null`, no `[]`, no `0`, no `false`.
- `rowSetComplete` is established by the serving replica's read executor, which sets it only when it returned
  the statement's whole result ([V] `src/partition/partition-service-write-metrics-base.js:150-175, 251-262`,
  `partition-statement-admission.js:481-491`); `remoteQueryAnswer` forwards it only for a non-partial success
  ([V] `partition-service-remote-query-methods.js:147-165`); the executor copies the boolean
  ([V] `query-executor-partition-request-builders.js:245-248`); the CDC flow and the gateway recompute it from
  that boolean and from the absence of partial/failure evidence
  ([V] `cdc-integration-service-owner-rpc-read-execution.js:56-62`,
  `control-plane-system-table-gateway-read-strategies.js:50-67, 183-201`). `readOwnerFact` requires
  `isCompleteAuthoritativeReadResult(answer)`; otherwise `owner_fact_incomplete_row_set`.
  A system table has exactly one partition ([V] `haveAllExpectedSystemTablePartitions`,
  `cdc-integration-service-authoritative-read-flow.js:265-288`), so one replica's complete row set is the complete
  answer for the statement. Completeness is of the **statement's** result; a census needs a census statement.
- A refusing receiver sends no rows (section 9), so follower data is never on the wire for an owner-fact read.

---

## 6. Retained obligations

None are created, held or released. In-flight mutations are unaffected. The read holds no lease and no
reservation. A caller that got UNAVAILABLE keeps exactly the obligations it had; its existing continuation
(timer, sweep, rearm) is the owner of the retry — `readOwnerFact` never retries on its own and never sleeps.

---

## 7. Candidate selection (routing to the one authority)

For a request on table T (partition P) issued on node N:

0. `buildOwnerFactRequest` refuses a malformed draft (no read).
1. **In-process arm** (CDC read flow, required mode only). Resolve the replicas of P hosted in this process
   (`resolveLocalSystemTableServices`, [V] `cdc-integration-service-local-system-table-routing.js:438-484`).
   For a replica whose consensus core reports the leader role, call **the same receiver entry the RPC reaches**
   (`handleRemoteQuery` with the owner-fact field) in process: no routing projection, no query engine, no
   transport. A READY-shaped answer whose witness passes the predicate is the answer. Any refusal or a missing
   local leader → step 2.
2. **Owner RPC arm** (`executeOnPartition`, leader-required). Candidates, in order, from the routing snapshot's
   routable services of P (for a system partition every active, addressed replica is routable:
   [V] `query-executor-partition-service-resolution.js:230-238`): the published leader's services first (a hint);
   then, when there is no published leader or none of its services is usable, every other routable replica,
   this node's first. Each candidate is asked the same request; a replica that does not lead refuses (section 9),
   with a redirect to the leader's committed address when it knows one. The first answer whose witness passes
   the predicate wins.
3. Exhaustion → `unavailable` with the most specific reason seen (a leader's own refusal over `not_leader` over
   `read_failed`).

Why it cannot return non-leader data:
- (a) The only code that produces a success for an owner-fact read is a receiver that has just applied the
  predicate to its own core status and passed.
- (b) `readOwnerFact` applies the same predicate to the witness that came back, so an answer that travelled a
  path which did not enforce (a) — a coalesced read issued for another caller's floors, a receiver that never
  saw the field — is still refused.
- (c) No arm reads `any_replica`, the cache, or the SQL engine; step 1 goes through the receiver, not through
  `executeLocalQuery`.
- (d) A refusal carries no rows.
- Residual, stated in section 4: the leader's own belief is the witness.

This is one algorithm (ask a replica; it answers only if it leads and meets the floors) with two transports
(in process, routed). It is not a fallback ladder: no step returns a weaker answer than another.

**Unsettled, needs a ruling (Q1):** whether step 2 offers the non-published replicas *always* (H2 read
literally) or only *when the published leader is absent, unusable, or has refused*. The difference is observable:
`test/query/query-executor-recovery-read-lifetime.test.js:436-457` [V] pins that a leader-required read **drops**
the former leader's held answer once the publication names a new leader. That holds today because the former
leader stops being a candidate (`readDelivery.currentIn`, [V] `src/query/query-executor-recovery-read-delivery.js:59-62`).
With flat widening the former leader stays a candidate and its pre-transfer answer (a real leader witness of the
older term) would be accepted. The delivery owner already has the mechanism for the narrower rule: "a typed
redirect from the still-selected owner may lead publication" ([V] same file `:131-149`), which today only writes
trigger because the receiver redirects only writes ([V] `partition-service-remote-query-methods.js:340-348`).

---

## 8. Receiver-side refusal, and how a continuation learns "try again" versus "not here"

Today the receiver never refuses a read: it answers with whatever role it has and the caller rejects the
answer afterwards ([V] `partition-service-remote-query-methods.js:369-381`,
`cdc-integration-service-owner-rpc-read-execution.js:97-116`). Because the rejection happens after
`executeOnPartition` has returned its first success ([V] `query-executor-partition-delivery.js:431-445`), no
second candidate is ever tried: widening candidates without moving the check is ineffective.

Required: a request carrying `ownerFactRead: {minimumIndex, minimumTerm}` is leader-routed by the receiver
exactly as a write is ([V] `writeRoutingRefusal`, `:98-118`). Before executing, the receiver takes one
`readStatus()` observation, builds the witness from it, and applies `ownerFactWitnessRefusal`:

| Receiver state | Answer | Meaning to the routing loop | Meaning to the caller |
| --- | --- | --- | --- |
| leads, applied = commit, floors met | executes; success + witness | answer | READY |
| does not lead | `failureCode: owner_fact_not_leader`, plus `redirect` + `leaderAddress` when its core names a leader with a committed address | **not here**: follow the redirect, else next candidate | (only if no candidate leads) `unavailable/not_leader` |
| leads, `applied !== commit` | `owner_fact_apply_behind_commit`, `retryAfterMs` | **here, not yet**: other candidates cannot lead this term | `unavailable/apply_behind_commit` + `retryAfterMs` |
| leads, below a floor | `owner_fact_below_index_floor` / `_term_floor` | the caller knows a newer position than this leader: try the next candidate | `unavailable/below_*_floor` unless another candidate answers |
| status not `CORE_OK` (held, recovering) | `owner_fact_not_leader` (no leadership claim can be made) | not here | as above |
| field malformed | refusal, not retryable | stop | `read_failed` (cannot occur through `readOwnerFact`) |

The caller's continuation branches on `state` only for the decision, and on `reason` only to choose between
"keep the turn scheduled" (every reason but one) and "this statement cannot be answered" (`incomplete_row_set`).
No continuation may treat any UNAVAILABLE as a fact about the data (SF-5, SF-6 of the W4 report).

---

## 9. Canonical wake, cleanup, cancellation

- No state, timer, cache or subscription is created by either read. Nothing to deregister.
- Cancelling a wait: the caller's `timeoutBudget` (and the gateway's `cancellationToken`/`signal`) travel
  unchanged; the executor's per-invocation read delivery owns its submissions and disposes them
  ([V] `query-executor-recovery-read-delivery.js:150-155`).
- Stopping execution: an abandoned read at the receiver is a pure read; it completes or is dropped with the
  delivery, with no effect to settle.
- Late answers: dropped by the invocation scope; nothing retained.
- Gateway single flight ([V] `control-plane-system-table-gateway-read-dispatch.js:108-178`): two callers with
  different floors may share one read; each validates the shared answer against its own floors (section 7 (b)).
  Whether the floors belong in the request key is a stage-2 detail [I].
- Wake: none owned here. The owner whose turn got UNAVAILABLE is re-driven by its existing trigger.

---

## 10. Cold formation: can a strict read be issued before a canonical leader is published, and what happens

**Yes, strict reads are issued throughout formation**; the leader-publication premise fails in specific windows.

Callers that run during bootstrap or formation (all `OWNER_RPC_REQUIRED` + leader `REQUIRED` unless noted):

| Site | Table | When | On failure today |
| --- | --- | --- | --- |
| [V] `src/bootstrap/seed-original-registration.js:23-27` | SERVICES, CONFIG, publications | seed REGISTRATION | [F] not RPC-strict: `OWNER_LOCAL_ONLY` + leader REQUIRED + `LOCAL_LEADER`; `observe` returns false `:38-45` |
| [V] `src/partition/partition-service-row-owner.js:125` | SERVICES | after a failed registration insert, every replica registration | [F] caught → `null` row `:115-139` |
| [V] `src/bootstrap/owners/service-registration-visibility-owner.js:170` | SERVICES | registration visibility, seed and joiner | [F] `{row: null, error}` |
| [V] `src/control-plane/owners/node-registration-incarnation-write.js:59` | NODES | node registration | [F] `{available: false}` → UNRESOLVED |
| [V] `src/control-plane/owners/endpoint-incarnation-authority.js:63` | endpoint tables | endpoint publication at start/join | [F] `AUTHORITY_UNAVAILABLE` |
| [V] `src/control-plane/owners/control-plane-publications-owner.js:110` | publications | every `getPublication` (membership publication, active gate) | [F] throws `publicationAuthorityUnavailable` |
| [V] `src/node/replica-create-admission-owner.js:63` | `replica_operations`, NODES | target-side CREATE admission of every ADD | [I] typed admission error |
| [V] `src/partition/partition-replica-admission.js:153` | `replica_operations` | learner/target admission | [F] authority-unavailable with a retry hint |
| [V] `src/control-plane/authoritative-control-plane-view.js:535` | readiness owner rows | readiness decisions | [I] stays not-ready |

Where the canonical leader comes from:
- The seed writes every system PARTITIONS row with `leader_node_id = seed` at registration
  ([V] `src/bootstrap/seed-foundation-rows.js:43-58`). So on the seed, once rows exist, a leader **is** published.
- In production the executor takes leader identity from the bootstrap topology owner; only an owner-confirmed
  row or a retained-runtime identity yields a leader; a SERVICES `raft_role` does not
  ([F] `src/query/canonical-leader-routing.js:163-171, 246-290`,
  `src/query/query-executor-canonical-leader-routing-methods.js:31-46` [V]).
- The publication writers are the seed rows, `PartitionServiceRowOwner.publishCanonicalLeaderNodeId`, and the
  leadership edge (`applyReplicaLeadership` → `queueLeaderNodeUpdate`, [V] `src/raft/replica-leadership-state.js:62-81`).
  The gating read of that last one is `OWNER_RPC_PREFERRED` today ([F]
  `src/partition/partition-service-metadata-mutation-helpers.js:127-166`): **no strict-read circularity exists
  today; it appears the moment that read is made strict without S0.**

Windows in which a strict read finds no usable leader or no route:
1. **Seed before CACHE_HYDRATION**: the CDC service has no SQL engine ([F]
   `src/bootstrap/shared/cdc-integration-setup.js:85-125`), so the owner-RPC arm returns `null`
   ([V] `cdc-integration-service-owner-rpc-read-execution.js:397-403`) and the flow answers
   `AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE` ([V] `...authoritative-read-flow.js:755-771`) although the seed hosts
   every leader. [X] witness 1, case 2.
2. **Demotion**: the deposed leader's node clears its own `leader_node_id` projection
   ([V] `src/raft/replica-leadership-state.js:83-102`).
3. **Fresh election before the durable publication commits.**
4. **Stale publication** (names a deposed node). [X] witness 2.
5. [X] witness 1, case 1: projection without a canonical leader on the node that hosts the leader.

Does `executeOnPartition` serve a local leader without the routed query transport?
- **Delivery: yes.** For a QUERY message to a locally registered address with no query message-group service
  selected, the router calls `deliverLocal` ([V] `src/transport/message-router-delivery-pressure-routing.js:286-302`);
  with a service selected it goes through that service's direct send and re-enters `deliverLocal`
  ([F] `message-group-service-outbound-dispatch-runtime-methods.js:65-108, 216-226, 290-305`). No socket to self.
  The required mode also proceeds past a not-ready query transport, because `allowOwnerRpcFallback` is true for
  it ([V] `control-plane-system-table-gateway-read-contracts.js:191-199`, `...authoritative-read-flow.js:638-671`).
- **Routing: no.** `executeOnPartition` needs a router, a system cache, an ACTIVE addressed SERVICES row for the
  replica in that cache, and — for REQUIRED — a published leader equal to that row's node
  ([V] `query-executor-partition-delivery.js:132-147`, `query-executor-partition-routing-snapshot.js:37-66`,
  `query-executor-partition-routing-candidates.js:167-190`). And the CDC flow needs a query engine at all.
  So the circular prerequisites are the projection and the engine, not the socket.

With this design, a strict read issued on the seed before any leader is published:
1. Request built. 2. In-process arm: the seed's replica of P is in the CDC provider map (seed
   `() => d.getPartitionServices()`, [V] `src/bootstrap/owners/seed-runtime-bridge-owner.js:54`; in bootstrap mode
   `localPartitionServices`, [V] `cdc-integration-service-local-system-table-routing.js:405-414`), its core says
   leader (sole voter), the receiver entry is called in process, the witness passes, READY.
   Neither the projection, the engine nor the transport is consulted.
3. On a joiner (hosts no leader): step 2 of section 7 needs ACTIVE addressed SERVICES rows in its projection and
   a route to a replica; that is discovery of *where replicas are*, which the joiner needs to exist at all. It
   no longer needs to know *which one leads*.

Limits found, not repaired by S0:
- A read that reaches the CDC flow without a frozen `readAuthority` token fails first with
  `READ_AUTHORITY_REQUIRED` ([V] `...authoritative-read-flow.js:526-533`); the bootstrap writer's
  `readAuthoritativeRows` passes plain options ([F] `src/bootstrap/system-table-writer.js:53-57`).
- **The CDC provider map holds only bootstrap/join-created replicas.** Replicas the ReplicaHandler creates later
  live in `replicaHandler.localServices`; bootstrap copies its map *into* that registry
  ([V] `src/bootstrap/bootstrap-service-replica-registration-methods.js:297-298`) and I found nothing copying
  back ([V] by grep: the only `partitionServices.set` is `seed-partitions-phase.js:273`, plus
  `exposePartitionConstruction`). So on a node whose ledger leader replica was created by an ADD or REPLACE,
  the in-process arm finds nothing and the read needs the routed arm (which then reaches the local replica in
  process, given its SERVICES row). Today's `OWNER_LOCAL_*` arms have the same blind spot. Q3.

---

## 11. Adoption by the retained-repair owner

The shared predicate is a parameterised copy of `currentWitness`; moving it would require deleting two functions
and a constant in `replica-operation-retained-repair-authority.js`, which is more than an import, so the file is
left alone and the adoption diff is given for the lead (to apply at merge, H6):

```diff
--- a/src/rebalancer/replica-operation-retained-repair-authority.js
-import {isValidLeaderReadAuthorityWitness} from '../control-plane/control-plane-authoritative-read-witness.js';
-import {isCompleteAuthoritativeReadResult} from '../control-plane/control-plane-system-table-gateway-read-strategies.js';
-import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
-  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE} from '../control-plane/control-plane-system-table-gateway-constants.js';
+import {OWNER_FACT_STATE, OWNER_FACT_UNAVAILABLE_REASON} from
+  '../control-plane/control-plane-owner-fact-read.js';
@@
-const READ_OPTIONS = Object.freeze({authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
-  leaderMode: LEADER_MODE.REQUIRED});
@@
-function witnessMatchesExpectedOwner(witness, attempt) { ... }
-function currentWitness(witness, attempt) { ... }
@@ async function readRetainedRepairAuthority(repository, attempt, scope) {
   const plan = readPlan(attempt, scope);
-  let answer;
-  try {
-    answer = await repository.executeReplicaOperationsRead(plan.sql, plan.params, READ_OPTIONS);
-  } catch {
-    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.READ_FAILED);
-  }
-  if (!isCompleteAuthoritativeReadResult(answer) ||
-      !currentWitness(answer.readAuthorityWitness, attempt) ||
-      !completeRows(repository, answer.rows, attempt, plan)) {
+  const fact = await repository.readOwnerFact({sql: plan.sql, params: plan.params,
+    minimumIndex: attempt.minimumLedgerIndex, minimumTerm: attempt.minimumLedgerTerm,
+    ...(attempt.expectedOwner === null ? {} : {expectedReplica: attempt.expectedOwner})});
+  if (fact.state !== OWNER_FACT_STATE.READY) {
+    return unavailableRepairAuthority(
+      fact.reason === OWNER_FACT_UNAVAILABLE_REASON.READ_FAILED ?
+        REPAIR_AUTHORITY_REFUSAL.READ_FAILED : REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED);
+  }
+  if (!completeRows(repository, fact.rows, attempt, plan)) {
     return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED);
   }
-  return {state: REPAIR_AUTHORITY.READY, rows: answer.rows,
-    census: answer.rows.map(censusRowOf), completeCensus: plan.ids === null,
-    witness: answer.readAuthorityWitness};
+  return {state: REPAIR_AUTHORITY.READY, rows: fact.rows,
+    census: fact.rows.map(censusRowOf), completeCensus: plan.ids === null,
+    witness: fact.witness};
 }
```

Equivalence, term by term [V against `:40-53, :79-95`]: partition (`LEDGER_PARTITION_ID` =
`replica_operations-p1` = `INITIAL_PARTITION_IDS.replica_operations`, [V]
`src/partition/partition-placement-admission-decision.js:39-42`); leader witness shape; safe-integer applied,
commit, term; `commit === applied`; both floors inclusive; optional serving pin on (`nodeId`, `replicaId`);
complete row set. `completeRows` (row-shape validation against the canonical operation row) is the retained
owner's own and stays. One behavioural difference: a read that *answers* failure maps to `READ_FAILED` where
today it maps to `UNQUALIFIED`; the reason is not exported and its only consumer branches on `state`
([V] `replica-operation-repository-retained-placement-repair.js:311-316`). `attempt.minimumLedgerIndex/Term` start at
0 ([V] `replica-operation-retained-repair-record.js:14`), which is the explicit "no prior knowledge" floor.

---

## 12. Witnesses

| # | Property | File | Red because |
| --- | --- | --- | --- |
| 1 | the node hosting the ledger leader gets its owner fact with no published leader, and with no query engine | `test/cdc/cdc-owner-required-authoritative-routing.test.js` (second test; the file's first test is the existing one) | behaviour, through the existing strict read |
| 2 | a stale published leader refuses typed with no rows; the replica that leads answers | `test/cdc/cdc-owner-fact-stale-published-leader.test.js` | behaviour, through the existing strict read |
| 3 | an empty answer from a non-leader is never absence; READY carries the leader's witness; floors, pin, in-process arm | `test/cdc/cdc-owner-fact-non-leader-absence.test.js` | **the owner function is absent** |
| 4 | no mode can be named, omitted into a default, or misspelled; floors, statement, table, reader required; a hint is not an owner fact | `test/control-plane/control-plane-owner-fact-read.test.js` | **the owner function is absent** |

Witnesses 3 and 4 are properties of a function that does not exist. `test/guidelines/fixtures.md:120-122` says a
missing-method failure does not establish a product defect, and it does not here: they are acceptance witnesses
of the new owner. In stage 2 each is to be shown able to fail for its own invariant by running it against
deliberately weakened variants (accept a follower witness; spread the caller's options over the token; default a
missing floor; drop the identity check) and recording those runs.

Fixture (`test/cdc/cdc-owner-fact-group-fixture.js`): real — three `PartitionService` replicas of
`replica_operations-p1` on raft-rs (`formAdmittedGroup`), per node a `MessageRouter`, `QueryExecutor`,
`CDCIntegrationService`, `ControlPlaneSystemTableGateway`, a real leadership transfer. Substituted — query channel
transit between routers (recorded; can make a node unreachable) and the routing projection rows. Ceiling — one
process; rows seeded straight into each replica's database; no bootstrap, CDC propagation or node lifecycle.

---

## 13. What stage 2 needs that the assignment does not give, and open questions

Files beyond the writable set, each with the reason:

| File | Why |
| --- | --- |
| `src/partition/partition-service-remote-query-methods.js` | the receiver-side refusal (H1/H2 as ruled); the witness must take `role` from the same `readStatus()` as the indices |
| `src/query/query-executor-partition-request-builders.js` | the request must carry `ownerFactRead` to the receiver ([V] it carries nothing about leader requirement today, `:129-161`) |
| `src/control-plane/control-plane-system-table-gateway-options.js` (or `…-read-contracts.js` if the floors ride in the frozen token) | the gateway builds query options from an allow-list ([V] `:17-60`): a floor passed in read options is dropped |
| `src/cdc/cdc-integration-service-owner-rpc-read-execution.js` | the caller-side rejection there must become the shared predicate and must surface the receiver's typed reason and `retryAfterMs` instead of `authoritative_query_failed` |
| possibly `src/query/query-executor-partition-delivery.js` / `query-executor-write-retry-routing.js` | only under Q1 option C |
| possibly `src/bootstrap/owners/seed-runtime-bridge-owner.js`, `src/bootstrap/node-joining-publication-activation.js` | only if Q3 is ruled in scope |
| `test/query/query-executor-recovery-read-lifetime.test.js` | only under Q1 option A |

Questions for the lead:

- **Q1. Discovery rule.** (A) flat widening as H2 reads: every routable replica is a candidate, published leader
  first. Changes the pinned behaviour of `query-executor-recovery-read-lifetime.test.js:436` (a former leader's
  pre-transfer answer becomes acceptable). (B) redirect-first: candidates stay the published leader's replicas
  when it is published and usable; the deposed replica's typed refusal carries the leader redirect the delivery
  owner already follows; widen only when no leader is published or none of its services is usable. Keeps `:436`.
  Residual: a stale published leader that knows no leader keeps the read unavailable until it learns one
  (a connected follower learns within a heartbeat). (C) = B plus widening after a typed non-leader refusal with
  no redirect, which needs the delivery owner's files. My recommendation: B now, C if the lab shows the residual.
- **Q2. Scope of the receiver refusal.** Applies to (i) only requests issued by `readOwnerFact`, or (ii) every
  existing `OWNER_RPC_REQUIRED` + leader `REQUIRED` read (45 sites + COMPLETE_TABLE)? (ii) is what "owner fact =
  today's strict read" means and removes follower data from the wire for all of them, but adds the
  `commit === applied` refusal to consumers S0 was told not to migrate. Floors for (ii) would be zero, explicit
  in one constant at the single sender.
- **Q3. In-process arm source.** The CDC provider map misses handler-created replicas (section 10). Point the
  provider at the ReplicaHandler registry (a superset) in this slice, or record it as its own unit?
- **Q4. Incarnation in the witness.** Forward `lifecycleIncarnation` from `readStatus()` and allow
  `expectedReplica` to pin it?
- **Q5. Hint source.** Projection only (one source), or the local replica for non-propagated tables? S6 will
  need the answer; S0 only needs the type separation.
- **Q6. `fixtures.md:120-122`.** Accept witnesses 3 and 4 as acceptance witnesses with stage-2 mutation runs, or
  require a different red?

Out-of-scope findings (recorded, not touched):

- The witness's `role` is the service's event-derived field while its indices are the core's ([V], section 3):
  every existing strict read accepts a leader claim the core may no longer hold. Owner: partition service.
- The existing local read path builds its witness after an awaited read
  ([V] `cdc-integration-service-authoritative-read-flow.js:316-334`): a floor checked against it can be passed
  by rows older than the floor. Affects `OWNER_LOCAL_*` consumers that compare indices. Owner: CDC read flow (S7).
- The bootstrap topology owner derives the canonical leader from a merge of `SELECT * FROM partitions` over
  every initialized local replica of the partitions partition, of any role, held for a TTL
  ([F] `src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js:119-200, 446-490`): an
  any-replica read feeding leader identity; sibling of W4 family 2.
- `enforceRequiredLeaderReadAuthority` checks neither `commit === applied` nor any floor: a freshly elected
  leader that has not applied its log answers an empty set that 44 strict consumers read as absence (only the
  retained owner checks). Sibling of SF-5.
- The CDC provider map / ReplicaHandler registry split (Q3) also limits today's `canWriteSystemTableLocally`
  and every `OWNER_LOCAL_*` read on nodes whose replicas were created after bootstrap [I on reachability].
- `test/cdc/cdc-owner-required-authoritative-routing.test.js` (first test) pins that a strict read never enters
  the local stub; the stub is a hand-built local service with no witness
  (`createLocalSystemTablePartitionServices`). It will keep passing only if the in-process arm requires a
  replica whose core leads; noted so stage 2 checks it rather than discovers it.
- **That first test is red on this line for a reason unrelated to S0** ([X], section 15): its transit stub hands
  the caller router's `deliveryLifetime` to the owner router's `deliverLocal`, which the delivery-lifetime owner
  refuses (`router_delivery_lifetime_invalid`, [V] `src/transport/message-router-delivery-lifetime.js:243-248`),
  and it asserts `budget.timeoutMs`, a field the transport options no longer carry. Remote cases fail; the
  same-host case fails only the budget assertion. Witness 1 was added to the same file as a second test, so the
  file stays red after stage 2 until that first test is repaired by its owner (the repair is the two-line
  transit change the new group fixture uses: pass `{timeoutMs: deliveryLifetime.remainingMs(), signal}`).

---

## 14. Stage-2 edit set, file by file

Written for an implementer without this session's context. It assumes the rulings recommended above
(Q1 = B, Q2 = ii); the lines that change under another ruling are marked. Items 2-5 and 9 are outside the
assigned writable set and need the lead's go-ahead first.

**1. New `src/control-plane/control-plane-owner-fact-read.js`** (imports only: `INITIAL_PARTITION_IDS`,
`isValidLeaderReadAuthorityWitness`, `isCompleteAuthoritativeReadResult`, the two mode enums). Exports, exactly as
`test/control-plane/control-plane-owner-fact-read.test.js` and `test/cdc/cdc-owner-fact-non-leader-absence.test.js`
import them: `OWNER_FACT_STATE {READY:'ready', UNAVAILABLE:'unavailable'}`, `OWNER_FACT_UNAVAILABLE_REASON`
(the seven values of section 2, keys `READ_FAILED, NOT_LEADER, APPLY_BEHIND_COMMIT, BELOW_INDEX_FLOOR,
BELOW_TERM_FLOOR, UNEXPECTED_SERVING_REPLICA, INCOMPLETE_ROW_SET`), `OWNER_FACT_REQUEST_REFUSAL` (keys
`UNKNOWN_FIELD, FLOOR_REQUIRED, STATEMENT_REQUIRED, TABLE_NOT_OWNER_READABLE, EXPECTED_REPLICA_MALFORMED,
READER_REQUIRED`), `class OwnerFactRequestRefusal extends TypeError {code, field}`,
`CONTROL_PLANE_HINT_STATE {OBSERVED:'hint_observed', UNAVAILABLE:'hint_unavailable'}`, `buildOwnerFactRequest`,
`ownerFactWitnessRefusal`, `readOwnerFact`, `readHint`, `isOwnerFactAnswer`, `ownerFactRows`.

```
buildOwnerFactRequest(draft):
  for key of Object.keys(draft): not in {tableName, sql, params, minimumIndex, minimumTerm, expectedReplica, timeoutBudget}
      -> throw Refusal(UNKNOWN_FIELD, key)            // a key present with value undefined is refused too
  INITIAL_PARTITION_IDS[tableName] missing            -> Refusal(TABLE_NOT_OWNER_READABLE, 'tableName')
  sql not a non-empty string                          -> Refusal(STATEMENT_REQUIRED, 'sql')
  params not an array                                 -> Refusal(STATEMENT_REQUIRED, 'params')
  minimumIndex / minimumTerm not a safe integer >= 0  -> Refusal(FLOOR_REQUIRED, that field)
  expectedReplica present and not {nodeId: non-empty string, replicaId: non-empty string}
                                                      -> Refusal(EXPECTED_REPLICA_MALFORMED, 'expectedReplica')
  return frozen {tableName, partitionId, sql, params, minimumIndex, minimumTerm, expectedReplica?, timeoutBudget?}

readOwnerFact(readLeaderRows, draft):                 // async
  typeof readLeaderRows !== 'function'                -> throw Refusal(READER_REQUIRED, 'readLeaderRows')
  request = buildOwnerFactRequest(draft)              // throws before any read
  readOptions = frozen {authoritativeReadMode: OWNER_RPC_REQUIRED, leaderMode: REQUIRED,
                        ownerFactFloor: frozen {minimumIndex, minimumTerm}, timeoutBudget?}
  answer = await readLeaderRows(tableName, sql, params, readOptions)   // a throw -> unavailable(READ_FAILED)
  answer.success !== true -> unavailable(answer.failureCode if it is one of the reasons, else READ_FAILED;
                                         retryAfterMs when finite and > 0)
  reason = ownerFactWitnessRefusal(answer.readAuthorityWitness, {partitionId, minimumIndex, minimumTerm, expectedReplica})
  reason !== null -> unavailable(reason)
  !isCompleteAuthoritativeReadResult(answer) -> unavailable(INCOMPLETE_ROW_SET)
  return issue(frozen {state: READY, rows: answer.rows, witness: frozen copy of the witness})
unavailable(reason, retryAfterMs?) = issue(frozen {state: UNAVAILABLE, reason, ...(retryAfterMs ? {retryAfterMs} : {})})
issue(x): add x to a module-private WeakSet; isOwnerFactAnswer = WeakSet.has
ownerFactRows(x): issued and READY -> x.rows; otherwise throw TypeError
readHint(readProjectionRows, {tableName, cachePredicate?}): typed draft checks as above;
  result = await readProjectionRows(tableName, {cachePredicate}); success === true and rows an array
  -> frozen {state: 'hint_observed', rows}; otherwise frozen {state: 'hint_unavailable', reason: 'hint_read_failed'}
  (never issued into the WeakSet)
```

**2. `src/partition/partition-service-remote-query-methods.js`** (receiver; not in the assigned set).
(a) `buildRemoteReadAuthorityWitness`: take one `status = this.raft?.readStatus()`; `role` from `status.role`
when `status.outcome` is `CORE_OK`, never from `this.role`. (b) `handleRemoteQuery`: after `isWriteOperation`,
when `payload.ownerFactRead` is present on a read: require `{minimumIndex, minimumTerm}` safe integers >= 0
(else refuse `failureCode: 'owner_fact_request_malformed'`); build the witness **before** executing; `reason =
ownerFactWitnessRefusal(witness, {partitionId: this.partitionId, minimumIndex, minimumTerm})`; when non-null
return `{success: false, error: reason, failureCode: reason, partitionId, readAuthorityWitness: witness}` plus,
for `owner_fact_not_leader`, `redirect: LEADER_REDIRECT, leaderAddress` when `this.resolveLeaderAddress()` does
not throw (as `writeRoutingRefusal` does at `:98-118`), and for `owner_fact_apply_behind_commit` a `retryAfterMs`
of one raft tick. No statement is executed for a refused read. Under Q2 = i the field is stamped only for
`readOwnerFact` reads; under ii for every leader-REQUIRED read.

**3. `src/query/query-executor-partition-request-builders.js`** (not in the assigned set).
`createDefaultPartitionRequestBuilder`: when `forRead` and `executionOptions.readAuthority?.leaderMode === REQUIRED`,
stamp `request.ownerFactRead = executionOptions.ownerFactFloor ?? NO_OWNER_FACT_FLOOR` (`{minimumIndex: 0,
minimumTerm: 0}`, one named constant exported by the owner module). The field-name constant lives in the owner
module and is imported by this file and by item 2.

**4. `src/control-plane/control-plane-system-table-gateway-options.js`** (not in the assigned set).
`buildGatewayQueryOptions` copies `options.ownerFactFloor` into the query options (it is an allow-list today,
`:17-60`). `executeAuthoritativeOwnerRpcRead` already spreads `options.queryOptions` into the executor's
options (`cdc-integration-service-owner-rpc-read-execution.js:425-440`), so the floor then reaches item 3.
Decide whether the floor joins the gateway's single-flight key; correctness does not depend on it (section 7 (b)).

**5. `src/cdc/cdc-integration-service-owner-rpc-read-execution.js`** (not in the assigned set).
`enforceRequiredLeaderReadAuthority` uses `ownerFactWitnessRefusal` (floors from `options.queryOptions.ownerFactFloor`
or the zero floor) and on refusal sets `failureCode` to the reason; a failed executor answer keeps the receiver's
`failureCode` and `retryAfterMs` (verify that `buildPartitionExecutionFailureResult` /
`buildQueryPartitionCandidateFailureDetails` carry `failureCode`; if they do not, the floor cases of witness 3
still pass through the caller-side predicate only if the floors are **not** sent to the receiver, so either make
the failure details carry the code or keep floor checks caller-side).

**6. `src/cdc/cdc-integration-service-authoritative-read-flow.js`** (assigned). In
`executeAuthoritativeSystemTableRead`, for `requireOwnerRpcRead && readAuthority.leaderMode === REQUIRED`, **before**
`getLocalQueryTransportReadiness` and before `executeAuthoritativeOwnerRpcRead` (so it needs neither a query
engine nor a transport): resolve `resolveLocalSystemTableServices(service, tableName, {consistency: LOCAL_LEADER})`,
keep those whose `partitionId === INITIAL_PARTITION_IDS[tableName]` and whose `raft.readStatus()` is `CORE_OK`
with role leader; for the first, build the request with the query owner's
`createDefaultPartitionRequestBuilder({executionOptions: {readAuthority, ownerFactFloor}, forRead: true, params,
partitionId, sql})()` and call `partitionService.handleRemoteQuery(request)` inside
`issueAuthoritativeReadStage(service, CDC_TERMINAL_STAGE.LOCAL_READ, …)`; decode with
`resolvePartitionExecutionBuilders({executionOptions, forRead: true, params, partitionId, sql}).buildSuccessResult(answer)`;
apply the same enforcement as item 5; on success return it with `localReadHit: true` and the base diagnostics.
A refusal or no local leader falls through to the existing owner-RPC arm unchanged. Do not reuse
`queryLocalAuthoritativeSystemTableRows` (witness after the read; `executeLocalQuery` bypasses the receiver).
The stub local service of the file's first test (`createLocalSystemTablePartitionServices`) has no `raft`, so it
is skipped and that test's "strict never enters the local stub" stays true.

**7. `src/query/query-executor-partition-routing-candidates.js`** (assigned). In the `requireCanonicalLeader`
branch (`:172-191`): keep the published leader's services first. When there is no `canonicalLeaderNodeId`, or its
services add no candidate, add `orderedServices` with this node's (`service.node_id === this.nodeId`) first, and
return them instead of an empty list (still logging the gap). Under Q1 = A, append the remaining services always.
`addService` already skips temporarily unroutable addresses.

**8. New `src/rebalancer/replica-operation-repository-owner-fact-read-methods.js`** + one import and one
`assign…(ReplicaOperationRepository)` line in `replica-operation-repository.js` (748 lines today; check the
file-size ratchet first): `readOwnerFact(draft)` = `readOwnerFact((_table, sql, params, readOptions) =>
this.executeReplicaOperationsRead(sql, params, readOptions), {...draft, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS})`.
`executeReplicaOperationsRead` spreads its options into the gateway call
([V] `replica-operation-repository-read-methods.js:87-140`), keeps the participation deferral (a
`{success: false, retryAfterMs}` answer → `read_failed` + `retryAfterMs`) and adds the coalescing key.

**9. Contract text** (`architecture/contracts/authority-and-recovery.md`, not in the assigned set): one paragraph
"Owner fact and hint" with the guarantee wording of section 4 and the rule that neither authorises an effect.

**10. Tests the edit set touches.** `test/cdc/cdc-owner-required-authoritative-routing.test.js` first test is
already red for an unrelated reason (section 15) and one of its cases asserts today's "same-host owner goes
through transit", which item 6 changes only for a local service whose core leads (its stub has none);
`test/query/query-executor-recovery-read-lifetime.test.js:436` only under Q1 = A; any test asserting "no
candidates when a leader-required read has no canonical leader" (census with
`grep -rln "leaderMode" test/query test/cdc test/control-plane` before editing item 7).

### What turns each witness green

| Witness | Needs | Note |
| --- | --- | --- |
| 1, case "no canonical leader" | item 6 | item 7 alone is not enough: the test requires zero query transit |
| 1, case "no query engine" | item 6 placed before the engine-dependent arm | |
| 2 | items 2 and 3 (typed refusal with no rows from the deposed replica), 5, and a way from the refusal to the leader: the redirect of item 2 (Q1 = B) or the candidates of item 7 under Q1 = A | the test's diagnostic comment prints `deposedKnownLeader`; if the deposed fixture replica cannot resolve the leader's committed address, B alone leaves the read unavailable and A or C is required |
| 3 | item 1; items 2-7 for the real-group cases (unreachable leader, floors, pin, in-process arm) | each case opens a fresh read surface so one case's no-handler quarantine is not the next's |
| 4 | item 1 only | node-free |

Stage-2 mutation runs owed for witnesses 3 and 4 (section 12): accept a follower witness; spread the draft over
the token; default a missing floor; return a look-alike without issuing it.

## 15. Executed evidence (lab host adams-gamla, check base 0dbed1718)

Output directories are under `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/`.

**Run 1** — `s0-w1w2-red-ccac40a77`, sha ccac40a77b36dfa2cf5a9045799b66249ffb8012, files
`test/cdc/cdc-owner-required-authoritative-routing.test.js`, `test/cdc/cdc-owner-fact-stale-published-leader.test.js`.
- Routing file: 97 leaf assertions, 62 pass, 35 fail. File's first failure: `remote success › should be equal`
  (line 207) in the **existing** first test, the unrelated red of section 13. Witness 1 (second test): setup
  passes; case "the routing snapshot names no canonical leader" 1 pass / 9 fail, first failure
  `the node hosting the leader gets its owner fact (today: unavailable)`, observed
  `{success: false, error: "Partition service not found", source: "owner_rpc_lane", transit: []}`; case "no query
  engine exists yet" 1 pass / 9 fail, same first failure, observed
  `{success: false, error: "authoritative_row_source_unavailable", transit: []}`.
- Stale-published-leader file: 17 leaf assertions, 3 pass, 14 fail; first failure
  `earlier witness: the published leader leads and answers` with `router_delivery_lifetime_invalid`: **a fixture
  defect, not the product red** (the fixture handed the caller router's delivery lifetime to the target router).
  Group formation on `replica_operations-p1` and the real leadership transfer worked
  (`deposedCoreRole: follower`, `deposedServiceRole: follower`). Repaired in 8d4fd93d7; this run is not evidence
  for witness 2.

**Run 2** — `s0-witnesses-red-8d4fd93d7`, sha 8d4fd93d7fee46aae86ce1f739c62c0bb267d8db (branch head), all four files.
- Witness 1, routing file: 97 leaf assertions, 62 pass, 35 fail (17 in the existing first test, 18 in witness 1;
  same observations and first failures as run 1).
- Witness 2, `cdc-owner-fact-stale-published-leader.test.js`: 17 leaf assertions, 7 pass, 10 fail. The earlier
  witness passes (the published leader leads and answers, served by `replica_operations-p1-r1`). After the real
  transfer, first failure `the strict read reaches the replica that leads (today: unavailable behind the stale
  leader)`. Observed: `{success: false, error: "authoritative_query_failed", authorityFailureReason:
  "authoritative_owner_leader_witness_required"}`; the only replica asked was the deposed one on
  `owner-fact-node-a`, which answered `success: true` **with rows** and a witness `role: "follower", term: 2`
  and no `failureCode`; the leader was never asked. The deposed replica's core names the leader
  (`deposedKnownLeader: "replica_operations-p1-r2"`), which is what the redirect of Q1 = B needs; whether
  `resolveLeaderAddress()` resolves its committed address in this fixture is not yet observed.
- Witness 3 and witness 4 files: 0 assertions each; first failure `ERR_MODULE_NOT_FOUND` for
  `src/control-plane/control-plane-owner-fact-read.js` — red by the absent owner, as declared in section 12.

**Run 3** — `s0-base-routing-b638284d1`, sha b638284d110d2a6b7cd55ebf902a63cb262fa25a (the branch base, before any
S0 change), `test/cdc/cdc-owner-required-authoritative-routing.test.js`: 76 leaf assertions, 59 pass, 17 fail,
first failure `remote success › should be equal`, `router_delivery_lifetime_invalid` in the log: the existing
test's red predates S0.

---

## 16. Stage 2 (appended 2026-11-21 by the stage-2 implementer; sections 1-15 above are unchanged)

Branch `work/owner-fact-read-20261121`, base b638284d1. Commits (all pushed):
c3fb8cc2b (receiver decides leader-qualified reads), 075a413d8 (readOwnerFact/readHint, repository method,
in-process arm reading the replica handler's registry, redirect-first discovery), 81db700ed (stage-2 witnesses
and the red finding), fc37b8d1a (contract paragraph, first-test repair), 9a6d3da52 (read point = applied
election log, after the lab showed `currentTermApplied` is not live), b3b18beeb (fixture opens the group's write
path), ee58d307f (deposed-replica comparison waits for the successor's heartbeat). Branch tip ee58d307f, pushed,
worktree clean. Each commit carries its own message (checked against its diff after the shared-scratchpad
message collision report). Marking as above: [X] executed on the lab
(directory named), [V] read in code.

### 16.1 What was built, against the rulings

| Ruling / requirement | Where | Status |
| --- | --- | --- |
| Q2(a) not-leader refused at the receiver for every leader-REQUIRED read | `partition-service-remote-query-methods.js` (`answerLeaderQualifiedRead`), request field `leaderRead` stamped by `query-executor-partition-request-builders.js` for every read whose token says leader REQUIRED | done |
| Q2(b) commit === applied and floors only for readOwnerFact | `control-plane-owner-fact-read-contract.js` `leaderReadWitnessRefusal` (kind `leader_required` vs `owner_fact`) | done |
| Witness from one core observation; captured before, re-checked after | receiver: `readOwnRaftStatus()` once before (role, term, indices, election-log flag); after the read: still leader, same term, same `lifecycleIncarnation` and `runtimeGeneration` (group and replica identity re-checked by `readOwnRaftStatus`), and for owner facts an unmoved applied index | done |
| Owner item 2: witness = applied position of the snapshot read | see 16.3 | done, conservative (refuses when the applied index moved) |
| Owner item 4 / B: fresh-leader refusal on readOwnerFact | reason `owner_fact_election_log_not_applied`; see 16.4 for why not `currentTermApplied` | done |
| Q1 (B) redirect-first | `query-executor-partition-routing-candidates.js`: published leader's replicas when usable; otherwise every routable replica, this node's first | done; `query-executor-recovery-read-lifetime.test.js` unchanged and green |
| Owner item 3 / C: redirects inside the original deadline, loops bounded | no source change: the redirect's router options are rebuilt from the same execution budget (`query-executor-partition-attempt-budget.js:345-361`, used at `query-executor-partition-delivery.js:457-464`); witnessed | witnessed |
| Owner item 1 / C: one receiver contract local and remote | in-process arm calls `handleRemoteQuery` with the request the routed arm builds (`executeInProcessLeaderRead`, `cdc-integration-service-owner-rpc-read-execution.js`); witnessed field by field | done |
| Q3 in-process arm reads the one owner of hosted replicas | `ReplicaHandler.hostedPartitionReplicas` (accessor), bound into the CDC service's declared `hostedReplicaOwner` field by the handler's constructor (`src/cdc/cdc-hosted-replica-owner.js`) | done |
| Q4 identity pair in the witness | see 16.5 | STOPPED, not implementable inside the writable set |
| Q5 hint = projection only, not passable as owner fact | `readHint`; `ownerFactRows` refuses anything not issued READY (private-field brand) | done |
| Contract paragraph | `architecture/contracts/authority-and-recovery.md`, "Owner fact and hint" | done |
| First test of the routing file repaired | transit passes `{timeoutMs: remaining, signal}`; assertion reads the lifetime's remaining duration and delivery priority | done; it was red on b638284d1 (section 15, run 3) |

Files written outside the stage-1 set, each within the approved extension: the receiver, request builder,
gateway options and owner-RPC execution files (approved); `src/node/replica-handler-class.js` (the accessor and
its one binding line), `src/cdc/cdc-hosted-replica-owner.js` and one declared field in
`src/cdc/cdc-integration-service.js` (the accessor's slot; the pre-commit navigability gate refuses module-scope
identity-keyed state, so the binding is an owner-held field, not a WeakMap). Flagged for the lead: the last two
are the wiring of the approved accessor, not separately approved files.

### 16.2 Executed evidence (lab host adams-gamla, check base 0dbed1718; directories under `lab/`)

Reproductions (red before, executed in stage 1) kept apart from specifications:
- Witness 1 (`cdc-owner-required-authoritative-routing.test.js`, second test) — EXECUTED reproduction: red at
  8d4fd93d7 (`s0-witnesses-red-8d4fd93d7`: unavailable on the node hosting the leader, "Partition service not
  found" / "authoritative_row_source_unavailable"); green from 075a413d8 on.
- Witness 2 (`cdc-owner-fact-stale-published-leader.test.js`) — EXECUTED reproduction: red at 8d4fd93d7. It
  established a receiver-contract defect (the deposed replica answered success WITH rows and a follower
  witness, no typed refusal) and a routing dead end (the real leader was never asked); the strict caller did
  NOT accept those rows (it rejected the follower witness). Green from 9a6d3da52 on (receiver refuses typed
  with a redirect; the redirect reaches the leader).
- Witnesses 3 and 4 — SPECIFICATIONS (red at 8d4fd93d7 only by import failure, not product evidence); green
  from 9a6d3da52 on. Q6 requires their mutation runs before they count: see 16.9 (NOT complete).

Runs at the stage-2 heads (`test-results.ndjson` in each directory):

| Directory (sha) | Result |
| --- | --- |
| `s0-witnesses-075a413d8`, `s0-witnesses-81db700ed`, `s0-witnesses-fc37b8d1a` (console logs only) | not run: "no lab machine is ready" (host held by other agents) |
| `s0-witnesses-fc37b8d1a-try2` (fc37b8d1a) | 3/9 pass: routing file (witness 1 + repaired first test, 107 assertions), witness 4, pinned lifetime test; all 6 group files stopped at the fixture's `currentTermApplied` setup (section 16.4) |
| `s0-witnesses-9a6d3da52-try3` | not run: `machine-lock-busy` (claude:w1b-format) |
| `s0-witnesses-9a6d3da52-try4` (9a6d3da52) | 7/9 pass: witnesses 1-4, hosted-replica, redirect/deadline, pinned lifetime; the read-point file and the finding stopped at setup `partition_write_cutover_paused` (fixture defect, repaired in b3b18beeb) |
| `s0-witnesses-b3b18beeb` (b3b18beeb) | 7/9 pass. Red: (a) `cdc-leader-required-fresh-leader-absence.test.js` on its named assertion "a committed row is never answered as absent" — the RECORDED FINDING, red by design; (b) `cdc-owner-fact-receiver-read-point.test.js` 41/42: only the secondary check "deposed leader names the leader that replaced it" (observed `null`: compared before the successor's first heartbeat; the in-process/transport sameness assertions passed) — test race, fixed in ee58d307f, NOT yet re-run |
| `s0-mutant-m01-accept-follower-witness` | not run: placement refused the mutant commit, "generated metadata is stale; regenerate test/shards/impact-graph-seal.json" (exit 97) |

Green at b3b18beeb inside the read-point file (executed): fresh leader refuses `owner_fact_election_log_not_applied`
in process and routed, shipping no rows; same typed answers in process and over the transport for leader,
follower, insufficiently applied leader, deposed leader (failure code, redirect, row shipping, witness role,
serving replica, term, applied index); leadership moving during the awaited read never yields the old
leader's rows (READY from the successor, the old leader refused after its read); an apply landing before or
after the statement never mis-states the witness; the caller re-verifies a received follower witness.
Redirect/deadline file green: a redirect succeeds inside the original deadline with no hop outliving it; an
A→B→A redirect loop (answers substituted in transit) ends typed unavailable at the deadline; a published
replica that knows no leader is an explicit unavailable (no redirect, its address owner's refusal named).

### 16.3 The witness and the snapshot actually read (owner item 2 / review A) [V]

What the store gives (file:line at 9a6d3da52):
- The raft-rs durable store is the replica's own SQLite connection: `DURABLE_STORAGE: this.db`
  (`src/partition/partition-service-raft-init-base.js:319`).
- Application is synchronous (`requireSynchronousApplication`, `src/raft/raft-rs-operation-port.js:220`;
  `APPLY_COMMITTED_ENTRY_MODE: SYNCHRONOUS`, `partition-service-raft-init-base.js:339-341`), and a slice's
  entry effects and `putAppliedState(groupId, lastEntry.index, ...)` commit in ONE SQLite transaction
  (`src/raft/raft-rs-application-transaction-owner.js:166-177`); the applied-state row lives in the same
  database (`src/raft/raft-rs-durable-store.js:198-214, 530-543`).
- The in-memory applied index that `readStatus()` reports is set synchronously right after that transaction
  (`src/raft/raft-rs-runtime-owner.js:1176-1197`, `recordAppliedEntry`).
- The receiver's READ branch has no await before the statement runs: `executeQuery` READ path
  (`src/partition/partition-service-write-metrics-base.js:177-213`) → `executeAdmittedReadQuery` (`:130-172`)
  → `collectBoundedTypedRowSet` (`src/query/query-result-budget.js:130-185`, `statement.iterate`).

So on one connection, with synchronous apply and a synchronous read, an observation taken in the same
synchronous step as the statement IS the applied position of the snapshot read; nothing can interleave.
The receiver relies on that adjacency AND guards it: after the awaited read it requires the applied index to
be unchanged, otherwise it refuses `owner_fact_read_point_moved` (no rows). That makes the witness truthful
even if a later change makes the statement yield before reading (the cases A(1)-(4) of the review: the read
starts at a position meeting the floor; it reads that position; leadership, term and runtime identity are
re-checked after; a later advance never re-labels older rows). Cost: an apply landing in the microtask gap
after a synchronous read is refused conservatively and retried by the delivery loop or the caller. A precise
tie without that refusal needs the statement owner (`partition-service-write-metrics-base.js:130-172`,
outside the writable set) to return the applied index it read under; recorded as a follow-up.
Witnessed both ways (`cdc-owner-fact-receiver-read-point.test.js`, "an apply landing ..."): with the apply
before the statement (mutant m11 understates) and after it (mutant m06 overstates).

### 16.4 The own-term condition: what raft-rs exposes (owner item 4) [V] + [X]

- Exposed in `readStatus()`: `currentTermApplied` = leader and `applied > pendingConfIndex`
  (`src/raft/raft-rs-status-observation.js:106-113, 147`) and `confChangePending` = `pendingConfIndex > applied`
  (`:145-146`). Not exposed: the applied entry's term (`group.appliedTerm`, kept by the runtime owner,
  `raft-rs-runtime-owner.js:1195`).
- [X] lab run `s0-witnesses-fc37b8d1a-try2`: with `currentTermApplied` as the condition every group witness
  stopped at setup: after formation the leader's last applied entries are its own configuration changes, which
  raise `pending_conf_index` to their index, so `applied > pendingConfIndex` stays false until a later ordinary
  entry applies. As an owner-fact condition that would refuse every owner fact on a quiet ledger after any
  membership change (a liveness defect, not a safety one).
- Used instead: `electionLogApplied` = `confChangePending === false` (applied ≥ pendingConfIndex), the raft
  owner's own fallback test in `hasAppliedOwnTermEntry` (`src/raft/raft-rs-conf-change-admission.js:236-248`).
  raft-rs sets `pending_conf_index` to the last log index on becoming leader and only raises it while leading
  (raft-0.7.0 raft.rs 1227-1232, cited at `raft-rs-status-observation.js:99-105`). Applied ≥ that index means
  the leader applied its whole election-time log, which by leader completeness holds every entry an earlier
  leader committed; those it can only commit through an entry of its own term. Residual: while a configuration
  change the leader proposed is in flight, owner facts refuse until it applies (bounded by one commit round).
  The precise test (applied term == current term) needs the raft owner to expose `appliedTerm` in the status
  (`raft-rs-status-observation.js`, outside the writable set): recorded for the raft owner.

### 16.5 Q4 (identity pair in the witness): STOPPED [V]

The ruled pair is (node boot incarnation, replica `created_at`). The receiver (`PartitionService`) holds
neither:
- `created_at` is minted at registration by `PartitionServiceRowOwner.buildServiceRow`
  (`src/partition/partition-service-row-owner.js:209-228`) and returned as registration evidence to the
  registering caller (`:335-338`; consumers `src/bootstrap/shared/partition-service-activation.js:285-304`,
  `src/node/replica-state-machine-registered-activation.js:215-220`); it is never stored on the service. The
  handler's CREATE stores only `createAdmissionOperationId/Token/AttemptToken` on it
  (`src/node/replica-handler-create-methods.js:562-573`).
- The node boot incarnation reaches the receiver only through its transport router
  (`src/transport/message-router-connection-lifecycle-methods.js:600`) or the handler's `ownerIncarnation`
  (`src/node/replica-handler-class.js:137`); the service holds no handler.
- `lifecycleIncarnation` in `readStatus()` is the raft replica lifecycle record's UUID minted at that record's
  birth (`src/raft/raft-rs-replica-lifecycle-owner.js:26-28, 183-188`), not one of the pair, so per the ruling
  it was not forwarded under the pair's name. (It is part of an existing attested generation,
  `src/partition/partition-participant-release-contract.js:15-16, 80-81`, if the lead prefers that identity.)
Carrying the pair needs the registration owners to hand the birth to the service (bootstrap activation,
handler CREATE, partition service core): outside the writable set. The receiver does re-check, after the
read, the runtime identity it has (`lifecycleIncarnation`, `runtimeGeneration`, group and replica identity).

### 16.6 Duplicate-registry finding (Q3) [V]

The in-process arm reads only the replica handler's registry. The CDC provider map (and the same bootstrap/join
maps handed to the SQL engine) is a second registry of hosted replicas that misses handler-created replicas;
its consumers, not rewired in this slice:
- `src/cdc/cdc-integration-service-local-system-table-routing.js:405-414, 438-484, 504-512, 514-545`
  (every `OWNER_LOCAL_*` read, `canWriteSystemTableLocally`, `resolvePartitionServices`)
- `src/cdc/cdc-bootstrap-direct-sql.js:48-83` (bootstrap direct writes, `localPartitionServices`)
- `src/node/runtime-service-handler.js:106-110` (falls back to the CDC provider)
- `src/query/sql-query-engine-instance-initializer.js:133-135`, `sql-query-engine-routing-metadata-methods.js:473-477`,
  `sql-locking-read-execution.js:63-64` (the SQL engine's provider)
- `src/live-query/live-query-startup-wiring.js:362-363, 465`, `src/node/runtime-service-call-cell-handler.js:280`
- wiring: `src/lagrange-runtime-startup.js:294, 535`, `src/entrypoint-runtime-admin-composition.js:161, 181-183,
  378, 618`, `src/bootstrap/owners/seed-runtime-bridge-owner.js:54`, `src/bootstrap/shared/cdc-integration-setup.js:191-198, 261-268`.

### 16.7 Remaining leader-REQUIRED consumers and their migration obligation (review B)

Every site below is still a plain leader-REQUIRED read: since c3fb8cc2b its receiver refuses a non-leader typed
(no follower rows on the wire), but it has NO read-point refusal, so a fresh leader can answer a committed row as
absent (`test/cdc/cdc-leader-required-fresh-leader-absence.test.js`, red by design). No absence-dependent
consumer may rely on it; each migrates to `readOwnerFact` in its slice, classifying absence-dependence first.
"not traced" = this slice did not read the consumer's use of an empty result (an indicator scan is in the
stage-2 report). Also affected: every read with `authoritativeObservationScope: COMPLETE_TABLE`
(`control-plane-system-table-gateway-read-dispatch.js:23-36`), which forces this read shape.

| Consumer (file:line of the leader-REQUIRED token) | Absence-dependent | Status |
| --- | --- | --- |
| `src/node/runtime-service-definition-resolution.js:26` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/runtime-service-definition-resolution.js:31` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-state-machine-registered-activation.js:88` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-recovery-service-row-admission.js:75` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-cleanup-tombstone-owner.js:233` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-cleanup-tombstone-owner.js:260` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-cleanup-tombstone-owner.js:473` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-state-machine-lifecycle-observation.js:145` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/node/replica-create-admission-owner.js:63` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/query/runtime-replica-state-projection.js:106` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/query/runtime-replica-state-projection.js:118` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/query/sql-query-engine-metadata-authority-refresh.js:437` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/replica-operation-message-group-membership-owner-claim.js:20` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/replica-operation-repository-entity-read-methods.js:228` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js:113` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js:552` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/operation-workflow-replace-target-binding.js:88` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/operation-workflow-placement-learner-retirement.js:67` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/operation-workflow-recovery-timeout.js:284` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/replica-operation-retained-repair-authority.js:22` | yes (its census at floor 0 decides capacity and re-insert) [V] | adoption diff 16.8 ready; its own `currentWitness` checks commit === applied and floors but not the election-log condition |
| `src/rebalancer/rebalance-coordinator-topology-guard-methods.js:369` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/message-group/message-group-service-row-owner.js:120` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/replica-operation-repository-mutation-update-methods.js:215` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/cdc/cdc-integration-service-cache-visibility-authority.js:31` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/partition/managed-workflow-record-store.js:284` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/partition/partition-service-row-owner.js:125` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/partition/group-retirement-evidence.js:344` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/node-lifecycle-publication.js:147` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/authoritative-control-plane-view.js:535` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/owners/control-plane-publications-owner.js:110` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/owners/logs-owner.js:35` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/policy/table-policy-resolution.js:42` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/owners/endpoint-incarnation-authority.js:63` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/bootstrap/seed-original-registration.js:25` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/bootstrap/owners/service-registration-visibility-owner.js:170` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/rebalancer/operation-workflow-owner-shared.js:403` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/partition/partition-replica-admission.js:153` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |
| `src/control-plane/owners/node-registration-incarnation-write.js:59` | not traced | plain leader-REQUIRED read; fresh-leader gap open; classify before migrating |

### 16.8 Adoption diff for the retained-repair owner (supersedes section 11's diff; final signature)

For the lead to apply at merge (H6); `replica-operation-retained-repair-authority.js` is another writer's file and
was not edited. Signature as landed: `repository.readOwnerFact({sql, params, minimumIndex, minimumTerm,
expectedReplica?, timeoutBudget?})` → `{state: 'ready', rows, witness}` | `{state: 'unavailable', reason,
retryAfterMs?}` (`src/rebalancer/replica-operation-repository-owner-fact-read-methods.js`; the table is the
ledger's). `expectedReplica` must have exactly the keys `nodeId`, `replicaId` (a request with any other key is
refused at construction, `OwnerFactRequestRefusal`), so the owner's pin is copied field by field.

```diff
--- a/src/rebalancer/replica-operation-retained-repair-authority.js
+++ b/src/rebalancer/replica-operation-retained-repair-authority.js
-import {isValidLeaderReadAuthorityWitness} from '../control-plane/control-plane-authoritative-read-witness.js';
-import {isCompleteAuthoritativeReadResult} from '../control-plane/control-plane-system-table-gateway-read-strategies.js';
-import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
-  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE} from '../control-plane/control-plane-system-table-gateway-constants.js';
-import {LEDGER_PARTITION_ID, censusRowOf, retainedRepairCensusRead} from '../partition/partition-placement-admission-decision.js';
+import {OWNER_FACT_STATE, OWNER_FACT_UNAVAILABLE_REASON, ownerFactRows} from
+  '../control-plane/control-plane-owner-fact-read.js';
+import {censusRowOf, retainedRepairCensusRead} from '../partition/partition-placement-admission-decision.js';
@@
-const READ_OPTIONS = Object.freeze({authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
-  leaderMode: LEADER_MODE.REQUIRED});
@@
-function witnessMatchesExpectedOwner(witness, attempt) { ... }
-
-function currentWitness(witness, attempt) { ... }
+function expectedReplicaOf(attempt) {
+  return attempt.expectedOwner === null ? {} : {expectedReplica: {
+    nodeId: attempt.expectedOwner.nodeId, replicaId: attempt.expectedOwner.replicaId}};
+}
@@ async function readRetainedRepairAuthority(repository, attempt, scope) {
   const plan = readPlan(attempt, scope);
-  let answer;
-  try {
-    answer = await repository.executeReplicaOperationsRead(plan.sql, plan.params, READ_OPTIONS);
-  } catch {
-    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.READ_FAILED);
-  }
-  if (!isCompleteAuthoritativeReadResult(answer) ||
-      !currentWitness(answer.readAuthorityWitness, attempt) ||
-      !completeRows(repository, answer.rows, attempt, plan)) {
+  const fact = await repository.readOwnerFact({sql: plan.sql, params: plan.params,
+    minimumIndex: attempt.minimumLedgerIndex, minimumTerm: attempt.minimumLedgerTerm,
+    ...expectedReplicaOf(attempt)});
+  if (fact.state !== OWNER_FACT_STATE.READY) {
+    return unavailableRepairAuthority(fact.reason === OWNER_FACT_UNAVAILABLE_REASON.READ_FAILED ?
+      REPAIR_AUTHORITY_REFUSAL.READ_FAILED : REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED);
+  }
+  const rows = ownerFactRows(fact);
+  if (!completeRows(repository, rows, attempt, plan)) {
     return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED);
   }
-  return {state: REPAIR_AUTHORITY.READY, rows: answer.rows,
-    census: answer.rows.map(censusRowOf), completeCensus: plan.ids === null,
-    witness: answer.readAuthorityWitness};
+  return {state: REPAIR_AUTHORITY.READY, rows,
+    census: rows.map(censusRowOf), completeCensus: plan.ids === null,
+    witness: fact.witness};
 }
```

Differences from today's `currentWitness`, term by term (read-only, against `replica-operation-retained-repair-authority.js:40-53, 79-95` at b638284d1):
- Same: leader witness of `replica_operations-p1` (= `INITIAL_PARTITION_IDS.replica_operations` =
  `LEDGER_PARTITION_ID`), safe-integer applied/commit/term, `commit === applied`, both floors inclusive, the
  optional (`nodeId`, `replicaId`) pin, a complete row set.
- Stricter (new): the serving leader must have applied every entry its log held when it was elected
  (`electionLogApplied`, reason `owner_fact_election_log_not_applied`, section 16.4); the decision is made first at the receiver on one core
  observation (role from the core, not the service's event field); the receiver refuses when it stopped
  leading (term or runtime changed) or its applied index moved during the read (`owner_fact_read_point_moved`).
  Each is UNAVAILABLE → `UNQUALIFIED`, the owner's existing continuation.
- Behaviour change kept from section 11: a read that answers failure maps to `READ_FAILED` (today
  `UNQUALIFIED`); its only consumer branches on `state`.
- `rows` is now a frozen copy; `completeRows` and `censusRowOf` only read it.
- The retained owner's floors start at 0 (`replica-operation-retained-repair-record.js:14`): with S0 an empty
  census at floor 0 is an answer only from a leader that has applied its election log, which closes the
  fresh-leader absence gap for this owner once it adopts. Witness of that condition: section 16.2.

### 16.9 Mutation runs (Q6): NOT complete

Mutants (one mechanism each; `mutants.py` and `s0-seal-mutants.sh` kept in the worktree's git directory
`/mnt/data/peter/projects/lagrange/.git/worktrees/owner-fact-read-20261121/`), built with git plumbing as
children of ee58d307f, never on a branch, never pushed: m01 predicate accepts a follower witness; m02 caller
options spread over the token (no unknown-field refusal); m03 missing floor defaults to 0; m04 identity by
shape; m05 receiver lets a non-leader answer; m06 witness built after the read; m07 floors ignored; m08 an
empty non-leader answer reported as absence; m09 in-process arm reads the CDC provider map; m10 no
election-log condition; m11 no unmoved-applied-index check. Intended killers: m01 witnesses 2+3; m02-m04
witness 4; m05 witness 2; m07 witness 3; m09 hosted-replica file; m06/m08/m10/m11 read-point file.
The lab refuses a mutant whose import-graph seal is stale, so each needs the hook's generator
(`generate-global-owner-debt-inventory.js --refresh`) run on its tree. Sealed so far (commit-tree children of
ee58d307f, seal + inventory regenerated): m01 3de15e2c6, m02 59ef438d0, m03 d48b1f596, m04 717eb0dee,
m05 c7b4125da, m06 6f4ba10d5, m07 a4d3d4833, m08 8d24b209d; m09-m11 not sealed (stopped on the
coordinator's instruction). No mutant has been executed: no kill is claimed.

### 16.10 Residuals and findings for other owners (recorded, not repaired here)

- Gateway single flight: the read key holds the frozen read-authority token
  (`control-plane-system-table-gateway-query-execution.js:109-117, 139-156`) but not `ownerFactFloor`, so an
  owner-fact read may share a plain leader-REQUIRED read's answer (or another floor's). Correctness holds:
  `readOwnerFact` re-applies the predicate with its own floors (witnessed by the caller-verification case,
  mutant m08). Liveness: a shared answer can be refused for a floor the sharer did not ask for; it retries on
  its owner's cadence. Owner: gateway read dispatch.
- Exhaustion reports the delivery loop's LAST candidate failure, not "the most specific reason seen" (section
  7.3); in every witnessed case the last failure was the leader's own refusal (a redirect target's failure is
  recorded last). Owner: query delivery.
- `currentTermApplied` in the status observation is not live as an own-term indicator after leader-proposed
  configuration changes (16.4); `appliedTerm` is not exposed. Owner: raft runtime / status observation.
- The witness role of EVERY read (also the `OWNER_LOCAL_*` local path, `selectLocalPartitionWitness`) now comes
  from the core observation, no longer from the service's event-derived `this.role` (section 3's finding).
- The local `OWNER_LOCAL_*` path still builds its witness after an awaited read
  (`cdc-integration-service-authoritative-read-flow.js:316-334`): unchanged here (S7).
- heavy.sh / governor interaction (operational, not product): the governor pauses descendants of any process
  whose command line contains `tools/heavy.sh`, including an agent's own wrapper shell; that made two of this
  slice's commit attempts return 147 with nothing committed. Invoking heavy.sh through a variable path avoids it.

### 16.11 Open (stage-2 end state, 2026-11-21)

1. Re-run all S0 files at ee58d307f on the lab (expect 8/9 with only the finding red).
2. Seal m09-m11, run all 11 mutants on the lab, record the kill table (Q6).
3. The change cone versus b638284d1 (`scripts/lab.js test changed --lane all --base-sha b638284d1...`): not run.
4. Q4 identity pair (16.5): needs the registration owners; lead decision.
5. Precise own-term test (`appliedTerm` in the status) for the raft owner (16.4).
6. First consumer migration (topology guard SERVICES inventory read,
   `rebalance-coordinator-topology-guard-methods.js:362-371`, a `rebalance-coordinator-*` file of another
   writer): the read is functionally ready (witnesses green) but Q6's mutation evidence is missing. The
   consumer must call `readOwnerFact((t, sql, params, o) => gateway.readAuthoritativeRows(t, sql, params, o),
   {tableName: SYSTEM_TABLE_NAME.SERVICES, sql, params, minimumIndex, minimumTerm})` (floors 0 = no prior
   knowledge, or its last committed write's index/term), branch on `state`, take rows only through
   `ownerFactRows`, and treat every UNAVAILABLE reason as "keep the turn scheduled", never as data.
