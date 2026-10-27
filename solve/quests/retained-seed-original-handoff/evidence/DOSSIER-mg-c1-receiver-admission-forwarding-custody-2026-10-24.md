---
audience: development
documentClass: evidence
---

# DOSSIER C1: public receiver admission and forwarding custody

Quest `retained-seed-original-handoff` (epic `raft-rs-full-cutover`). Read-only
investigation. Worktree `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`,
branch `work/mg-delivery-resume-r2-20261023`, HEAD `bed8c6354` (source checkpoint
`947107b63`). No file in the repository was edited, no test was run. Every
`file:line` refers to that HEAD unless it says otherwise. "Unknown" means it was
not established here.

Abbreviations:
- RCV = `src/message-group/message-group-service-cdc-propagation-runtime-methods.js` (the receiver)
- ACC = `src/message-group/message-group-cdc-committed-acceptance.js` (committed-acceptance owner)
- REP = `src/message-group/message-group-service-cdc-replication-runtime-methods.js`
- RTG = `src/message-group/message-group-proposal-routing.js`
- NDM = `src/message-group/message-group-forwarding-owner-native-delivery-methods.js`
- FDM = `src/message-group/message-group-forwarding-owner-delivery-methods.js`
- FWO = `src/message-group/message-group-forwarding-owner.js`
- FRM = `src/message-group/message-group-forwarding-owner-routing-methods.js`
- ING = `src/message-group/message-group-service-inbound-ingress-runtime-methods.js`
- PQ  = `src/partition/proposal-queue.js`

---

## 0. Executive summary

1. **The defect is confirmed in source, and it has two parts.**
   (a) `handleDurableLatencyCdcMessage` deep-captures at RCV:18 (`captureCdcEvents(incoming)`).
   That happens before the only queue reservation, `reserveCdcWait`'s `queue.enqueue(reservation, {})`
   at ACC:113. ACC:112 states the owner invariant: "The queue owner reserves capacity
   BEFORE immutable capture or digesting". The envelope owner restates it at
   `src/cdc/cdc-event-envelope.js:101-102`: "Capacity is reserved by the delivery
   owner before it calls this synchronous capture".
   (b) The receiver's own ingress decision (RCV:22-23, RCV:36-46) sends FORWARD
   to `service.forwardCDCBatchToLeader` (RCV:45). That reaches
   `forwardDurableCdcPayload` (NDM:247) with **no** `cdcCommitWaiters` reservation
   at all, so ProposalQueue capacity never bounds a public follower forward.
2. **Routing the receiver through `applyCDCBatch` is necessary but not sufficient.**
   Inside the owner, the FORWARD route is also uncharged. `deliverCapturedCdc`
   (ACC:213-224) passes `proposeCommand` (which routes through `ownOperation`,
   ACC:146) but nothing for forwarding. `routeAttempt`'s FORWARD arm (RTG:190-195)
   calls `options.forwardToLeader` directly: no `ownOperation`, no deadline race.
   The owner holds the slot only through the *response* entry (`responsePending`).
   When the waiter's deadline timer resolves that entry (ACC:72-75, then
   `takeResponse` PQ:164-174), the slot is freed immediately because
   `rawOperation === null`, while the actual forward continues. Meanwhile the
   caller is still awaiting the forward (ACC:213, ACC:265), so the response does
   **not** settle at the deadline. Today the follower owner path therefore has
   both C1 symptoms: expiry releases custody, and the caller does not settle at
   its deadline.
3. **The proposed consolidation is sound** with these exact additions: a forward
   callback charged through the same `ownOperation` and raced against
   `wait.completion`; canonical DEFER handled inside `deliverCapturedCdc`; and a
   typed UNKNOWN answer on owner-side expiry (see 5.4, a predicted failure of
   cut 4 if omitted). The "do not wrap the whole delivery in `ownOperation`"
   warning is concretely justified: `ownOperation` joins an open raw operation for
   the same key (PQ:137). A nested `ownOperation` inside an outer one returns the
   outer promise to itself, which never settles and leaks the slot permanently.
4. **C1 is one instance of a broader class, not a local bug.** Section 3 lists
   the siblings. Within the delivery owners (R01/R03/R11/R13), the same correction
   covers: the receiver durable branch (both capture-before-admission and the
   competing ingress decision); the owner's uncharged FORWARD route; and the
   now-redundant bare `applyCDCBatch` arm in `tryAddressedDurableCdcIngress`
   (NDM:153-155). Outside this owner, separate findings (R17) are: the legacy
   non-durable receiver FORWARD (RCV:93-173, RCV:230-297), which has no queue at
   all; the partition write commit deadline releasing ProposalQueue capacity
   while a parked or in-flight handoff persists
   (`src/partition/partition-service-cdc-stream-base.js:328-337`,
   `src/partition/partition-service-raft-write-commit.js:262-266`); the generic
   MESSAGE/ACK `withinProposalDeadline` with no raw custody (RTG:135-161,
   RTG:183-184); and transport inbound `JSON.parse` before any application
   admission (`src/transport/message-router-inbound-dispatch.js:52`).
   The topology wave is a correct sibling: it admits before capture
   (`src/topology/cdc-group-propagation-durable-delivery.js:179-194`).

---

## 1. Complete operation trace (file:line per hop)

### 1.1 Common entry (all public durable input)

| # | Hop | Location |
|---|---|---|
| E0 | WebSocket inbound: full-message `JSON.parse(data.toString())` **before any application admission** (wire decode; transport owner) | `src/transport/message-router-inbound-dispatch.js:46-52` |
| E1 | Router handler registered by `registerMessageGroupTransportHandler`; handler calls `messageGroup.receiveMessage(envelope, connectionDelivery, localDelivery)` | `src/bootstrap/shared/message-group-transport-handler.js:26-37` |
| E2 | `receiveMessage`: raft envelopes are stepped; everything else goes to `handleApplicationMessage` | ING:114-129 |
| E3 | `handleApplicationMessage`: duplicate-messageId check, HLC update, dispatch on payload.type | ING:137-194 (`LATENCY_CDC_PROPAGATION` ING:177-185; `_BATCH` ING:186-194) |
| E4 | `handleLatencyCdcPropagationMessage` / `...BatchMessage` -> runtime functions | ING:227-235 / ING:243-251 -> RCV:48 / RCV:192 |
| E5 | `startedAtMs = service.timeSource.now()` | RCV:55 / RCV:199 |
| E6 | `captureCdcForwardRequest(service, payload, batch)`: **shallow** `copyStrictOwnDataRecord` of the wrapper (`src/utils/strict-own-data.js:60-86`, top-level own data descriptors only), plus `hasDurableCdcEvents(incoming)` (shallow per-member `eventKey` own check, proxy refusal; `src/cdc/cdc-delivery-outcome.js:172-191`), plus `readCdcForwardContext` (NDM:76-92) | RCV:56 / RCV:200 -> NDM:109-119 |
| E7 | Durable: `handleDurableLatencyCdcMessage` | RCV:58-61 / RCV:202-205 -> RCV:11 |
| E8 | Receiver grant: `createCdcDeliveryBudget(service, {...localDelivery, receivedRemainingMs})`. O(1), no data capture | RCV:16-17 -> `src/cdc/cdc-delivery-budget.js:36-63` |
| **E9** | **DEEP CAPTURE #1: `captureCdcEvents(incoming)`**. Recursive `captureCdcData` copy/freeze plus identity set (`src/cdc/cdc-event-envelope.js:104-148`). **No reservation exists yet.** | **RCV:18** |
| E10 | `assertCdcTerminalEvents(events, context)` | RCV:19 -> NDM:100-107 |
| E11 | Competing ingress decision: `event = find(shouldUseStrictCDCForwarding)`; `service.resolveCdcIngressDecision({...event, ...context, events})` | RCV:22-23 -> `message-group-service-forwarding-runtime-methods.js:17-18` -> FWO:258 (durable: FWO:296-302 -> FRM:127-158 `resolveNativeCdcIngressDecision`; otherwise cache selection FWO:304-404, including `shouldUseCanonicalLocalIngressForStrictCDC` FWO:341 -> FRM:532-...) |
| E12 | `applyDurableLatencyCdcDecision`: DEFER -> UNKNOWN (RCV:39); APPLY_LOCAL with NATIVE_COMMIT and localIngress -> UNKNOWN (RCV:41-42); APPLY_LOCAL -> `applyCDCBatch` (RCV:43); else **FORWARD -> `forwardCDCBatchToLeader`** (RCV:45) | RCV:36-46 |
| E13 | Reply: `budget.assertCurrent()` then `buildLatencyCdcPropagationResult({... ...answer})` | RCV:26-33 |

### 1.2 Local-leader branch (decision APPLY_LOCAL, state LOCAL_RAFT_LEADER, FRM:134-138)

| # | Hop | Location |
|---|---|---|
| L1 | `service.applyCDCBatch(events, options)` (events = already-captured vector from E9) | RCV:43 -> REP:157 |
| L2 | `captureCdcForwardOptions`, `assertCdcTerminalEvents`, durable dispatch | REP:158-160 |
| L3 | `applyDurableCdcBatch`: `captureCdcParentGrant` (ACC:231-241) with parent = receiver budget | ACC:252-254 |
| **L4** | **RESERVATION: `reserveCdcWait` -> `queue.enqueue(reservation, {})`**. Capacity refusal: PQ:110-115 BACKPRESSURE -> ACC:259-261 `backpressuredCdcAcceptance` | **ACC:257-258 -> ACC:113** |
| L5 | **DEEP CAPTURE #2 (correct position):** `captureCdcCommandVector` (captureCdcEvents + digest + ordinary normalization) | ACC:118-119 -> ACC:100-107 |
| L6 | key = `cdcCommitWaitIdentity(events)`; duplicate active key -> BACKPRESSURE; `liveWait`; release reservation and install key entry with no await; `armCdcWait` | ACC:120-136 |
| L7 | `deliverCapturedCdc`: `assertCurrent`; `capturedCdcIngress` (**third** decision: ACC:192-200); terminal guard ACC:207-208; provisional guard ACC:209-211 | ACC:202-211 |
| L8 | `service.proposeCDCCommand(wait.command, {assertCurrent, applyProvisionalIngress, remainingMs, proposeCommand})` | ACC:213-224 -> REP:320 |
| L9 | `routeMessageGroupCommand` -> `executeWithRetry` -> `routeAttempt` PROPOSE arm: `withinProposalDeadline(() => options.proposeCommand(command), min(proposeTimeoutMs, remainingMs()))` | REP:332-339 -> RTG:211-241 -> RTG:177-189 -> RTG:135-161 |
| L10 | `proposeCdcAndAwaitCommitted`: **`cdcCommitWaiters.ownOperation(key, runCdcProposal)`**, then `parent.context?.ownChild(raw)` | ACC:142-153 -> PQ:131-151 |
| L11 | `runCdcProposal`: re-arm per-attempt budget, `proposeMessageGroupCommand` (`raft.propose`), `await wait.completion` | ACC:155-171 -> RTG:118-125 |
| L12 | Native apply registers effects: `registerCdcCommittedAcceptance`; afterCommit settles the exact current waiter | `message-group-service-raft-timing.js:208` -> ACC:274-290 |
| L13 | `inputCdcOutcome` (I-digest binding), `finally` resolves waiter if still current | ACC:265-271, ACC:243-250 |
| L14 | Reply E13 | RCV:26-33 |

Capture vs reservation on this branch: **capture #1 (RCV:18) precedes reservation (ACC:113): DEFECT.** Capture #2 (ACC:118) follows it correctly.

### 1.3 Follower-forward branch (decision FORWARD, state FORWARD_NATIVE_LEADER, FRM:154-155; or FORWARD_STRICT_TARGET / FORWARD_NON_STRICT from cache selection, FWO:322-334, FWO:369-388)

| # | Hop | Location |
|---|---|---|
| F1 | `service.forwardCDCBatchToLeader(events, options)` (receiver path; **no ACC involvement**) | RCV:45 -> `message-group-service-forwarding-runtime-methods.js:186-187` -> FDM:407-414 |
| F2 | `forwardDurableCdcPayload`: wrapper record copies, **new budget** from incoming options, context | NDM:247-255 |
| **F3** | **DEEP CAPTURE #2 on this path: `captureCdcEvents(...)`. Still no reservation.** | **NDM:256** |
| F4 | Terminal/relay-depth guard -> UNKNOWN; **fourth** decision; optional topology repair and re-decision (`shouldRepairAuthoritativeTopology`) | NDM:257-265 |
| F5 | `deliverDurableCdcDecision`: no targets -> `tryAddressedDurableCdcIngress`; that calls **`applyCDCBatch` (bare)** when no `applyProvisionalIngress` is supplied, which is the case from the receiver path. That is a nested reservation. | NDM:270-284 -> NDM:145-158 (bare arm NDM:153-155) |
| F6 | `tryDurableCdcForwardTargets` -> `tryDurableCdcForwardTarget` -> `deliverDurableCdcForwardTarget`: `service.transport.deliver(address, request{relayDepth+1, cdcForwardMode: NATIVE_COMMIT if terminal}, {timeoutMs: remainingMs(), deliveryContext, prepareDeliveryMessage})` | NDM:201-235 -> NDM:176-199 (deliver NDM:187-196) |
| F7 | Remote leader: E0-E13 with `cdcForwardMode = NATIVE_COMMIT`. Leader reserves its *own* queue (L4) and owns its local raw (L10). | — |
| F8 | Reply decorated at RCV:26-33. **The follower's ProposalQueue was never touched.** | — |

Owner-originated follower forward (e.g. `follower.applyCDCBatch(...)` in the test,
topology source leaf `src/topology/cdc-group-propagation-durable-delivery.js:101`):
L1-L8, then `routeAttempt` FORWARD arm RTG:190-195 -> `forwardToLeader` REP:337-338
-> `forwardCDCCommandToLeader` REP:397-417 (relay depth preserved for durable,
REP:23-30) -> F1-F7. Here reservation (ACC:113) **precedes** capture (ACC:118, then NDM:256
re-captures already-captured data), but **the raw forward is not charged through
`ownOperation`** and is not raced against `wait.completion`. The slot is held only by
`responsePending`. The deadline timer ACC:72-75 retires it, `takeResponse` PQ:164-174 ->
`removeClosedEntry` PQ:154-161 deletes the entry at once (rawOperation null), and
`deliverCapturedCdc` keeps awaiting the forward at ACC:213.

### 1.4 Provisional / local-ingress branch (APPLY_LOCAL with `localIngress: true`, FWO:341-367)

- Receiver: capture #1 (RCV:18), then the receiver's own terminal+localIngress guard RCV:41-42.
  Then `applyCDCBatch` (RCV:43) -> reservation ACC:113 -> capture ACC:118 -> `deliverCapturedCdc`
  ACC:209-211 -> `provisionalCdcIngress` ACC:180-190 (`applyImmediate`,
  `buildProvisionalCdcOutcome`). **Capture precedes reservation: DEFECT.**
- The RCV:41-42 guard is redundant with the owner. `shouldUseCanonicalLocalIngressForStrictCDC`
  returns false for NATIVE_COMMIT (FRM:541). `resolveNativeCdcIngressDecision` returns DEFER for
  NATIVE_COMMIT non-leaders (FRM:139-141). The owner's terminal guard ACC:205-208 refuses
  `terminal && (target mismatch || !leader || !ready)`, and `applyProvisionalIngress`
  returns UNKNOWN for terminal (ACC:217).

### 1.5 DEFER branch

- Receiver: capture #1 (RCV:18), then UNKNOWN (RCV:39). No queue use, but capture already happened.
- **The owner has no DEFER branch.** `deliverCapturedCdc` (ACC:202-229) never inspects
  `ingress.action`. A non-terminal DEFER falls to `proposeCDCCommand` (ACC:213). On a follower
  that becomes FORWARD -> `forwardDurableCdcPayload`, which for `DEFER_STRICT_TARGET_UNKNOWN`
  (FWO:390-403, `shouldRepairAuthoritativeTopology: true`) **repairs topology and re-decides**
  (NDM:261-265). Then it may reach addressed provisional ingress (NDM:272, NDM:277-280).
  So today the *same* durable input has two DEFER semantics, depending on whether it entered
  through the public receiver (immediate UNKNOWN, no repair) or through a direct `applyCDCBatch`
  caller (repair, re-decide, possible provisional). That is itself an R11 two-path defect.
  See open question O1.

### 1.6 Single vs batch

The durable path is identical for both. `incoming` is `[payload]` (single) or
`payload.events` (batch) (NDM:111). `copyCdcEvent` keeps only envelope fields, so
passing the single-event wrapper record as an event is safe
(`src/cdc/cdc-event-envelope.js:88-99`). The only difference is reply decoration
(RCV:28-31).

### 1.7 Summary table: capture position relative to queue reservation

| Branch | Pre-reservation reads | First deep capture | Reservation | Verdict |
|---|---|---|---|---|
| Single, leader | E6 shallow, E8 | RCV:18 | ACC:113 | capture before admission |
| Batch, leader | E6 shallow (O(n) member scan), E8 | RCV:18 | ACC:113 | capture before admission |
| Local ingress/provisional | same | RCV:18 | ACC:113 | capture before admission |
| DEFER | same | RCV:18 | none | capture with no admission |
| Public follower FORWARD | same | RCV:18, then NDM:256 | **none** | no admission at all; uncharged forward |
| Owner-originated follower FORWARD | — | ACC:118 | ACC:113 | admission correct; **forward raw uncharged; expiry frees slot; caller not settled at deadline** |

---

## 2. History pass

| Element | Introduced by | Evidence |
|---|---|---|
| `handleDurableLatencyCdcMessage`, `applyDurableLatencyCdcDecision` (RCV:11-46) | `681da1dc1` (2026-10-23, "wip: preserve rs-raft delivery draft at user stop") | `git blame -L 11,46`: 36/36 lines from 681da1dc1. Present unchanged in `947107b63` (R2 preserved). |
| Legacy (non-durable) receiver with FORWARD bypass (RCV:93-173, RCV:230-297) | Pre-existing. Blame `a7f0454ce` (2026-05-24, "Refactor message-group runtime oversized package", a file split, so the origin is earlier) and `06273547c` (2026-07-02). 681da1dc1 only added `...copyCdcEventMetadata` and `...answer` (RCV:158-159). | `git blame -L 155,175` |
| ACC (whole file: `reserveCdcWait`, `applyDurableCdcBatch`, `proposeCdcAndAwaitCommitted`) | `681da1dc1` | `git log -- ACC` shows only 681da1dc1. `-S reserveCdcWait` on HEAD: 681da1dc1, then docs 74fde68a4 and 947107b63. |
| `ProposalQueue.ownOperation`, `takeResponse`, `proposals` custody map, `isResponsePending` | `681da1dc1` (`git log -L131,151:PQ`: 681da1dc1 over `1aea11baf` #63 2026-09-30). The queue itself is old (`62a1e525a` 2026-02-09). | Reviewed in `REVIEW-mg-delivery-native-custody-r1-r6-2026-10-23.md:55-110` |
| `withinProposalDeadline` taking an operation, `proposeCommand` hook, `assertCurrent`/`remainingMs`, route answer retention | `681da1dc1` (diff of RTG shown by `git diff 681da1dc1^ 681da1dc1`). The FORWARD arm received only `invoke(...)`, **no custody**. | RTG:171-196 |
| `forwardDurableCdcPayload` and the whole NDM file | `681da1dc1` | `git log -S forwardDurableCdcPayload` |
| `cdc-delivery-invocation` `run()` (response races raw, raw stays child-owned) | `681da1dc1` | `src/cdc/cdc-delivery-invocation.js:212-252` |

Quest and records:
- Everything above is draft WIP of **this** Quest (`retained-seed-original-handoff`). The
  681da1dc1 commit message calls it "58 production paths ... Corrected runtime and final
  composition remain unexecuted ... not Quest landing". The quest log entry at
  2026-10-24T06:40:46Z (log.ndjson line 68) says "C1 corrected predecessor test
  697d8f4030 is reviewed but unmeasured; C1 production ... remain absent."
- The C1 discovery is recorded in
  `solve/epics/raft-rs-full-cutover/HANDOVER-2026-10-23-resume-workspace-interruption.md:106-145`
  and `HANDOVER-2026-10-24-r2-preservation.md:137-158,213-236`. Per the first handover
  (`:199-203`), the original local log appends for the C1/C2 findings were lost and must
  not be fabricated.

Earlier treatment of the same symptom family:
- **Admission before capture (correct precedents):** ACC:109-113 (681da1dc1). Also
  `REVIEW-mg-delivery-root-source-r1-2026-10-23.md:307` ("Queue capacity is reserved
  synchronously before immutable capture/digest") and
  `REVIEW-mg-delivery-complete-vector-source-r1-2026-10-23.md:217,247`. The topology wave
  (`src/topology/cdc-group-propagation-durable-delivery.js:179-194`, comment at :183-184).
  None of these reviews traced the *receiver* entry. The R2 test review
  (`REVIEW-mg-receiver-admission-predecessor-resume-r2-2026-10-23.md:33-47`) first records
  that gap.
- **Expiry must not release custody:**
  `REVIEW-mg-delivery-native-custody-r1-r6-2026-10-23.md:55-88`, quoting: "The public route
  can retire while this raw operation remains open, but the same recipient slot ... remain
  charged"; and `:147` (witness row "Remote call without a source brand | Recipient
  key/capacity stays charged after response retirement"). That review covered the
  *local native* raw (ACC:146) and the remote recipient's own queue. It did **not** cover
  the follower's own forward raw (RTG:190-195), which is the gap C1 cut 4 now measures.
- Contract text: `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md:537-539` ("Caller
  expiry is not proof a pending transport/recipient operation has stopped, so it cannot
  immediately free the slot"), `:781-786` ("Queue reservation precedes immutable capture.
  Each admitted waiter's actual vector/codec working set remains charged until its real
  finalizers close it ... Source/native accepted work and native history are not freed by
  retiring the response waiter"), and `:797-798` ("an expired caller does not free retained
  raw-send callbacks").
- Native-runtime precedent with the same shape: `26700ebea` (2026-10-14, ancestor of HEAD),
  "own referenced admitted-inbound and retry timer through exact close and core outcome"
  (`src/raft/raft-rs-runtime-owner.js`). It is cited as precedent in the R1-R6 review
  (`:132-135`).
- Source-side invocation with the same shape (correct): `beginCdcDeliveryInvocation.run`
  races the public response against an abort signal while `ownChild` keeps raw custody
  (`src/cdc/cdc-delivery-invocation.js:212-252`).

---

## 3. Consumer and mechanism census

### 3.1 Every ProposalQueue consumer

| Queue instance | Call site | Method | Note |
|---|---|---|---|
| MG `cdcCommitWaiters` (created `src/message-group/message-group-service-state.js:142`) | ACC:113, 132 (reservation enqueue/resolve), ACC:133 (key enqueue), ACC:138 | enqueue/resolve | admission |
| | ACC:46-47 | get/isResponsePending | currentWait |
| | ACC:74 | resolve | deadline retirement (frees slot unless raw is open) |
| | **ACC:146** | **ownOperation** | the only `ownOperation` caller in src (`git grep ownOperation`) |
| | ACC:269, 278, 281 | resolve/get | finally retirement, afterCommit settle |
| | ACC:293 | release | shutdown/port retirement (`message-group-consensus-port.js:150,213`; `message-group-service-cache-and-lifecycle-runtime-methods.js:152`) |
| Partition `proposalQueue` (`src/partition/partition-service-core-base.js:167`) | `src/partition/partition-service-cdc-stream-base.js:330` releaseEntry (commit-deadline timer), :339 enqueue, :349/:378 get, :394 resolve, :400 reject, :406 release, :411 markProposal | — | no `ownOperation`; see 3.3 S5 |

Test coverage of `ownOperation`/`takeResponse`/`isResponsePending`: **only** the new C1
test references them (`grep -rln` in test/). `test/partition/proposal-queue.test.js`,
`proposal-queue-capacity.property.test.js` and `proposal-queue-size-invariant.property.test.js`
cover the generic enqueue/resolve/reject/release surface only.

### 3.2 Every ingress into the durable MG delivery owner

| Ingress | Location | Reservation before deep capture? | Raw forward charged? |
|---|---|---|---|
| Public receiver durable (single/batch) | RCV:11-46 | **No** (RCV:18) | **No** (RCV:45) |
| Direct `applyCDCBatch` (topology source leaf `src/topology/cdc-group-propagation-durable-delivery.js:101`; tests) | REP:157-160 | Yes (ACC:113 before ACC:118) | **No** (RTG:190-195) |
| `applyCDCEvent` wrapper | RCV:308-321 | Yes (via applyCDCBatch) | No |
| Addressed provisional from forward owner | NDM:153-155 | Yes, but it is a **nested** second reservation for the same vector when reached from RCV:45. The owner path supplies `applyProvisionalIngress` (ACC:215-218), so this arm is dead once C1 lands. | n/a |
| `forwardDurableCdcPayload` direct callers | FDM:370, FDM:411, FDM:533 | Only when called inside an ACC wait | No |
| Legacy strict addressed convergence | FDM:466-520 (`applyCDCEvent`/`applyCDCBatch`) | via applyCDCBatch | — |
| Bootstrap/topology non-durable `applyCDCEvent` | `src/topology/cdc-group-propagation-service.js:246,415`; `src/bootstrap/phases/seed-cache-hydration-phase.js:415` | Non-durable path: no queue | — |

### 3.3 Sibling instances of the two classes

**Class A: capture before admission.** **Class B: expiry releases custody while raw work continues.**

| ID | Class | Location | What happens | Covered by C1 owner correction? |
|---|---|---|---|---|
| S1 | A + R11 | RCV:18, RCV:22-23, RCV:36-46 | Receiver deep capture plus competing ingress decision | **Yes** (core of C1; R01/R03/R11) |
| S2 | B | RTG:190-195, called from ACC:213 | Owner FORWARD raw is uncharged. Timer ACC:72-75 frees the slot; the caller still awaits the forward | **Yes**, required (R13). Without it cut 4 cannot pass even after routing through `applyCDCBatch`. |
| S3 | A + B | RCV:45 -> NDM:247-256 | Public forward: second capture with no reservation; fresh budget from incoming options (NDM:252) | **Yes** (disappears once RCV routes through ACC) |
| S4 | A (nested) | NDM:153-155 | Bare `applyCDCBatch` re-entry reserves the same vector again (would see `queue.has(key)` -> BACKPRESSURE) | **Yes**: becomes unreachable for durable input. Delete per R11, or record as finding if out of scope. |
| S5 | B | `src/partition/partition-service-cdc-stream-base.js:328-337` (`releaseEntry` at commit deadline), `src/partition/partition-service-raft-write-commit.js:262-266,277-287` (PARKED_WRITES), :239-259 (handOffToConsensus) | The partition write commit deadline frees ProposalQueue capacity. A parked handoff remains in `PARKED_WRITES`, and an in-flight `proposeWithinDeferralBudget` may still be pending. "A write already released ... is never proposed", but its handoff object stays uncharged until readmission. | **No.** Partition write owner (R13); record as R17 finding. Whether this is a defect is **unknown**: it depends on the reservation-lifetime bound of PARKED_WRITES and whether the deferral budget bounds the handoff. |
| S6 | B | RTG:135-161 with RTG:183-184 when `proposeCommand` is absent (generic MESSAGE/ACK) | The deadline rejects while `raft.propose` may still be pending. No queue custody at all. | **No.** MG proposal routing for non-CDC commands. Contract says generic MESSAGE/ACK keeps its "existing append contract" (CONTRACT:141-144). Record only. |
| S7 | A (unbounded) | RCV:62-190, RCV:206-305 (legacy non-durable branches) | Forward and local apply with no queue. Cache-only CDC has "separately existing semantics" (CONTRACT:109-110). | **No**, by contract scope. Record as finding: R12 pressure path for non-durable CDC is unknown. |
| S8 | A (transport) | `src/transport/message-router-inbound-dispatch.js:52` | Full JSON decode before any handler admission. The `ws` default maxPayload is 100 MiB (CONTRACT:709-718). | **No.** Transport owner; already recorded as the "accepted-source / wire-domain owner finding" (CONTRACT:720-731). |
| S9 | correct | `src/topology/cdc-group-propagation-durable-delivery.js:179-194`; `src/cdc/cdc-delivery-invocation.js:212-252` | Admission before capture; slot released by actual cleanup | Model to follow |
| S10 | B (cross-node) | NDM:187-196 `transport.deliver({timeoutMs: remainingMs()})` | Transport response deadline on the router's clock. Remote work continues and is charged on the *remote* queue. The follower's raw promise settles when the transport settles, so in production the follower-side custody extension lasts as long as the transport response does. | Partially. Transport lifetime owner (`message-router-delivery-lifetime.js`). Unknown whether the transport promise always settles at its own deadline when the remote is slow; verify with `test/transport/message-router-cdc-custody.test.js`. |

**Conclusion.** C1 is a class instance. The capture-before-admission member is local to
the receiver's duplicate durable path (S1/S3/S4), and one owner change removes it. The
expiry-releases-custody member is systemic inside the MG proposal-routing seam (S2, S6)
and has a partition analogue (S5). The C1 correction must cover S2. S5, S6, S7 and S8 are
separate owners and should be recorded findings, not absorbed (R16/R17).

---

## 4. Primary references and their implications

1. **etcd/raft**, `go.etcd.io/raft/v3`. Docs: https://pkg.go.dev/go.etcd.io/raft/v3.
   Source: https://raw.githubusercontent.com/etcd-io/raft/main/raft.go
   - `MaxInflightMsgs` "limits the max number of in-flight append messages during
     optimistic replication phase". `MaxUncommittedEntriesSize`: "Once this limit is
     exceeded, proposals will begin to return ErrProposalDropped errors."
     `increaseUncommittedSize` runs in `appendEntry`, and `stepLeader` returns
     `ErrProposalDropped` when it fails or during leader transfer.
   - Followers do no admission accounting: `stepFollower` `case pb.MsgProp` forwards
     (`m.To = r.lead; r.send(m)`) or drops with `ErrProposalDropped` when there is no
     leader or `disableProposalForwarding` is set. `Node.Propose`: "proposals can be lost
     without notice, therefore it is user's job to ensure proposal retries."
   - Implication: the **leader** owns the authoritative admission bound. A typed,
     fail-fast refusal is the right answer under pressure (our BACKPRESSURE). Durable
     retry belongs to the caller, which here is the source ledger.
   - Where it does not apply: etcd's follower forward is fire-and-forget with no
     response object. Lagrange's follower forward returns a validated committed receipt
     and holds a response waiter, so the follower *does* retain local resources
     (waiter, vector, transport call) that need their own bound. That is why C1 charges
     the follower's queue. etcd's admission also happens after the entry is already
     decoded into memory, so it does not model admission before deserialization.
2. **hashicorp/raft**. Source: https://raw.githubusercontent.com/hashicorp/raft/main/api.go.
   Docs: https://pkg.go.dev/github.com/hashicorp/raft
   - `Apply` doc: "An optional timeout can be provided to limit the amount of time we wait
     for the command to be started." The code selects on `timer` -> `ErrEnqueueTimeout`
     vs `r.applyCh <- logFuture`. `applyCh` is unbuffered by default
     (`make(chan *logFuture)`), or buffered to `MaxAppendEntries` with `BatchApplyCh`.
     The doc says that on `ErrLeadershipLost` "There is no way to guarantee whether the
     write succeeded or failed".
   - Implication: the timeout bounds **admission** (enqueue), not completion. Once
     enqueued, the future/log owns the work until FSM apply. That matches "caller expiry
     is a typed UNKNOWN, raw custody continues to closure", and the unbuffered channel is
     admission-before-acceptance.
   - Where it does not apply: hashicorp has no follower forwarding (Apply "must be run on
     the leader"), so it gives no guidance for the forward raw.
3. **gRPC / HTTP/2**. RFC 9113 https://www.rfc-editor.org/rfc/rfc9113.html §6.5.2
   (`SETTINGS_MAX_CONCURRENT_STREAMS` "the maximum number of concurrent streams that the
   sender will allow"), §5.1.2 (exceeding it "MUST" be treated as `PROTOCOL_ERROR` or
   `REFUSED_STREAM`), §5.2 ("Receivers advertise how many octets they are prepared to
   receive"). grpc-go https://raw.githubusercontent.com/grpc/grpc-go/master/server.go:
   `serveStreams` calls `streamQuota.acquire()` before running the handler, and runs
   `defer streamQuota.release()` *after `handleStream` returns*. The quota is not released
   on client cancellation or deadline, only when the handler actually returns. Guide:
   https://grpc.io/docs/guides/flow-control/
   - Implication: this is the closest analogue to C1. Concurrency admission precedes the
     handler, and the slot is held until real handler closure even when the caller's
     deadline already cancelled the RPC. That is exactly "caller expiry settles finitely
     while the raw forwarding operation retains its slot". REFUSED_STREAM is a retryable
     refusal, like BACKPRESSURE.
   - Where it does not apply: HTTP/2 window credit bounds bytes *before* they are read.
     Lagrange's WebSocket path has already `JSON.parse`d the whole message (S8), so
     window-style before-read bounding belongs to the transport owner, not C1.
     grpc-go blocks the reader when quota is exhausted; Lagrange must *refuse*
     (BACKPRESSURE), because blocking an async handler would retain the captured payload,
     which is the very thing the contract forbids.
4. **Kafka broker**. RequestChannel:
   https://raw.githubusercontent.com/apache/kafka/trunk/core/src/main/scala/kafka/network/RequestChannel.scala
   (`new ArrayBlockingQueue[BaseRequest] (queueSize)`; `sendRequest` "potentially blocking
   until there is room in the queue"). `queued.max.requests` (default 500) blocks network
   threads, which then stop reading sockets: https://www.netdata.cloud/guides/kafka/kafka-request-queue-full/
   (third party, needs confirmation against Apache docs; the official config page did not
   render through the fetcher). Purgatory:
   https://raw.githubusercontent.com/apache/kafka/3.7/core/src/main/scala/kafka/server/DelayedProduce.scala
   pre-sets `REQUEST_TIMED_OUT`; `onExpiration` only logs and records metrics, and nothing
   there truncates the already-appended log.
   - Implication: a request-count bound sits between decode and processing. Expiry
     returns a timed-out response, but the appended records (native history) are not
     undone, which matches "removing a waiter releases only transient response custody,
     never native history".
   - Where it does not apply: Kafka bounds *after* full decode (`socket.request.max.bytes`
     separately caps size), so like S8 it does not support moving the queue in front of
     JSON decode. Kafka's purgatory does release the *response* slot at timeout. It counts
     queued requests, not in-flight appends, so it is not a model for retaining forward
     custody.
5. **Netty / Reactive Streams**. Netty `ChannelConfig.setAutoRead`
   https://netty.io/4.1/api/io/netty/channel/ChannelConfig.html (read only when demand is
   signalled; write-buffer high/low water marks). Reactive Streams
   https://github.com/reactive-streams/reactive-streams-jvm/blob/master/README.md: rule 1.1
   (onNext count "MUST be less than or equal to the total number of elements requested"),
   rule 2.1 (demand via `request(n)`), and the goal "backpressure is an integral part of
   this model in order to allow the queues which mediate between threads to be bounded".
   - Implication: demand (a reserved slot) must exist before an element is taken in. That
     supports reserving the ProposalQueue slot before capture and building the encoded
     forward only when the slot is held.
   - Where it does not apply: credit-based pull would need the transport to stop reading
     (the transport owner). C1 is push with refusal at the application boundary.

Net design rule from all five: **reserve (count) before materialising the
application-owned copy; refuse with a typed retryable outcome when full; hold the slot
until the actual work closes, not until the caller stops waiting; the caller gets a
finite typed answer at its deadline.** All five systems do this, and none of them nest a
second outer slot around work that already holds one.

---

## 5. Design recommendation (for the implementer)

### 5.1 Owner edits

**E-1 Receiver: RCV `handleDurableLatencyCdcMessage` (RCV:11-34); delete `applyDurableLatencyCdcDecision` (RCV:36-46).**
- Keep E5 `startedAtMs` and `captureCdcForwardRequest` (shallow) at RCV:55-61 / RCV:199-205.
- Keep the receiver grant `createCdcDeliveryBudget(...)` (RCV:16-17). The R2 review says
  "Keep public response decoration and the existing received-duration grant at the
  receiver boundary" (`REVIEW-...-r2-2026-10-23.md:88-89`).
- **Remove** `captureCdcEvents(incoming)` (RCV:18), the `assertCdcTerminalEvents` duplicate
  (RCV:19; `applyCDCBatch` repeats it at REP:159), the strict-event selection and
  `resolveCdcIngressDecision` (RCV:22-23), and the whole DEFER/APPLY_LOCAL/FORWARD switch
  (RCV:36-46).
- Call `service.applyCDCBatch(request.incoming, {...request.context, ...budget,
  skipSubscriptionCheck: true, replayOnly: request.payload.replayOnly === true})`. These
  are the same option fields as today's RCV:20-21, with raw (uncaptured) `incoming`. Deep
  capture then happens only at ACC:118, after ACC:113.
- Reply decoration must not deep-read input. Take `tableName`/`operation` (single) from
  the shallow wrapper `request.payload`, which `copyStrictOwnDataRecord` has already
  captured. Take `eventCount` (batch) from the dense length already validated by
  `hasDurableCdcEvents`/`isDenseDataArray`. This needs a reviewer decision; see O4.
- Typed expiry at the receiver: put `budget.assertCurrent()` on both the fulfilled and the
  rejected settlement of the `applyCDCBatch` await, so receiver-grant expiry always
  surfaces as `cdcDeliveryBudgetError()` (`code: CDC_COMPLETION.UNKNOWN`,
  `src/cdc/cdc-delivery-budget.js:14-16`). This is not a new grant; it is the existing one.
  It is needed by cut 4 (see 5.4) unless E-3 alone produces a typed answer.

**E-2 Owner forward charging: ACC `deliverCapturedCdc` (ACC:202-229) plus REP `proposeCDCCommand` (REP:320-339).**
- Add to ACC one function next to `proposeCdcAndAwaitCommitted` (ACC:142-153), sketched:
  ```
  function forwardCdcWithinWait(service, wait, forward) {
    if (!currentWait(service, wait.key, wait.entry)) return wait.completion;
    const raw = service.cdcCommitWaiters.ownOperation(wait.key, forward);
    wait.entry.parent.context?.ownChild(raw);
    // The response may retire first; raw keeps key/capacity until its closure.
    const answered = raw.then(undefined, (error) =>
      currentWait(service, wait.key, wait.entry) ? Promise.reject(error) : wait.completion);
    return Promise.race([answered, wait.completion]);
  }
  ```
  This is the sketch behind the "existing forward callback is the narrow place" in
  `REVIEW-...-r2-2026-10-23.md:100-106`. The `raw.then(..., error => ...)` arm stops a
  post-retirement `PROPOSAL_QUEUE_RELEASED_CODE` rejection (PQ:21-24, PQ:138-141) from
  winning the race when ownOperation's microtask body runs after the timer retired the
  response.
- In `deliverCapturedCdc`'s options to `proposeCDCCommand` (ACC:213-224), add
  `forwardCommand: (forward) => forwardCdcWithinWait(service, wait, forward)`.
- In REP:337-338, change `forwardToLeader` to
  `options.forwardCommand ? options.forwardCommand(() =>
  this.forwardCDCCommandToLeader(command, routeContext.attempt, options)) :
  this.forwardCDCCommandToLeader(...)`. This mirrors how `proposeCommand` reaches
  RTG:183-184. RTG itself needs no change. Do not put CDC policy into RTG.
- Do **not** re-arm the waiter budget for forward. The original-budget timer (ACC:134)
  is the caller deadline, per contract item 3: "The encompassing original delivery
  deadline does not restart at forwarding" (CONTRACT:116-118).

**E-3 Owner canonical DEFER and typed expiry: ACC `deliverCapturedCdc` / `applyDurableCdcBatch`.**
- After the terminal guard (ACC:207-208), add
  `if (ingress.action === MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER) return unknownCdcAcceptance();`.
  Import the action constant from `message-group-forwarding-owner-constants.js`; do not
  inline it (R06). Order matters: the terminal guard first, so NATIVE_COMMIT keeps its
  existing UNKNOWN. This must follow the owner decision in O1, because it changes the
  direct-caller DEFER semantics described in 1.5.
- Expiry: when the response was retired by its own deadline, `deliverCapturedCdc`'s
  `assertCurrent` (ACC:203, ACC:225, and RTG:221 through `options.assertCurrent`) throws
  `new Error(CDC_COMPLETION.UNKNOWN)` with `retryable:false` and **no `code`** (ACC:175-176).
  `proposeCDCCommand` then wraps it as `RAFT_PROPOSE_FAILED` (REP:384-389;
  `wrapCdcProposeError` copies `code` only if present,
  `message-group-service-runtime-support.js:252-274`). Recommended: in
  `applyDurableCdcBatch` (ACC:264-271), when the delivery rejects and
  `!currentWait(service, wait.key, wait.entry)`, return `await wait.completion` (the
  already-settled typed UNKNOWN, or the committed afterCommit receipt) instead of
  rethrowing. Alternatively add `code: CDC_COMPLETION.UNKNOWN` at ACC:176. Either is a
  named state (R07). Pick one owner; do not do both.

**E-4 Dead arm: NDM `tryAddressedDurableCdcIngress` (NDM:153-155).**
After E-1, every durable `forwardDurableCdcPayload` invocation comes from ACC with
`applyProvisionalIngress` (ACC:215-218). The bare `applyCDCBatch` arm then only produces
a nested same-vector reservation. Delete it, making `applyProvisionalIngress` required
for durable (R11), or record it as a finding if it is outside the reviewed scope. Verify
first with `git grep "forwardCDCBatchToLeader\|forwardCDCEventToLeader\|forwardCDCPayloadToLeader"`
on src. At this HEAD the callers are RCV:45 / RCV:158 / RCV:286 (receiver), REP:399-415
(owner), and FDM:398 / FDM:455 / FDM:533 (internal).

**Not changed:** PQ (no new method, cap or queue). RTG (no custody there). The
non-durable receiver branches (S7). The transport. Topology.

### 5.2 Invariants to keep

1. Reservation (`queue.enqueue(reservation)`, ACC:113) is the first state change for
   every durable input, public or direct. Nothing before it allocates a deep copy (only
   E6 shallow reads and E8 are allowed; see O3).
2. A refused input (BACKPRESSURE, INVALID capture, liveWait false) leaves
   `cdcCommitWaiters.size` unchanged (ACC:137-139 finally) and causes zero proposals,
   applications or forwards. `test/message-group/message-group-cdc-input-guard.test.js:116-134`
   witnesses this.
3. Canonical DEFER becomes one decision, in the owner (E-3; O1).
4. Terminal NATIVE_COMMIT guard (ACC:205-208, ACC:217) is unchanged: terminal input never
   gets provisional, never forwards (NDM:258-259), and only gets a receipt from a current
   leader whose group matches.
5. **No nested `ownOperation`.** `ownOperation` is called exactly once per raw route
   attempt (PROPOSE at ACC:146, FORWARD in E-2), never around `deliverCapturedCdc` or
   `applyDurableCdcBatch`. Reason: PQ:137 returns the open `custody.rawOperation` for the
   same key. An outer wrapper whose body reaches the inner call gets back its own pending
   promise and awaits it, so the cycle never settles, the entry is never removed, and
   capacity leaks permanently (R13). It would also make the PROPOSE raw (`runCdcProposal`,
   which awaits `wait.completion`) the outer's child, which is the "incorrect late
   custody" in the handover.
6. One raw per entry at a time. A retry while a raw is open joins it (PQ:137). This is
   intended (`REVIEW-...native-custody-r1-r6:72-75`). Note the cross-mode consequence: a
   FORWARD attempt after a PROPOSE deadline rejection (RTG:143-149) while the PROPOSE raw
   is open will join the PROPOSE raw and not forward. That is acceptable (no overlapping
   second effect), but the reviewer should be told it is deliberate.
7. Response retirement never removes an entry with an open raw (PQ:154-161). Raw closure
   never removes an entry whose response is pending. Both are identity-fenced.
8. Parent invocation custody: the forward raw is `ownChild`-charged
   (`src/cdc/cdc-delivery-invocation.js:212-223`), so the source invocation slot also
   stays occupied until real closure (CONTRACT:797-801).
9. Late raw closure cannot change the settled caller answer (promise single settlement),
   and late afterCommit cannot resurrect a retired response (ACC:285 `currentWait`).

### 5.3 The race to prove absent

On the **same** entry key K, the follower's waiter deadline timer (ACC:72-75 ->
PQ:200-209 -> PQ:164-174, on `queue.timeSource`, which is the service clock) runs against
the forward raw's closure (PQ:144-149, triggered by `transport.deliver` settlement at
NDM:187, on the router's clock). Required outcomes:
- **Timer first:** `responsePending=false`; the entry stays (`rawOperation !== null`); size
  is unchanged; the caller gets typed UNKNOWN finitely; a new admission is BACKPRESSURE
  (full queue) or duplicate-key BACKPRESSURE (ACC:121); `ownOperation` for K now throws
  RELEASED (PQ:134-136), so no second forward. When raw closes, `closed()` removes K
  exactly once.
- **Raw first:** `closed()` leaves K (response pending); the race resolves with the remote
  answer; the owner validates it (ACC:226-228); the finally clause (ACC:268-270) retires
  the response, and since raw is null, K is removed.
- **Microtask interleave:** `ownOperation`'s body (PQ:138-141) runs after the timer
  retired K. Raw rejects RELEASED, and E-2's rejection arm returns `wait.completion`
  (UNKNOWN), not the RELEASED error. No transport call happened, so raw closes and K is
  removed.
- **Local afterCommit first** (follower applied the occurrence before the forward reply):
  the waiter settles committed via ACC:284-289; the race returns it; the forward raw
  still holds K until it closes. The R2b test deliberately excludes this schedule by
  holding follower replication (`REVIEW-...-r2b-2026-10-23.md:22-36`). A separate witness
  for it is recommended (O5).
- **Shutdown during open raw:** `retireCdcCommitWaiters` (ACC:292-294) rejects responses.
  Raw stays until `forwardDurableCdcPayload`'s `assertCurrent` fails or the transport
  settles. Unknown: whether service shutdown awaits these raws or only tracks them
  through the parent invocation (O6).

### 5.4 Mapping the four named cuts

| Cut | Test location | Predecessor failure mechanism (predicted from source, not measured) | Change that makes it pass |
|---|---|---|---|
| `C1_PUBLIC_SINGLE_CAPACITY_PRECEDES_DEEP_CAPTURE` | test L141-183 (marker L176-177) | The leader queue is full (capacity 1, real native slot). The receiver deep-captures at RCV:18, the nested `Symbol` throws INVALID (`src/cdc/cdc-event-envelope.js:104-111`) before ACC:113, so `pressured.error` is set and `assertBackpressure` fails | E-1: no capture before `applyCDCBatch`; ACC:113 throws BACKPRESSURE first, giving `backpressuredCdcAcceptance` (ACC:40-43). The free-capacity control then reaches capture at ACC:118 and gets INVALID with size 0 (ACC:137-139) |
| `C1_PUBLIC_BATCH_CAPACITY_PRECEDES_DEEP_CAPTURE` | same loop, batch=true | same (RCV:18 via batch `incoming = payload.events`) | E-1 |
| `C1_PUBLIC_FOLLOWER_CAPACITY_PREVENTS_SECOND_FORWARD` | test L245-290 (L281) | The follower queue is full from the occupied direct `applyCDCBatch` (its response entry is pending). The public input takes RCV:45, so `forwardDurableCdcPayload` makes a second transport call (`hold.calls.length` 2) and possibly a second native write | E-1 (reservation at ACC:113 refuses before any forward). E-2 is not strictly needed for this cut, because the occupying entry has `responsePending=true` |
| `C1_PUBLIC_FORWARD_DEADLINE_SETTLES_BEFORE_RAW_CLOSE` | test L292-343 (L326-336) | Today: no follower reservation (`admittedEntry` undefined), and the caller awaits the held transport, so `expired.settled=false`. With E-1 only: the reservation exists, but the forward is uncharged, so the deadline timer frees K (`custody.size` 0, `retry` admitted, a second forward follows) and the caller still awaits the forward (ACC:213) | E-1 + **E-2** (raw charged and raced, so the response settles at 100 ms while K stays) + **E-3 typed expiry / E-1 receiver assert** so that `expired.answer.error === UNKNOWN` or `expired.error.code === UNKNOWN`. Without that, the wrapped error from REP:384-389 has no `code` (predicted; must be measured) |

Also asserted in case 4 and satisfied by the same change: `custody.responsePending === false`
(PQ:168); `retry` is BACKPRESSURE (the queue still holds K); `forwardsWhileHeld === 1`;
size 0 after `hold.release()` and before the native replay (raw closure, PQ:144-148).

### 5.5 Affected existing tests (must stay green; their expectations touch the changed behaviour)

- `test/message-group/message-group-cdc-input-guard.test.js`: the `forward-handler` entry
  calls `handleLatencyCdcPropagationBatchMessage` (L90, L101). Its typed refusals must
  still leave `cdcCommitWaiters.size` unchanged and cause no proposal (L116-134). After
  E-1, refusals for `data`/`array` proxies and identity errors move from RCV:18 to ACC:118
  (still released in the finally at ACC:137-139). `vector`/`member` proxies are still
  refused shallowly by `hasDurableCdcEvents`. Note that `calls.direct` will now also
  increment for the `forward-handler` entry; the test only checks `calls[entry]`
  (L127-128).
- `test/message-group/message-group-native-mixed-vector.test.js` (RF3 follower forward,
  L131-157): the follower's owner path now goes through E-2. The leader-side public
  receiver now goes straight to `applyCDCBatch`. The `cdcVectorDigest` inequality (L155-156)
  relies on per-hop `inputCdcOutcome` (unchanged).
- `test/message-group/message-group-native-provisional-route.test.js` (relayDepth 0 -> 1 ->
  2, provisional at FOLLOWER, L296-410): the first-hop public FORWARD now becomes owner
  FORWARD via `routeMessageGroupCommand`. That adds `commandRetryHandler` attempts and
  backoff (REP:332-361) which the receiver's direct `forwardCDCBatchToLeader` never had.
  Exact event ordinals (`requireReturn`, L242-259) and relay depths (L311, L344, L376)
  must be re-measured. This is the highest-risk existing witness.
- `test/message-group/message-group-native-custody-handoff.test.js` (L227-260, recipient
  queue entry retained across source expiry).
- `test/message-group/message-group-native-application-membership.test.js` (L96
  `applyCDCBatch`).
- `test/cdc/cdc-delivery-outcome.test.js` and `test/cdc/cdc-delivery-complete-vector.test.js`
  (canonical predicates and UNKNOWN shape).
- `test/topology/cdc-group-propagation-foreground-boundary.test.js` and
  `test/test-helpers/cdc-topology-progress-fixture.js` (topology targets deliver to the MG
  receiver message type, `src/topology/cdc-group-propagation-durable-delivery.js:55-63`,
  equal to `MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION*`,
  `src/message-group/constants.js:32-34`).
- `test/transport/message-router-cdc-custody.test.js`, `-cdc-response-boundary.test.js`
  (S10).
- ProposalQueue regressions (not edited, but now a second `ownOperation` caller):
  `test/partition/proposal-queue.test.js`, `proposal-queue-capacity.property.test.js`,
  `proposal-queue-size-invariant.property.test.js`.
- Non-durable receiver tests are unaffected if S7 is left alone:
  `message-group-service-strict-cdc-forward-routing.test.js`,
  `message-group-service-strict-cdc-join-convergence.test.js`, `cdc-non-leader-propagation*`,
  `message-group-service-raft-replication-and-cdc.test.js`. They are already in the
  contract test list, so they run anyway.

### 5.6 Impact-contract registration (`test/shards/impact-contracts.json`)

`cdc-source-native-delivery` exists twice. One is `contracts` (L1344, key `tests`), whose
`owners` already include RCV, ACC, REP, NDM, FDM, RTG and PQ. The other is `coupledPairs`
(L2886, key `witnessTests`, endpoints `source-and-propagation` / `recipient-and-response`).
Neither lists `test/message-group/message-group-cdc-receiver-admission.test.js` (verified
by grep). Required:
- Add `test/message-group/message-group-cdc-receiver-admission.test.js` to **both**
  `contracts["cdc-source-native-delivery"].tests` and
  `coupledPairs["cdc-source-native-delivery"].witnessTests`.
- Recommended, because PQ is an owner in `recipient-and-response` and E-2 makes it a
  second custody consumer: add `test/partition/proposal-queue.test.js` and the two
  proposal-queue property tests to the coupledPair witnesses. They are currently absent.
- If E-4 deletes the NDM arm, no owner list changes (NDM is already listed). The new
  foreground helper `src/topology/cdc-group-propagation-foreground-retry.js` is still
  missing from `source-and-propagation` owners (handover `:342-343`). That is outside C1.
- Then regenerate canonical test metadata (per the handover order, step 5).

---

## 6. Open questions for an owner decision

- **O1 (canonical DEFER semantics).** Public receiver DEFER returns immediate UNKNOWN with
  no topology repair (RCV:39). A direct `applyCDCBatch` with the same decision goes FORWARD
  -> `forwardDurableCdcPayload`, which repairs topology on `DEFER_STRICT_TARGET_UNKNOWN` and
  re-decides, possibly reaching addressed provisional ingress (NDM:261-265, NDM:272,
  NDM:277-280). Which one is canonical inside the owner for *all* durable callers? Choosing
  the receiver's version changes direct-caller behaviour (topology source leaf,
  `cdc-group-propagation-durable-delivery.js:101`). Choosing the forward owner's version
  changes public-input behaviour, and the reviewed handover text says "preserve canonical
  DEFER". Unknown which one the R2b reviewer meant.
- **O2 (expiry typing owner).** Which owner names caller expiry as typed UNKNOWN: ACC
  (return the settled completion when the response was retired; or add `code` at ACC:176)
  or the receiver (`budget.assertCurrent()` on rejection)? Today local-native expiry has
  the same untyped-wrap behaviour (REP:384-389), and no existing test pins it (`grep
  CDC_COMPLETION.UNKNOWN test/` shows only the C1 test for MG).
- **O3 (pre-admission reads allowed).** Is the shallow pre-reservation work acceptable
  under "queue reservation precedes immutable capture" (CONTRACT:781)? That work is the
  wrapper copy `copyStrictOwnDataRecord`, the O(n) shallow `hasDurableCdcEvents` scan
  (needed to choose the durable owner at all), `readCdcForwardContext`, and the receiver
  budget. The alternative would push durable classification into ACC, which changes REP:157-160.
- **O4 (reply decoration source).** May `eventCount`, `tableName` and `operation` in the
  public reply come from the shallow wrapper and the validated dense length, or must they
  come from the owner's captured vector? That would require ACC to return them, which is a
  contract-shape change (R08).
- **O5 (local-afterCommit-wins schedule).** Should a fifth witness cover "follower locally
  applies and settles committed before the forward reply, raw still holds K"? The R2b
  schedule excludes it by design.
- **O6 (shutdown vs open forward raw).** Does service shutdown need to await or bound open
  forward raws held in `cdcCommitWaiters`, beyond the parent invocation's `ownChild`?
  Unknown from source. `retireCdcCommitWaiters` only retires responses.
- **O7 (S10 transport closure).** Is `transport.deliver` with `timeoutMs` guaranteed to
  settle (giving actual raw closure) when the remote never answers? If not, a follower
  slot could be held past every deadline. That would be bounded only by transport
  lifetime ownership (`message-router-delivery-lifetime.js`), which is outside this
  investigation.
- **O8 (siblings S5-S8).** Record each as a finding for its owner (partition write
  kernel, MG generic proposal routing, non-durable CDC, transport ingress), or widen this
  Quest explicitly (R16)? This dossier recommends recording, not absorbing.
- **O9 (S4 deletion).** Is deleting the bare `applyCDCBatch` arm in
  `tryAddressedDurableCdcIngress` (NDM:153-155) within the reviewed C1 scope, or a
  separate recorded finding?
