# W1 transition record: retained placement repair owner

Status: STAGE 1 (contract first). Nothing here is implemented yet. Stage 2 waits
for the lead's rulings in section 12. Stage-1 witness commits: `7b0b427b2`, `8eba5f745`
(tests and fixtures only; `src/` is unchanged from `0993265e5`).

- Worktree: `/mnt/data/peter/projects/.worktrees/retained-ledger-observation-repair-20261121`
- Branch: `work/retained-ledger-observation-repair-20261121`
- Source under review: tip `0993265e53601cba4a6a41baa08158725cfcea7f` (unverified WIP draft).
  All `file:line` references below are to that tree (the stage-1 witness commits change
  only `test/`).
- Owning quest for records: `fresh-formation-user-table-routability`.
- Evidence labels used in this file: **[read]** = source read only, not executed;
  **[lab]** = executed on `tv-dator` through the focused runner, output directory named.

Acceptance bar (shared definition):

> A publication change is a hint to reconsider the current canonical binding.
> A failed authority read leaves reconsideration owed. A durable outcome settles
> only the exact entry it proves.

## 1. Producer and consumer symbols

Owner: `ReplicaOperationRepository` (the retained placement repair methods mixed in by
`assignRetainedPlacementRepairMethods`,
`src/rebalancer/replica-operation-repository-retained-placement-repair.js:73`). It is the one
owner of the volatile retained attempt record. It never grants a row: every write
reaches native committed apply on the ledger partition.

Producers into the owner (legitimate triggers):

| Trigger | Symbol | Site |
| --- | --- | --- |
| Origin caller, dispatch gate | `ensureRetainedOperationRow` via `repairOperationRowForGateRepairedReservation` | `src/rebalancer/operation-workflow-gate-operation-row-repair.js:15-31` |
| Origin caller, zero-row update divergence | `repairRetainedOperation` | `src/rebalancer/replica-operation-repository-mutation-update-methods.js:593` |
| Ingress at the ledger leader | `acceptRetainedPlacementRepairRequest` called by `requestPlacementRepair` | `src/partition/partition-placement-admission.js:184-196` (out of scope, W1b) |
| Cache publication (REPLICA_OPERATIONS, SERVICES, NODES, PARTITIONS) | `observeRetainedPlacementRepairCommit` from the coordinator's deferred cache listener | `src/rebalancer/rebalance-coordinator-lifecycle.js:540-546` |
| Local ledger commit | `PARTITION_SERVICE_EVENT.ENTRY_COMMITTED` -> `shouldWake` | `...retained-placement-repair.js:41-52`, `:466-483` |
| Local write path released | `PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED` -> `onReleased` | `...retained-placement-repair.js:470-476` |
| Local ledger leadership start | `ReplicaPlacementOwner.setLeader(true)` -> `wakeRetainedPlacementRepairs` | `src/rebalancer/replica-placement-owner.js:292-293` |
| Read-dependency timer | `scheduleRetainedRepairReadRetry` | `src/rebalancer/replica-operation-retained-repair-read-retry.js:10-32` |

Ports the owner consumes (composition `src/rebalancer/rebalance-coordinator-lifecycle.js:352-358`):

| Port | Canonical implementation | Meaning |
| --- | --- | --- |
| `resolveRetainedPlacementRepairRoute` | `resolveRemoteLedgerLeader` -> `resolvePlacementLedgerRoute(cache)` (`src/rebalancer/replica-placement-owner-transport.js:28-43`) | current canonical binding: PARTITIONS leader through `resolveCanonicalPartitionLeaderObservation` + exactly one ACTIVE identity-bound ledger SERVICES endpoint, else `null` |
| `prepareRetainedPlacementRepair` | `prepareRetainedPlacementRepairBody` (`src/rebalancer/replica-placement-owner-retained-repair-routing.js:47-53`) | canonical body from the ledger leader's placement owner (local call or `PLACEMENT_REPAIR_PREPARE`) |
| `repairRetainedPlacement` | `submitRetainedPlacementRepair` (`src/rebalancer/rebalance-coordinator-operation-creation-support.js:290-300`) | present one exact `{entryId, body}`: local `requestPlacementRepair` or `PLACEMENT_REPAIR` delivery to the route address |
| `executeReplicaOperationsRead` (own method) with `OWNER_RPC_REQUIRED` + leader `REQUIRED` | `readRetainedRepairAuthority` (`src/rebalancer/replica-operation-retained-repair-authority.js:80-96`) | one qualified leader read with a read-authority witness |
| `timeSource` | repository clock (`src/rebalancer/replica-operation-repository.js:520`) | every owner deadline |

Production publication facts re-verified **[read]**:

- Partition SERVICES rows never publish `raft_role=leader`: `queueRoleUpdate` normalizes with
  `collapseLeaderToFollower: true` (`src/partition/partition-service-metadata-delivery-methods.js:28-32`),
  as does `resolvePartitionRaftRole` (`src/partition/partition-service-row-owner.js:87-102`).
- Leader identity is published through PARTITIONS `leader_node_id` (`queueLeaderNodeUpdate`,
  same file `:38-41`); `applyReplicaLeadership` drives both (`src/raft/replica-leadership-state.js:62-80`)
  and mints the leadership tenure `{term}` (`:38-42`).
- The cache notifies listeners on a deferred hop (`setImmediate`,
  `src/cache/system-table-cache.js:70-72`, `notifyListeners` in
  `src/cache/system-table-cache-observation-methods.js:416-434`): the notified record can lag the cache.

## 2. Owner-defined shape (target)

One record per `operationId`, created only by a caller or an ingress. Every field has a named
initial state; no `null` or `undefined` carries meaning (R07). Today's record
(`src/rebalancer/replica-operation-retained-repair-record.js:11-20`) omits `delegated`,
`nativeService`, `nativeAnswerPromise` and uses `blockers: null`, `expectedOwner: null`,
`clearingTrigger: null` (deletion sentinel, `...retained-placement-repair.js:274`) and
`retainedPlacementRepairReleaseSequence ?? 0` (`:195`, `:245`, `:471-472`, never initialized in
the constructor `src/rebalancer/replica-operation-repository.js:502-506`).

| Field | Named states | Replaces |
| --- | --- | --- |
| `operation` | immutable snapshot (identity) | unchanged |
| `entry` | `{state: UNPINNED}` or `{state: PINNED, entryId, body}` | `entryId: null`, `body: null` |
| `binding` | `{state: UNBOUND}`, `{state: BOUND, nodeId, replicaId, address, endpointCreatedAt}`, `{state: UNAVAILABLE}` | `expectedOwner: null`, `observedRoute: null`, `routeUnavailable` |
| `custody` | `{state: SELF}` or `{state: DELEGATED, nodeId, replicaId, term, entryId, bodyText}` | undeclared `delegated` |
| `nativeIngress` | `{state: NONE}` or `{state: EXPECTED, service, term, answer: NOT_REQUESTED or promise}` | undeclared `nativeService`, `nativeAnswerPromise`, `nativeIngressTerm`, `nativeIngressExpected` |
| `blocker` | `{kind: NONE}`, `{kind: OPERATIONS, operations, clearingTrigger}`, `{kind: OCCUPANCY, occupancy, clearingTrigger}`, `{kind: WRITE_PATH, clearingTrigger}`, `{kind: OUTCOME_UNKNOWN}` | `blockers: null`, `occupancy: null`, `clearingTrigger` overloaded |
| `owed` | finite mask of named reconsideration kinds (`OWN_ROW`, `CLEARING`, `ROUTE`, `CONTENTION`); `NONE` initially | `observations` + `retryObservations` |
| `continuation` | `{state: IDLE}`, `{state: ARMED, handle, attempts, reason, deadlineAt}`, `{state: SPENT, reason}` | repository-wide `retainedPlacementRepairReadRetry` + shared delay |
| `decision` | `{state: IDLE}` or `{state: RUNNING, mode, promise}` plus `lastOutcome` (typed, never reused across turns) | `pending`, `lastDecision` |
| `minimumLedgerIndex`, `minimumLedgerTerm` | monotonic floors, initial `0` | unchanged |
| repository `releaseSequence` | integer initialized to `0` in the constructor | `?? 0` |

Typed outcomes of one authority read (owner: the retained authority reader):
`READY`, `READ_FAILED(cause)`, `UNQUALIFIED_POSITION` (witness below the floors or
commit != applied), `UNQUALIFIED_BINDING` (serving replica is not the binding),
`UNQUALIFIED_SHAPE` (incomplete answer, wrong partition, invalid witness),
`INVALID_ROW` (malformed, duplicate or out-of-plan row). The real cause travels with the
outcome; no `{retryAfterMs}` is synthesized.

Custody attestation stays the receiver's reply field (`repairCustody`,
`src/rebalancer/replica-operation-retained-repair-ingress.js:39-46`) with one added member,
the ledger term the receiver read at ingress (`ingressTerm`, same file `:19-21`).

## 3. Identity and generation

| Identity | Owner | Hops |
| --- | --- | --- |
| Operation identity: `operationId` + `createdAt` + full snapshot | origin workflow owner | record key; body `operation`; reply `operationId/createdAt`; native apply compares the retained row identity |
| Attempt identity: `entryId` (`retained-repair:<operationId>:<uuid>`) + exact `body` bytes | the retained owner that pinned it | `PLACEMENT_REPAIR` payload; committed statement outcome key (`getCommittedEntryKey`); custody; reply. A durable outcome under this key settles this entry and nothing else. |
| Record identity (volatile generation) | repository map slot | `retainedRepairAttemptIsCurrent` fences every continuation after an await |
| Binding identity: `{nodeId, replicaId, address}` of the canonical route + the endpoint row incarnation (`created_at`, minted by `mintServiceRowCreatedAt`, `src/node/service-row-incarnation.js`) | PARTITIONS leader publisher + SERVICES registration owner | resolved from the cache at decision start; compared with the read witness `servingNodeId/servingReplicaId` and the custody attestation |
| Receiver tenure: ledger raft term while leader (`leadershipTenure.term`, read as `ingressTerm`) | ledger partition service | captured at ingress; fences the native completer (`ownsIngress`); travels in the custody attestation |
| Read version: witness `term`, `appliedIndex`, `commitIndex` | serving ledger replica | raises `minimumLedgerTerm/Index`; a read version is not a routing epoch and never becomes a binding |
| Repository `releaseSequence` | repository | detects a WRITE_PATH_RELEASED that happened while the refused answer was in flight |

Not used as identity: the notified cache row (a hint only); SERVICES `raft_role`
(never `leader` for partitions); `membershipPublicationEpoch` (belongs to the operation body).

## 4. Ordering

- One serialized decision per record (`decision.promise`). Binding, custody, blocker and entry
  change only inside it. Observers (cache listener, service events, timer, callers, ingress) only
  add to `owed` and ensure the drain runs. The drain joins the in-flight decision before it
  takes `owed`.
- The publication channel is deferred and at-least-once: a notification is processed against the
  cache state at delivery time, so A->B->A with a late B notification resolves A.
- The two publication lanes (PARTITIONS leader, SERVICES endpoint) arrive in either order; a
  half-published state resolves `null`.
- Ledger positions: `minimumLedgerIndex/Term` are monotonic floors raised by committed answers
  and qualified reads. This is a per-owner freshness fence on one ledger partition, not a
  consistent cut across owners.
- The durable order of native entries is the ledger log. A replay of a settled entry returns the
  recorded outcome before any volatile record is consulted
  (`...retained-repair-ingress.js:54-58`).
- Overlapping versus sequential arrival is decided by `decision.state` at arrival: RUNNING =
  overlapping (may join), IDLE = sequential (fresh bounded decision, fresh qualified read).

## 5. Absent versus unavailable

| Fact | Typed outcome | Consequence |
| --- | --- | --- |
| Row absent in a qualified read | `ABSENT` | the only state that may lead to a proposal, and only in a proposing mode after contention evaluation |
| Authority read failed or unqualified | `UNAVAILABLE(reason)` | no proposal, no retirement, no replacement; `owed` kept; blocker unchanged; never cached for a later turn |
| Malformed authority row | `INVALID_ROW` | typed refusal; obligation kept; no proposal; no timer; visible |
| Route `null` (leader unpublished, endpoint missing, two ACTIVE endpoints) | `binding: UNAVAILABLE` | no send; obligation kept; the next relevant publication re-opens |
| Port not composed | construction error | the route, prepare and send ports are required; today `repairPort` substitutes `() => null` (`...retained-placement-repair.js:56-71`) |
| Receiver without tenure (not leader, shutting down) | disclaim: `UNAVAILABLE` reply without custody | sender custody becomes `SELF`; sender owns the continuation |
| Native outcome unknown (lost answer) | `blocker: OUTCOME_UNKNOWN` with the entry pinned | resolved only by re-presenting the exact entry; never a new entry |

## 6. Durable commit

The only durable transition is the native committed apply of the exact `PLACEMENT_REPAIR`
entry on the ledger partition (`requestPlacementCommand` behind `submitNative`); its statement
outcome is recorded under the entry key. A committed ADMITTED restores the row; a committed
REFUSED records the refusal for that entry. The retained record, binding, custody, `owed`
and the continuation are volatile and reconstructible: after process loss the origin's
workflow owner re-enters through `ensureRetainedOperationRow` / the zero-row update arm and
the durable outcome answers any replay. Nothing in this change adds durable state.

## 7. Retained obligations

| Obligation | Owner while it is owed | Released by |
| --- | --- | --- |
| Restore or confirm the exact retained row | the origin's record (SELF), or the receiver tenure that attested custody of the exact entry | qualified read EXACT; CHANGED; a committed permanent refusal |
| Resolve a pinned unknown entry | the record that pinned it | the durable outcome of that exact entry |
| Reconsideration after an unavailable read | whoever holds the obligation now: SELF sender, or the custodian receiver during its tenure | a qualified read that covers the owed kinds |
| Reconsideration after a route publication | the origin/sender record | the serialized decision that re-resolves the binding |
| Receiver custody | the receiver's ledger tenure | durable outcome; tenure end (leadership loss, term change, shutdown); disclaim on the next request |
| In-flight native submit at shutdown | the ledger log | commits or not; settles only that entry; no volatile effect after shutdown |

## 8. Canonical wake and cleanup

- Wake: every trigger in section 1 queues a named `owed` kind and starts the one drain. No
  trigger runs a second algorithm.
- A relevant publication is any cache change of the ledger PARTITIONS row or of a ledger
  partition SERVICES row, whatever the row says. It queues `ROUTE`.
- Cancelling a wait (timer cleared), stopping execution (record-identity fence after each
  await), releasing resources (service listeners unbound, record removed) and settling a
  committed effect (durable outcome stays) are four separate things. Retirement and shutdown
  do the first three; neither can undo the fourth.
- Retirement of a record (EXACT, CHANGED, permanent refusal, deletion without a read,
  custodian tenure end) cancels that record's continuation and drops its backoff state.
  Shutdown cancels every continuation, unbinds the service listeners and clears the map; no
  read, send or timer after it.

## 9. B1 decision: the repository owns the continuation

Decision: the retained owner owns one continuation per record. It does not reuse the workflow
owner's per-operation retry entry (`armObservedProgressRetry`,
`src/rebalancer/operation-workflow-observed-progress-retention.js:92-152`).

Why the first mechanism cannot serve **[read]**:

1. Its action needs a visible row. The timer runs `reconcileObservedProgressOperation`
   (`src/rebalancer/operation-workflow-owner.js:306-348`), which reads the operation by id and
   routes on that row. A retained repair exists because that row is absent. The dispatch gate
   says so itself: "the dispatch retry lanes only re-drive while a durable row remains visible"
   (`src/rebalancer/operation-workflow-dispatch-reservation-gate.js:71-75`).
2. The receiver has no such entry. A ledger leader holds custody for operations whose workflow
   owner is another node (`acceptRetainedPlacementRepairRequest`). The workflow entry exists
   only for locally owned operations and is fenced by the operation-ownership epoch, not by
   ledger tenure.
3. Different fence and subject. The workflow entry is keyed by `operationId` under the
   operation single-flight key; the retained continuation must die with the record identity,
   the ledger tenure (custodian) and the binding.
4. The fenced, deadline-bearing form named in the brief is not on this branch:
   `953d705f8` and `29cd457e5` are not ancestors of `0993265e5` (`git merge-base --is-ancestor`
   fails for both; they live on `wip/core-*` and
   `work/composed-active-handoff-operation-read-original-20261121`). On this base the entry has a
   deadline only for `DELIVERED_CREATE_PROGRESS`.

What is shared, so this is not a second policy: the repository clock (`timeSource`), the
existing owner-read retry delay bounds (`REPLICA_OPERATION_READ_RETRY_DELAY_MS` 100 ms,
`REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` 1 s, `src/rebalancer/replica-operation-repository.js:255-256`),
the existing spent-wait reporter (`reportWaitBoundSpent`) and the existing budget constant
(`TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS`, 300 000 ms,
`src/control-plane/timeout-budget.js:18`).

Proposed bound (needs ruling Q1): a continuation re-arms on `READ_FAILED` and
`UNQUALIFIED_POSITION` with the existing doubling delay (100 ms up to 1 s) until
`deadlineAt = first unavailable read + REBALANCE_OPERATION_BUDGET_MS`. At the deadline it
reports one `wait_bound_spent` and becomes `SPENT`: obligation kept, zero proposals, no timer.
`INVALID_ROW` and `UNQUALIFIED_SHAPE` never arm a timer (bound: zero retries).
`UNQUALIFIED_BINDING` queues `ROUTE` instead of a timer. Any legitimate trigger re-opens a
`SPENT` or refused record with a fresh bounded continuation.

## 10. State and event table

States of a retained attempt:

| Code | State | Meaning |
| --- | --- | --- |
| U | UNOBSERVED | record just created; left in the same synchronous turn (creation starts a decision) |
| D | DECIDING | one serialized decision in flight (reading, sending or awaiting the native answer) |
| P | PINNED | exact entry pinned; native outcome uncommitted (`WRITE_PATH`, typed uncommitted refusal) or `OUTCOME_UNKNOWN`; custody SELF |
| B | BLOCKED | committed or observed refusal: `blocker` OPERATIONS or OCCUPANCY with its clearing trigger; entry unpinned unless it was never proposed; custody SELF |
| G | DELEGATED | sender side: the exact entry is in the custody of an attested receiver tenure |
| O | READ OWED, ARMED | overlay on P or B, at the origin or at a custodian receiver (never on G, whose custodian owns it): `owed != NONE`, continuation ARMED |
| X | READ OWED, STOPPED | `owed != NONE`, continuation SPENT, or typed refusal INVALID_ROW; no timer |
| R | RETIRED | record removed |

Impossibility reasons used in the cells:

- **I-D**: reads and native submits are issued only by the serialized decision; their answers
  return into D of the same record, or are discarded by the record-identity fence.
- **I-T**: no continuation is armed in this state.
- **I-U**: U is left in the turn that created the record; no other event can interleave.
- **I-R**: no record exists; the observer's lookup finds nothing.
- **I-L**: the event is produced by a local ledger service; a remote sender has none.

"Owner" names who owns the next reconsideration after the transition.

### 10.1 U (UNOBSERVED)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | D | start a RETRY decision | decision |
| ingress arrival | D | start a RECEIVER decision; entry pinned from the payload | decision |
| every other event | - | impossible: I-U | - |

### 10.2 D (DECIDING)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival (overlapping) | D | join the in-flight decision only if its mode can propose; otherwise queue `CLEARING` and answer from the next decision | decision, then drain |
| ingress arrival (overlapping) | D | join; inherit the typed outcome only if the mode covered proposing; never answered ABSENT; custody only for the entry the record pins | decision, then drain |
| own-row commit | D | queue `OWN_ROW`; nothing in the in-flight decision changes | drain after the decision |
| blocker clear | D | queue `CLEARING` | drain |
| capacity release | D | queue `CLEARING` | drain |
| write path released | D | advance `releaseSequence`; queue `CLEARING` if the pin waits on WRITE_PATH | drain |
| route change | D | queue `ROUTE`; binding untouched until the decision ends | drain |
| route unavailable | D | queue `ROUTE` | drain |
| read ok: EXACT | R | sync the incomplete-operation observation; retire; answer true | none |
| read ok: CHANGED | R | retire; answer false (the row belongs to another birth) | origin workflow owner |
| read ok: CONTENDED | B | record blocker and trigger from this read; zero proposals | blocker's clearing trigger |
| read ok: ABSENT | D, or prior state | proposing mode: present the entry (pinned one first, else prepare one). Confirm-only mode: keep the prior state and, when it has neither blocker nor custody, queue `CLEARING` | decision or drain |
| read unavailable | O | `owed` gains the kinds this decision consumed; arm the continuation with the real reason; blocker unchanged; joiners get typed UNAVAILABLE | continuation (custodian) |
| read invalid | X | typed refusal INVALID_ROW; obligation kept; zero proposals; one ERROR | next legitimate trigger |
| native: committed ADMITTED | D | the exact entry is settled; confirm with a SUBJECT read (EXACT retires; unavailable goes to O owing `OWN_ROW`) | decision |
| native: committed REFUSED with trigger | B | the exact entry is settled and unpinned; blocker from the committed result. If the decision was resolving an older pinned entry: one CENSUS read (CONTENDED stays B, ABSENT proposes once, unavailable is B + O with the committed trigger unchanged) | blocker's clearing trigger |
| native: committed REFUSED permanent | R | retire; visible | origin workflow owner |
| native: uncommitted typed refusal | P | entry stays pinned; blocker from `PLACEMENT_CLEARING_TRIGGER`; if `releaseSequence` advanced in flight, queue `CLEARING` | named trigger |
| native: unknown (lost, malformed, foreign) | P + O | entry stays pinned; `blocker: OUTCOME_UNKNOWN`; continuation owes re-presenting the exact entry (ruling Q8) | continuation |
| receiver observation reply | G, B, P or O | EXACT/CHANGED: confirm by own SUBJECT read. CONTENDED: B. Custody attested: G. UNAVAILABLE without custody: O. PENDING without custody: P owing `CLEARING` | receiver tenure (G) or sender |
| disclaim | P/B + O | custody SELF; queue `ROUTE`; sender arms its continuation | sender continuation |
| timer fires | D | the callback queues its `owed` kinds; no second decision | drain |
| retirement (external removal) | R | later steps of the decision are fenced; joiners answer false | none |
| shutdown | R | record cleared; no further read, send or timer; a submitted entry may still commit durably | ledger log |

### 10.3 P (PINNED, custody SELF)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | D | fresh RETRY decision; ABSENT re-presents the exact pinned entry | decision |
| ingress arrival | D | fresh decision; a different incoming entry first resolves the pinned one and never receives custody | decision |
| own-row commit | D | CONFIRM decision (SUBJECT read) | decision |
| blocker clear | D or P | if the row can affect this entity or copy lane: RETRY decision; else ignored | decision |
| capacity release | D or P | same as blocker clear | decision |
| write path released | D | when the pin waits on WRITE_PATH: RETRY decision re-presenting the entry; else ignored | decision |
| route change | D | HANDOFF decision: rebind inside the decision, evaluate contention exactly as RETRY, ABSENT re-presents the exact entry to the new binding | decision |
| route unavailable | P | `binding: UNAVAILABLE`; no send; obligation kept | next relevant publication |
| read ok / unavailable / invalid | - | impossible: I-D | - |
| native answers, observation reply, disclaim | - | impossible: I-D | - |
| timer fires | - | impossible: I-T | - |
| retirement | R | remove record | none |
| shutdown | R | clear | none |

### 10.4 B (BLOCKED, custody SELF)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | D | fresh RETRY decision reading the recorded blockers or the census; unchanged contention gives zero proposals | decision |
| ingress arrival | D | fresh RECEIVER decision with a fresh qualified read; unchanged contention answers CONTENDED, zero proposals | decision |
| own-row commit | D | CONFIRM decision | decision |
| blocker clear (a recorded blocker changed) | D | RETRY decision | decision |
| blocker clear (unrelated row) | B | ignored | blocker's trigger |
| capacity release (recorded occupancy changed) | D | RETRY decision with the census | decision |
| write path released | B | ignored: the blocker does not wait on it | blocker's trigger |
| route change | D | HANDOFF decision with the same contention evaluation as RETRY; unchanged BUSY gives zero native proposals | decision |
| route unavailable | B | `binding: UNAVAILABLE`; blocker kept | next relevant publication |
| read ok / unavailable / invalid | - | impossible: I-D | - |
| native answers, observation reply, disclaim | - | impossible: I-D | - |
| timer fires | - | impossible: I-T | - |
| retirement | R | remove record | none |
| shutdown | R | clear | none |

### 10.5 G (DELEGATED, sender side)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | D | fresh decision: SUBJECT read; EXACT retires; otherwise re-present the exact entry to the current binding, whose reply re-attests custody or disclaims | decision |
| ingress arrival | D | the sender became ledger leader: custody is void; fresh RECEIVER decision | decision |
| own-row commit | D | CONFIRM decision | decision |
| blocker clear | D | JOIN: re-present the exact entry | decision |
| capacity release | D | JOIN | decision |
| write path released | - | impossible: I-L (if the sender has a local ledger leader it is not delegated to itself) | - |
| route change | D | custody is not trusted across a publication: HANDOFF decision re-presents the exact entry to the current binding | decision |
| route unavailable | G | `binding: UNAVAILABLE`; custody unverifiable; obligation kept | next relevant publication |
| read ok / unavailable / invalid | - | impossible: I-D | - |
| native answers, observation reply, disclaim | - | impossible: I-D (a disclaim is a reply inside D) | - |
| timer fires | - | impossible: I-T (the custodian owns the continuation) | - |
| retirement | R | remove record | none |
| shutdown | R | clear | none |

### 10.6 O (READ OWED, continuation ARMED)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | D | fresh decision now with a fresh qualified read; the unavailable result is not reused | decision |
| ingress arrival | D | fresh decision now; same rule | decision |
| own-row commit, blocker clear, capacity release, write path released | D | queue the kind and decide now; an event is not parked behind the backoff | decision |
| route change | D | queue `ROUTE`; HANDOFF decision now | decision |
| route unavailable | O | `binding: UNAVAILABLE`; timer stays (the read may recover for the same binding) | continuation and next publication |
| read ok / unavailable / invalid | - | impossible: I-D | - |
| native answers, observation reply, disclaim | - | impossible: I-D | - |
| timer fires | D | decision consuming `owed`. A qualified read clears only the kinds its scope satisfied; the rest stay owed. Unavailable re-arms (attempts + 1) until `deadlineAt`, then X | continuation |
| retirement | R | cancel the timer; drop backoff state | none |
| shutdown | R | cancel the timer; clear | none |

### 10.7 X (READ OWED, STOPPED)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival, ingress arrival | D | fresh decision; a new unavailable read starts a fresh bounded continuation | decision |
| own-row commit, blocker clear, capacity release, write path released, route change | D | queue the kind; fresh decision | decision |
| route unavailable | X | `binding: UNAVAILABLE` | next relevant publication |
| read ok / unavailable / invalid | - | impossible: I-D | - |
| native answers, observation reply, disclaim | - | impossible: I-D | - |
| timer fires | - | impossible: I-T (a cancelled handle that still fires is fenced by handle identity) | - |
| retirement | R | remove record | none |
| shutdown | R | clear | none |

### 10.8 R (RETIRED)

| Event | Next | Effect | Owner |
| --- | --- | --- | --- |
| caller arrival | U then D | a new record; no state inherited | decision |
| ingress arrival | U then D | a settled entry replays its durable outcome before any record is created; otherwise a new record | decision |
| every other event | R | impossible to act: I-R | - |

### 10.9 Local ledger tenure (events the table above folds in)

| Event | Effect |
| --- | --- |
| local ledger leadership start | every record with custody SELF queues `CLEARING` when its blocker waits on LEADERSHIP_START; every record queues `ROUTE` (the binding is now the local service) |
| local ledger leadership end or term change | a record created only by ingress (custodian) is retired, cancelling its continuation; an origin record keeps the obligation and queues `ROUTE`; a native completer of the old term answers disclaim (`ownsIngress`) |

## 11. Review findings: verification

All **[read]** on `0993265e5` unless a lab run is named. "Confirmed" means the defect is present
in the code as described.

| Id | Verdict | Evidence |
| --- | --- | --- |
| A1 route from cache | Already true on the tip: `retainedRepairPublishedRouteChanged` uses the row only as a relevance filter and resolves the route from the port (`...retained-placement-repair.js:445-449`). Predecessor `a046d5495` woke from the notified row: `receiverChanged` required a SERVICES row with `raft_role === LEADER` and copied `row.node_id/replica_id` into `expectedOwner` (`a046d5495:...retained-placement-repair.js:74-79`, `:444-449`). With production rows (follower only) that predicate never fires: a lost wake, not a wrong move. Lab: W1 and W2 pass on the tip (section 13); the predecessor was not executed. |
| A1 route port default | Confirmed: `repairPort(options.resolveRetainedPlacementRepairRoute, () => null)` (`...retained-placement-repair.js:56-71`); a null route sets `routeUnavailable` and returns no observation (`:450-454`), so an uncomposed repository silently never observes a route. Siblings: the send and prepare ports default the same way (`:64-69`). |
| A2 blind handoff | Confirmed: HANDOFF reads SUBJECT scope (`:156-160`); SUBJECT plans only the own id (`...retained-repair-authority.js:28-39`), so an absent row yields ABSENT without the known blockers and `retryRetainedRepairDecision` proposes (`...retained-placement-repair.js:112-115`). |
| A3 custody without tenure | Confirmed: custody carries node, replica, operation, createdAt, entry, body, no term or incarnation (`...retained-repair-ingress.js:39-46`). A no-custody `unavailableReply` (`:15-17`, `:51-53`) matches as an observation at the sender, `recordRetainedRepairCustody` leaves `delegated` (`...retained-placement-repair.js:235-240`), and the UNAVAILABLE arm skips the sender's retry while delegated (`:407-411`). A delegated caller returns false without a read (`:88`). Non-operation publications are ignored while delegated (`:431-432`) and an unchanged tuple is not a change (`:455-463`). |
| A3 sibling (lab) | Baseline test 15 `remote paused repair progresses solely on actual owner WRITE_PATH_RELEASED` fails on the tip: after the receiver restored the row the delegated sender's `ensureRetainedOperationRow` still answers false (section 13). |
| A5 classifier mutation | Confirmed: the classifier writes `routeUnavailable`, `observedRoute` and `expectedOwner` (`...retained-placement-repair.js:452`, `:460-462`) from the cache listener with no serialization; readers after an await: `witnessMatchesExpectedOwner` (`...retained-repair-authority.js:41-45`), `matchesRetainedRepairObservation` (`...retained-repair-reply.js:36-38`), `custodyMatches` (`...retained-repair-answer.js:66-67`). Siblings: `recordRepairObservation` clears `delegated` synchronously on LEADER (`...retained-repair-observation.js:29-32`); ingress writes `nativeService` and `expectedOwner` before it joins the pending decision (`...retained-repair-ingress.js:72-73`). |
| B1 | Decided in section 9. The named commits are not on this branch. |
| B2 overwritten trigger | Confirmed, three paths: `settleRetainedRepairDecision` UNAVAILABLE (`...retained-placement-repair.js:380-384`) reached from ingress (`...retained-repair-ingress.js:116-118`) and from the post-resolution read (`...retained-placement-repair.js:138-142`); `consumeRetainedRepairObservation` UNAVAILABLE (`:407-411`). Effect: `shouldWake` (`:44`) and `onReleased` (`:473-475`) drop a real release during the outage. On the tip the armed timer's CLEARING mask later re-reads, so the drop is masked until B4 bounds the timer. |
| B3 cleared retry bits | Confirmed: `completeRetainedRepairReadDependency` zeroes `retryObservations` on any qualified read of any scope (`...retained-repair-read-retry.js:34-40`); during backoff every observation is diverted into `retryObservations` and bypasses `recordRepairObservation` (`...retained-placement-repair.js:287-291`). Lab: baseline test 44 fails for this reason (section 13). |
| B4 collapsed outcomes | Confirmed: `INVALID_ROW` is computed and discarded (`...retained-repair-authority.js:56-63`, `:74`), everything not READY becomes UNQUALIFIED (`:88-92`) and then a reasonless `{state: UNAVAILABLE}` (`...retained-placement-repair.js:340-341`). The delay is a synthesized `{retryAfterMs}` clamped to 100..1000 ms with no attempt or time bound (`...retained-repair-read-retry.js:15-17`, `src/rebalancer/replica-operation-repository-visibility-methods.js:64-73`). |
| B5 cancellation | Partly confirmed: shutdown cancels (`...retained-placement-repair.js:490-496`). The timer and its delay are repository-wide, not per record (`src/rebalancer/replica-operation-repository.js:505-506`); the delete sites do not cancel or reset (`...retained-placement-repair.js:275`, `:372`, `:375`). A retirement that follows a qualified read cancels through `completeRetainedRepairReadDependency`; deletion without a read (`:274-275`) does not. "Replacement" does not exist on the tip: a different operation under the same id is refused (`:86`, ingress `:61-63`). |
| C1 reused UNAVAILABLE | Confirmed: `REUSABLE_DECISIONS` contains UNAVAILABLE, CONTENDED and PENDING (`...retained-repair-ingress.js:27`); a later ingress in the same term with no queued observation is answered from `lastDecision` without a read (`:29-32`, `:104-106`). During backoff the observations are diverted, so the cached UNAVAILABLE is served until the timer fires. |
| C4 joiner inherits a non-proposing decision | Confirmed: after awaiting `pending` the joiner is answered with `lastDecision` whatever its mode, including ABSENT from CONFIRM or REFRESH (`...retained-repair-ingress.js:93-100`; ABSENT settles to nothing, `...retained-placement-repair.js:385-386`). |
| C4 PENDING reuse on an idle ledger | Confirmed: `lastDecision` is set to PENDING before the send (`:196`) and stays PENDING after an uncommitted BACKPRESSURE/RESERVED answer (`:242-250`, trigger LEDGER_COMMIT per `src/rebalancer/replica-placement-owner-constants.js:194-197`); with no ledger commit nothing wakes and later requests reuse PENDING. |
| C4 delegated JOIN finding ABSENT | Confirmed: `joinRetainedRepairDecision` after a committed refusal reads the census and settles ABSENT to nothing (`:118-129`, `:385-386`): no proposal and no queued retry while the recorded blocker is already gone. |
| Record shape | Confirmed (section 2). |
| Fixtures | Confirmed: leadership rows are hand-built and hand-admitted (`test/partition/placement-retained-leadership-fixture.js` at the tip, `:71-99`); "endpoint not arrived" is a wrong-address row (`test/partition/placement-retained-leadership.test.js:46-53`); the copy-owner cache returns a partition SERVICES row with `raft_role: 'leader'` (`test/partition/placement-retained-row-repair-fixture.js:80-82` at the tip); remote senders are fed by hand-called `observeRetainedPlacementRepairCommit`. |

Refuted or narrowed:

- A1 as a present defect of the tip: not found. The tip already resolves from the cache; what is
  missing is the proof against the predecessor `a046d5495` and the required port.
- B5 "replacement cancels": there is no replacement path to cancel; the table defines the rule
  for stage 2 (a new record inherits nothing).
- B2 "a real release commit during the outage is dropped": true at the wake predicates, but not
  observable end to end on the tip in the ingress and post-resolution paths, because the armed
  timer re-reads with CLEARING. The observable defect is the rewritten trigger field; the drop
  becomes real once the continuation is bounded.

## 12. Open questions for the lead (before stage 2)

- **Q1 bound.** Is the continuation bound `REBALANCE_OPERATION_BUDGET_MS` (300 s) from the first
  unavailable read, reported once through `reportWaitBoundSpent`, then event-driven only? The
  permanent-failure witness accepts any stop within 720 s of virtual time.
- **Q2 tenure identity.** Custody attestation gains the receiver's ledger term; the sender binding
  gains the endpoint row incarnation (`created_at`). Acceptable, or must it be the node boot
  incarnation?
- **Q3 custodian tenure end.** May a receiver retire ingress-only records when it loses ledger
  leadership (the sender keeps the obligation)?
- **Q4 handoff toward a remote leader with unchanged contention.** Proposed: one qualified read at
  the sender; CONTENDED means no send and the sender keeps its blocker wake through
  REPLICA_OPERATIONS publication. This changes the expectation of the existing test
  `A-origin BUSY routes to B ...` (it expects a `PLACEMENT_REPAIR` to B and custody on B).
- **Q5 ports and probes.** Make all three ports required. May I also remove the capability probes
  in the two rebalancer consumers (`operation-workflow-gate-operation-row-repair.js:16`,
  `replica-placement-owner.js:292`)? The third probe is in W1b's file.
- **Q6 predecessor proof.** W1 and W2 pass on the tip. Showing them red on `a046d5495` needs the
  new test files on the old source. Authorize a throwaway pushed ref, or accept the stage-2
  "lost wake" mutant as that proof?
- **Q7 fixture fidelity.** The stage-1 witnesses admit production-shaped rows through the real
  cache but do not yet drive `applyReplicaLeadership` -> `queueRoleUpdate`/`queueLeaderNodeUpdate`
  or real CDC delivery. Is building that composition part of stage 2, and does it gate green?
- **Q8 unknown native outcome on an idle ledger.** The own-entry commit is excluded from the wake
  (`...retained-placement-repair.js:43`) and nothing else commits. Proposed: the continuation
  owns re-presenting the exact entry. New behavior; ruling needed.
- **Q9 events during backoff.** Proposed in 10.6: an event decides now instead of waiting for the
  timer (at most one read per coalesced event burst). Confirm.

## 13. Witnesses and lab results

Runner: `LAGRANGE_LAB_AGENT=claude:w1-retained node tools/focused.mjs <sha> tv-dator
0dbed1718c2d07c1fcb8bbe56b87ac41763c262c <dir> <files>`. Every directory under
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/` holds `selection.json`,
`exit.json`, `test-results.ndjson` and the host `.log`/`.err`; the console output is the
sibling `<dir>.console.log`. No runner failure occurred; every non-zero exit is a test outcome.

### Runs **[lab]**

| Run directory | Sha | Files | Pass / fail |
| --- | --- | --- | --- |
| `w1-baseline-tip-0993265e5` | `0993265e53601cba4a6a41baa08158725cfcea7f` | `placement-retained-leadership.test.js`, `placement-retained-row-repair.test.js` | 5 / 0 and 43 / 6 |
| `w1-witness-run1-7b0b427b2` | `7b0b427b251d01c389f301d64533352be084b7ff` | `placement-retained-publication.test.js`, `placement-retained-continuation.test.js`, `placement-retained-leadership.test.js`, `placement-retained-row-repair.test.js` | 4 / 2, 3 / 14, 5 / 0, 43 / 2 |
| `w1-witness-run2-8eba5f745` | `8eba5f745e495b7a094a17a5d7514db5353838bb` | the same four files | 4 / 2, 3 / 14, 5 / 0, 43 / 2 (the same 18 failing cases as run 1) |

Baseline failures on the draft tip (first failure each): row-repair 15
`remote paused repair progresses solely on actual owner WRITE_PATH_RELEASED` (`false !== true`
at `:434`, the delegated sender refuses its caller after the receiver restored the row);
33-36 the four invalid-census cases (`2 !== 1`, "one bounded authoritative read for the whole
release burst" at `:999`); 44 `queued real E2 joins E1 winner and confirms unavailable authority`
(`1 !== 0` at `:1206`, an own-row observation parked behind the backoff). Cases 33-36 are
replaced by the two virtual-clock schedules; 15 and 44 stay as red witnesses (they are 15 and
40 after the replacement).

### Witness map (source = draft tip `0993265e5`; test tree = the run's sha)

| Witness | Test | Claims to fix | Result on the tip **[lab]** | First failure |
| --- | --- | --- | --- | --- |
| W1 | publication 1 | A1 (predecessor `a046d5495`) | pass | - |
| W2 partition-first | publication 2 | A (publication orders) | pass | - |
| W2 endpoint-first | publication 3 | A | pass | - |
| W2 ambiguous | publication 4 | A | pass | - |
| W3 | publication 5 | A2 on `0993265e5` | RED | `1 !== 0`: "the origin as ledger leader evaluates the known blocker first: zero native proposals" |
| W4 | leadership 4 `a lost committed reply retires from the visible winner without another native proposal` | guard | pass | - |
| W5 disclaim | continuation 1 | A3 on `0993265e5` | RED | "a later caller finds no receiver tenure: custody is not trusted and the sender itself owns the owed reconsideration" |
| W5 restart | continuation 2 | A3 on `0993265e5` | RED | "after the receiver restart: the retained row is restored" |
| W5 sibling | row-repair 15 | A3 on `0993265e5` | RED | `false !== true` |
| W6 transient | continuation 3 | B (guard; tip passes) | pass | - |
| W6 permanent | continuation 4 | B4 on `0993265e5` | RED | `1 !== 0`: "a permanent read failure reaches an explicit bounded stop (still armed after 720 continuation turns and 721 reads)" on `8eba5f745`; 200 turns and 201 reads on `7b0b427b2` |
| W7 ingress | continuation 5 | B2 on `0993265e5` | RED | `'LEADERSHIP_START'` instead of `'LEDGER_COMMIT'` |
| W7 consume | continuation 6 | B2 on `0993265e5` | RED | same, at the sender |
| W7 post-resolution | continuation 7 | B2 on `0993265e5` | RED | same |
| W8 shutdown | continuation 8 | B5 (guard) | pass | - |
| W8 retirement | continuation 9 | B5 (guard) | pass | - |
| W9 | publication 6 | A5 and B3 on `0993265e5` | RED | `1 !== 0`: "a qualified answer read under the B binding is judged against that binding ..." |
| B3 sibling | row-repair 40 (was 44) | B3 on `0993265e5` | RED | `1 !== 0` |
| C1 overlapping x4 | continuation 10, 12, 14, 16 | C1 on `0993265e5` | RED | `false !== true`: "a later legitimate trigger obtains fresh authority after an earlier unavailable result" (safety and the one-read assertions pass first) |
| C1 sequential x4 | continuation 11, 13, 15, 17 | C1 on `0993265e5` | RED | `1 !== 2`: "an arrival after settlement starts one fresh decision: an unavailable result is not reused" (safety assertions pass first) |

Not yet witnessed (stage 2): the C4 cases (PENDING reuse after BACKPRESSURE/RESERVED on an
idle ledger; delegated JOIN after a committed refusal that finds ABSENT), deletion without a
read with an armed continuation, and the six mechanism mutants.

Witnesses that pass on the tip are guards: W1 and W2 need a predecessor run (Q6); W6
transient and W8 pass because the tip already re-reads on its timer and cancels at shutdown.

## 14. Found outside scope (reported, not changed)

- `src/partition/partition-placement-admission.js:191-193`: capability probe
  `!repository?.acceptRetainedPlacementRepairRequest` answers OWNER_UNAVAILABLE (W1b file).
- `src/rebalancer/replica-placement-owner.js:292`: `this.workflowOwner?.repository?.wakeRetainedPlacementRepairs?.(...)`
  silently skips the leadership-start wake when any link is missing.
- `src/rebalancer/operation-workflow-gate-operation-row-repair.js:16`: `typeof ... !== 'function'`
  probe answers false.
- `src/partition/group-retirement-redrive.js:455-461`: the SERVICES arm of `announcesLeader`
  tests `raft_role === LEADER`, which a partition SERVICES row never carries (W3 census).

## 15. Stage 2 (implementation, opus writer, 2026-11-21)

Labels as above: **[read]** source only; **[lab]** executed on tv-dator (run directory named in 15.6).

### 15.1 What the owner now is (items 1-5)

- Record (`replica-operation-retained-repair-record.js`): every field has a named state: `entry`
  {UNPINNED | PINNED entryId,body | SETTLED body}, `binding` {UNOBSERVED | LOCAL | REMOTE (+ nodeBootIncarnation,
  replicaCreatedAt) | UNAVAILABLE}, `custody` {SELF | DELEGATED binding, ledgerTerm, entryId}, `tenure`
  {NONE | LEDGER service, term}, `nativeIngress` {IDLE | EXPECTED fence, answer}, `blocker` {NONE | OPERATIONS |
  OCCUPANCY}, `clearingTrigger` (what the last refusal waits for; never null), `owed` (revalidation a failed read
  left), `continuation` {IDLE | ARMED | OPEN | SPENT}, `decision` {IDLE | RUNNING mode, promise}, `origin`
  {CALLER | INGRESS}. Repository `retainedPlacementRepairReleaseSequence` starts at 0.
- Ports: `repairRetainedPlacement`, `resolveRetainedPlacementRepairRoute` (now a typed binding:
  `resolveRetainedPlacementRepairBinding` in the retained routing module, composed in the coordinator lifecycle)
  and `prepareRetainedPlacementRepair` are required; a missing one throws `retained_placement_repair_port_missing`
  at construction. The probes in `operation-workflow-gate-operation-row-repair.js` and `replica-placement-owner.js`
  are gone (the latter now calls the required `observeRetainedLedgerLeadershipStart`). The 22 test files that build a
  bare repository declare `unavailableRetainedRepairPorts()` (`test/test-helpers/retained-repair-ports.js`), the
  owner's own typed unavailable outcomes.
- Authority reads: `READ_FAILED`, `UNQUALIFIED_LEADERSHIP`, `UNQUALIFIED_POSITION` (transient: continuation),
  `UNQUALIFIED_BINDING` (owes ROUTE, no timer), `UNQUALIFIED_SHAPE`, `INVALID_ROW` (typed refusal, logged, no timer).
  A read is judged against the binding its decision resolved when it began (W9).
- Continuation (B1/Q1): per record, delays = the repository's owner-read retry bounds (100 ms doubling to 1 s),
  window = `REBALANCE_OPERATION_BUDGET_MS` from the first unavailable read; at the deadline one `wait_bound_spent`
  and SPENT; any later trigger decides and, if unavailable again, opens a fresh window. Retirement, tenure release
  and shutdown cancel it.
- Q9: an event decides at once (observations are never diverted); the drain joins the decision in flight and then
  consumes `observations | owed` once (one in flight + one owed).
- C1/C4: no decision outcome is reused. Only an arrival that overlaps a decision whose mode may propose (RETRY,
  HANDOFF, JOIN, RECEIVER) inherits it; any other arrival runs a fresh decision with a fresh read. A delegated JOIN
  whose entry got a committed refusal reads the census once and, on ABSENT, proposes a successor.
- Q4: the binding is resolved only inside the serialized decision. At the local ledger leader HANDOFF reads the RETRY
  scope (own row + known blockers): unchanged BUSY => zero proposals. A remote sender presents the exact entry; the
  receiver's decision reads first (the receiver no longer re-presents its own older entry before that read).
- Q2/Q3: custody attests `ledgerTerm` and `nodeBootIncarnation` (the repository's `membershipOwnerBootIncarnation`,
  i.e. the router's issued boot incarnation the NODES row publishes). The sender's REMOTE binding carries the bound
  node's published `boot_incarnation` and the endpoint row's `created_at`; a NODES row of the bound node with another
  boot incarnation, or any ledger PARTITIONS/SERVICES row, queues ROUTE; a HANDOFF voids custody. A receiver releases
  ingress-only records whose tenure ended (not leader, or another term) at its next commit, release or ingress; a
  caller's record keeps the obligation and queues ROUTE. Residual: the receiver does not attest the replica
  `created_at` itself (the partition service does not carry its own SERVICES birth); the pair is attested as
  (boot incarnation from the receiver, created_at observed by the sender).
- Q8: the pinned entry's own ENTRY_COMMITTED wakes the record (kind ENTRY); the decision re-presents that exact entry
  and native replay answers its committed result with no proposal. Without an observed commit, an unknown outcome
  or an uncommitted refusal that waits for LEDGER_COMMIT arms the continuation, which re-presents the exact entry.

### 15.2 B1: why the workflow owner's retry entry and this continuation are two owners

`armObservedProgressRetry` (workflow owner) owns progress of an operation whose durable row is VISIBLE: it reads the
row by id and routes on it, keyed by operation single-flight and fenced by the operation-ownership epoch. This
continuation owns the reconsideration of an operation whose row is ABSENT (its restoration through native apply),
lives at the origin or at a custodian ledger tenure that has no workflow entry, and dies with the retained record,
its binding or its tenure. Different subject (visible-row progress vs absent-row restoration), different fence,
different lifetime: merging them would make one of them act on a fact it cannot observe.

### 15.3 Exact settlement consumers ("a durable outcome settles only the exact entry it proves") [read]

| Consumer | What it treats as settling | Exactness it requires | Near-miss witness (must NOT settle) |
| --- | --- | --- | --- |
| `isCommittedRepairAnswer` (`replica-operation-retained-repair-answer.js`) | a committed native answer | entry PINNED and `answer.entryId` === pinned entryId; ledger partition; positive index/term; exact result fields; ADMITTED `operationIds` === [operationId]; REFUSED readable by `readRetainedRepairRefusal` | row-repair `foreign and malformed native answers retain one exact unknown attempt` (foreign entry id, foreign partition, foreign operation id stay unknown) |
| `retainCommittedRepairRefusal` | a committed refusal | settles only the pinned entry (-> SETTLED); permanent retires | row-repair `incoming durable E0 refusal replays before volatile E1 redrive and rejects changed bytes` (same entry id, other bytes => BYTES, no settlement) |
| ingress replay (`acceptRetainedPlacementRepairRequest`, `readCommittedStatementOutcome` by entry key) | the recorded outcome of an entry | key = exact entry id; native replay validates the exact fingerprint/body | same test as above |
| `readRetainedRepairDecision` EXACT -> `settleRetainedRepairDecision` | a visible row in a qualified read | qualified witness serving the decision's binding at or above the floors; `createdAt` equal and `isReplicaOperationUpdateSatisfied` (history) | row-repair `exact existing row succeeds; changed birth and history refuse without replacement` (same id, other birth/history => CHANGED); `an in-flight stale own-row observation reads absence once` (an old exact-looking row while the current read is ABSENT does not retire) |
| observation replies (`matchesRetainedRepairObservation`, `consumeRetainedRepairObservation`) | never: EXACT/CHANGED only trigger the sender's own SUBJECT read | exact entry id, body bytes, operation id, createdAt, from the bound replica | row-repair `queued real E2 joins E1 winner and confirms unavailable authority without relabeling` (E1's visible row while E2's owner cannot confirm: E2 kept, typed UNAVAILABLE) |
| custody (`custodyMatches`, `recordRetainedRepairCustody`) | transfer of the reconsideration, not settlement | exact entry id, bytes, operation id, createdAt, bound replica, ledger term, boot incarnation | row-repair `different remote E2 never receives custody while owner retains unknown E1` (same operation, other entry => no custody) |
| Q8 own-entry commit (`pinnedEntryCommitted` -> RESOLVE) | never by itself: re-presents the exact entry, replay answers | event entry id === pinned entry id | continuation `Q8 a lost answer after the pinned entry committed ...` |
| dispatch gate `repairOperationRowForGateRepairedReservation` -> `ensureRetainedOperationRow` | `true` only from EXACT above | inherits EXACT | row-repair `reservation gate consumes native repair refusal and retains the original reservation` |
| zero-row update `repairRetainedOperation` (`replica-operation-repository-mutation-update-methods.js:593`) | REINSERTED only on `true` | inherits EXACT | row-repair `native entity repair and ordinary admission serialize: normal first` |
| placement owner attempt settlement (`resolveRetainedPlacementAttempt`, `rebalance-coordinator-operation-creation-support.js:319-365`) | a PLACEMENT_ADMIT answer | settles only `retained.entryId === answer.entryId` under its intent key; separate obligation (ordinary admission), not this owner | not changed here; read only |

### 15.4 Cross-boundary witness and coupled pair

`test/partition/placement-retained-real-publication.test.js`: the real publishers (role events through
`applyReplicaLeadership` -> `queueRoleUpdate`/`queueLeaderNodeUpdate`) write one durable control-plane store
(`createLifecycleCdcService`), every applied write reaches both caches only through `CDCHandler.applyImmediate`; the
consumer rebinds A -> B (REMOTE) -> A (LOCAL), keeps the exact entry, proposes nothing paused, completes once; B's
ingress record is released at its tenure end; conformance: the emitted PARTITIONS leaders are [B, A] and no SERVICES
row with raft_role=leader. Registered: contract `retained-placement-repair-leadership-publication` + coupled pair
`leadership-publication-and-retained-placement-repair` in `test/shards/impact-contracts.json` (audit PASS, 100
contracts, 72 pairs). Fixture: the row-repair copy-owner cache no longer serves a partition SERVICES row with
raft_role=leader.

### 15.5 Witness corrections made or required in the open

- Made (accessor migration only, same assertions): `attempt.entryId/body` -> `attempt.entry.entryId/body`,
  `blockers` -> `blocker.operations`, `occupancy` -> `blocker.kind === 'occupancy'`, `delegated === undefined` ->
  `custody.state === 'self'`, repository `retainedPlacementRepairReadRetry` -> the record's `continuation.state`.
- Added: Q4 counts in `A-origin BUSY routes to B` (0 proposals at B before, exactly 1 after the clear); Q3 assertion
  in W5 disclaim (receiver record map empty).
- REQUIRED, not yet made (conflict with the approved Q8 behavior, evidence [lab] run3): W7 post-resolution
  (continuation 7, `:307` "the unknown outcome keeps its entry pinned") and row-repair 41 (`:1183`, receiver record
  still pinned to E0) assert an intermediate state Q8 removes on purpose: at the ledger leader the lost answer's own
  entry commit is observed, so the record re-presents E0 at once, native replay answers the committed BUSY, and the
  entry is SETTLED with the blocker before the test inspects it. Proposed correction: W7 post-resolution installs its
  read control and virtual clock BEFORE the lost-answer call (fault: reads 1-2 qualified, read 3 fails) so the Q8
  resolution itself performs the post-resolution census read; keep every other assertion (blocker named, trigger
  LEDGER_COMMIT unchanged, release during the outage not dropped). Row-repair 41: replace the pinned-E0 assertion by
  "E0 settled with its committed BUSY blocker, no new proposal". Not applied: needs the lead's acceptance.

### 15.6 Stage-2 commits and lab results

Commits (pushed): `95ee6ee4a` items 1-5; `bc20bb929` real-publication witness (foreign message, see 9d241bd89);
`9d241bd89` coupled pair (LAST; selects the whole corpus: not run here, for the lead to schedule).
[lab] `lab/w1-stage2-run3-bc20bb929-try7` (+ `.console.log`), six files: publication 6/6, leadership 5/5,
real-publication 1/1, continuation 18/21, row-repair 44/45, replace-real-group 1/3. The 16 stage-1 red witnesses are
green except W7 ingress and W7 post-resolution; all 7 guards green; row-repair 15 and 40 green; new Q8 x2 and Q9
green. Red: W7 ingress (release during the outage not restored within 200 continuation turns, cause not yet
attributed: the witness bumps the raft term without a role transition, so the native submit after recovery may be
refused by the write kernel's leadership tenure; unverified), W7 post-resolution and row-repair 41 (Q8 conflict,
15.5), B5 tenure-end (`:545`, one receiver timer still pending after the release, not attributed), S11 owned-repair
and raw-bypass-negative in `replace-real-group-native-ledger-recovery.test.js` (`:64`, ledger owner holds 0
records where 1 was expected, not attributed). Not run: the change cone versus 0993265e5; the mutation table.

## 16. Stage 2b (finishing writer, opus, 2026-11-21)

Labels as above: **[read]** source only; **[lab]** executed on tv-dator (directory under
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/`, console output `<dir>.console.log`).
Start state: branch tip `9d241bd89`, worktree clean (the hook-generated
`solve/changes/global-owner-debt-inventory/inventory.json` was NOT left modified).
Runner failures ("no lab machine is ready", "tv-dator is not a ready lab machine") are
retried in a new `-tryN` directory and are never results.

### 16.1 Attribution of the six red cases (ruling B; S11 first)

**S11 owned-repair and S11 raw-bypass-negative** (`test/rebalancer/replace-real-group-native-ledger-recovery.test.js`)

- Observed on `bc20bb929` **[lab]** `w1-stage2-run3-bc20bb929-try7`: owned-repair first failure
  `:64` "the actual ledger owner retains original identity while the incumbent owns its live lane"
  `0 !== 1`; raw-bypass-negative first failure `:68` "the composed prospective guard must reject this
  known-bad authoritative row" `1 !== 0`.
- Same file on the stage-1 tip `8eba5f745` (whose `src/` is `0993265e5`) **[lab]**
  `w1-s2b-s11-attribution-8eba5f745-try3` (tries 1-2 were runner failures): the SAME two cases fail
  with the SAME first assertions and values (`:64` `0 !== 1`; `:68` `1 !== 0`); `none` passes.
  => NOT a stage-2 regression. The claim "they passed before stage 2" holds only for `7fbdd5057`,
  which is NOT an ancestor of this branch (`git merge-base 7fbdd5057 HEAD` = `812dd3a1b`, the base of
  the 14 WIP draft commits); the S11 files were last changed at `812dd3a1b`.
- Cause **[read]**: WIP draft commit `533a861b0` replaced `resolveRemoteLedgerLeader`
  (`src/rebalancer/rebalance-coordinator-operation-creation-support.js:233-235` on the tip), which
  at `812dd3a1b` selected a ledger SERVICES row with `raft_role === leader`, by the canonical route
  `resolvePlacementLedgerRoute` (`src/rebalancer/replica-placement-owner-transport.js:27-43`: PARTITIONS
  leader + exactly one ACTIVE identity-bound partition endpoint). The S11 fixture publishes the ledger
  leader ONLY through a partition SERVICES row with `raft_role: 'leader'` and no `service_type`,
  `address` or PARTITIONS row (`test/rebalancer/replace-real-group-native-ledger-fixture.js:31-33`
  world cache, `:61-62` holder cache), a row production never writes (brief: "No fixture may write
  raft_role=leader on a partition SERVICES row"). The canonical route is therefore `null` at the
  holder; the holder's retained repair cannot present PLACEMENT_REPAIR and the ledger owner holds no
  record. Classification: fixture (witness) defect exposed by the draft's correct production route,
  pre-existing on `0993265e5`. Resolution: see 16.2.

**W7 ingress** (`test/partition/placement-retained-continuation.test.js`, test at `:220` on `9d241bd89`)

- Observed **[lab]** `w1-stage2-run3-bc20bb929-try7`: first failure `:216` (via `releaseAndRecover`
  from `:240`) "the release committed during the outage is not dropped: the retained row is
  restored" (`expected: true`), after 200 continuation turns; no `wait_bound_spent`, no warning.
- Diagnostic probe `39024f7cc` (local ref `probe/w1-diag-w7-ingress`, never pushed; it wraps the
  receiver's `decideRetainedRepair` and `repairRetainedPlacement`) **[lab]**
  `w1-s2b-probe-w7-ingress-39024f7cc`: after the ingress the caller record is SETTLED, trigger
  LEDGER_COMMIT, blocker OPERATIONS, owed CLEARING, observations ROUTE, continuation ARMED, tenure
  term 2; after the release the HANDOFF read fails (owed CLEARING|ROUTE, trigger unchanged); on
  recovery the HANDOFF read succeeds, the record pins a new entry and the native submit answers
  `{success:false, failureCode:'partition_write_cutover_paused'}`; the record then waits on
  WRITE_PATH_RELEASED with no timer (correct per table 10.2 "uncommitted typed refusal").
- Cause **[read]**: the witness raises the ledger raft term at `:228` without the participant
  release a new term requires: `invalidateParticipantReleaseAdmission`
  (`src/partition/partition-participant-transaction-pause.js:227-234`) re-raises the cutover pause
  when the admission proof's term differs from the status term, and `proposePlacementCommand`
  refuses (`src/partition/partition-placement-admission.js:134-135`). Nothing in the witness releases
  the write path. Classification: witness defect (pre-existing in the stage-1 witness; the stage-1
  tip failed earlier at the trigger assertion, so it never reached this point). The previous
  writer's suspicion (term bump) was right about the trigger, wrong about the mechanism (not the
  write kernel's leadership tenure; the participant cutover pause).
- Resolution: re-staged (16.3): after the term bump the witness performs the participant release
  (`resumeFixtureParticipantAdmission`, as W5 does). Every original assertion kept.

**W7 post-resolution** (continuation `:292` on `9d241bd89`)

- Observed **[lab]** run3-try7: first failure `:307` "the unknown outcome keeps its entry pinned"
  (`expected: true`).
- Cause **[read]**: approved Q8. The holder is the ledger leader; the lost answer's own entry commit
  wakes the record (kind ENTRY, `replica-operation-retained-repair-wake.js` `onCommit`), the drain
  re-presents E0 after the caller's decision settles, native replay answers the committed BUSY and
  the entry is SETTLED before `bounded()` (40 event-loop turns) returns. Classification: re-staging
  under Q8 (the witness asserted an intermediate state Q8 removes on purpose).
- Resolution: re-staged (16.3).

**Row-repair 41** `real committed BUSY E0 lost reply replays across repositories without a fresh proposal`

- Observed **[lab]** run3-try7: first failure `:1183` `undefined !== 'retained-repair:historical-REMOVE:…'`.
- Cause **[read]**: NOT the Q8 conflict the previous writer recorded. `:1183` reads
  `record.entryId`, a field the stage-2 record does not have (`entry.entryId`,
  `src/rebalancer/replica-operation-retained-repair-record.js:61-73`): the stage-2 accessor
  migration (15.5) missed this one line, so the value is `undefined` in every schedule. At that
  moment (three microtask hops after the caller's decision settles, no `bounded()`), the Q8
  resolution in the drain is still awaiting its first read, so E0 IS still pinned **[read]**.
  Classification: witness defect introduced by stage 2's migration.
- Resolution: accessor migrated (`.entry.entryId`); no other change. If the lab shows the entry
  already settled at that line, this becomes a Q8 re-staging (not expected, see above).

**B5 tenure-end** (continuation `:527` on `9d241bd89`)

- Observed **[lab]** run3-try7: first failure `:545` "the ended tenure released its ingress-only
  record without a read" `1 !== 0` (the record map, not a timer: the previous summary said "one
  receiver timer"; the failing assertion is the map size; the timer assertion follows it).
- Cause **[read]**: stage 2 released an ended tenure only inside `onCommit`, `onReleased` and the
  ingress (`acceptRetainedPlacementRepairRequest`). In B5 the later caller's PLACEMENT_REPAIR to the
  demoted replica is refused by `requestPlacementRepair`'s leadership check
  (`src/partition/partition-placement-admission.js:185-186`, W1b's file) BEFORE the repository,
  so no release site runs. Classification: product defect of stage 2 (residual C(ii) as stated by
  the previous writer). Resolution: 16.2 (C(ii)).

### 16.2 Fixes (commit after `9d241bd89`, see 16.6)

- C(ii) leadership-loss trigger **[read]**. The ledger partition service has no leadership-loss
  event of its own (`PARTITION_SERVICE_EVENT`, `src/partition/partition-service-constants.js:228-243`,
  has LEADER_ELECTED but no loss); the ledger replica's demotion reaches the rebalancer only as the
  leadership-sink drive: `onFollower`/`onCandidate` -> `updateRebalancerLeadership` ->
  `driveRebalancerLeadershipSink` -> `sink.setLeader(false)`
  (`src/partition/partition-service-raft-lifecycle-wiring.js:87-110`,
  `src/partition/partition-service-leader-activation-methods.js:72-79`; shutdown at
  `partition-service-lifecycle-methods.js:103-109`). The sink is the placement owner, whose
  `setLeader(true)` already carries the leadership-start wake. Now every `setLeader(false)` lets the
  retained owner release the tenures that ended (`retireEndedRetainedTenures(service)`), BEFORE the
  placement owner's own `isLeader === next` early return: custody follows the replica's leadership,
  not the placement owner's planning state (the repair-ledger fixture pauses planning with
  `setLeader(false)` while the ledger leads; that call finds no ended tenure). Subscribing to
  `service.raft` role events instead was rejected: the port is recreated during the service's life
  (`relayPartitionConsensusObservations` comment), so a bind-time subscription would go stale; adding
  a partition-service loss event is outside this scope. A decision RUNNING at the loss is released
  when it settles (`releaseEndedRetainedTenure` in the decision `finally`, both the drain's decision
  and the receiver decision). A tenure ended = service shut down, not leader, or another term.
  The commit/release/ingress checks stay as fences for a term change without a role event.
- Stage-2 defect found while doing C(ii) **[read]**: the placement owner declares `workflowOwner`
  optional (`src/rebalancer/replica-placement-owner.js:4`, `requireOptionalMethods` at `:123` on the
  tip) and production passes `workflowOwner: null` when there is no coordinator
  (`src/bootstrap/shared/control-plane-setup.js:646`), but stage 2's Q5 edit called
  `this.workflowOwner.repository.observeRetainedLedgerLeadershipStart()` unconditionally: a
  TypeError on `setLeader(true)` for such owners (e.g. `test/rebalancer/replica-placement-owner-core.test.js:550-566`
  constructs one without a workflow owner and calls `setLeader(true)`; the stub workflow owner at
  `replica-placement-owner-test-support.js:1204` has no repository). Fixed: `setLeader` resolves the
  retained owner as `this.workflowOwner ? this.workflowOwner.repository : null` (none for the
  declared-absent collaborator, the existing pattern of `:499` `if (!this.workflowOwner) return
  false`); when a workflow owner is present its `repository` must
  carry `observeRetainedLedgerLeadershipStart` and `retireEndedRetainedTenures` (typed construction
  refusal `ReplicaPlacementOwner collaborator invalid: workflowOwner.repository`). The one stub
  workflow owner was migrated (Q5) to `retainedRepairOwnerWithoutRecords()`
  (`test/test-helpers/retained-repair-ports.js`).
- C(i) receiver attests its own birth **[read]**. The partition service does not retain its SERVICES
  birth (`PartitionServiceRowOwner.registerReplica` returns sealed evidence to its caller,
  `src/partition/partition-service-row-owner.js:288-338`; nothing keeps it on the service). The
  receiver now attests `replicaCreatedAt` from ITS OWN node's SERVICES row for its own replica
  (`ownReplicaBirth`: the row keyed by its replica id, with its own node id and partition id and a
  positive created_at), together with `nodeBootIncarnation` (its process boot incarnation). Without
  its own row it attests no custody (the sender keeps the obligation). `custodyMatches` compares
  both members with the sender's binding (published `boot_incarnation`, endpoint `created_at`) in one
  place. Residual (reported): the created_at comes from the receiver's own projection, not from the
  registration evidence or an authoritative SERVICES read (`observeAuthoritativeReplicaLifecycle`,
  used by `replica-handler-learner-retirement-authority.js:95-111`); that read belongs to the node's
  replica state machine, which is not composed into the rebalance coordinator. Fixtures: the repair
  ledger node holds its own production-shaped registration row (`world.endpoint`), and
  `remoteSender` binds that same row instead of minting another birth; W5 restart's
  re-registration reaches the restarted ledger node and the sender alike.
- S11 fixture: holder and world caches get the canonical route rows (PARTITIONS leader + the
  ledger's own follower endpoint) instead of a `raft_role: 'leader'` partition SERVICES row.

### 16.3 Re-staged witnesses: before / after (ruling A)

**W7 post-resolution** (property kept: "a read failure on the post-resolution path leaves the
blocker's clearing trigger unchanged and the owed revalidation is retained"; it is still exercised
in a reachable schedule: the holder's own Q8 resolution followed by a failing census read).

| Before (`9d241bd89`) | After |
| --- | --- |
| clock + read control installed AFTER the lost-answer call (the first arm used the real clock) | installed BEFORE it; fault = reads 1-2 qualified, read 3 throws |
| `assert.ok(attempt.entry.entryId, 'the unknown outcome keeps its entry pinned')` | the exact entry is re-presented: `presented.length === 2`, `presented[1].entryId === presented[0].entryId`, bodies deep-equal ("the unknown outcome keeps its entry pinned: the exact entry is re-presented") |
| second caller call `repairRetainedOperation` -> false ('resolution') | removed: under Q8 the resolution is the holder's own decision on its observed entry commit; `idleRepairs` waits for it |
| `reads.attempted === 2` "one read before and one after resolving the pinned entry" | `reads.attempted === 3` "the caller read once; the resolution read once before and once after the pinned entry" (same two resolution reads plus the caller's read, now counted) |
| `proposals === 1`, no further proposal, same record, blocker = competitor, trigger LEDGER_COMMIT, `releaseAndRecover` | unchanged |

**W7 ingress**: one added step after `controllablePort.term += 1`:
`await resumeFixtureParticipantAdmission(world.leader)` (the participant release a new term needs).
No assertion changed.

**B5 tenure-end**: added BEFORE the later caller (strengthening): record map empty "the leadership
loss released the ingress-only record of the ended tenure", no timer armed, no read. The original
assertions after the later caller are unchanged.

**Row-repair 41**: `:1183` `record.entryId` -> `record.entry.entryId` (accessor migration only).

### 16.4 S11 after the fixes, and what stays red

- **[lab]** `w1-s2b-run1-d427d14ff` (sha `d427d14ff`): S11 `none` and `owned-repair` pass;
  `raw-bypass-negative` still fails at `:68` `1 !== 0` with the canonical route rows in place, so its
  cause is not the route. It injects the historical row by a raw committed insert (no retained repair
  is involved) and asserts that the REPLACE dispatch's REMOVE safety rejects it
  (`evaluateRemoveSafety`, `src/rebalancer/operation-workflow-remove-safety-evaluator.js:419`), a
  guard no commit of this owner touches. It is red identically on `8eba5f745` (src = `0993265e5`).
  The draft base `812dd3a1b` could not be measured: **[lab]** `w1-s2b-s11-base-812dd3a1b` is a
  runner refusal ("the commit's generated metadata is stale; regenerate and commit
  test/shards/impact-graph-seal.json", exit 97), not a result. The draft range
  `812dd3a1b..0993265e5` changes only the retained owner, the ledger route (now supplied by the
  fixture) and `partition-placement-admission.js` (W1b's file). Classification: not this owner;
  pre-existing on the base of this work; reported (section 16.8), not changed.

### 16.5 Mutation table (ruling D) **[lab]**

Every mutant is built on a detached HEAD from `d427d14ff` through the normal pre-commit hook
(`heavy.sh git commit`), kept only under the local ref `probe/w1-mutant-<name>`, never pushed.
Patches: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9fc649c2-52dc-446a-bd53-fca59718b5ee/scratchpad/mutants/apply.py`
(each is the exact old/new text below). Lab directories under `lab/`.

| Mechanism | Mutant (src change) | Commit (local ref) | Lab run | Killed by (first failure) |
| --- | --- | --- | --- | --- |
| lost wake | `routePublication` (wake module): a ledger PARTITIONS/SERVICES row wakes ROUTE only if `row.raft_role === RAFT_ROLE.LEADER` (the role-keyed notified-row predicate of `a046d5495`; production never publishes it) | `80826174e` `probe/w1-mutant-lost-wake` | `w1-s2b-mutant-lost-wake-a1` | KILLED: W2 partition-first (publication 2) "the completing publication alone makes reconsideration reach the current leader B" (`:122`); also W2 endpoint-first, W2 ambiguous, W9, real-publication |
| stale custody | `recordRetainedRepairCustody`: an answer without matching custody keeps the previous custody (`: attempt.custody` instead of `: SELF_CUSTODY`) | `c8369ccbc` `probe/w1-mutant-stale-custody` | `w1-s2b-mutant-stale-custody-a1` (continuation, row-repair, leadership) | **NOT KILLED** (21/21, 45/45, 5/5). Finding: no witness gives a delegated sender a typed disclaim WITHOUT custody. W5 disclaim does not: the demoted receiver's refusal comes from `requestPlacementRepair`'s leadership check (W1b's file), an uncommitted refusal that arms the sender's continuation whatever its custody. Witness added (16.6) and the mutant re-run on it (row below). |
| blind handoff | `retryRetainedRepairDecision`: HANDOFF reads SUBJECT scope also at the local leader (`mode === MODE.HANDOFF ? SUBJECT : CURRENT`) | `adac58888` `probe/w1-mutant-blind-handoff` | `w1-s2b-mutant-blind-handoff-a1` | KILLED: W3 (publication 5) "the origin as ledger leader evaluates the known blocker first: zero native proposals" `1 !== 0`; also W9 |
| reused unavailable | `completeIncomingRetainedRepair`: an arrival with no decision in flight is answered from `lastDecision` when it is UNAVAILABLE (no read) | `768679a5a` `probe/w1-mutant-reused-unavailable` | `w1-s2b-mutant-reused-unavailable-a1` | KILLED: C1 sequential x4 (continuation 11, 13, 15, 17) "an arrival after settlement starts one fresh decision: an unavailable result is not reused" `1 !== 2`; also the four C1 overlapping cases (10, 12, 14, 16) |
| overwritten trigger | `oweRetainedRepair`: a failed read sets `attempt.clearingTrigger = PLACEMENT_TRIGGER.LEADERSHIP_START` (the B2 defect) | `3ddd34710` `probe/w1-mutant-overwritten-trigger` | `w1-s2b-mutant-overwritten-trigger-a1` | KILLED: W7 ingress (continuation 5) "a failed read owes revalidation; it does not rewrite what the committed refusal waits for" `'LEADERSHIP_START'` vs `'LEDGER_COMMIT'`; W7 post-resolution (7) "the failed post-resolution read owes revalidation; the committed trigger is unchanged", same values. NOTE: W7 consume (6), the planned killer, stays GREEN: its sender holds receiver custody at the UNAVAILABLE observation (`consumeRetainedRepairObservation` returns before owing when DELEGATED), so the sender's own owe path is not exercised there; the mechanism is killed by the other two W7 witnesses (finding recorded in 16.8). |
| uncancelled timer | `retireRetainedRepair` no longer calls `cancelRetainedRepairContinuation` | `b58b02f45` `probe/w1-mutant-uncancelled-timer` | `w1-s2b-mutant-uncancelled-timer-a1` | KILLED: B5 tenure-end (continuation 20) "the released record left no continuation armed" `1 !== 0` (`:566`, the assertion at the leadership-loss edge). NOTE: W8 retirement (9), the planned killer, stays GREEN: there the retirement follows a qualified read, and `satisfyRetainedRepairRevalidation` cancels the continuation before `settleRetainedRepairDecision` retires; W8 retirement therefore witnesses "nothing fires after retirement", not "retirement itself cancels". The retirement-without-read case is B5. |

### 16.6 Witness added for the surviving stale-custody mutant

`W5 a disclaim without custody from a receiver whose tenure ended mid-decision returns the
obligation to the sender` (continuation, commit `6517e3c17`). Schedule: the receiver's first read
fails, so it answers UNAVAILABLE and attests custody of the exact entry (sender: `custody.state ===
'delegated'`, no sender timer); the sender's later caller re-presents the entry; the receiver's own
decision holds its read while the same replica moves to a later term (with the participant
release); the decision then answers the typed disclaim without custody and releases its ended
record. Assertions: no proposal; the sender's custody is `self` ("a reply without attested custody
leaves no custody"); the sender owns an armed continuation; the receiver map is empty with no timer;
advancing the sender's clock completes the original entry exactly once and retires the sender with
no timer left. Under the mutant the sender stays `delegated` and owns no continuation. Results in
16.5 (row "stale custody (re-run)") and 16.7.

**[lab]** `w1-s2b-run2-6517e3c17`: the new witness failed at its FIRST assertion on the correct
code ("the receiver attested custody of the exact entry", `'self'` vs `'delegated'`). Cause
**[read]**: custody WAS attested, then voided by the sender's own initial route-row notifications
(the deferred cache listener delivers the PARTITIONS/SERVICES rows `remoteSender` admitted once the
record exists): they run a HANDOFF with an UNCHANGED binding, `bindRetainedRepairDecision` voided
custody on every HANDOFF, and `retryRetainedRepairDecision` then returned early without
re-presenting (`mode === HANDOFF && !changed && kinds === ROUTE`). So in these fixtures a remote
sender's custody never survived its first publication hint, which is also why the stale-custody
mutant survived everything. This contradicts ruling Q2 (tenure end = disclaim, route change, or a
published incarnation change of the bound endpoint; the binding carries route + both incarnation
members) and left a sender with neither custody nor a continuation after any no-op ledger row
publication. Product defect of stage 2, fixed in the next commit: custody ends only when the binding
differs from the one it was attested under (`bindRetainedRepairDecision`, the `mode` parameter
removed). The table-10.5 cell "route change -> custody is not trusted across a publication" is
superseded by Q2 for an unchanged binding; a changed binding still voids custody and re-presents.

**[lab]** `w1-s2b-run3-f5184f08b` (custody fix): the new disclaim witness passes; W5 disclaim
(continuation 1) turned red at `:88` "a later caller finds no receiver tenure: custody is not trusted
and the sender itself owns the owed reconsideration" (`false`). Cause **[read]**: with custody now
genuinely held, the later caller is a JOIN that re-presents directly; the demoted receiver answers
`NOT_LEADER` from `requestPlacementRepair`'s leadership check (W1b's file) before its repository, and
`retainUncommittedRepairAnswer` recorded `LEADERSHIP_START` (`PLACEMENT_CLEARING_TRIGGER`, W1b's
row) with no continuation. Before the custody fix W5 disclaim passed by accident: the voided custody
made the caller a RETRY whose sender read was refused UNQUALIFIED_LEADERSHIP (transient), which armed
the timer. Product defect of stage 2 (same fact, receiver without tenure, handled two ways depending
on the caller's mode). Fix (next commit): at a REMOTE binding, an uncommitted refusal whose trigger is
LEADERSHIP_START is the receiver's disclaim (table 10.2 "disclaim"): custody SELF (already done for
REMOTE uncommitted answers), `owed |= CLEARING | ROUTE`, continuation armed with reason
`receiver_without_ledger_tenure`, the recorded blocker trigger NOT rewritten. A LOCAL binding keeps the
table's LEADERSHIP_START (woken by `observeRetainedLedgerLeadershipStart`).

Mutation table, continued (16.5):

| Mechanism | Mutant | Commit (local ref) | Lab run | Killed by |
| --- | --- | --- | --- | --- |
| stale custody (re-run on the final head) | same patch as above, built on `551c574ec` | `308a8e348` `probe/w1-mutant-stale-custody-r3` | `w1-s2b-mutant-stale-custody-r3-a1` | KILLED: new W5 disclaim-mid-decision witness (continuation 3, `:176`) "a reply without attested custody leaves no custody: the disclaim is not trusted as custody" `'delegated'` vs `'self'`. (An intermediate build `9ffb31e3c` `probe/w1-mutant-stale-custody-r2` on `6517e3c17` was not run: on that sha the witness itself failed its first assertion, see 16.6.) |

The other five mutants were built on `d427d14ff`; the commits after it (`6517e3c17` witness,
`f5184f08b` custody/binding, `551c574ec` remote disclaim) do not touch the five mutated sites
(`routePublication`, `retryRetainedRepairDecision` scope line, `completeIncomingRetainedRepair`,
`oweRetainedRepair`, `retireRetainedRepair`) and change no witness those kills rely on **[read]**;
they were not re-run on the final head.

### 16.7 Commits of stage 2b and the final focused lab table

Pushed to `work/retained-ledger-observation-repair-20261121` (each through `heavy.sh`, normal hook):

| Commit | Content |
| --- | --- |
| `d427d14ff` | C(ii) leadership-loss release (+ settle-time release), placement owner's optional workflowOwner honoured + typed refusal, C(i) receiver-attested birth, W7 ingress participant release, W7 post-resolution re-staged, B5 loss-edge assertions, row-repair 41 accessor, S11 canonical route rows, repair-ledger node's own registration row (first attempt refused by the hook: file-size 808 > 800 and one literal; fixed before this commit) |
| `6517e3c17` | new witness: disclaim without custody mid-decision (16.6) |
| `f5184f08b` | custody ends with its binding, not with every route publication (16.6) |
| `551c574ec` | a remote receiver's leadership refusal is its disclaim (16.6) |

Final focused run **[lab]** `w1-s2b-run4-551c574ec` (sha `551c574ecb24a5d956567057b5c99c314d0e674f`, tv-dator):

| File | Pass / total |
| --- | --- |
| `test/partition/placement-retained-publication.test.js` | 6/6 |
| `test/partition/placement-retained-continuation.test.js` | 22/22 |
| `test/partition/placement-retained-leadership.test.js` | 5/5 |
| `test/partition/placement-retained-row-repair.test.js` | 45/45 |
| `test/partition/placement-retained-real-publication.test.js` | 1/1 |
| `test/partition/placement-retained-post-copy.test.js` | 2/2 |
| `test/partition/placement-growth-dispatch-identity.test.js` | 13/13 |
| `test/rebalancer/replace-real-group-native-ledger-recovery.test.js` | 2/3 (raw-bypass-negative: not this owner, 16.4) |
| `test/rebalancer/replica-placement-owner-core.test.js` | 19/20 (test 20 "Finding 2 & 3 production witness: 3->5 GROWTH_PROMOTE ...": "ReplicaOperationRepository requires a control-plane mutation ingress"; identical on `0993265e5` **[lab]** `w1-s2b-attr-0993265e5-placement-owner-core`: pre-existing, not this change) |

Earlier runs of this stage: `w1-s2b-run1-d427d14ff` (continuation 21/21, row-repair 45/45, S11 2/3,
owner-core 19/20, rest green), `w1-s2b-run2-6517e3c17` (new witness red on its first assertion,
16.6), `w1-s2b-run3-f5184f08b` (W5 disclaim red, 16.6).
The 16 stage-1 red witnesses: all green on `551c574ec` (W3, W5 x2, row-repair 15, W6 permanent,
W7 x3, W9, row-repair 40, C1 x8). The 7 guards: green (W1, W2 x3, W4, W6 transient, W8 x2 — W8
counted as two). Q8 x2, Q9, B5, real-publication: green.

### 16.8 Residuals, findings and what is not done

Residuals (ruling C):
- C(i) closed with a stated limit: the receiver attests its own `created_at` from its own node's
  SERVICES row for its replica (not the sender's copy), together with its boot incarnation; the
  sender compares both with its binding. Limit **[read]**: the value comes from the receiver's own
  projection, not from the registration evidence (not retained by the partition service) nor an
  authoritative SERVICES read (`observeAuthoritativeReplicaLifecycle`, a replica-state-machine
  owner not composed into the coordinator). In the repair-ledger fixtures both boot incarnations
  are `null` (the test coordinator has no router boot incarnation and the sender cache no NODES
  row): the pair matches by `null === null`, so the boot member is not discriminated by any witness.
- C(ii) closed: release at the leadership-loss drive (16.2); witness B5 (loss-edge assertions) and
  the new disclaim witness (release after a decision in flight settles).

Findings outside this owner (reported, not changed):
- S11 raw-bypass-negative red (16.4): REMOVE safety guard, pre-existing on `0993265e5`.
- `replica-placement-owner-core` test 20 red on `0993265e5` and here ("ReplicaOperationRepository
  requires a control-plane mutation ingress"): the test builds a repository without the mutation
  ingress; not touched by this owner's changes.
- `requestPlacementRepair` (`src/partition/partition-placement-admission.js:185-186`, W1b) refuses a
  non-leader with NOT_LEADER before the repository, so the repository's own typed disclaim
  (`acceptRetainedPlacementRepairRequest`, `!service.isLeader`) is unreachable from a remote
  sender; this owner now treats that refusal at a REMOTE binding as the disclaim (16.6). The
  `PLACEMENT_CLEARING_TRIGGER` row NOT_LEADER -> LEADERSHIP_START (W1b's table) is unchanged.
- No partition-service event exists for leadership loss; the leadership-sink drive is the only
  channel (16.2). If W2/W3 add one, the retained owner should bind it in
  `bindRetainedPlacementRepairWake` instead of the placement owner forwarding.

Witness findings from the mutation table:
- W7 consume does not exercise the sender's own owe path (its sender holds receiver custody at the
  UNAVAILABLE observation); the overwritten-trigger mechanism is killed by W7 ingress and W7
  post-resolution instead. Not re-staged (the mechanism is killed; noted for the verifier).
- W8 retirement witnesses "nothing fires after retirement" only after a qualified read already
  cancelled the timer; retirement-without-read cancellation is witnessed by B5 (killed the
  uncancelled-timer mutant).
- The stale-custody mechanism was invisible to every witness because custody never survived a
  sender's first publication hint (16.6); fixed in product, killed by the new witness.

Not done: the corpus selection implied by `9d241bd89` (the lead schedules it); the mutants other
than stale custody were not re-run on the final head (16.5 note); 16.9 (change cone) below.

### 16.10 Interaction with W1b: definite refusals (coordinator input)

W1b's `38708b6fa` (branch `work/placement-outcome-format-20261121`, not merged here) gives
`BYTES`, `ORIGIN`, `TARGET`, `REMOVE_INTENT_UNSCOPED` and `RESULT` a null row ("definite answer,
nothing to wait for") in `PLACEMENT_CLEARING_TRIGGER` (`git show 38708b6fa:src/rebalancer/replica-placement-owner-constants.js`
`:181-185`). **[read]** on `551c574ec`: `retainUncommittedRepairAnswer` did NOT set the trigger to
null (the record state is named); for a null row it logged `AUTHORITY_REFUSED` and returned, leaving
the record in the map with its dead entry pinned, no continuation and no owned wake (only the generic
LEDGER_COMMIT wake at a local ledger, which would re-present the refused entry on every ledger
commit; nothing at a remote sender). Before the merge `BYTES` has no row on this branch and is
treated as an unknown outcome (bounded continuation re-presenting the refused entry for up to 300 s).
Both lack a definite consequence.

Fix `fd1cf0489`: a null-row refusal retires the record (cancelling its continuation) and logs
`Retained placement repair entry definitely refused` with `{reason, operationId, entryId}`; the
origin's workflow owner keeps the operation obligation (zero-row update arm / dispatch gate) and its
next arrival starts a fresh record with a fresh entry id, never the refused one. This mirrors the
committed permanent refusal (table 10.2). Applies already to this branch's existing null rows
(HOLD_NOT_HELD, TARGET_CLAIM_TAKEN, ALREADY_FOUNDED, SYSTEM_PARTITION_SEED_FOUNDED,
LEDGER_PARTITION_REQUIRED, when answered uncommitted) and to W1b's five after the merge.

Witness (continuation, last test): another command is committed under the pinned entry's key
through the real native admission (`requestPlacementAdmission` with the retained payload's entry id)
before the record's presentation, so the native replay refuses the presentation definitely. Asserts:
the answer's code is a null row of the clearing table; record map empty; no timer; the refused entry
presented exactly once; no repair proposal; the ERROR carries reason, operation and refused entry; a
later caller presents a fresh entry id. It can be green only after W1b's rows are merged: on this
branch the first assertion fails by design and names the missing row (expected red until the merge;
it is NOT counted in 16.7).

### 16.9 Change cone versus `0993265e5` **[lab]**

Run: `scripts/lab.js test changed --lane all --sha 551c574ecb24a5d956567057b5c99c314d0e674f
--base-sha 0993265e53601cba4a6a41baa08158725cfcea7f --on tv-dator`, log
`lab/w1-cone-551c574ec-try2.log` (the first attempt `w1-cone-551c574ec.log` was a planner refusal:
the local import graph was not the one the committed seal binds after the mutant builds; refreshed
with `generate-global-owner-debt-inventory.js --refresh-import-graph-only` through heavy.sh).
Result: 1419 files, 1350 pass, 69 fail.

Attribution: the 69 failing files were rerun on `0993265e5` in one focused run
(`lab/w1-s2b-cone-attr-0993265e5-try2`, try1 a runner refusal). 64 fail there too
(ALREADY FAILING ON THE BASE, not this change): 
- `test/control-plane/replica-dispatch-reservation-identity.test.js`
- `test/node/fresh-create-resumed-syncing-claim.test.js`
- `test/partition/placement-create-bootstrap-binding.test.js`
- `test/partition/placement-creation-terminal-replay.test.js`
- `test/partition/placement-founding-and-runtime-service-admission.test.js`
- `test/raft/raft-rs-backend/committed-membership-census.test.js`
- `test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js`
- `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js`
- `test/rebalancer/message-group-membership-operation-lane.test.js`
- `test/rebalancer/operation-record-step-shape.test.js`
- `test/rebalancer/replace-named-handoff-attempt.test.js`
- `test/convergence/dt-formation-declared-size-latch.test.js`
- `test/rebalancer/replace-real-group-native-ledger-recovery.test.js`
- `test/rebalancer/replace-owner-lease-verdict-property.test.js`
- `test/rebalancer/replace-real-group-scheduling.test.js`
- `test/rebalancer/replica-placement-owner-clearing-triggers.test.js`
- `test/rebalancer/reservation-file-backed-restart.test.js`
- `test/rebalancer/replica-placement-owner-core.test.js`
- `test/rebalancer/storage-reservation-lost-outcome-idempotency.test.js`
- `test/scripts/check-guideline-navigability.test.js`
- `test/scripts/check-operation-dispatch-completion-owner.test.js`
- `test/rebalancer/strict-operation-outcomes.test.js`
- `test/scripts/repository-legacy-fallback-closure.test.js`
- `test/rebalancer/admission-real-size-estimates.test.js`
- `test/rebalancer/executor-bypasses-workflow-owner.test.js`
- `test/scripts/select-change-tests.test.js`
- `test/rebalancer/replica-operation-repository.test.js`
- `test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js`
- `test/rebalancer/duplicate-operation-prevention.property.test.js`
- `test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js`
- `test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
- `test/rebalancer/quorum-conditioned-remove-safety.test.js`
- `test/rebalancer/rebalance-coordinator-topology-guard.test.js`
- `test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
- `test/rebalancer/rebalance-coordinator-stopping-reconcile-stale-priority.test.js`
- `test/rebalancer/replace-replica-workflow.test.js`
- `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
- `test/rebalancer/replica-operation-membership-epoch-binding.test.js`
- `test/rebalancer/ledger-quorum-spread-hold-cure-drain-admission.test.js`
- `test/raft/snapshot-dispatcher-wiring.test.js`
- `test/rebalancer/reservation-fail-closed-dispatch-gate.test.js`
- `test/rebalancer/operation-workflow-remove-safety-concurrent-down-target.test.js`
- `test/rebalancer/reservation-expiry-operation-aware.test.js`
- `test/rebalancer/reservation-reconcile-premature-orphan-release.test.js`
- `test/rebalancer/coordinator-created-operation-progress.test.js`
- `test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js`
- `test/query/sql-query-engine-create-table-quorum.test.js`
- `test/rebalancer/operation-workflow-remove-safety-concurrent-stale-phantom.test.js`
- `test/rebalancer/operation-workflow-target-sync-active-progress-contract.test.js`
- `test/rebalancer/rebalancer-entity-interaction-contract.test.js`
- `test/rebalancer/self-owned-coordinator-handoff-dispatches-in-process.test.js`
- `test/rebalancer/replica-operation-retained-owner-turn.test.js`
- `test/rebalancer/replica-status-completeness.property.test.js`
- `test/rebalancer/terminal-status-constants.test.js`
- `test/rebalancer/replica-operation-insert-retry-idempotency.test.js`
- `test/rebalancer/operation-workflow-remove-safety-universal-floor.test.js`
- `test/convergence/dt-formation-joint-admission-release-liveness.test.js`
- `test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js`
- `test/convergence/dt-placement-owner-formation-drain.test.js`
- `test/integration/message-group-learner-join.integration.test.js`
- `test/raft/raft-rs-backend/initialization-shutdown-serialization.integration.test.js`
- `test/rebalancer/message-group-operation-routing.integration.test.js`
- `test/integration/control-plane-rebalance.integration.test.js`
- `test/integration/lagrange-server-npm-package.integration.test.js`

5 pass on the base and fail in the cone (candidates for this change):
- `test/bootstrap/boot-incarnation-reservation-census.test.js`: MINE (stage 2): "no unclassified
  incarnation-default site", `+ "src/rebalancer/replica-operation-retained-repair-ingress.js#dropped_field"`:
  the custody literal `holds ? {..., nodeBootIncarnation} : null` matched the census's dropped-field
  shape. Fixed in the next commit (explicit no-custody return; attestation unchanged).
- `test/rebalancer/coordinator-dedup-gap.test.js`, `test/rebalancer/rebalance-coordinator-outcome-routing.test.js`,
  `test/rebalancer/operation-workflow-delivered-create-progress-retention.test.js`,
  `test/partition/placement-create-dispatch-execution-mirror.test.js`: classified by a focused run of
  the head (below).

Focused classification on the head **[lab]** `w1-s2b-run5-1ede7a19d` (sha `1ede7a19d`):
- `boot-incarnation-reservation-census`: 44/44 green after the fix (`1ede7a19d`). RESOLVED.
- STILL RED on the head and GREEN on `0993265e5` => REGRESSIONS OF THIS BRANCH, NOT YET ATTRIBUTED
  to a commit (stage 2 `95ee6ee4a` or stage 2b): `rebalance-coordinator-outcome-routing` (tests 2, 3
  "priority recovery in-progress create dispatch ...", first inner failure "create rearm should still
  issue one dispatch request"), `coordinator-dedup-gap` (test 1, inner "Partition nodes-p1 already has
  a different create intent"), `operation-workflow-delivered-create-progress-retention` (test 8 "a
  terminal CREATE response consumes retention before owner return"),
  `placement-create-dispatch-execution-mirror` (test 2 "a SENDING placement CREATE re-entered by
  ledger CDC advances through real acknowledgement", `0 !== 1`). Common theme: CREATE dispatch is not
  issued. Next step for a successor: focused runs of these four files on `9d241bd89` (stage-2 tip)
  and `d427d14ff` (first 2b commit) to bisect, then read the dispatch path against
  `operation-workflow-gate-operation-row-repair.js` (probe removed in stage 2) and the repository
  constructor/port changes of `95ee6ee4a`.
- Continuation 22/23: only the W1b-dependent witness is red, at its first assertion as designed:
  "the native answer placement_admission_bytes_invalid is a definite refusal row of the clearing
  table (W1b 38708b6fa)" (BYTES really produced through native admission; no row before the merge).

Stopping point (2026-11-21, finishing writer out of context): head `1ede7a19d` pushed. Open: the
four regressions above; the W1b witness (green only after merging 38708b6fa); the corpus selection
of `9d241bd89` (lead). No local test was executed; every result above is from tv-dator.

## 17. Stage 2c (CREATE-dispatch regressions, opus writer, 2026-11-21)

Labels: **[lab]** executed on tv-dator (directory under `lab/`, console `<dir>.console.log`);
**[read]** source only. Start: tip `1ede7a19d`. No local test was executed.

### 17.1 Attribution **[lab]**

| File (first failing case) | Green on | Red on (first-bad) | Red on head |
| --- | --- | --- | --- |
| `test/rebalancer/rebalance-coordinator-outcome-routing.test.js` (tests 2, 3: "create rearm should still issue one dispatch request" `0 !== 1`) | `0993265e5` `w1-s2b-cone-attr-0993265e5-try2` | `95ee6ee4a` `w1-s2c-attr-95ee6ee4a` | `1ede7a19d` `w1-s2b-run5-1ede7a19d` |
| `test/rebalancer/coordinator-dedup-gap.test.js` (test 1, assertion 4: "Partition nodes-p1 already has a different create intent": the first operation never dispatched, so the third create conflicts) | same | same | same |
| `test/rebalancer/operation-workflow-delivered-create-progress-retention.test.js` (test 8: "the completed response should succeed") | same | same | same |
| `test/partition/placement-create-dispatch-execution-mirror.test.js` (test 2: `assertCreateDelivery` `0 !== 1`) | same | same | same |

`95ee6ee4a^` (= `8eba5f745`) has `src/` identical to `0993265e5` and differs only in retained witness
files these four do not import; `bc20bb929` and `9d241bd89` touch no `src/` and no helper of these
files. So `95ee6ee4a` is the first bad commit for all four.

Gate decision, captured by a diagnostic probe (`bf8a1f022`, local ref `probe/w1-s2c-gate-decision`,
never pushed: it logs what the retained owner answered at
`repairOperationRowForGateRepairedReservation`) **[lab]** `w1-s2c-probe-bf8a1f022`:
- delivered-create (`completed-response-operation`), mirror (`pl-sql_transactions-p1-3-0`),
  dedup-gap: `confirmed:false`; route port = the coordinator's own production binding
  `() => resolveRetainedPlacementRepairBinding(this)` (none of the four uses
  `test/test-helpers/retained-repair-ports.js`); record `binding:{unavailable}`,
  `lastDecision:{unavailable, route_unavailable}`, `owed:6` (CLEARING|ROUTE), continuation idle,
  entry unpinned. A qualified owner read issued by the probe at that moment returned the row
  (1 row; witness observed/leader/term 1/applied=commit=1).
- outcome-routing (`op-outcome-1`): the decision threw `cache.getAll is not a function` inside the
  route port (its cache double had only `get`); the gate logged and answered false.

Cause **[read]** (lines at `1ede7a19d`): `retryRetainedRepairDecision`
(`src/rebalancer/replica-operation-repository-retained-placement-repair.js:146-149`) owed ROUTE
before any read whenever the binding was unavailable, and `witnessRefusal`
(`src/rebalancer/replica-operation-retained-repair-authority.js:81-82`) refused a read served by any
replica other than the binding even when it showed the row. The dispatch gate
(`src/rebalancer/operation-workflow-dispatch-reservation-gate.js:136`) asks this owner to confirm
the row of every storage-increasing dispatch whose reservation is ACTIVE. On `0993265e5` the same
read was judged with `expectedOwner === null` (any qualified leader) and confirmed EXACT.
Classification: product regression for a coordinator whose cached ledger route is unpublished
(the binding is UNAVAILABLE): the CREATE dispatch of a present, exact row was withheld and nothing
re-drove it. Fixture part (outcome-routing only): a cache double without `getAll`.

### 17.2 Repair and the presence/absence asymmetry

Commits: `f9d847b1d` (first rule: a present row settles from ANY qualified ledger-leader read;
superseded after the safety review below) and `a10a9cae3` (the restricted rule, now in force).

Rule (`a10a9cae3`, `readRetainedRepairDecision` in
`src/rebalancer/replica-operation-repository-retained-placement-repair.js`, read service in
`replica-operation-retained-repair-authority.js` `REPAIR_READ_SERVICE` {BOUND, OTHER_REPLICA,
NO_BINDING}):
- a read served by the decision's binding decides as before;
- with NO binding at all (route unpublished or ambiguous), a qualified read settles a present row
  (EXACT or CHANGED) and never an absence; anything else stays owed to the route
  (`confirmUnboundRetainedRepair`, SUBJECT scope, no timer);
- a read served by a replica other than a resolvable binding settles nothing
  (`UNQUALIFIED_BINDING`, owes ROUTE, no timer), whatever it shows.

Why (the safety review **[read]**):
- No read here is linearizable. A deposed leader that has not learned of its successor answers a
  strict leader read with `role: leader` at its own term; the witness checks (role,
  commit == applied, the record's floors) cannot exclude it, because the floors are raised only by
  this record's own reads and answers (0 for a fresh caller record).
- Presence (EXACT) proves that the row, in that exact form, was committed at some index
  <= `witness.appliedIndex`. Committed entries are durable, but later committed entries may have
  retired or changed the row on the current leader: presence is a historical fact, not a current
  one. The binding does not make it current either (it comes from the coordinator's cache, which
  can itself still name the deposed leader).
- Absence (ABSENT/CONTENDED) leads to a proposal at the read's term to the binding
  (`submitRetainedRepairAtTerm(attempt, decision.term, binding)`): the read and the proposal must
  name the same replica, otherwise the term fence is another replica's term (W9). Absence therefore
  needs the binding in every case.
- What `true` (EXACT) does depends on the consumer:
  1. Dispatch gate: the dispatch proceeds on the caller's own snapshot. Schedule: the current
     leader retires or changes the row; the coordinator re-enters a stale SENDING row; a deposed
     leader answers EXACT; the coordinator sends CREATE. Fence: the target's create admission is a
     committed CAS on the ledger row keyed on (operation_id, workflow_step SENDING,
     updated_at = the request's workflowUpdatedAt, completed_at NULL, no prior admission)
     (`src/node/replica-create-admission-owner.js:547-575`), adopted only from a row that carries
     that admission (`:579-592`); a retired or changed row applies zero rows and the CREATE is
     refused before any replica exists. A deposed leader cannot commit it. The coordinator's own
     claim PENDING -> SENDING (`src/rebalancer/operation-workflow-dispatch-execution.js:193-199`,
     `updateStep`) and the response step update are committed CAS writes on the current leader.
  2. Zero-row update arm (`src/rebalancer/replica-operation-repository-mutation-update-methods.js:593-600`):
     `true` becomes `REINSERTED, persisted: true` with no further write. NOT fenced. Reached only by
     operations without create admission or membership (`requiresExistingOperationRow`, same file
     `:89-94`, refuses those before the arm).
- Hence: OTHER_REPLICA is refused (the binding and the witness disagree on the leader, one view is
  stale and the decision cannot tell which; accepting would trust a deposed leader exactly when the
  cache already names its successor: negative witness, 17.5). NO_BINDING presence is accepted: the
  decision has no evidence of the current leader at all; refusing withholds every dispatch on a
  coordinator with an unpublished route (the four regressions) with no owned re-drive (17.4);
  `0993265e5` accepted it; the gate's effects are fenced as in (1).
- CHANGED: retire + `false` (withhold or refuse), no durable effect: justified from NO_BINDING;
  from OTHER_REPLICA refused like EXACT (same ambiguity; cost is liveness only).
- Residual (stated, not closed): with no binding, the zero-row arm can turn a deposed leader's
  presence into REINSERTED, as on `0993265e5` (stage 2 had closed it by reading nothing; this
  re-opens it for the unbound case only). Proposed fence for the owner of the update methods: the
  arm passes the position of its own absence observation (the authoritative read's witness
  term/index) into the record's floors, so an older presence fails `UNQUALIFIED_POSITION`.

### 17.3 Capability-probe census (lines at `a10a9cae3`)

Inside the retained-repair owner's files:
- `replica-operation-repository-retained-placement-repair.js:51` (`instanceof Function`): the
  construction validation itself (typed `retained_placement_repair_port_missing`). Conformant.
- `replica-operation-retained-repair-wake.js:208` (`get(service)?.()`): an absent registration
  means nothing to unbind; not a probe of a collaborator. Unchanged.
- `replica-operation-retained-repair-answer.js:82-83`, `replica-operation-retained-repair-authority.js:105`:
  validation of data shape, not probes.
- `operation-workflow-gate-operation-row-repair.js:19` (`owner.logger?.warn?.(`): a missing logger
  silently drops the gate's failure log. The port is the workflow owner's
  (`operation-workflow-owner-retry-registry.js:61` assigns `options.logger` unvalidated). Exact
  edit (outside): validate `logger.warn`/`logger.error` at OperationWorkflowOwner construction
  (typed refusal), then `owner.logger.warn(...)` in the gate. Not changed here: changing the gate
  alone would turn a silent drop into an untyped TypeError.
Reached by the route binding (`resolveRetainedPlacementRepairBinding`,
`replica-placement-owner-retained-repair-routing.js:64-73`), all outside these files:
- `rebalance-coordinator-operation-creation-support.js:221`, `:612-613`, `:623`: `instanceof Set`
  around `ledgerPartitionServices`, which `rebalance-coordinator-lifecycle.js:338` always
  initializes. Edit: delete the three checks.
- `replica-placement-owner-transport.js:29` (`if (!cache) return null`): no cache silently means no
  route. Edit: the coordinator requires `systemTableCache` at construction; delete the guard.
- `replica-status.js:305-314` (`resolveTargetNodeIncarnationSnapshot`): no cache -> null boot
  incarnation (custody then matches null === null). Edit: same requirement; delete the branch
  (shared: census its other callers first).
- `replica-placement-owner-transport.js:48` (`typeof deliver !== FUNCTION_TYPE -> null`), used by
  the repair send (`rebalance-coordinator-operation-creation-support.js:288-297`) and the remote
  preparation (`replica-placement-owner-retained-repair-routing.js:19-23`): a router without
  `deliver` silently means no route. Edit: require `messageRouter.deliver` at construction.
- The retained owner's own wake channel: `rebalance-coordinator-lifecycle.js:534-539`
  (`bindSystemTableCacheListener`): a cache without `onCacheChange` silently never forwards
  PARTITIONS/SERVICES/REPLICA_OPERATIONS changes to `observeRetainedPlacementRepairCommit` (ROUTE
  and own-row wakes lost); `:561-563` and `rebalance-coordinator.js:180-181` (`offCacheChange`).
  Edit: require `onCacheChange`/`offCacheChange` at construction; delete the probes. Note:
  `createMockCache` (`test/rebalancer/test-helpers.js:201`) has no `onCacheChange`, so every fixture
  built on it runs without retained wakes.
Repository cache probes that gave the outcome-routing stub its meaning (not on the binding path):
- `replica-operation-repository-row-methods.js:482-489` (get, else getAll, else null),
  `:496-508` (filter, else getAll, else null = "cache unavailable"), `:514-520` (a boundary exists
  iff filter or getAll); `replica-operation-repository-observation-methods.js:325`, `:336-342`,
  `:576`. Edit: the repository requires a SystemTableCache (get/getAll/filter) at construction
  (`replica-operation-repository.js:514`, and `syncOwnerDependencies` `:573` `|| null`), delete the
  branches; "cache unavailable" becomes a named state only where it is a real state.
Fixture: outcome-routing hosts `new SystemTableCache()` (`a10a9cae3`) instead of the stub.

### 17.4 Re-drive of a withheld dispatch: design question (stopped)

Witness (mirror, `a10a9cae3`, "a CREATE dispatch withheld at the gate is dispatched exactly once
after the retained owner confirms the row"): published route; the owner's first bound read fails
(READ_FAILED) -> the gate withholds; the record's continuation is ARMED; with no other caller or
event the continuation (repository virtual clock) re-reads, confirms EXACT and retires the record;
the witness then requires exactly one CREATE delivery. RED BY DESIGN (17.5): nothing re-drives.
Pre-existing on `0993265e5` (the base continuation retired the record the same way).

Not implemented, because on this branch the workflow owner's per-operation retry entry is the
pre-`953d705f8` form (`src/rebalancer/operation-workflow-observed-progress-retention.js:92-152`,
`armObservedProgressRetry`): a single-shot timer (`OBSERVED_PROGRESS_RETRY_DELAY_MS`) re-running
`reconcileObservedProgressOperation`, re-armed and deadline-bounded only for
DELIVERED_CREATE_PROGRESS, with no operation-ownership fence (`953d705f8` is not an ancestor:
section 9 item 4). Expressing the re-drive through it needs either
(a) the gate arming that timer on every refusal: a polling re-drive, unbounded and unfenced here,
    beside the retained owner's own continuation (two timers for one condition: Q9/R11), or
(b) the retained owner signalling that entry when it settles EXACT a record that refused a caller:
    a new owner interaction that does not exist.
Question for the lead: does "a withheld dispatch is re-driven once its row is confirmed" belong to
(a) the workflow owner's fenced entry after merging `953d705f8` (the gate arms it with the
retained record's reason and window), or (b) a typed settlement signal from the retained owner
into that entry? Both need the `953d705f8` form on this branch first.

### 17.5 Lab evidence **[lab]** (tv-dator; lists `lab/w1-s2c-list-witness.txt`, `lab/w1-s2c-list-cone97.txt`)

Commits pushed: `f9d847b1d` (first rule), `a10a9cae3` (restricted rule, witnesses, real
SystemTableCache fixture), `f42102c84` (absence-served-elsewhere witness). Local refs only (never
pushed): `probe/w1-s2c-gate-decision` `bf8a1f022`, `probe/w1-s2c-witnesses-on-f9d847b1d`
`30619e5e7`, `probe/w1-s2c-mutant-absent-from-other` `6796edad0`,
`probe/w1-s2c-mutant-absent-from-other-r2` `c79fb9f02`.

The four regressions:

| File | Red before | Green after |
| --- | --- | --- |
| outcome-routing | `w1-s2c-attr-95ee6ee4a`, `w1-s2b-run5-1ede7a19d`, probe `w1-s2c-probe-bf8a1f022` | `w1-s2c-run1-f9d847b1d` (stub `getAll`) 102/102; `w1-s2c-run3-a10a9cae3` (real SystemTableCache) 102/102 |
| coordinator-dedup-gap | same | `w1-s2c-run1-f9d847b1d` 69/69; `w1-s2c-run3-a10a9cae3` 69/69 |
| delivered-create-progress-retention | same | 35/35 in both |
| create-dispatch-execution-mirror (original test 2) | same | green in both (`run1`, `run3`, `run5`) |

New mirror witnesses (`f42102c84`):

| Witness | Red before | Green on head |
| --- | --- | --- |
| present row dispatches once, route published | guard (green on `1ede7a19d` by construction) | `w1-s2c-run5-f42102c84` ok 3 |
| present row dispatches once, route unpublished | same scenario as original test 2: red `w1-s2b-run5-1ede7a19d` | ok 4 |
| read served by another replica than the cached route: withheld, owed to route | red on the any-leader rule: probe `w1-s2c-probe-p1-30619e5e7` (not ok 5, "the serving replica or the cache is stale: no dispatch") | ok 5 |
| absence served by another replica: nothing prepared/proposed, owed to route | added for the surviving mutant (17.6) | ok 6 |
| deposed leader has the row, current leader retired it: not confirmed (negative) | red on the any-leader rule: probe p1 (not ok 6, "…confirms nothing" `true !== false`) | ok 7 |
| withheld dispatch re-driven exactly once after the retained owner confirms | RED BY DESIGN everywhere (17.4): `run3` and `run5` fail at the last assertion "re-driven exactly once" `0 !== 1`, after "withheld", "continuation ARMED" and "confirmed the row" pass | red (open) |
| absent row, no route: withheld, owed to route, no timer | guard | ok 9 |

Retained/placement set on `a10a9cae3` (`w1-s2c-run3-a10a9cae3`) and `f9d847b1d`
(`w1-s2c-run1-f9d847b1d`): publication 6/6, leadership 5/5, row-repair 45/45, real-publication
1/1, post-copy 2/2, growth-dispatch-identity 13/13; continuation 22/23 (only the W1b-dependent
witness, 16.10); S11 2/3 (raw-bypass-negative `:68` `1 !== 0`, 16.4); placement-owner-core 19/20
(test 20, "ReplicaOperationRepository requires a control-plane mutation ingress", 16.7). All three
are the known reds with the same first assertions.

Cone selection (97 files of the 1419-file cone: every cone test file that enters dispatch or the
retained owner: `dispatchOperation(Internal)`, `handleObservedReplicaStateChange`,
`persistOperationUpdate`, `createOperation(`, `ensureDispatchReservationOrSkip`,
`ensureRetainedOperationRow`, `repairRetainedOperation`, `retainedPlacementRepair`,
`advanceDispatchCandidateStep`, `runDispatch`, `dispatchPendingOperations`, minus the 12 already in
the witness list): `w1-s2c-run2-cone97-f9d847b1d` 67 pass / 30 fail; `w1-s2c-run4-cone97-a10a9cae3`
67 pass / 30 fail. Each of the 30 fails on `0993265e5` (`w1-s2b-cone-attr-0993265e5-try2`) with the
identical first failing assertion: pre-existing, none introduced (attribution script output in the
run console logs; list of the 30 in 17.7).

### 17.7 The 30 pre-existing reds of the cone selection (identical first assertion on `0993265e5`)

- `test/control-plane/replica-dispatch-reservation-identity.test.js`: not ok 7 - the canonical owner dispatches after the strict identity gate
- `test/partition/placement-creation-terminal-replay.test.js`: not ok 1 - native create replay reads committed FAILED after the original reply is lost
- `test/partition/placement-founding-and-runtime-service-admission.test.js`: not ok 1 - routes RUNTIME_SERVICE ADD, REPLACE, and REMOVE through PLACEMENT_ADMIT and enforces TARGET_CLAIM_TAKEN
- `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js`: not ok 40 - should be equal
- `test/rebalancer/message-group-membership-operation-lane.test.js`: not ok 5 - canonical visibility treats omitted nullable membership fields as SQL NULL while preserving non-null owner stamps
- `test/rebalancer/replace-named-handoff-attempt.test.js`: not ok 1 - one handoff was issued
- `test/rebalancer/replace-owner-lease-verdict-property.test.js`: not ok 1 - Invalid replica operation persistence outcome: growth_promotion_cohort_unresolved
- `test/rebalancer/reservation-file-backed-restart.test.js`: not ok 25 - the existing reservation gate dispatches exactly once
- `test/rebalancer/storage-reservation-lost-outcome-idempotency.test.js`: not ok 1 - Authoritative operation visibility deferred for partition:partition-lost-reservation-answer (entity_operation_observation_incomplete)
- `test/rebalancer/replace-real-group-scheduling.test.js`: not ok 7 - the retained owner path commits the exact missing row after SAFE
- `test/rebalancer/admission-real-size-estimates.test.js`: not ok 1 - Authoritative operation visibility deferred for partition:p-real-size (entity_operation_observation_incomplete)
- `test/rebalancer/duplicate-operation-prevention.property.test.js`: not ok 1 - Authoritative operation visibility deferred for partition:partition-1 (entity_operation_observation_incomplete)
- `test/rebalancer/quorum-conditioned-remove-safety.test.js`: not ok 1 - lower-case remove preflight should block unsafe critical remove
- `test/rebalancer/replica-operation-repository.test.js`: not ok 1 - divergence path recovers by re-inserting instead of failing
- `test/rebalancer/rebalance-coordinator-topology-guard.test.js`: not ok 1 - createOperation should fail closed when the target node already hosts the partition
- `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`: not ok 1 - timeout reconciliation must skip non-owner operations but keep target-owned system REPLACE reconciliation
- `test/rebalancer/replace-replica-workflow.test.js`: not ok 8 - second REPLACE phase should issue REMOVE_REPLICA to source node
- `test/rebalancer/replica-operation-membership-epoch-binding.test.js`: not ok 6 - src/partition/partition-placement-retained-repair.js: an unclassified reader of the membership epoch appeared; route it through the decode owner or classify it as passthrough
- `test/rebalancer/strict-operation-outcomes.test.js`: not ok 7 - should be equal
- `test/rebalancer/reservation-fail-closed-dispatch-gate.test.js`: not ok 5 - restored authority dispatches exactly once through the existing gate
- `test/rebalancer/operation-workflow-remove-safety-concurrent-down-target.test.js`: not ok 1 - a concurrent op to a reachable target must still serialize-block
- `test/rebalancer/coordinator-created-operation-progress.test.js`: not ok 5 - the resumed owner path should continue into dispatch after claiming the operation
- `test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js`: not ok 2 - the floor counts the partition's voter rows, not cluster nodes
- `test/query/sql-query-engine-create-table-quorum.test.js`: not ok 1 - provisioning below quorum is rejected without lowering the quorum minimum
- `test/rebalancer/operation-workflow-remove-safety-concurrent-stale-phantom.test.js`: not ok 1 - a genuinely in-flight concurrent op (within its step timeout) must still block
- `test/rebalancer/rebalancer-entity-interaction-contract.test.js`: not ok 1 - context.buildDeferredRemoveSafetyEvaluation is not a function
- `test/rebalancer/replica-status-completeness.property.test.js`: not ok 8 - Step 'SUPERSEDED' should map to valid status 'superseded'
- `test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js`: not ok 20 - public coordinator dispatch accepts the runtime create
- `test/rebalancer/message-group-operation-routing.integration.test.js`: not ok 1 - Invalid replica operation persistence outcome: persisted operation history is not JSON text
- `test/integration/control-plane-rebalance.integration.test.js`: not ok 11 - Placement admission refused for replica_operations-p1: placement_admission_bytes_invalid

### 17.6 Mutation by mechanism for the presence/absence rule **[lab]**

| Mechanism | Mutant | Commit (local ref) | Lab run | Killed by (first failure) |
| --- | --- | --- | --- | --- |
| presence accepted from a replica other than a resolvable binding | the `f9d847b1d` rule (any qualified leader) under the `a10a9cae3` witnesses | `30619e5e7` `probe/w1-s2c-witnesses-on-f9d847b1d` | `w1-s2c-probe-p1-30619e5e7` | KILLED: mirror 5 "the serving replica or the cache is stale: no dispatch"; mirror 6 (deposed negative) "presence answered by a replica other than the bound current leader confirms nothing" `true !== false` |
| an ABSENT answer from a non-binding leader accepted | `readRetainedRepairDecision`: `unboundPresence = row === undefined \|\| service === NO_BINDING` (absence from OTHER_REPLICA or NO_BINDING decides) | first on `a10a9cae3`: `6796edad0` `probe/w1-s2c-mutant-absent-from-other` | `w1-s2c-mutant-absent-from-other-6796edad0-try2` (try1 = a mistyped sha, refused before any test; not a result) | **NOT KILLED** by the six retained files nor the mirror on `a10a9cae3` (only the two by-design reds). Finding: no witness showed an absence served elsewhere. Witness added in `f42102c84`. |
| same, re-run on the new witness | same patch on `f42102c84` | `c79fb9f02` `probe/w1-s2c-mutant-absent-from-other-r2` | `w1-s2c-mutant-absent-from-other-r2-c79fb9f02-try3` on adam-laptop (try1 and try2: "tv-dator is not a ready lab machine", runner failures; tv-dator held by another agent) | KILLED: mirror 6 "an absence served by another replica than the cached ledger route settles nothing" at the owed-reason assertion: `'placement_repair_owner_unavailable'` vs `'unqualified_binding'` (the mutant went on to prepare against the stale binding). Publication 6/6 stays green under it. |

### 17.8 State at the end of stage 2c

Head `f42102c84` pushed; worktree clean. Open:
- 17.4: the re-drive of a withheld dispatch (witness red by design; lead's design question).
- 17.2 residual: with no binding, the zero-row update arm can turn a deposed leader's presence into
  REINSERTED (proposed fence for the update-methods owner).
- 17.3: the capability probes outside this owner (exact edits listed), including the coordinator's
  cache-subscription probe that silently drops the retained owner's wakes.
- Carried from 16: W1b-dependent continuation witness; S11 raw-bypass-negative; owner-core test 20.
No local test was executed; every result in this section is from the lab.

## 18. Corrective round after independent verification (opus writer, 2026-11-21)

Subject: the verifier's findings F1-F5, the table finding (T1 = verifier F6), visibility (V1 =
verifier 3(c)/(d)) and the term-only tenure end (T2 = verifier F7) on head `f42102c84`
(`reports/verify-w1-retained-repair-owner.md`). Rule: a behavioural repair only where an EXECUTED
witness shows the defect; a witness that passes is kept as evidence the finding was wrong.
Labels: **[lab]** executed (directory under `lab/`, console `<dir>.console.log`); **[read]** source
only. No test was executed on the desktop.

Fixture: every leadership change in the new publication witnesses goes through the REAL publishers
(`applyReplicaLeadership` -> `queueRoleUpdate`/`queueLeaderNodeUpdate`) into both coordinator caches
by CDC (`attachRealPublication`, moved from the real-publication test into the pair fixture, with a
held delivery that models the deferred CDC channel). No partition SERVICES row with raft_role
leader; no route row written by hand in any new witness. Owner timers on `VirtualTimeSource`.

### 18.1 Witnesses (commits `c1169112a`, `029666421`; red-first)

Red run **[lab]** `lab/w1c-red-c1169112a` (tv-dator, sha `c1169112a`, the 13-file retained list
`lab/w1-s2c-list-witness.txt`): every new witness red; every earlier witness unchanged (the four known
reds only: mirror 8 re-drive by design, continuation 23 W1b-dependent, S11 raw-bypass-negative,
owner-core 20).

| Item | Witness (file, test) | Schedule | Red on `c1169112a` (first failing assertion) |
| --- | --- | --- | --- |
| F1 | publication 7 | pinned paused entry at origin A; A -> B by the real publishers; every read bound to B fails while the publication flows, then the provider recovers; nothing but A's continuation clock | "the owed reconsideration reaches B and restores the row with no other event" (preconditions passed: B-bound read failed, binding B, one timer, zero proposals). The timer fired and the decision returned at the pure-hint guard |
| F2 | continuation 24 | ledger leader, every presentation answered uncommitted BACKPRESSURE after a qualified read; 720 one-second continuation turns | "reaches the bounded stop (still armed after 720 continuation turns, 723 qualified reads and 723 presentations)" `1 !== 0` |
| F3 | publication 8 | origin B delegated to A with BUSY; B's ledger wins the next term with its leader activation held on its holdoff clock and the publishers' CDC held; a caller arrives | "the node that would propose evaluates the unchanged blocker first: zero native proposals" `1 !== 0` (preconditions passed: B local leader, activation not run, no hint queued, custody delegated) |
| F4 | continuation 25 | BUSY at the leader; read 1 fails, the continuation's read 2 is incomplete (typed refusal); 720 s later the real blocker release; its read fails | "a later independent transient failure is not spent at once by an earlier window" `1 !== 0` |
| F5 failed read | publication 9 | A unbound by the real publishers (B leads, B's endpoint never published); present row; first read fails | reason `'route_unavailable'` vs `'owner_read_failed'` |
| F5 invalid row | publication 10 | same; the served row lacks a canonical column | reason `'route_unavailable'` vs `'invalid_operation_row'` |
| V1 | publication 11 | pinned entry at A; A unbound as above; three later callers; then A leads again | "the record names what it waits for: the next ledger route publication" (no named state) |
| T1 | continuation 26 | receiver answers the sender's entry uncommitted BACKPRESSURE while holding custody | on `c1169112a`: TypeError, the sender record was gone. Attribution **[read]**: the delegated sender still owed CLEARING, so its own deferred route-row notifications (delivered once the record exists) drove a second decision that re-presented and completed the entry while the custodian also held it: the duplicate owner, seen through its effect. Re-staged in `029666421` (setup notifications drain first; a missing record fails with a message): red **[lab]** `lab/w1c-red-t1-029666421`: "exactly one continuation owns the obligation (receiver 1, sender 1)" `2 !== 1` |
| T2 | publication 12 | sender B delegated to paused A; A demoted and re-elected at a later term (same node, incarnation, replica, address); admission released; no caller | "the delegated sender resumes after a term-only tenure end ... (sender custody delegated, term 1)" |

### 18.2 The window model (F2, F4)

- What a window measures: ONE episode of one record's obligation: the consecutive
  continuation-owned failures since its last progress. Continuation-owned reasons:
  `owner_read_failed`, `unqualified_leadership`, `unqualified_position`, the receiver disclaim,
  `outcome_unknown` (lost, malformed or uncommitted LEDGER_COMMIT answer), `owner_unavailable`.
- Progress (owner-defined): the decision ends with the obligation owned by someone other than the
  continuation: a settlement (EXACT/CHANGED retire, definite or permanent refusal), a durable
  outcome of the entry (committed ADMITTED or committed refusal), a judged contention (CONTENDED:
  blocker + trigger), a named clearing trigger of an uncommitted refusal (WRITE_PATH_RELEASED,
  LEADERSHIP_START, ...), or an attested custodian. A qualified read alone is NOT progress.
- Opens: at the first continuation-owned failure with no open window (continuation IDLE or SPENT).
- Kept: by every later continuation-owned failure (ARMED keeps its timer; OPEN re-arms with the
  doubled delay), whatever reads succeeded in between.
- Closes: at the end of any decision that does not end continuation-owned: progress, or a
  hand-over to an event owner (route publication: `unqualified_binding`, `route_unavailable`;
  row or binding change: `invalid_operation_row`, `unqualified_shape`). Nothing leaves it OPEN:
  the end of every decision (sender and receiver) applies this rule
  (`endRetainedRepairDecision`).
- Bound: `REBALANCE_OPERATION_BUDGET_MS` from opening; delays `REPLICA_OPERATION_READ_RETRY_DELAY_MS`
  doubling to `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS`. A continuation-owned failure at or after
  the deadline spends it: continuation SPENT, waiting `bound_spent`, exactly one
  `wait_bound_spent` report, no timer, obligation kept, zero proposals. Any later legitimate
  trigger decides afresh; a new failure opens a new window (Q1).

### 18.3 Repairs (commit `f615921f5`)

Files: `replica-operation-repository-retained-placement-repair.js` (owner), `-read-retry.js`
(continuation, window, visible wait, decision begin/end), `-record.js` (`waiting`), `-ingress.js`
(receiver decision begin/end). No file outside the owner's changed in `src/`.

| Item | Cause shown by the witness | Repair |
| --- | --- | --- |
| F1 | `retryRetainedRepairDecision` returned before any read for every HANDOFF with an unchanged binding whose kinds were ROUTE, including the timer-driven decision of an owed ROUTE | the no-op applies only to a pure hint: `kinds === ROUTE` AND nothing owed AND binding unchanged. An owed revalidation always reaches a read |
| F2, F4 | the window was discarded by every qualified read (`satisfyRetainedRepairRevalidation` cancelled the continuation) and kept OPEN by decisions that ended on an event-owned reason | the window model of 18.2: a qualified read only clears `owed`; `beginRetainedRepairDecision` / `endRetainedRepairDecision` bracket every decision (sender `runRetainedRepairDecision`, receiver `completeIncomingRetainedRepair`), and the end arms or closes the continuation from the wait the decision ended with. `oweRetainedRepair` no longer arms: it names the wait |
| F3 | `joinRetainedRepairDecision` presented UNFENCED with no read when the rebind found the local ledger leader | a join whose binding is LOCAL decides as RETRY (the node that would propose evaluates contention first) |
| F5 | `confirmUnboundRetainedRepair` relabelled every non-present outcome `route_unavailable` (no log, no timer) | each read outcome keeps its own reason and owner; ROUTE is owed in every case |
| T1 | an uncommitted answer carrying custody recorded DELEGATED and then still owed CLEARING and armed the sender | custody is recorded from every non-observation answer of a REMOTE binding; a DELEGATED result after an uncommitted or unknown answer returns with nothing owed; and the end of every decision closes the continuation of a delegated record (the invariant) |
| V1 | no named wait, no log for route-owed waits, an ERROR per evaluation for typed refusals | `waiting` = {state, reason} on the record; one line per transition |

Systemic check (siblings) **[read]**: every decision that may propose reads contention first:
RETRY and HANDOFF (CURRENT at LOCAL), RECEIVER (its own read), JOIN at LOCAL (now RETRY), JOIN at
REMOTE (the receiver reads); RESOLVE presents only an entry the local ledger already committed
(native replay). The only arming site is the end of a decision; the only cancellation sites are
retirement, shutdown and the end of a decision.

Witness re-staged in the repair commit (before / after): mirror 9 "an absent placement row is
withheld ... owed to the route publication": `record.lastDecision.reason` `'route_unavailable'` ->
`'unqualified_binding'` (the read outcome's own name, F5), plus `record.waiting.state ===
'route_publication'`. Its other assertions are unchanged.

Green run **[lab]** `lab/w1c-green-f615921f5` (tv-dator, sha `f615921f5`, the 13-file list): F1, F2,
F3, F4, F5 x2, V1, T1 green; every earlier witness green except the same known reds with the same
first assertions (mirror 8 "re-driven exactly once" `0 !== 1`; continuation 23 "placement_admission_bytes_invalid
is a definite refusal row" (W1b); S11 raw-bypass-negative `1 !== 0`; owner-core 20 "requires a
control-plane mutation ingress"); T2 red (stopped, 18.7). Files: publication 11/12, continuation
25/26, leadership 5/5, row-repair 45/45, real-publication 1/1, post-copy 2/2, growth-dispatch 13/13,
mirror 9/10, outcome-routing 102/102, dedup-gap 69/69, delivered-create 35/35, S11 2/3, owner-core 19/20.

### 18.4 Corrected table cells (section 10)

A new record field `waiting` = {state, reason} names what a record waits for: `none` (nothing
owed: its blocker's trigger or its custodian owns it; both already named fields), `continuation`,
`bound_spent`, `route_publication`, `row_change`. It is set by the decision's exits and settled at
the end of every decision; one log line per transition into a wait (warn; error for `row_change`;
`bound_spent` is its single `wait_bound_spent` report). There is no snapshot or diagnostic surface
of this owner anywhere in `src/` (searched: repository, coordinator, admin); the record in
`retainedPlacementRepairs` is where the owner already exposes its named state, so the field lives
there. No endpoint was added.

| Cell | Was | Now |
| --- | --- | --- |
| 10.5 G, timer fires | impossible (I-T: the custodian owns the continuation) | was POSSIBLE on `f42102c84` (T1 red: an uncommitted answer carrying custody armed the sender while DELEGATED). Now impossible by construction: a delegated record owes nothing after an uncommitted or unknown answer carrying custody (the custodian owns the entry, its trigger and its continuation), and the end of every decision closes the continuation of a delegated record |
| 10.5 G, caller arrival / blocker clear / capacity release | JOIN: re-present the exact entry | JOIN re-presents to the current REMOTE binding; when the rebind finds the LOCAL ledger leader (the origin became leader), custody is void and the join decides as RETRY: contention first, unchanged BUSY gives zero proposals (F3) |
| 10.5 G, route change | custody not trusted across a publication (superseded in 16.6) | a changed binding voids custody and the HANDOFF reads; an unchanged binding with nothing owed is a pure hint |
| 10.5 G, receiver tenure ends by term only (new row) | not in the table | NOT OBSERVED by the sender: no publication carries the term (T2 open, 18.7) |
| 10.2 D, read unavailable | O, continuation with the real reason | the reason names the owner: transient (`owner_read_failed`, `unqualified_leadership`, `unqualified_position`), disclaim, `outcome_unknown`, `owner_unavailable` -> O (continuation, same window); `unqualified_binding`, `route_unavailable` -> `route_publication` (no timer, ROUTE owed); `invalid_operation_row`, `unqualified_shape` -> `row_change` (no timer). Also with NO binding (F5: no longer folded into `route_unavailable`) |
| 10.2 D, read invalid | X, one ERROR | `row_change`, one ERROR per transition into it, not per evaluation (V1) |
| 10.2 D, a qualified read followed by a failed presentation | (implicit: the read reset the window) | not progress: the window is kept (F2) |
| 10.3 P / 10.4 B, route unavailable | binding UNAVAILABLE, obligation kept, next publication | the same, and visible: `waiting` = `route_publication` with its reason, one warn line per transition (V1) |
| 10.6 O, timer fires | decision consuming `owed` | an owed revalidation always reaches a read, also on an unchanged binding (F1); the only no-op is a pure publication hint with nothing owed |
| 10.6 O, a decision ends on an event-owned wait | (left the continuation OPEN with its window) | the window closes; a later independent failure opens its own (F4) |
| 10.7 X | SPENT or INVALID_ROW | two named waits: `bound_spent` (continuation SPENT, one report) and `row_change` |

### 18.5 Re-drive of a withheld dispatch: what the owner exposes (specification only)

Ruled post-merge work (integration line); not implemented here. What the retained owner must expose
so the post-merge writer can implement the re-drive without the owner becoming a scheduler (the
verifier's section 8, adopted as the specification):
- One edge-triggered notification, emitted only at the single retirement site
  `retireRetainedRepair` (`replica-operation-repository-retained-placement-repair.js`), synchronously,
  once per record, no timer, no retry.
- Emitted only for a CALLER-origin record that has answered `false` to at least one caller (the
  record must remember that it refused a caller: a named field, not a sentinel).
- Payload: the operation identity (`operationId`, `createdAt`) and a named outcome:
  `CONFIRMED` (settled EXACT) or `UNCONFIRMED` with its reason (`CHANGED`, a definite refusal with
  its failure code, a permanent committed refusal with its reason).
- Never on shutdown (`clearRetainedPlacementRepairCustody`), never on a receiver's tenure release of
  an ingress record, never on SPENT (a spent bound is not a settlement: the record is kept).
- Consumer: the workflow owner's fenced per-operation entry (after `953d705f8` is on the line)
  decides whether to dispatch; the retained owner never dispatches.

### 18.6 Mutation table at the corrective head **[lab]**

Pending (built and run in progress; this section is updated as each completes).

### 18.7 Stopped / open

T2 (term-only tenure end), STOPPED as instructed. What exists **[read]**: custody carries the
receiver's `ledgerTerm` (attested at ingress); the sender's binding (`resolveRetainedPlacementRepairBinding`)
carries node, replica, address, the node's published boot incarnation and the replica's SERVICES
`created_at`, but no term. The PARTITIONS leader publication (`createLeaderNodeMutationHelper`,
`partition-service-metadata-mutation-helpers.js`) writes only `leader_node_id` and `updated_at`; the
`partitions` schema has no term column (`system-table-core-schema-definitions.js`). SERVICES role
publications collapse leader to follower and carry no term. The receiver's answers carry the term
only in reply to a presentation, and with no caller nothing is presented. So nothing published
carries the term, and the sender cannot learn a term-only end without a timer (forbidden) or a
caller. What would have to be published: the ledger leader's raft term with its leader identity,
i.e. a `leader_term` column on the PARTITIONS row written by `queueLeaderNodeUpdate(leaderNodeId,
raftTerm)` (it already receives the term) in the same CAS as `leader_node_id`; then
`resolvePlacementLedgerRoute` returns it, the binding carries it, and custody holds only while
`custody.ledgerTerm === binding.leaderTerm` (a republished term is then a route change, which
already voids custody and re-presents). Owner of that change: the partition leadership publication
(outside this writer's files). The witness stays in the suite, red, naming the gap.

Other open items carried: the zero-row update arm's fence (F8) and the capability probes outside the
owner (post-merge, not started); verifier F11 items not touched by a witness here (the send port's
`null` for "no route", `lastDecision` not reset at decision start, the second route resolution in the
send, PENDING without custody owing nothing at the sender).
