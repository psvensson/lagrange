---
audience: evidence
recorded: 2026-11-14
quest: cdc-propagation-node-slot-removal
---

# Challenge: hidden reliance on the node-wide CDC slot

Read-only challenge of `slot-removal-model-draft.md`, written before any evidence. Code is the worktree
`lagrange-cdc-slot-removal-20261114` at `7d6cdbfaa`. File:line references are to that commit unless a
commit is named. **[V]** means verified by reading the code. **[I]** means inferred and not run. Nothing
was executed.

Abbreviations:
- `DD` = `src/topology/cdc-group-propagation-durable-delivery.js`
- `SVC` = `src/topology/cdc-group-propagation-service.js`
- `PP` = `src/cdc/cdc-propagation-progress.js`
- `INV` = `src/cdc/cdc-delivery-invocation.js`
- `LANE` = `src/partition/partition-cdc-obligation-lane.js`
- `DEL` = `src/partition/partition-cdc-obligation-delivery.js`
- `LPROG` = `src/partition/partition-cdc-obligation-progress.js`
- `ACC` = `src/message-group/message-group-cdc-committed-acceptance.js`
- `REG` = `src/transport/message-router-outbound-delivery-registry.js`
- `QADM` = `src/transport/message-router-outbound-queue-admission.js`
- `GOV` = `src/control-plane/pressure-governor.js`
- `L` = lanes with owed work whose partitions this node leads (up to ~140 on a seed).

The slot did more than bound memory. It was also the only thing that held these to one at a time on a node:
- the router's CDC traffic per destination;
- the wave rate, and with it every per-wave CPU cost;
- writes to publication-mode diagnostics;
- the error-log volume of exhausted waves;
- the one non-"transient" answer a lane got from this subscriber.

Each of these changes meaning when waves overlap.

---

## Part A - Must add / must handle

### A1. A lane no longer receives "backpressure" from this subscriber. Every leaf refusal reaches it as UNKNOWN (transient): its window halves and its backoff climbs to 10 s

**Code [V]:**
- Slot BUSY was the only outcome in the wave that carried `error: BACKPRESSURE` and a hint (`DD:259-269`).
- A wave that ends with any leaf uncovered answers `unknownCdcAcceptance()`, with `error: UNKNOWN`, no `retryAfterMs` and no `reason` (`DD:422-425`, `cdc-delivery-outcome.js:321-323, 389`). This applies whether the leaf was refused by the pressure governor (`DD:357-358`), was refused by the recipient's commit queue (`ACC:41-44,126,295`), or failed with an outbound-queue rejection.
- The subscriber copies only `answer.reason` and `answer.error === BACKPRESSURE` (`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:188-208`). `isBackpressureError` therefore returns false (`LANE:146-151`).
- The disposition becomes `TRANSIENT_FAILURE` (`LANE:153-160`). `handleDeliveryFailure` then halves the window (`DEL:407-409`), doubles `retryDelayMs` up to `CDC_BUFFER_REPLAY_MAX_DELAY_MS` = 10 s (`DEL:327-330`, `LANE:215-218`), and logs at **warn**, not debug (`DEL:419-423`).

**Two-wave scenario:**
1. Lanes A (`services`) and B (`replica_operations`) both have waves in flight to recipient R.
2. R's commit-wait queue or the seed→R outbound queue refuses B's target leaf. B's three foreground attempts (50 / 100 ms, `cdc-group-propagation-constants.js:59-64`) all hit the same refusal.
3. B's lane receives UNKNOWN. Its window goes 8→4, its retry 50→100→…→10 000 ms.
4. Today, the same congestion would have reached B mostly as slot BUSY: no halving and at most 250 ms.

**Why it matters:**
- The draft's line 5 says governor defer and a full recipient queue arrive as "typed backpressure". That is false end to end.
- Under the overlap the repair creates, lanes will shrink their vectors and back off exponentially. That is anti-batching exactly when batching is needed. It is also the opposite of the measured run, where 1 186 of 1 186 holds were backpressure and caused 0 halvings.
- warn-level holds may be persisted to the logs table (see A6).

**Add to the model:**
- Decision "classify wave failure for the lane". It needs explicit rows: leaf refused by the governor, by the recipient queue, by an outbound-queue rejection or preemption, by never settling, or by a throw. For each row, give the expected lane disposition, the window change and the retry delay.
- Then either carry the strongest typed refusal and its hint through `prepareDurableForegroundWave.result` (one owner, no new outcome), or state that halving under recipient congestion is intended.
- Witness: two waves, recipient refuses one, assert the lane's disposition and window.

### A2. The router's per-destination window, not "the recipient", is now the shared resource. One lane's stuck leaves can delay or evict another lane's leaves

**Code [V]:**
- Every target leaf is a `messageRouter.deliver` call into the per-destination-node outbound queue (`DD:370-381`, `REG:361-560`). That queue is shared with all other router traffic to that node.
- Defaults (`src/constants/transport.js:86-88`, production readiness reserve 8 at `:106`):
  - `maxConcurrent` 32
  - `maxPending` 64
  - critical reserve 16
  - critical pending ceiling 64−8 = 56 (`QADM:537-544`)
  - background pending limit 64−16 = 48 (`QADM:526-535`)
  - critical in-flight per source key 32−16 = 16 (`QADM:431-458`)
  - pending per source key max(4, 64/4) = 16 (`message-router-delivery-source-admission.js:204-212`, `message-router-shared-vocabulary.js:148,156`)
- A multi-event vector's `deliverySource` is per table: `latency.cdc.propagation.visibility.table:<table>` (`src/cache/cdc-propagation-delivery-profile.js:107-138`). All lanes of one table therefore share one source key per destination.
- A CRITICAL delivery that finds the queue at its ceiling **preempts** a pending critical item of the most-represented other source key and rejects it with an outbound backpressure error (`REG:441-509`, `QADM:220-298`).
- A leaf's timeout is the lane invocation's remaining budget, at most min(MG delivery timeout, transport message timeout) = 5 s (`DD:375`, `INV:60-67`). A never-answering destination therefore holds an in-flight slot for up to 5 s.

**Two-wave scenario:**
- (a) Lane A (`nodes`) has a pending leaf to node X. Lane B (`partitions`), whose source key has nothing pending at X, arrives when X's queue is at 56. B preempts A's pending item. A's leaf fails, A's wave foreground-retries, and A's retry can in turn preempt B or some third subsystem's critical write.
- (b) 17 lanes of user table T each have a leaf in flight to X. The 17th exceeds the 16 per-source in-flight limit and waits in pending. Once 16 are pending, the next lane of T is rejected at once, while other tables' lanes still pass.
- (c) X stalls. 32 overlapping waves each occupy one in-flight slot at X for up to 5 s. Every other lane's leaf to X waits behind them.

  This also covers non-CDC traffic to X: replica operations, readiness reads and query RPCs. The measured run already shows 4 "Message not acknowledged" REMOVE failures that target the seed.

**Why it matters:**
- Claim (ii) ("A's time does not depend on whether B's wave settles, up to a shared recipient's own typed backpressure") is false as stated. The coupling is on the sender side, through the router.
- The reproducer "a never-settling wave of one lane does not hold another lane's vector" passes for 2 lanes and fails for ≥33 lanes to one destination.
- The slot kept CDC's share of every destination queue at ≤1. The comment at `DD:389-390` states this reliance: "A serial dispatch window is bounded by every positive router concurrency." That holds per wave, and after removal no longer holds per node.

**Add to the model:**
- State: "number of in-flight CDC leaves per destination node versus 32 / 56 / 48 / 16, and non-CDC traffic to the same node".
- Events:
  - "leaf preempted by another wave's critical source" (an uncovered leaf after an effect-free refusal, typed by `backpressureScope` and `preemptedByCriticalSource`);
  - "per-source pending limit reached";
  - "N ≥ 33 never-settling leaves to one destination".
- Output: per-destination queue depth, rejections and preemptions, split into CDC and non-CDC.
- Qualify claim (ii) explicitly.

### A3. Stop and initialize retire only `active/DurablePropagation`. With N waves, the others keep sending until their next leaf boundary

**Code [V]:**
- `SVC:178` (stop) and `SVC:118` (initialize) call `this.active/DurablePropagation?.context.retire()` on one wave.
- The child scope spreads the parent, so `retire` is the **lane invocation's** retire (`INV:159-160`, `INV:217-223`). It aborts the controller's signal, which reaches the router as `signal` (`DD:378`).
- A wave that is not retired notices stop only at the next `progress.next()` / `observe()` / `result()`. There it checks `durablePropagationLifetime` and `isPropagationStopped` (`PP:143-145`).
- An in-flight `messageRouter.deliver` or source `applyCDCBatch` (a Raft proposal through `ACC:147-158`) is **not** aborted. It completes its effect after stop.
- Retry sleeps are fine for N: `retrySleepReleases` is a Set (`cdc-group-propagation-lifecycle-methods.js:36-50`, `SVC:188-190`).

**Two-wave scenario:** waves A and B are in flight; A is the "active" one. `stop()` retires A's lane invocation. B's target leaf is mid-delivery to X: its envelope is sent, X proposes it to its group, and it commits after stop. B then throws at `observe` (lifetime check). The effect landed after stop, which violates (v).

**Second scenario, restart:**
1. `stop(); start()` runs synchronously while B sleeps in a foreground retry. stop releases B's sleep.
2. B resumes, finds `isPropagationStopped()` false, and returns ADVANCE (`cdc-group-propagation-foreground-retry.js:25-26`).
3. B's next `progress.next()` fails the lifetime check (`PP:144`). The repair must keep that check: the lifetime check is what saves this case, not the state check.

**Must handle:**
- Stop *and initialize* iterate the in-flight set and retire every member.
- Set membership ends on `context.cleanup` (`INV:133-137,181-184`), not on response, and not on stop.
- After restart the set may still hold old-lifetime waves until their children settle. No diagnostic or bound may count them as live.
- Each retired lane invocation runs `resumeAfterCdcCleanup` (`DEL:602-608`) and arms its **own** lane timer (partition `timeSource`). "Stop arms nothing" is a statement about the service. Stop with N waves arms up to N lane retries, each answered `propagation_stopped`.
- No lane wakes on `start()`. After a restart, lanes wait out a backoff of up to 10 s.

**Add to the model:**
- Temporal: "initialize while running", "between stop and start", "after cleanup of an old-lifetime wave".
- Output: "effects completed after stop" (count of router deliveries and source proposals settled after stop), which must equal those dispatched before stop.

### A4. Publication-mode diagnostics are node-wide, last-writer-wins, and a readiness decision guard

**Code [V]:**
- Every admitted wave calls `owner.setPublicationMode(publicationModeOf(plan), plan.fallbackReason)` (`DD:510`), and may promote again on completion (`DD:514-518`).
- `setPublicationMode` appends to a 10-entry transition history and stamps `enteredAt` (`SVC:330-367`).
- `captureMetadataPublicationState` puts `currentMode` and `reasonCode` into the positive-decision publication guard (`src/control-plane/readiness-planning-publication-contract.js:83-96,151-159`). Readiness planning vetoes a positive decision when that guard changes (`readiness-planning-completion-admission-methods.js:184-202,582`).
- The same file explains why heartbeat mode fields were removed from that guard: "made this signature change on EVERY … attempt … the cluster could never form" (`:105-120`).
- The plan is per source group (`cdc-group-propagation-durable-plan.js:14-31`, `cdc-group-propagation-routing.js:715-775`):
  - `SOURCE_GROUP_MISMATCH` is per source;
  - target fallback codes are per target set;
  - the subscriber selects the source group per table (`partition-cdc-propagation-subscriber.js:257-260`).

**Two-wave scenario:**
1. Lane A's source plan falls back (CONSERVATIVE_FANOUT, `MISSING_COORDINATOR_ADDRESS`). Lane B's source is grouped. Both waves overlap.
2. The mode goes conservative (A), then grouped (B), then conservative (A's next wave), and so on.
3. Each change flips the readiness guard and vetoes a planning snapshot. The rate grows with concurrent admissions rather than ≤ ~3/s.
4. The history fills with flaps, and `currentMode` describes neither wave.

**Must handle:** decide what the publication mode *means* when waves overlap. Options:
- the most recent capture;
- per source group;
- derived from the plan, not from waves.

Then show it does not change more often than the plan does. **Add:**
- State "mixed publication modes in flight".
- Output "publication-mode transitions per second and readiness vetoes attributable to them".
- `stats.last*` and the `PROPAGATED` event (`DD:457-464`) are also last-writer-wins. They have no `src` consumer [V: no reader found], so they need only a doc note.

### A5. Per-wave CPU is unchanged, but the wave rate is no longer capped, and a wave captures the plan several dozen times

**Code [V]:** `cdcPropagationProgressCurrent` (`PP:142-155`) calls `captureDurablePropagationPlan`. That runs `refreshConfig()` plus `buildGroupedContext` or `buildSafeTargets`, which scan the cache (`collectKnownMessageGroupDomain`, `cdc-group-propagation-routing.js:242,715-775`). It runs on:
- every bound `next` / `observe` / `result` (`PP:179-219`);
- **every** `assertCurrent` of the wave's context. The child scope's parent is the lane's scoped invocation, whose `isCurrent` is `cdcProgressCurrent` → `topologyBindingCurrent` → `cdcPropagationProgressCurrent` (`LPROG:32-50,136-153`, `INV:81-126`).
- every `context.remainingMs()` the router calls (`DD:375-376`).

By reading, that is about 12+k captures per leaf and about 40-50 per three-leaf wave [I: count it]. Each target leaf also calls `PressureGovernor.evaluate`, which walks `messageRouter.getStats()` across all outbound queues (`GOV:597-624,638-658,329-380`).

**Scenario:** with the slot, the node ran at most one wave at a time, measured at about 292 waves in 141 s. Without it, L = 40 lanes each finishing a wave in about 350 ms is about 115 waves/s. That is roughly 5 000 plan captures/s on the event loop, plus vector JSON stringify per leaf and parse at the lane.

**Why it matters:**
- This is the event-loop starvation route.
- The trace already shows a 1 381 ms seed loop gap inside a slot wait, and Run A had the seed at 92-100 % CPU.
- No code bounds wave rate except the lane's own single flight.

**Must measure before claiming "no limiter":**
- synchronous CPU per wave;
- plan captures per wave;
- event-loop lag p99 and max gap at peak overlap.

**Add:** output "event-loop lag and CPU per wave" and state "L lanes all owing at once (formation burst)".

### A6. Unthrottled per-wave error report and warn-level holds can feed the logs table and its own CDC lane

**Code [V]:**
- Every wave that exhausts its foreground retries calls `reportCdcPropagationForegroundRetrySpent` (`cdc-group-propagation-delivery-methods.js:37-41`). That goes to `reportWaitBoundSpent` with scope `{nodeId}` only (`cdc-group-propagation-retry-wait-report.js:49-69`). Because the scope is not a logs-table scope, the sink is a persisted `logger.error` (`src/logging/wait-bound-spent.js:194-219`). It is not throttled.
- Only the *scheduling* notice is throttled and console-only (`cdc-group-propagation-retry-wait-report.js:14-31`). Its comment warns: "Retrying CDC may itself be carrying a logs-table write. Never feed this … back through the CDC pipeline."
- `handleDeliveryFailure` logs warn for every non-backpressure hold (`DEL:419-423`). After A1 that is nearly every hold.
- `proposeCDCCommand` logs error on each failed route (`message-group-service-cdc-replication-runtime-methods.js:381-401`).

**Two-wave scenario:**
1. Lane A ships `logs` rows to a congested recipient. Lane B (any table) does too.
2. Both exhaust their retries, producing 2 persisted ERROR rows and 2 warn holds.
3. Those rows are new owed `logs` obligations on A's lane.

With the slot this loop ran at ≤1 wave at a time. Now it runs at L waves.

**Must handle:**
- Throttle or console-sink the spent report per service. One owner already exists: the `LogThrottle` WeakMap.
- Or route the logs-table lane's own failures console-only.

**Add:** output "persisted log rows per second produced by CDC failure paths".

### A7. Synchronised failure of many waves on one source-group or recipient event, with retries that carry no jitter

**Code [V]:**
- Every lane on the node usually shares one source message group (the subscriber's selection). Its leader change, or a recipient's leader change, fails every in-flight wave together.
- Foreground retry delays are deterministic: 50 · 2^(n−1) ms (`cdc-group-propagation-delivery-methods.js:89-94`).
- Lane delays are deterministic and identical for lanes with the same history (`LANE:187-221`, `DEL:331-339`).
- The proposal path retries inside each wave as well (`message-group-proposal-routing.js:212-243`, per-attempt timeout ≤1 500 ms, `…replication-runtime-methods.js:485-505`).

**Scenario:**
1. The source MG elects a new leader while L = 60 waves are in flight. All 60 source leaves fail within one tick.
2. All 60 waves retry at +50 ms and +100 ms, then return. All 60 lanes re-arm at the same delay, re-read and re-parse their ranges (`partition-cdc-obligation-range.js:249-301`), and arrive together again.
3. With the slot they arrived one at a time.

This is the remaining path to the `97b6c0e30` storm. That storm's guard (the `consecutiveBackpressure` escalation) applies only to the BACKPRESSURE disposition, which A1 shows the lane will rarely see now.

**Must handle:**
- Decide jitter, or prove herd-free by measurement.
- Count materialisations per second during a source leader change with L waves in flight.

**Add:** event "source MG leader change with N waves in flight" and output "range materialisations per second".

### A8. "Pressure-governor defer" is not "attempted nothing", and the governor starves non-critical classes systematically

**Code [V]:**
- The governor is consulted only for **target** leaves (`DD:356-358`), after the source leaf has already proposed and committed (source is leaf 0, `PP:162-175`).
- Its decision is global, not per destination. One saturated destination queue defers background-class CDC to every destination (`GOV:329-380,423-456`).
- CRITICAL work always gets `CRITICAL_BYPASS`: with resource key `cdc:retry` the partition is SHARED and `criticalReserveExhausted` cannot be true (`GOV:191-249,261-270,438-450`).
- Background or standard-visibility tables are BACKGROUND class (`cdc-propagation-delivery-profile.js:34-36,196-223`). That covers `message_groups`, user tables, and non-critical system rows such as `services` rows that are not partitions.
- The governor's `retryAfterMs` pacing hint is dropped (`DD:357-358`).

**Scenario:**
1. 30 critical lanes (`nodes`, `partitions`, `replica_operations` …) fill seed→X past 48 background pending.
2. Every background-class wave to any destination is deferred after its source leaf committed. It retries twice, ends UNKNOWN (A1), halves its window and backs off toward 10 s.
3. Critical lanes are never deferred and keep the queue full.
4. With the slot, the table rotation gave background tables a turn regardless of class.

**Must handle:** after removal, fairness between tables is router FIFO plus class priority. State whether starving background-class lanes under critical load is accepted. If it is not, the repair needs a per-class or per-destination fairness argument. Measure: per-class commit→receipt latency under overlap.

Effect-free refusals that remain:
- `propagation_stopped` (`SVC:206-209`);
- invalid request or invocation (`SVC:232-256`, `DD:481`);
- `SOURCE_GROUP_MISMATCH` (`DD:505-509`, after the child scope opens but before effects);
- subscriber owner-not-ready (`partition-cdc-propagation-subscriber.js:179-186`).

Correct the draft's lines 5 and 10: the "re-capture the owed tail after a refusal that attempted nothing" rule fires only on these. After a governor defer the cell holds source coverage, so the lane re-presents the same range by design (`LPROG:82-89`).

### A9. Memory and custody: per-lane single flight is a structural bound, but not the fixed node bound F2 required

**Code [V]:**
- Per lane: one invocation, which cannot reopen until every child settles (`INV:190-191,206-211`, `DEL:557-580,643-646`). A never-settling child therefore pins its lane and nothing more.
- Per wave the payload is held several times:
  - parsed at the lane (`eventsOfShipRange`);
  - captured again by the wave (`DD:504`);
  - captured, normalised and captured again in the source's commit-wait entry (`ACC:101-108,123-128`), and held there until settlement;
  - serialised for the Raft command (base64 ×4/3 per `partition-cdc-obligation-constants.js:62-73`);
  - for the in-flight target leaf, serialised for the router.
- The recipient holds its own captured copy per wait.
- Vector bytes ≤ `SHIP_MAX_BYTES` 256 KiB, except one entry above it, which ships alone and whole (up to W9's 2 MiB).
- The source group's `cdcCommitWaiters` is one `ProposalQueue` with capacity 1000 (`message-group-service-state.js:223`, `proposal-queue-constants.js:14-20`). It is shared by this node's L waves and by every remote sender's waves to this group.

**Why it matters:**
- History constraint 3 and Amendment D ask for an aggregate bound after removal.
- The draft's (iv) covers waiting lanes, not admitted ones. Memory now scales as L × vector × about 5-8 copies (table below).
- The draft's statement "no new node-wide limiter is needed" is defensible only as "the bound is L × B × k, proportional to partitions led". That is an owner decision (F2, `cdc-owed-work-admission`: "any byte admission policy is a separate explicit owner decision") plus a lab measurement. Reviewer #132 said exactly this: "accepted only with repair (2) and a lab load measurement".

**Add:**
- Output "peak heap / RSS and concurrent waves".
- Constraint: the repair writes down the bound formula and the owner accepts or rejects it.

### A10. Model rows missing (summary of A1-A9 plus these)

- **Decision** "classify the wave's answer for the lane" (A1). **Decision** "what bounds aggregate custody" (A9, owner). **Decision** "publication-mode semantics" (A4). **Decision** "retry jitter" (A7).
- **State:**
  - the source MG replica is a follower, so the source leaf is forwarded through the same router (`message-group-proposal-routing.js:191-196`) and a source leaf also consumes destination window;
  - several lanes of one table (shared `deliverySource` key, A2);
  - logs-table lane (A6);
  - background-class versus critical-class lanes (A8);
  - recipient group also receiving from other senders (shared 1000-entry waiter queue).
- **Temporal:**
  - "source leaf covered, targets not" (the cell is re-presented);
  - "response returned, raw child still open". For example, a proposal past its 1 500 ms attempt deadline is still charged through `ownOperation` (`ACC:150-157`), so the lane stays closed;
  - stop→start (A3); initialize (A3).
- **Events:** preemption and per-source limit (A2); source or recipient leader change with N in flight (A7); config grouped↔safe flip with N in flight (`refreshConfig` runs on every capture, `cdc-group-propagation-durable-plan.js:15`, so one flip re-routes all in-flight waves at their next leaf).
- **Outputs:**
  - router queue depth, rejections and preemptions per destination, CDC versus non-CDC;
  - commit-waiter occupancy on source and recipients;
  - event-loop lag and CPU per wave;
  - publication-mode transitions and readiness vetoes;
  - persisted log rows from failure paths;
  - per-lane window trajectory and halvings;
  - per-class latency.
- **Evidence:** the draft's "differential against base for a single lane" proves nothing about overlap. Add a lab load run (reviewer #132) with L ≥ 30 lanes owing simultaneously, on a cluster with ≥3 recipients, recording the outputs above.

---

## Part B - Consider

### B1. Why `405f35609` was reverted, and whether its hazard applies

- [V] `ae698f5ed` is an **exact inverse** of `405f35609` for every CDC file: `git diff 405f35609^ ae698f5ed` is empty for `DD`, `cdc-propagation-delivery-profile.js`, `partition-cdc-delivery.js`, `partition-cdc-obligation-delivery.js`, `partition-service-hydration-image-methods.js`, `seed-cache-hydration-phase.js` and `test/topology/cdc-group-propagation-stop-arms-nothing.test.js`.
- So the whole CDC bundle was backed out together:
  - hydrated-obligation retirement (later re-landed in another form);
  - parallel target leaves;
  - three more CRITICAL tables (`control_plane_publications`, `replica_operations`, `tables`).
- The commit message names none of this. The reason remains unrecorded.

What the parallel code changed, by reading the diff:
- It replaced the serial loop, and deleted the comment "A serial dispatch window is bounded by every positive router concurrency".
- It enqueued all target leaves at once with `Promise.all` after the source leaf.
- It evaluated the governor for every leaf before any of them was enqueued, so the governor never saw the wave's own load.
- Its one test change was the stop case: the test had to wait for **all** router calls and answer each of them before cleanup (`stop-arms-nothing.test.js:260-267`). Stop with several children in flight was the first behaviour that needed a new witness.

The same hazards apply to concurrent waves:
- dispatch window greater than 1 per node (A2);
- stop/cleanup custody of several in-flight children (A3);
- a governor blind to concurrent load. All waves evaluate before their siblings enqueue. With N waves the governor reads the queue state between enqueues, so this is weaker [I].

A third hazard does not apply: concurrent waves never send two leaves of *one* vector at once. Treat the revert as a warning, not evidence. If the repair proceeds, it should record what 405 was measured against (nothing is recorded).

### B2. Recipient de-duplication is keyed by vector digest; equal vectors become BACKPRESSURE

[V] `ACC:125-126` answers BACKPRESSURE when `cdcCommitWaiters.has(key)`. Distinct lanes produce distinct digests, since `cdcSemanticEvent` includes `eventKey` and `sourcePartition` (`cdc-delivery-outcome.js:183-199`). So this does not cross lanes.

It does cross:
- two propagation subscribers on one lane;
- a re-presented vector whose previous raw child is still open after a source leader change. Review R1-7 called for a typed `DUPLICATE_IN_FLIGHT`.

Under overlap this case is unchanged, but it is still mis-typed as capacity. Keep it out of any "recipient backpressure" metric.

### B3. Same-key events from different lanes

The cache handler dedups by (table, op, key, timestamp) (#137 D). Different partitions hold disjoint keys, so overlap adds no new ordering hazard. The exception is a key that moves between partitions (split or move) while both lanes owe it. Whether that can happen while both are led on one node is not checked [I]. Name it as an explicit non-goal or check it.

### B4. Diagnostics

The following are now aggregates across concurrent waves, and the scheduling-notice throttle is one bucket per service:
- `stats.last*`;
- the per-service `LogThrottle`;
- the `wait_bound_spent` `lastObserved`.

Per-lane retry evidence will be mostly suppressed. Evidence runs should read lane-side records, not these.

### B5. Raft source group

L concurrent `CDC_BATCH` proposals enter one group's turn chain (`message-group-proposal-routing.js:119-126`). I found no proposal-count bound at the port [I: searched `src/raft` for capacity and backpressure; only the inbound queue has one, 16 384 / 64 MiB, `raft-rs-runtime-owner-constants.js:99-100`].

If queueing pushes a proposal past the 1 500 ms per-attempt deadline, the route retries. The first entry may still commit, which bloats the log (consumers dedupe). Measure source-apply leg p90 under overlap against the measured 72/199 ms.

---

## Worst-case concurrency and memory (by reading; to be measured)

Symbols:
- L = lanes led with owed work (seed ~140; journey run 3-6 contending tables);
- R = recipients per wave (journey 2; W9 allows 65);
- B = vector bytes (typical rows 1 KiB × window ≤ 256, so ≤ 256 KiB; singleton entry ≤ 2 MiB);
- S = sending nodes.

| Quantity | With slot (today) | After removal (no new limiter) | Bound that applies next | Typed outcome when it fills → lane does |
|---|---|---|---|---|
| Waves in flight per node | 1 | L (≤ 140) | none (per-lane single flight only) | - |
| Wave rate per node | ≈ 1 / 350 ms (measured 292 in 141 s) | ≈ L / wave time (e.g. 40 / 0.35 s ≈ 115 /s) | none | - |
| Plan captures per second (sync, cache scan) | ≈ 3 × ~45 | ≈ 115 × ~45 ≈ 5 000 [I] | none | event-loop lag |
| CDC leaves in flight to one destination node | ≤ 1 | ≤ L (one per wave at that leaf; ≈ L/(R+1) on average) | router `maxConcurrent` 32 (critical per source key 16) | queued |
| CDC leaves pending at one destination | 0-1 | up to L − 32 | critical ceiling 56; background 48; per source key 16 | outbound backpressure rejection, or critical **preemption** of another source → leaf uncovered → 3 in-wave attempts → UNKNOWN → lane halves window, backoff to 10 s (A1) |
| Source MG commit-waiter entries | ≤ 1 local + remote | L local + Σ remote | `ProposalQueue` 1000 | BACKPRESSURE with retryAfterMs 100 on the leaf → flattened to UNKNOWN at the lane |
| Recipient MG commit-waiter entries | ≤ S | Σ over senders L_s | 1000 | as above |
| Concurrent Raft CDC proposals into one source MG | ≤ 1 | L | none found at the port [I] | per-attempt 1 500 ms timeout → route retry (possible duplicate entry) |
| Governor evaluations per second | ≈ waves × R | L× more, global decision | none | DEFER (background class only) → leaf uncovered → UNKNOWN |
| Retry timers | 1 sleep + L lane timers | L sleeps + L lane timers | per wave 3 attempts; per lane 1 timer | - |
| Heap per wave (sender) | 1 × ≈ (5-8) × B | L × (5-8) × B | none | - |
| Heap, typical (B = 256 KiB) | ≈ 1.3-2 MiB | 140 × ≈ 2 MiB ≈ **180-280 MiB** | none | (measured seed RSS already 157 → 472 MB) |
| Heap, pathological (B = 2 MiB singleton) | ≈ 10-16 MiB | 140 × ≈ 16 MiB ≈ **1.4-2.2 GiB** | none | - |
| Recipient heap (captured waits) | ≤ S × B × ~3 | Σ L_s × B × ~3, ≤ 1000 × B × 3 | 1000 waits | - |
| Persisted ERROR rows from exhausted waves | ≤ wave rate (~3/s) | up to L per round | none (A6) | feeds the `logs` lane |

The first bounded queue to fill as L grows is the router's per-destination window. It takes 32 in-flight leaves, and only 16 per source key for critical tables. Recipient waiter queues (1000) come later. Event-loop CPU has no bound at all. It is the quantity most likely to fail first in practice, and it is the one the slot capped implicitly. The lab load measurement must decide whether "no new node-wide limiter" holds. It should record:
- peak concurrent waves;
- event-loop lag (p99 and max gap);
- CPU per wave;
- router rejections and preemptions per destination, CDC and non-CDC;
- commit-waiter peak;
- heap / RSS;
- per-class latency;
- persisted log rows.
