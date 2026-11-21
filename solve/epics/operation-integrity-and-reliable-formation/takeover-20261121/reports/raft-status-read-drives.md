# A raft status read drives the group: census and design investigation (read-only)

Source of truth: commit `23344cddc` (integration line). Every `file:line` below is at that commit unless a different commit is named. Nothing was executed: no test, build or generator ran. **VERIFIED** means read in source or in a committed record at the named line. **INFERRED** means concluded from what was read, without an executed witness. Rules read at the same commit: `docs/steering/rules.md` R03, R08, R11, R27.

## Summary

- **The mechanism is confirmed, and is wider than reported.** `readStatus()` acts on five paths, not one: it drains delivered inbound, it can sync compacted storage into the core (and announce), it can reconstruct a failed group, it can replace the shared WASM runtime, and while a turn is busy it queues an extra, discarded read turn per call.
- **In production the read usually does not return post-drain facts.** The production transport send is an `async` function. A read-driven drain goes pending at the first outbound message, and the caller is answered with the **pre-drain** observation. The full in-stack drain (apply, role events) happens only when no send is awaited, which is the test harness's synchronous send mode.
- **Drive-on-read is not the 2026-09 "F1" repair.** It dates from the first runtime commit (`f4f5b5a6e`, 2026-09-22), when commands were the only thing that drained inbound. F1's frozen claim is owned by the **command turn** and protects six in-turn decisions. F1 recorded the status read's pre-drain answer as "by design" and excluded the pre-turn status readers by owner decision.
- **Drive-on-read has now caused four recorded defects** (2026-09-23, 2026-09-25, 2026-10-05, 2026-11-21).
- **Census:** 49 call sites in `src/`. None can soundly require a post-drain answer. 11 authorise something that no later core command fences; 11 authorise something a later command turn fences; 27 are routing, diagnostics or initialisation. 12 are hot paths.
- **Most of the CPU is not the drive.** Of the 8.8 % of seed formation samples under `readStatus`, 7.7 % is `readStatusUndrained`: the idle path, a fresh uncached core read plus reshaping and deep-freezing on every call.
- **Recommended: option (b).** `readStatus` becomes the owner's last settled observation for everyone; driving has one named entry.

## 1. The mechanism

### 1.1 Call chain (VERIFIED)

`port.readStatus()` (`src/raft/raft-rs-operation-port.js:456`) → `execute` → `dispatch` (:351-359: lifecycle admission, closed check, throw containment) → `dispatcher.execute` → `executeCommand` (`src/raft/raft-rs-runtime-owner.js:2134-2140`) → `readStatusNow` (:1542-1558) → `readStatusObserved` (:1560-1578).

The read uses `execute`, not `protocolTurn` (port :363-366). Raft work that a read drives is therefore charged to the **caller** in formation attribution, not to the raft protocol (stated at port :360-362; also `solve/quests/zero-liferaft-active-runtime/log.ndjson:54`).

### 1.2 What the read does on each path

| Group state | What happens | Cost | Basis |
| --- | --- | --- | --- |
| **Idle, nothing delivered** (`tail === null`, `inbound` empty) | `readStatusUndrained` (:1512-1516): `ensureExecution` (:1024-1044), then a **fresh core read** `readGroupStatus` (:1493-1497), then shaping | 2 WASM crossings (`status`, `conf_state`, :1451-1462). `status` formats every field as a string and serialises the leader's whole progress vector (`vendor/raft-rs-wasm/src/lib.rs:694-725`). Then per-peer identity and address resolution and a `deepFreeze` of the whole answer (`src/raft/raft-rs-status-observation.js:124-178`). No SQLite transaction; the snapshot index is a memoised committed fact (`src/raft/raft-rs-snapshot-witness.js:120-126`). The observation object is replaced on every read (:1501-1506), so the `SHAPED_STATUS` memo (:110) never hits on this path | VERIFIED |
| **Inbound pending, queue idle** | `enqueue(perform(READ_STATUS))` (:1565-1567). `perform` (:1983-2004) drains the **whole** inbound queue (extent `group.inbound.length`; only scheduled drains are capped at 32, :1999-2001), then reads | Per envelope: local-log guard, `step`, then `drainReady` (:1329-1369). With a Ready: `take_ready`, `store.persistReady` (**SQLite transaction**), `persist_ready`, sends, `applyEntries` (:1239; one SQLite transaction per slice, into the service's state machine), `advance_append`, commit-index write, light sends and applies, `advance_apply`. Then `announce` (:1398-1422): `status` + `conf_state` again and ROLE / TERM_CHANGE / LEADER_CHANGE / MEMBERSHIP_CHANGED / APPLIED_PROGRESS events. Finally the read's own `status` + `conf_state` + shape. Minimum for one no-op envelope: 6 crossings | VERIFIED |
| same, **a send is awaited** | The drain turn goes pending at the first unanswered send (`src/raft/raft-rs-peer-delivery.js:159-183`; `finishReady` :1234-1238 applies only after the sends). `read.settled` is false, so the read **answers the previously recorded observation** (:1568-1577) and the rest of the drain runs later as its own turn | In-stack: `step`, `take_ready`, the SQLite persist transaction, `persist_ready`, and the synchronous prefix of the first send. Apply and announce are not in the caller's stack | VERIFIED |
| **A turn already in progress** (`tail !== null`) | Never nested. A turn owns the queue from its first instant (:1064-1097). With inbound pending, the read **queues one more READ_STATUS turn behind the running turn**, swallows its result (:1571), and answers `group.statusObservation`, shaped once per observation. Without inbound it only answers the observation | Each such read costs a later full turn: drain, 2 crossings, shape, freeze, result discarded. **No coalescing**: N reads queue N turns | VERIFIED |
| **User transaction open** | `perform` refuses to drain (:1987-1991): fresh core read, inbound stays queued. On the idle path admission is not consulted at all | 2 crossings + shape | VERIFIED |
| **Group in recovery** | `readStatusInRecovery` (:1522-1529). Busy: answers `RECOVERY_DEFERRED`. Idle: **the read reconstructs the group** through the queue (`reconstructGroup`); if that goes pending the read answers `RECOVERY_DEFERRED` and the reconstruction runs on | durable-record read, core node re-creation | VERIFIED |
| **Shared runtime unhealthy** | **The read drives the shared runtime's replacement** (:1546-1553, comment at :1547-1550). While replacing: typed recovery outcome (:1543-1545) | rebuild of the WASM core for every group | VERIFIED |
| **Compacted storage moved** | `ensureExecution` → `syncCompactedStorage` (:976-1020): `seed_storage`, `set_conf_state`, and `announce` when the applied state changed | core mutation and events inside a read, including on the idle path | VERIFIED |
| **Closed port / retired lifecycle** | Refused before the runtime: `CORE_REFUSED closed` (port :353-356) or the lifecycle's refusal (`src/raft/raft-rs-replica-lifecycle-owner.js:255-259`) | none | VERIFIED |
| **Dispatcher stopped** (`group.closed`) | `invokeCoreAt` refuses (:360-379); the read answers a host failure `generation-changed` | none | INFERRED |

### 1.3 Corrections to the finding as reported

1. **"The read processes all of them synchronously inside the call" holds only when no send is awaited.** Production `sendToPeer` is `transport.deliver` (`src/partition/partition-service-raft-init-base.js:324-331`; `src/message-group/message-group-consensus-port.js:124-131`), and `deliver` is an `async` function (`src/transport/message-router-delivery-behaviors.js:149`). `turnFromForeignAnswer` names every native promise pending (`src/raft/raft-rs-turn-answer.js:79-83`). So in production a Ready that carries any outbound message makes the read's drain pending, and the caller gets the pre-drain observation. The September investigation recorded the same thing (`solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/synthesis-static-investigation.md:241`). How often a production Ready has no outbound message, so that apply and role events do run in the caller's stack, is **not measured**.
2. **The read still acts in production**: the `step`, the SQLite persistence transaction and the socket write are in the caller's stack, and the core's role and term can already have moved while the answer is the old observation.
3. **"Two evaluations in one synchronous call can see different facts"** is true when the drain completes synchronously (test send mode; production Readies with no awaited send). When the drain goes pending, the two evaluations see the same status, but the second read **queues another turn** (path "turn in progress").

### 1.4 Other "read" entry points that drive

| Entry point | Drives? | Where |
| --- | --- | --- |
| `readCommittedMembership`, purposes BOOTSTRAP and WITNESS | Yes, identically: it answers through `readStatusNow` (:2141-2145). With `replicaIdentity`, `peerId` or `includeRole` the port performs a **second** status read (port :481-490) | VERIFIED |
| `readCommittedMembership`, purpose LEARNER_ACTION | A queued, awaited command turn: drain, then read (:2154, :1724-1726; port :460-468). **This is already an explicit "process what is pending, then tell me" read** | VERIFIED |
| `getCurrentTerm`, `resolveCurrentTermSafe` | Wrappers over `readStatus()` (`src/partition/partition-service-raft-init-base.js:89-99`; `src/partition/partition-service-split-accessor-base.js:610-612`; `src/message-group/message-group-service-leadership-state-runtime-methods.js:158-161`; `src/wasm-service/wasm-service-replica.js:548-553`) | VERIFIED |
| `followerProgress`, peers, leader address, gate | Fields of the same status answer | VERIFIED |
| `probePeerProgress` | A command that ticks one heartbeat interval by design (:1626-1673). It is named a probe and acts; not a status read, recorded as a sibling | VERIFIED |
| `dispatcher.participationGateOpen()` | Pure field read (:2334-2335) | VERIFIED |

### 1.5 Non-driving status sources that already exist

| Source | Written by | Read by |
| --- | --- | --- |
| `group.statusObservation` + `SHAPED_STATUS` (the owner's last settled status) | end of every completed drain (`announce` :1404), opening (:2277-2281), each fresh read (:1494-1504) | only `readStatusObserved`'s busy path. **Not exposed as a contract** |
| Service fields `role`, `isLeader`, `leaderId`, `leadershipTenure {term}` | port events (`src/raft/replica-leadership-state.js:62-121, 143-203`) | the partition write gate, the handler's tracked role, CDC `owner.isLeader`, the managed-split authority's continuity key (the 2026-10-05 repair, `replica-leadership-state.js:28-41`) |
| Port events ROLE, TERM_CHANGE, LEADER_CHANGE, MEMBERSHIP_CHANGED, APPLIED_PROGRESS, CONF_CHANGE_APPLIED, GATE_OPENED | `announce` (:1398-1447) | lifecycle wiring of partition, message group and WASM replicas |

**A duplicated-authority pattern (VERIFIED).** Four sites combine the published field with a core read: `service.isLeader === true && readStatus().role === LEADER` (`src/partition/partition-replica-admission.js:207-210`; `src/partition/partition-service-learner-promotion-proof-methods.js:162-165`; `src/message-group/message-group-service-leadership-state-runtime-methods.js:35-38`; with OR, `src/node/replica-handler-membership-methods.js:305-306`). The second half is the hot path of the CDC check.

## 2. Why the read drives

### 2.1 History (VERIFIED)

| Date | Commit or record | What it says |
| --- | --- | --- |
| 2026-09-22 | `f4f5b5a6e` (#46), first version of the runtime owner | `execute` is `enqueue(perform(command))` for every command; `perform` is `ensureExecution` → `drainInbound` → `performCommand`; READ_STATUS is one of the commands (:708-710, :732-754 at that commit). `enqueueStep` only pushes (`group.inbound.push`). **There was no scheduled drain: commands were the only thing that processed inbound.** Drive-on-read is that structure, not a decision about reads |
| 2026-09-23 | `…/raft-rs-single-path-partition-cutover/design.md:42-47` (F4), `:262-267` (A7.1) | F4: "`readStatus()` returns a value when the group's queue is idle and a Promise otherwise". A7.1: "`readStatus()` is a synchronous observation, never a Promise. The rs-raft runtime owner returns the fresh core read when the group's queue is idle and the frozen snapshot refreshed after the last completed core entry when the queue is busy. Measured cause: 22-35% of a busy seed's 135 replicas answered a Promise at any instant" |
| 2026-09-23 | `…/design-f6-session-transaction-isolation.md:149-153` (T4) | "`readStatus` also drains inbound before answering … can itself trigger P1-P3 inside the session on a multi-replica leader". **First recorded defect of drive-on-read.** Repair: the persistence-admission gate, a read under an open user transaction does not drain (:1984-1991 today) |
| 2026-09-25 | F1, `…/f1-step-down-port/coverage-model.md`, `coverage-model-amendment-1.md` | see 2.2 |
| 2026-09-30 | `1aea11baf` (#63, squash) | introduces `readStatusObserved` and the comment at :1509-1511: "otherwise (**a read still drives delivered inbound, as before**)". No reason is stated; "as before" is the whole justification |
| 2026-10-05 | `solve/quests/zero-liferaft-active-runtime/log.ndjson:199` (split-merge-hysteresis rejected, blocker B3) | "the QPM authority read raft.readStatus() on every call for the continuity term: ~55 us per call on the real WASM port, ~3 calls per led partition per evaluation, synchronous on the event loop (N=50: 9.7 ms/eval; N=500: 86 ms/eval vs ~2 ms before), and readStatus is not side-effect free (ensureExecution can replaceRuntime/reconstructGroup and a queued status read drives waiting inbound)". **Third occurrence.** Repair: the event-pushed `leadershipTenure` token, for that one consumer |
| 2026-11-21 | `reports/cdc-currentness-record.md` §14.2 | **Fourth occurrence**: stage 2a stopped because the check's own status read can change the next evaluation's inputs |

The squash commits hide the commit that added the scheduled inbound drain. It existed by 2026-09-25 (`coverage-model.md` §1.1 lists it with `INBOUND_DRAIN_DELAY_MS = 0`). Since then the read's drain has been redundant for liveness: every accepted delivery schedules a drain (:2317-2320), and every tick is a command that drains (:1992-2003).

### 2.2 F1 (2026-09-25): what was frozen and what it protected (VERIFIED)

The frozen claim (`coverage-model.md:11`; unchanged in `coverage-model-amendment-1.md:7`):

> A decision made when relevant raft messages are already pending must produce the same externally relevant result as that decision made after those messages have first been processed.

- **Semantic owner** (`coverage-model.md` §1.1): "The rs-raft runtime owner's **command turn**. That is `perform` … A turn is admission, then `ensureExecution`, then `drainInbound`, then `performCommand`." The same section lists "a `readStatus` that meets pending inbound" as one of "two other things [that] can drain them", beside the scheduled drain.
- **Decisions in the claim** (amendment, "Amended dimensions"): D1 named transfer, D2 most-caught-up transfer, D3 dropped-`propose` classification, D4 dropped-`proposeConfChange` classification, D5 campaign eligibility, D6 the progress probe. A3 (write-path deferral) and A4 (admission outcome mapping) are covered through their answers. D7 (announcement) is an output checked by an anchor.
- **The three rejections** (rounds 2-4; `verification-round-4.md:29-40, 113-123`) were about decisions **inside a command turn** reading state before the drain: mutants "transfer on the pre-drain observation", "classification on pre-drain", "probe on pre-drain", "campaign on the full pre-drain observation". The repair is that each command drains first and then reads the core fresh inside its own turn.
- **The status read was not protected.** D8, "Status read answered from the cache while busy": "its contract is 'the last completed entry', so a pre-drain answer is by design" (`synthesis-challenger-a.md:209`). Challenger B on the admission pre-check: "`readStatus` answers the cached observation whenever the queue is busy or the READ_STATUS drain goes async. Not satisfied by production (A2)" (`synthesis-challenger-b.md:63`).
- **Owner decision 3, 2026-09-25** (`coverage-model-amendment-1.md:20-21`): "Excluded from the claim, and recorded (owner acknowledged): the pre-turn projection readers: the handler's branch choice (A1), the membership admission pre-check (A2's cached path) and the partition write gate (A5) … Their staleness … belongs to the projection and readiness owner".
- **F1 found a defect caused by drive-on-read** (owner decision 1, CA5 / S M10): "Announcing a role change must never re-enter message processing inside that announce. Today role listeners call `readStatus` synchronously inside `announce`, which triggers a nested drain, and the outer announce then emits stale diffs." The repair is the turn owning the queue from its first instant (:1064-1068). **Second occurrence.**

**Conclusion.** Drive-on-read is not the repair that came out of F1. Removing it does not reintroduce the F1 defect class in production code, because that class lives in the command turn, which keeps its drain.

**The one real dependency is the evidence.** F1's oracle builds its processed-first leg with a status read: "PROCESSED run: the same messages are processed by a status read, which drains and never ticks" (`coverage-model.md` §6.3). In the tree: `test/raft/raft-rs-backend/runtime-turn-integrity.test.js:114-115` (`processFirst` is `readStatus()`), `transfer-leadership-drain-oracle-harness.js:16`, `transfer-leadership-drain-order.test.js:221`. A non-driving read makes that leg identical to the pending leg; the oracle would stay green and prove nothing. The harness must move to a named settle in the same change.

## 3. Census of callers

**Scope.** `git grep readStatus 23344cddc -- src`, minus comments, `typeof` checks and the unrelated local `readStatus(row)` in `src/control-plane/serve-eligibility-record-decision.js`. **49 call sites**: 48 consumers and one inside the port. The use of each answer is VERIFIED from the lines shown. Frequencies are VERIFIED where a caller chain is cited and INFERRED from context otherwise. Tests: 869 `readStatus()` calls in 190 files under `test/`; how many depend on the drain is not determined.

**Classes.**
- **O**: routing, diagnostics, initialisation, bookkeeping.
- **AF**: authority whose effect is decided again by a later command turn, which drains first and is fenced by the core.
- **AU**: authority whose effect no later core command fences.
- **H**: hot path (many reads per logical operation, or one per request, event or tick).

| # | Site | Runs | Uses the answer to | Class |
| --- | --- | --- | --- | --- |
| 1 | `message-group/message-group-consensus-port.js:166` | once per open | refuse a group held at open | O |
| 2 | `…consensus-port.js:180` | once per start | gate closed → schedule; else `campaign` | AF |
| 3 | `message-group/message-group-forwarding-owner-routing-methods.js:57` (`nativeCdcObservation`, 5 callers) | per CDC ingress decision; with `isCurrentRaftLeader` 2 reads per `canAcceptCDCEvent`, **4 per subscriber delivery** (`cdc-currentness-record.md` §18) | accept locally or forward | AF, H |
| 4 | `message-group/message-group-forwarding-owner-target-methods.js:13` | per forward-target resolution | routing | O |
| 5 | `message-group/message-group-learner-join.js:286` | per join step (2 callers) | require own role FOLLOWER beside the committed stamp | O |
| 6 | `message-group/message-group-proposal-routing.js:85` | per refused proposal | classify the refusal as a routing miss | O |
| 7 | `message-group/message-group-service-leadership-state-runtime-methods.js:10` (`isCurrentRaftLeader`, 11 callers; `getCurrentTerm`) | **243 per CDC delivery to one target group, 685 to three** (measured, `cdc-currentness-record.md` §12); also per CDC accept, apply and propagate | gate acceptance, propagation, forwarding | AF, H |
| 8 | `message-group/message-group-service-peer-resolution.js:56` (5 callers) | per forwarded delivery | committed peer address | O, H |
| 9 | `node/participant-release-authorization-owner.js:134-136` (2 callers) | per release authorisation | answer from local committed operation rows only if leader | AU |
| 10 | `node/replica-handler-membership-methods.js:306` | per membership request | pick the local service | O |
| 11 | `node/replica-handler-participant-cutover.js:45` | per request | pick the local leader service | O |
| 12 | `…participant-cutover.js:212` | per request | control-node routing | O |
| 13 | `…participant-cutover.js:302` | per release request | NOT_LEADER refusal, else the grant path | AU |
| 14 | `node/replica-handler-participant-release.js:230` | per release request | STALE refusal | AU |
| 15 | `…participant-release.js:290` | per observe continuation | UNAVAILABLE / STALE / disposition | AU |
| 16 | `…participant-release.js:343` | per resume request | fast-path resume | AU |
| 17 | `node/replica-handler-release-recovery.js:77` | per recovery pass, per service | find the leader, detect a held group | O |
| 18 | `node/replica-handler-voter-readiness-methods.js:152` (3 callers) | per poll iteration of the readiness wait | "learner admitted" answer | O, H |
| 19 | `partition/partition-consensus-hold-log.js:59` | once after a hold ends | log | O |
| 20 | `…hold-log.js:75` | **every port announcement**, inside the turn | hold log state | O, H |
| 21 | `partition/partition-participant-transaction-pause.js:144` | per release-facts assessment | membership availability | AU |
| 22 | `…transaction-pause.js:230` | per invalidation | raise the pause when the admission proof no longer matches | AU |
| 23 | `…transaction-pause.js:274` | per resume ("No await separates the final generation/leadership check from resume") | **open participant admission** with proof {term, leaderId, configurationKey, …} | AU |
| 24 | `partition/partition-replica-admission.js:209` | per admission request | NOT_LEADER, else propose the conf change | AF |
| 25 | `…replica-admission.js:423` | per settled conf change or gained leadership | drop settled requests from the redrive set | O |
| 26 | `partition/partition-service-core-base.js:540` (`readLiveRaftLeaderId` ×3, `resolveLeaderAddress` ×6) | per forwarded or redirected request | leader address | O, H |
| 27 | `partition/partition-service-durability-fitness.js:97` | not determined | solo-group test | O |
| 28 | `partition/partition-service-learner-promotion-proof-methods.js:134` | per proof request | attest commit index and learner match | AF |
| 29 | `…promotion-proof-methods.js:164` | 2 per proof request | leads-now | AF |
| 30 | `partition/partition-service-raft-init-base.js:94` (`resolveCurrentTermSafe`) | each leadership edge (tenure mint), promotion, `getStatus()` | term stamp | O |
| 31 | `…raft-init-base.js:410` | once per init | configured peers for the log | O |
| 32 | `…raft-init-base.js:443` | once per init | gate closed → schedule; else `campaign` | AF |
| 33 | `…raft-init-base.js:513` | once per open | held-at-open refusal | O |
| 34 | `partition/partition-service-raft-lifecycle-wiring.js:70` | 1-2 per role or leader event, inside the turn | term on the event | O, H |
| 35 | `…lifecycle-wiring.js:178` | per voter check | `readStatus()?.id`; the shaped status has no `id` field (`raft-rs-status-observation.js:136-175`), so this arm looks dead (INFERRED) | O |
| 36 | `partition/partition-service-raft-peer-cache-reconciliation.js:79` | per reconcile | find a retired address, then `proposeConfChange` | AF |
| 37 | `partition/partition-service-raft-write-commit.js:421` (`partitionWriteLeadershipRefusalOf`, 13 callers) | **per write and per transaction step** | typed refusal, else `propose` | AF, H |
| 38 | `partition/partition-service-remote-query-methods.js:197` | **per remote read**, and per local system-table read (`cdc-integration-service-local-system-table-routing.js:56`) | read-authority witness (term, applied index) | AU, H |
| 39 | `partition/partition-service-split-accessor-base.js:60` (`readPartitionConsensusAuthority`) | **per hosted partition per readiness evaluation** (`bootstrap/owners/partition-quorum-authority.js:557`) | leader authority record for readiness | AU, H |
| 40 | `…split-accessor-base.js:189` | per size publication | term as memo key | O |
| 41 | `raft/raft-rs-group-membership-admission.js:233` | per peer admission | NOT_LEADER, else propose (F1's A2) | AF |
| 42 | `…membership-admission.js:283` | after a QUEUED admission | ALREADY_MEMBER classification | O |
| 43 | `…membership-admission.js:466` | per transition authorisation | WRONG_RECIPIENT, else propose the transition | AF |
| 44 | `raft/raft-rs-operation-port.js:485` | per committed-membership view | second status read for `confState` | O |
| 45 | `rebalancer/replica-operation-retained-repair-ingress.js:19` | 3-6 per repair ingress | leader-and-term fence across awaits | AU, H |
| 46 | `wasm-service/wasm-creation-genesis.js:42` | per genesis observation | held check | O |
| 47 | `wasm-service/wasm-service-consensus-port.js:227` | once per open | held-at-open refusal | O |
| 48 | `wasm-service/wasm-service-replica.js:549` | leadership edges | term | O |
| 49 | `…wasm-service-replica.js:730` | per safety-broadcast interval, per replica | broadcast the commit index | O, H |

Equivalent entry: committed-membership reads. 5 direct sites, about 13 callers through `readPartitionCommittedMembership` and `readMessageGroupCommittedMembership`. BOOTSTRAP and WITNESS drive exactly like `readStatus`. LEARNER_ACTION (`src/node/message-group-membership-recipient.js:63`) is the awaited settle-then-read.

### Totals

| Group | Sites | Which |
| --- | --- | --- |
| **MUST-BE-POST-DRAIN** | **0** | section 4 |
| Authority, **not** fenced by a later core command (AU) | 11 | 9, 13, 14, 15, 16, 21, 22, 23, 38, 39, 45 |
| Authority, fenced by a later command turn (AF) | 11 | 2, 3, 7, 24, 28, 29, 32, 36, 37, 41, 43 |
| Observation only (O) | 27 | the rest |
| **HOT-PATH-REPEAT** (overlaps the above) | 12 | 3, 7, 8, 18, 20, 26, 34, 37, 38, 39, 45, 49 |

**Top five hot paths.**
1. CDC currentness selection (#7): 243 status reads per delivery to one target group, 685 to three (measured).
2. Partition write pre-check (#37): one per write and per transaction step, 13 call sites.
3. Read-authority witness (#38): one per remote read and per local system-table read.
4. CDC subscriber readiness (#3 + #7): 4 per subscriber delivery, plus the message-group apply's leader checks per source apply.
5. Readiness quorum authority (#39): one per hosted partition per evaluation. The role-event listeners belong here too (#34, #20): 2-3 in-turn reads per announcement, each of which queues a discarded read turn when inbound is pending.

## 4. Safety of a non-driving read

**Assumed contract:** `readStatus` answers the owner's last settled status (recorded at the end of the last completed turn) and never enters the core.

### 4.1 No caller can require post-drain today (VERIFIED by reading)

The current read already answers the pre-drain observation in four cases: a turn is in progress; the drain goes pending at an awaited send (the normal production case); a user transaction is open; the group is in recovery. A caller whose correctness needed post-drain facts would already be wrong in production. F1 said so for the admission pre-check and the owner accepted the exclusion (section 2.2).

### 4.2 Delivered-but-undrained is the same as arriving a microsecond later

In every AF and AU caller, "delivered but undrained" is one more queue between the peer's decision and this replica's knowledge of it. The queues before it (the peer's send, the socket, the transport dispatch) are indistinguishable to the caller. Draining at the read narrows the window by one queue hop when it completes synchronously, and by nothing when it goes pending. It never closes the window.

### 4.3 The AF callers (11)

**Interleaving.** A higher-term append from a new leader sits in `inbound`. The settled status still says leader. The pre-check passes.

**Protection.** The effect is a command (`propose`, `proposeConfChange`, `campaign`, the membership transition). `perform` drains inbound first (:1992-2003), the core then refuses or drops the proposal, and the answer is classified. That is exactly F1's D3, D4, D5 and A3, with anchors R2.4 and R3.10 ("durable-write outcome at both ends of the budget"). The pre-check is a typed early refusal, not the fence.

### 4.4 The AU callers (11)

The drain was never their protection; each needs a named one. What exists today:

| Caller | Interleaving with a stale settled status | What protects the effect today |
| --- | --- | --- |
| #38 read-authority witness | a deposed leader stamps a read with its old term and applied index | the consumer's check of the witness against its own topology term (not traced here). No lease or read-index exists; the binding exports no `read_index` (`coverage-model.md` §4.1). **The drain does not provide linearizability either** |
| #39 readiness authority record | a deposed leader publishes one more leader record | `resolveConsensusLeadership` also requires the published role (`partition-service-split-accessor-base.js:105-110`); the record carries term and configuration key; the role event updates the next evaluation |
| #23 resume opens admission | admission opens on a deposed leader | writes are proposals (fenced); the demotion event discards participant sessions (`partition-service-raft-lifecycle-wiring.js:52-53`); #22 compares the stored proof with status and fails closed |
| #9, #13-#16, #21 participant release | an answer is granted or refused on a stale role | answers carry term, configuration key, membership generation and runtime generation, and the coordinator compares them (not traced end to end: **INFERRED**) |
| #45 retained-repair ingress | the term fence compares the settled term | the fence is the term itself; a higher term arrives by event at the next drain |

### 4.5 Who legitimately needs "process what is pending, then tell me"

- **Production: none found.** The one production read that wants it already has it: LEARNER_ACTION, a queued awaited turn.
- **Evidence: the F1 processed-first harness** (3 files named in 2.2) and an unknown number of the 869 test reads that use a status read to advance a deterministic cluster.

### 4.6 What changes beyond the drain (owner decisions)

1. **A read no longer repairs.** Today a read reconstructs a failed group, replaces an unhealthy runtime and syncs compacted storage. Ticks and scheduled drains also pass `ensureExecution`, so a scheduled group still recovers. Whether any group state has neither ticks nor inbound and relies on a read to recover is **not determined**; the comment at :1518-1521 presents the read as "the group's next operation".
2. **Fields that are not the core's.** `groupHealth`, runtime health and generation, per-peer delivery observations, resolved addresses and inbound step refusals are read at shape time. Health and lifecycle must stay live at read time, or callers #17, #19 and #20 lose held-group detection. The others need an owner-defined refresh rule.
3. **Deferred Ready.** When a user transaction opens mid-turn the core has stepped but the Ready is not taken (:1307-1310). Today an idle read shows that stepped, unpersisted state. A settled read would show the last persisted and announced state. INFERRED to be the safer answer.

## 5. Prior art (only what changes the design)

Only the vendored raft-rs is VERIFIED here. etcd, TiKV and CockroachDB are stated from knowledge of their sources and were not re-fetched.

- **raft-rs.** `RawNode::status(&self)` takes an immutable borrow (`vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs:721`). `tick`, `campaign`, `propose`, `step`, `ready` and `advance` take `&mut self` (:342-654). A status call cannot drive, by type.
- **TiKV.** Leader, term and role are read from the peer's in-memory raft state without stepping. Only the raftstore poller steps, ticks and handles Ready. Hot read paths do not ask the peer at all: the local reader consults a **published read delegate** (term, lease, applied term) that the raftstore thread updates on change. Currency is explicit: a lease or ReadIndex.
- **etcd raft.** `Node.Status` is answered by the node's own event loop between steps, as a snapshot. `Status()` is documented as allocating, with `BasicStatus` and `WithProgress` as cheaper tiers. The server publishes leader, term and committed index as fields the raft loop sets when a Ready carries new soft state. Linearizable reads go through ReadIndex.
- **CockroachDB.** Replica raft status is read under the replica's read lock. Tick and handle-raft-ready run only on the raft scheduler. It added basic and sparse status variants because the full status with the progress map was too costly on hot paths. Reads are authorised by leases, not by status.

**The shared rule.** Reading consensus state is a cheap snapshot of what the single event loop last settled; only that loop (step, tick, ready) advances the machine, and a reader that needs currency asks for it explicitly through the protocol (lease, ReadIndex, or a proposal), never by making the read step the machine.

**What this adds for Lagrange:** tiers of status (basic: role, term, leader, commit, applied; full: plus progress and peers); and a published snapshot updated on change, read by identity.

## 6. Design options

All options touch `src/raft/raft-rs-runtime-owner.js`, which another writer is changing for (i) status announced only on change and (ii) a node-level inbound drain. That work is not visible at `23344cddc`; the composition notes are conceptual.

### (a) Add a pure `observeStatus()` beside the driving `readStatus()`

- **Contract.** `observeStatus()` answers the last settled status, enters no core, O(1). `readStatus()` is unchanged. O and H callers move.
- **Files.** Runtime owner, `raft-rs-operation-port.js`, `raft-operation-port.js:11-27` (the method list), every port implementation and test double (R08), and the moved call sites.
- **Two paths or two contracts?** Two contracts in principle. In practice the census leaves the driving read with **no legitimate production caller**, and its name would keep three behaviours (fresh, driving, cached). That is a retained legacy path under the owner's rule, and R11's "one authoritative algorithm" for "what is this group's status" would have two answers that differ exactly when it matters. (a) is acceptable only as a dated migration step.
- **With (i).** Good: the observation is what (i) maintains. **With (ii).** Poor: the old read remains a second, uncapped inbound driver that bypasses the node-level drain's budget.
- **Risks.** 22 authority sites stay on the driving read "to be safe", and the defect class survives where it is least visible.

### (b) `readStatus` becomes pure observation for everyone; driving has one named entry

- **Contract.** `readStatus()` is the owner's last settled status. It enters no core, queues nothing, repairs nothing, and returns the same frozen object until the settled status changes. "Process what is pending, then tell me" is an explicit awaited turn owned by whoever owns the inbound drain; the form already exists (LEARNER_ACTION).
- **Files.** Runtime owner: `readStatusNow`, `readStatusObserved`, `readStatusUndrained`, `readStatusInRecovery`, the READ_STATUS command and its place in `COMMANDS_BEFORE_IDENTITY_RECORD`; `executeCommand`'s committed-membership branch (:2141-2145). Port :456 and :485. The F1 harness (3 files) and any test that drains by reading. **No production call site changes.**
- **With (i).** They are the same mechanism and should land together or (b) on top. If the observation object changes identity only when its content changes, the shaped answer is memoised (`SHAPED_STATUS` already exists) and object identity is the per-group "status generation" the CDC selection stamp asks for (`cdc-currentness-record.md` §17). The two changes must agree on **one end-of-turn settle point** that records the observation and then diffs and emits; (i) must not make recording conditional on anything narrower than "the core could have changed".
- **With (ii).** Required by it: once a node-level owner drains inbound with a budget, a read that drains a group out of band is a competing driver. Under (b) the named settle is a request **to that owner**, not a second drain.
- **Risks.**
  1. Recovery driven by reads needs an owner (4.6.1).
  2. Tests that drain by reading: unknown count; the F1 oracle silently loses its meaning unless moved in the same change.
  3. The 11 AU callers lose one queue hop of currency when the drain used to complete synchronously (4.4).
  4. Live versus snapshot fields (4.6.2).

### (c) Status pushed by events only, no pull

- **Contract.** Consumers hold what the events told them.
- **Files.** All 49 sites, plus new events for what has none today (commit index, follower progress, peer delivery, gate, health).
- **Assessment.** Every consumer-held copy is a derived projection (R05), and each of the 49 becomes a place where a copy can lag. R03 points the other way: the owner holds the one settled observation and consumers read it. Events remain right for **edges** (the tenure token is the good precedent). (c) is the largest change and the weakest on "authority is consumed, not copied".
- **With (i).** Depends on it entirely. **With (ii).** Neutral.

### Witnesses

**Red today, for (a) and (b).** Each uses the real port and core and counts with the existing `setActualCoreEntryObserver` (:2384-2386):

| Witness | Expectation | Today |
| --- | --- | --- |
| W1 idle read | a status read on an idle group makes **0 core entries**, 0 SQLite transactions, 0 events; N reads return the same frozen object | 2 core entries per read; N distinct objects |
| W2 read with pending inbound | k envelopes delivered, scheduled drain not yet fired: the read makes 0 core entries, `inbound` still holds k, no committed-entry application and no role/term/leader event inside the call. Run on **both send modes** | synchronous send: step, persist, apply and announce inside the call. Awaited send: step and persist inside the call, answer pre-drain |
| W3 read during a busy turn | N reads while a turn awaits and inbound is pending add 0 queued turns and 0 later core entries | N discarded READ_STATUS turns |
| W4 a read repairs nothing | a read on a group in recovery, or under an unhealthy runtime, enters no core and starts no reconstruction | reconstructs / replaces |

All four are INFERRED red from reading.

**Protecting the 2026-09 property.**

| Witness | What it shows |
| --- | --- |
| P1 the F1 differential oracle, unchanged in meaning | D1-D6 compared PENDING against PROCESSED, with the PROCESSED leg built by the named settle. Its guards must stay: "the processed run's core-entry log must show one `step` per delivered envelope"; "in the pending run, every delivered envelope must be stepped before any decision read" (amendment, "Anti-vacuity") |
| P2 the fence anchor for readers | a stale leader with a pending higher-term append: the pre-check on the settled status passes, the proposal's own turn drains first, the core drops it, the write is answered deferred or refused, and no row exists. This is F1's D3/A3 with anchors R2.4 and R3.10, now stated for the non-driving read |
| P3 settled equals core after every turn | after any completed turn the settled observation and the event stream match a fresh core read (F1's D7 anchor) |

### Choice

**(b)**, sequenced with the other writer's "announced only on change". It is the only option that leaves one implementation per contract, removes the read as a competing inbound driver for the node-level drain, changes no production call site, and gives the CDC selection stamp its generation for free. (a) is a migration step that would not be finished. (c) multiplies copies.

## 7. Expected effect

Figures from `reports/idle-raft-cpu-cost.md` §2 (seed profile on `f580579a5`, profiler on; the cited owner lines match `23344cddc`) and `reports/cdc-currentness-record.md` §12, §17. No profile chunk was re-parsed.

| Path | Today | Under (b) | Basis |
| --- | --- | --- | --- |
| CDC currentness selection | 243 reads per delivery to one target, 685 to three; each at least 2 WASM crossings + reshape + deep freeze | 0 crossings; one frozen object reused | measured count; cost by reading |
| The same, in time | about 13 ms and 38 ms of synchronous loop time per delivery | near 0 | **INFERRED**: 243 and 685 × the ~55 µs per call measured on 2026-10-05 |
| `readStatus` subtree, seed formation window | **8.8 %** of samples inclusive, of which `readStatusUndrained` **7.7 %**; status shaping is 2.7 points of `deepFreeze` | upper bound of the saving: 8.8 points, or 9.8 % of samples after removing profiler frames (7.8 %) and idle (2.4 %) | profile; bound INFERRED |
| The drive itself | at most 8.8 − 7.7 = 1.1 points, which also contains dispatch and the busy-path shaping | moves to scheduled drains: the same total raft work, now attributed to the protocol | INFERRED by subtraction |
| Readiness quorum authority | one fresh read per hosted partition per evaluation | O(1) | by reading; cadence not measured |
| Write pre-check, read witness | one fresh read per write or read | O(1) | by reading |
| Role-event listeners | 2-3 reads per announcement, each queuing a discarded turn when inbound is pending | 0 queued turns | by reading |

**Assumptions.**
- Nearly all `readStatus` samples come from the CDC check; the profile report says "mostly", and the split per caller is not established.
- The profile is one seed, profiler on (about 20 % overhead by that report's estimate).
- The CDC plan stamp (stage 2b) removes the plan rebuild, the other half of the 17.0 % CDC currentness subtree, independently. If a selection stamp also lands, CDC's reads fall to at most 1 per delivery, and what (b) saves is then the other hot paths plus the correctness of the read.
- On the 420 s formation bound: 8.8 % of a 431 s formation is about 38 s if the seed is CPU-bound and the relation is linear. That is an upper bound under a strong assumption, **not established**.

**What (b) does not reduce:** raft machinery and transport (25.5 % in formation, 41.6 % after drain), the announce after each drain (1.8 % / 3.7 %; the other writer's unit), apply, synced commits.

## 8. Owner decisions needed

1. **The meaning of a status read used for authority.** "The owner's last settled status" replaces "a fresh core read after a best-effort drain". For an idle group the two are equal. They differ when inbound is delivered but undrained, and when a Ready is deferred.
2. **The 11 unfenced authority callers** (9, 13-16, 21-23, 38, 39, 45): accept settled-status currency plus events, as production already has whenever a drain goes pending, or require a named fence (lease, read index, tenure) as separate work. The read-authority witness (#38) is the one where the missing protection is a known gap in itself.
3. **Who repairs when reads do not**: reconstruction of a failed group, replacement of the shared runtime, compacted-storage sync.
4. **Whether a named settle operation is exposed on the port** (an R08 change for every port implementation and test double) or stays a harness seam, and that its owner is the node-level drain.
5. **Which status fields are live at read time** (health, lifecycle) and which are part of the settled snapshot (peer delivery, addresses, progress), and whether a basic tier without progress is wanted.
6. **Sequencing** with "announced only on change" and the node-level drain: one end-of-turn settle point with one writer of the observation.

## 9. Not determined

- No witness was executed. Every "red today" is by reading. The two measured inputs are the earlier 55 µs per call and the 243 / 685 counts.
- How often a production Ready carries no awaited send, so that apply and role events run inside the reading caller's stack.
- The split of the 8.8 % `readStatus` samples by caller.
- How many of the 869 test `readStatus()` calls depend on the drain.
- Whether any group state relies on a read alone for reconstruction (no ticks scheduled and no inbound).
- The cadence of readiness evaluations, of the durability-fitness check (#27) and of the safety broadcast (#49).
- The consumer-side fences of the participant-release answers and of the read-authority witness (not traced end to end).
- The other writer's in-flight changes to the runtime owner.
- Whether the ~55 µs per call measured on 2026-10-05 still holds after `73c06f635`, which removed two SQL statements per read.
- etcd, TiKV and CockroachDB are cited from knowledge, not re-fetched.
- `partition-service-raft-lifecycle-wiring.js:178` reading a field the status does not have (#35) is a side observation, not followed up.
