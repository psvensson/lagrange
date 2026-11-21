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
