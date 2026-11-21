# Verification: placement owner tenure (stage 1) and wakes (stage 2)

Verifier: independent subagent, 2026-11-21, read-only. Subject `work/placement-owner-repair-20261121`,
source judged at `b92a5d6cea8b` against base `974320ad3`. Nothing was executed here; executed evidence is the
retained lab output (tv-dator, sha-bound by `placement-head=` in each log). Markers: VERIFIED = read at the path
and line named (or seen in a retained lab log); INFERRED = reasoned from what was read, not executed.
Line numbers are those of the file at `b92a5d6ce` unless a commit is named.

## Verdict

- **Stage 1 (tenure): APPROVE-WITH-CONDITIONS.** The safety half of the contract holds in every schedule I
  could trace through the owner (token, checkpoints, fence, per-custody drain, inherited work). Two things do
  not hold as claimed: the barrier fact is not "own term start applied" (finding 1, a liveness defect and a
  self-deadlock candidate), and the fence is not at the kernel boundary for writes not yet inside the core
  (finding 2, already witnessed red by the author, other writer's file). Condition 1 gates landing.
- **Stage 2 (wakes): APPROVE-WITH-CONDITIONS.** Resync, LEADER_UNKNOWN declaration and the start path are
  correct. The throw path is correct in code but has no witness that distinguishes it from the resync, and
  stage 2 removed the premise of four stage-1 witnesses (3, 4, 5 and the obsolete-work half of 13).

## Findings

### 1. The barrier fact goes false again after every ledger configuration change (stage 1; liveness)

- Where it is read (VERIFIED): one site. `isTermStartApplied` (`replica-placement-owner-tenure.js:52-55`) is
  called only by `passTermStartBarrier` (`replica-placement-owner.js:695-704`), from `runPassSteps` (`:734`),
  at the start of every pass while `custody.termStart === PENDING`. The first true read latches
  `custody.termStart = APPLIED` (`:702`); it is never read again in that custody, and never before an
  admission. `git grep currentTermApplied -- src` shows no other reader in the owner.
- What the field is (VERIFIED by read): leader and `applied > pendingConfIndex`, strict
  (`raft-rs-status-observation.js:106-113`). The raft owner's own test for the same question is different:
  `group.appliedTerm === status.term`, falling back to `applied >= pendingConfIndex`
  (`raft-rs-conf-change-admission.js:236-248`). `appliedTerm` is kept by the runtime owner
  (`raft-rs-runtime-owner.js:1196`) and is not in the status.
- Direction true => applied holds: `advance_apply` runs only after both `applyEntries` calls returned OK
  (`raft-rs-runtime-owner.js:1239-1271`, VERIFIED); that the core sets the index to the pre-noop last index on
  becoming leader is INFERRED (the crate is not in the repository; cited at `status-observation.js:99-105`).
- The converse is false. A configuration change the leader proposes raises `pendingConfIndex` to its own
  index; once applied, `applied == pendingConfIndex` and the field stays false until one more entry applies.
  Executed by another track today (`lab/s0-witnesses-fc37b8d1a-try2`, `reports/s0-transition-record.md`
  16.4); I read that write-up, not the log.
- Mid-tenure, after the latch (VERIFIED from code): the field goes false, the owner does not re-read it,
  placement does not wait. The seed's formation path is therefore not blocked: its custody latches when its
  own noop applies, and the first ledger membership change is caused by the owner's own admission, which is
  behind the barrier (the second half INFERRED: no non-owner path changing ledger membership first).
- Before the latch (INFERRED, not executed): a custody that takes its first read while
  `applied == pendingConfIndex` waits. Its only wake is `APPLIED_PROGRESS` (`:223-227`), which fires only when
  the applied index advances (`raft-rs-runtime-owner.js:1424-1431`). The resync pass re-reads the same false
  value and writes nothing. The owner's own admissions are ledger writes and are behind the barrier, so the
  wait ends only by a ledger write from someone else: a self-deadlock candidate on a quiet ledger.
  Minimal interleavings:
  a. owner attached or re-attached to a ledger that already leads (`setRebalancerLeadershipSink` drives at
     once, `partition-service-leader-activation-methods.js:64-79`; construction orders "join" and "ledger
     first"; `quiesceRebalancing` then re-attach) while the last applied entry is a membership change;
  b. new leader, noop applied, an inherited ledger membership operation proposes its next configuration change
     inside the 250 ms activation holdoff (`leader-activation-gate.js:7,88`), custody begins after it applied.
     Here the operation's next row write ends the wait (INFERRED), so the stall is bounded by that operation,
     but all placement for every partition waits on it.
- A leader elected while the last log entry is a configuration change behaves correctly: the index is reset to
  that entry, the noop follows it, `applied > index` becomes true when the noop applies (INFERRED from the
  formula plus the cited crate behaviour). `autoLeave: false` at `raft-rs-conf-change-admission.js:123`, so
  the automatic leave-joint variant does not arise there.
- Not seen by any test (VERIFIED): the fixture models the ideal fact (own term-start index applied,
  `placement-owner-authority-fixture.js` `LedgerLog.currentTermApplied`), with no pending-configuration index;
  the shared double answers "applied whenever it leads".
- Note on the alternative: `!confChangePending` is true as soon as the election-time log is applied, before
  the own-term entry commits. It is complete for inherited work (leader completeness) but weaker than the
  contract's literal "own term-start entry committed and locally applied". The exact fact is
  `appliedTerm === term`, which stays true through later configuration changes; it needs the raft writer to
  expose it.

### 2. The fence is not at the kernel boundary for writes not yet inside the core (stage 1; other writer)

- Fenced (VERIFIED): the owner checks `isPassCurrent(pass)` and calls the submitter in one synchronous turn,
  tenure stripped (`replica-placement-owner.js:365-372`); no `await` lies before `service.raft.propose`
  (`partition-placement-admission.js:221-280`; `partition-service-raft-write-commit.js:465-484, 313-362,
  242-246, 105-121, 83-88`; `retryable-control-plane-write.js:159-164` calls its executor synchronously on
  the first attempt). Every role-edge schedule is also fenced below: `releasePendingWrites` on
  FOLLOWER/CANDIDATE (`partition-service-raft-lifecycle-wiring.js:49-54, 96, 108`) makes
  `markCommittedWriteProposal` refuse a later proposal (`write-commit.js:84-87`).
- Not fenced: a tenure renewed without a role edge (`wirePartitionRaftLifecycleEvents` passes no
  `onTermChange`, `:61-131`), for a write that is (a) deferred by the port and retried on a timer
  (`write-commit.js:105-121`), (b) parked on a reserved partition (`:280-291`), or (c) queued inside the port
  because the group was busy (`raft-rs-runtime-owner.js:2146-2150`; the author's record does not name this
  one; INFERRED). (a) is executed red: `placement-owner-authority-write-kernel.test.js`, `lab/por-followup-7d678b8a`
  and `lab/por-stage2-b92a5d6c` ("not ok 1 - kernel: ...").
- Which clause: it violates "no fresh placement decision authorized by an expired tenure" (the old decision is
  admitted under the renewed term). It does not produce a duplicate admitted operation or capacity
  allocation: the applier refuses PARTITION_BUSY and capacity at commit, and a same-intent pass of the new
  custody reuses the retained attempt and joins the pending write (`admission.js:245-249`) (INFERRED).
- The renewal without a role edge is real in production by construction: `announce` emits role events only
  when the sampled role differs between two drains and TERM_CHANGE separately
  (`raft-rs-runtime-owner.js:1407-1412`, VERIFIED).
- A fence at apply is not needed and there is none: a proposal made under tenure T sits before the successor's
  term-start entry or never commits, so the barrier covers it; the contract calls it inherited work.
- Side effect (INFERRED): an obsolete continuation no longer deletes its retained attempt (`:382`). If its
  entry commits after the current custody's one reconciliation (only possible through this hole), the settled
  attempt stays retained for that custody; a later identical intent replays the old ADMITTED answer as a
  phantom admission for one pass.

### 3. A status read that can run a whole consensus turn sits inside both "synchronous" sections (stage 1)

- VERIFIED by read: `readStatus()` with inbound queued and the group idle steps all queued inbound, applies
  committed entries and emits events synchronously (`raft-rs-runtime-owner.js:1560-1578, 1983-2005,
  1071-1097`; `raft-rs-operation-port.js:264-268, 456`).
- (a) Between fence and propose: `proposePlacementCommand` begins with `partitionWriteLeadershipRefusalOf`
  -> `readStatus()` (`admission.js:222`, `write-commit.js:420-431`). "No await" is true; "nothing can
  intervene" is not. A demotion inside the read is caught by the kernel's role check on the returned status.
  A renewal inside it would not be; I judge that unreachable for a multi-voter group (re-election needs a
  network round trip) (INFERRED).
- (b) In the barrier, in the synchronous prefix of a drain's first pass, before `custody.running` is assigned
  (`:300`): APPLIED_PROGRESS emitted inside the read reaches the owner's own listener (`:223-227`) ->
  `notify` -> `drainQueue` sees `running === null` -> a second drain of the same custody starts nested. Two
  passes then plan from one census; duplicates are stopped only by attempt identity and the applier. It
  needs the read-driven turn to settle within the call (no awaited send), so it is unlikely with an
  asynchronous transport (INFERRED, conditional). The single-flight shape predates this change (base
  `:381-398`); stage 1 added the group-driving read to the prefix.
- No barrier read can return true for an ended tenure: an end shows as not-leader, a renewal as a term
  mismatch (INFERRED).

### 4. One await without a checkpoint before planning work (both stages; bounded stale work)

`runPassSteps` continues after `await this.readPassCensus(pass)` (`:735-744`) with no tenure check: node
inputs, `nodeAuthority.scheduleRefresh()`, construction for every partition and the capacity reads run, then
the CANDIDATE checkpoint (`:662`) stops the pass. No admission (checkpoint and fence). The window is the
microtask boundary of that await (and the read of finding 3b). The record's "the checkpoint is the first
statement after every await" and "after the barrier the pass re-checks the custody before reading the census"
are both not true of the code at `b92a5d6ce` (the second was the A1 checkpoint, removed by stage 2).
Every other await is followed by a check before the next authoritative action (VERIFIED: `:359, 382, 395, 417,
428, 627, 639, 650`, `replica-placement-owner-remove.js:40, 43, 47`; catch/finally paths do nothing
authoritative).

### 5. The throw path: correct in code, unwitnessed, and its only wake is the resync (stage 2)

- Code (VERIFIED `:307-330, 749-762`): triggers retained in the custody, drain ends, warn log, snapshot
  `ABORTED` with `failure` and `retainedTriggers`, `totals.failedPasses`. One pass per wake; no self-sustained
  spin.
- Witness: `P3(i)` waits `resyncIntervalMs + 3 s` (`placement-owner-authority-wakes.test.js:79-82, 207-216`)
  and asserts only "admitted". It passes with retention removed (a RESYNC pass re-plans from scratch) and
  with the catch removed (the test handles the rejection itself). The file took 128 s at `b92a5d6ce` against
  15 s before: two cases wait for the real 60 s timer. It is a second resync witness.
- After one transient throw in a quiet cluster recovery takes up to 60 s. On the factory-less constructor
  (`rebalance-coordinator-operation-creation-support.js:636-648`, reachable whenever the factory is not yet
  bound: the red construction orders 4 and 5) there is no resync, so retained triggers have no owned wake
  (INFERRED).
- A deterministic throw before the candidate loop (one bad PARTITIONS row, one failing capacity read) aborts
  every pass: every partition's placement is starved for the tenure. It is visible only as the warn log and
  the diagnostic snapshot; no typed blocked state, no per-candidate isolation (INFERRED).
- A pass woken by the resync with retained triggers is not `resyncOnly` (`:724`), so
  `placementResyncAdmissions` stays 0 although the timer caused the admission; the sealed contract uses that
  counter as its acceptance signal.

### 6. Witness state at `b92a5d6ce`

- Red before / green after, VERIFIED per case in the retained logs: tenure 3, 4, 5, 6, 8, 11, 12 red at
  `pow-run3-bf0c6310` and `por-red-c30195b7`, green at `por-repair-aae3106a`; await-points 3/3 red then green;
  13 red at the repair on timers only, green at `por-followup-7d678b8a`; wakes 2-6 red at
  `por-wakes-red-9687e4d1`. Wakes at `por-stage2-b92a5d6c` is retained at file level only ("ok ... 6
  assertions, 128236 ms"): per-case green is not in the log.
- The "before" run is at `bf0c6310`, not the stated base `974320ad3`; `por-red-c30195b7` repeats it on the
  witness commit. The red run finished at 15:10, two minutes after the repair run (15:08): red-first in commit
  order, not in execution order.
- Vacuous or red after stage 2: 3 red (its premise is gone); 4 and 5 pass with nothing suspended; 13's
  pass/trigger/write/attempt bound is 0 = 0 at every transfer (log line 1390: `inFlightPasses: 0`, admitted at
  transfer 1). 13's timer half is real: the resync interval is ref'd and attributed (`time-source.js:53` via
  `control-plane-setup.js:429`). The creation-stack attribution cannot see a timer armed after an await on the
  owner's behalf, unref'd timers, or listeners.
- Mechanism -> witness that fails without it: checks after awaits -> await-points A2, A3 (first REMOVE read
  only), A4->A5; fence -> tenure 6, 11; barrier -> 8; barrier independent of publication -> 9; per-custody
  drain -> A4->A5 `progressed`; TERM_CHANGE adoption -> 11; demotion order -> 12; resync armed -> P3(ii), P3(i);
  resync cleared per custody -> wakes 6, 13(a); start path -> P8; LEADER_UNKNOWN declaration -> P1.
- No witness: the barrier's wake (8 needs no work from the new leader after the barrier opens; everywhere
  else the barrier is already true at the first read); throw retention; the checkpoints after the second and
  third REMOVE reads and after the re-admission; token by identity as distinct from term equality (equivalent
  in every reachable schedule); the bound on obsolete continuations at head.

### 7. Smaller items

- Token (VERIFIED): the ledger replica's `leadershipTenure`, minted at every LEADER event and on TERM_CHANGE
  while leading, null on demotion and shutdown (`replica-leadership-state.js:38-60, 62-69, 94-103, 203-206`;
  `partition-service-lifecycle-methods.js:198`); the owner compares by identity on every check (`:132-135`)
  and keeps no second notion. A stale token can never read as live. The reverse can: the ledger holds a new
  token and the owner is not told, so it is inert until the next sink drive. Paths: an earlier TERM_CHANGE
  listener that throws (the port's `emit` has no containment, `operation-port.js:264-268`; the relay listener
  is registered first, `raft-init-base.js:356` before `:405`); a tenure with `term: null`
  (`resolveCurrentTermSafe`, barrier never true). Both INFERRED, fail-closed.
- Listener order (VERIFIED): renewal listener registered at port creation (`raft-init-base.js:405`), the
  owner's at custody begin, which needs `isLeader`, set only by that same wiring; the Set iterates in
  insertion order, including listeners added during the emit.
- Double `setLeader(true)` is a no-op (`:173`); an obsolete drain takes no trigger after its first iteration
  and cannot overwrite the current snapshot (`:322-328, 758`) (VERIFIED).
- Inherited work (VERIFIED): the census is a local SQLite read of the leading ledger replica
  (`partition-placement-admission-decision.js:93-96`), not a routed or follower-served read; reconciliation
  proposes nothing (`replica-placement-owner-attempts.js:89-98`).
- Start path (VERIFIED/INFERRED): nothing consumed the CDC drive's result at base (`974320ad3:485-497`); the
  CDC owner drives itself on LEADER_ELECTED and on every committed entry (`partition-cdc-delivery.js:165-168`).
  Deficits are still evaluated from the SERVICES/PARTITIONS cache, as before; the drive never brought those
  current.
- Observation (VERIFIED by grep): no decision in `src` reads `lastPassSnapshot`, the totals or
  `placementResyncAdmissions`.
- Out-of-scope edits (VERIFIED from the diff): no assertion changed in the caller files; the double's default
  cannot hide a hang, it hides the barrier from every suite except the authority fixture; the stub ledgers
  hold a constant tenure that never ends.
- Scope of the fence: `requestPlacementAdmission` has other callers that carry no tenure
  (`creation-support.js:302-317`, the routed PLACEMENT_ADMIT), and `wakeRetainedPlacementRepairs` runs at
  custody begin, before the barrier (`:190`). Unchanged by this work; the provisioner witness is still not
  established.
- Bound at head (INFERRED): at most one suspended pass per ended custody, at a kernel answer or a REMOVE
  read; released at once on a role edge, otherwise at commit or deadline. There is no constant bound and no
  executed witness; the REMOVE read timeout is the author's inference and I did not confirm it.

## Conditions

Stage 1:
1. (gates landing) Replace the barrier fact with one that stays true once the term start is applied
   (`appliedTerm === term`, exposed by the raft writer), or show finding 1's interleavings unreachable with an
   executed witness on a port that models the pending-configuration index.
2. Keep finding 2 open against the clause "fence at the actual admission boundary" until the kernel witness is
   green; add the port-queued proposal to that stop item.
3. Add the checkpoint after `await readPassCensus` and make drain start safe against a notify inside its
   synchronous prefix.
4. A witness in which the new leader must do work after the barrier opens.

Stage 2:
5. Re-stage 3, 4, 5 and 13 (below).
6. A throw witness that fails when retention is removed (the admitting pass carries the retained trigger and
   `placementResyncAdmissions` is 0), and a ruling on the 60 s recovery, the factory-less path and the
   poisoned-pass starvation.
7. Retain per-case output for the wakes file at the landing commit.

## What the re-staging of 3, 4, 5 (and 13) must preserve

- A real suspension: the obsolete pass is held at an await that still exists (the admission answer, a REMOVE
  read, a hold release), and the test asserts the premise itself: the pass is not done when the successor is
  measured. `gate.reached` on the CDC drive no longer proves a suspension.
- Observable continuation work: at least a second candidate, so "no construction, no capacity read, no
  admission attempt after the tenure ended" can fail. With one deficit nothing follows the admission answer.
- 4: the same node leads again; the old pass must be refused by identity, and the second admission's deciding
  tenure is the current one.
- 5: the successor admits while the obsolete pass is still outstanding, within the progress bound.
- 13: a pass genuinely suspended at every one of the N transfers, so the outstanding-work fields are non-zero
  and compared; keep the per-owner timer count.
