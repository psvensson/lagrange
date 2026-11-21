# Write kernel tenure fence: contract-first transition record

Writer: `claude:kernel-fence`, 2026-11-21. Worktree
`/mnt/data/peter/projects/.worktrees/write-kernel-tenure-fence-20261121`, branch
`work/write-kernel-tenure-fence-20261121`, base `8e84e2801` (= head of `work/placement-owner-repair-20261121`
when branched). Authorised by the executed red kernel witness (`placement-owner-authority-write-kernel.test.js`,
`lab/por-corrective-8e84e280`) and the lead's brief. Markers: VERIFIED = read at the path named; INFERRED =
reasoned, not executed.

## 1. The tenure the kernel consumes (no second notion)

`service.leadershipTenure` of the partition replica (`src/raft/replica-leadership-state.js`): a new frozen
`{term}` per leadership edge (`applyReplicaLeadership` :62-80) and per term observed while leading
(`renewReplicaLeadershipTenureOnTerm` :53-60, wired on TERM_CHANGE :203-206), `null` on demotion
(`applyReplicaDemotion` :94-103) and shutdown (`partition-service-lifecycle-methods.js:198`). Compared by
identity. Precedent in the same service (same capture-and-compare pattern): CDC delivery
(`partition-cdc-delivery.js:67-71`), the CDC obligation lane (`partition-cdc-obligation-lane.js:57-69`), the
managed-split QPM key (`managed-split-metrics-provider.js:116`), the placement owner's custody. Never part of a
durable identity: entry ids, commands and bodies are unchanged.

Why a renewal without a role edge IS a leadership loss (VERIFIED by read): a raft-rs leader never raises its own
term while it leads (a higher-term message makes it a follower; `MsgHup` on a leader is ignored). The runtime
announces once per turn (`announce`, `raft-rs-runtime-owner.js:1398-1412`, called at the end of every
`drainReady` :1340 and after a reconstruction :560/:1017): a role event only when the sampled role differs
between two announcements, TERM_CHANGE separately. LEADER at T then LEADER at T' > T with no role event means the
replica lost and regained leadership between two announcements. Reachable schedule (INFERRED from :548-562): a
sole voter reconstructed after a runtime failure campaigns inside `resumeAfterReconstruction` and announces
LEADER at T+1 against a last status of LEADER at T.

## 2. Kernel files (the write kernel and its own siblings)

- `src/partition/partition-service-raft-write-commit.js`: registration (`executePartitionRaftWriteCommit`
  :313-322), hand-over (`handOffToConsensus` :242-262 -> `proposeWithinDeferralBudget` :105-121 ->
  `proposeUnlessDeferred` :83-96 -> `service.raft.propose`), parking (`parkReservedWrite` :265,
  `readmitReservedWrites` :280-291, `reparkReservedWrite` :303-311), the leadership read
  (`partitionWriteLeadershipRefusalOf` :420-431).
- `src/partition/partition-service-cdc-stream-base.js`: the pending-write registry the kernel answers through
  (`waitForCommittedWrite` :317-349 with the commit deadline, `markCommittedWriteProposal` :414,
  `releasePendingCommittedWrites` :409). Only this file touches `proposalQueue` (VERIFIED, grep).
- `src/partition/proposal-queue.js` (`releaseEntry` :281, the queue's one release), `src/partition/partition-write-kernel.js`
  (`buildReleasedPendingWriteAnswer` :384-401, the one builder of a released write's answer).
- Lifecycle wiring `src/partition/partition-service-raft-lifecycle-wiring.js` (`releasePendingWrites` :49-54 on
  FOLLOWER/CANDIDATE): read, not changed (candidate (B) needs no event; section 6).

## 3. States of a write in the kernel x events (today -> after the repair)

States: R = registered, before its first proposal (synchronous with registration); D = deferred by the port
(proposal state QUEUED, sleeping on the kernel's retry timer inside the 2 s budget); P = parked (QUEUED, in
`PARKED_WRITES`, waiting for the reservation's decision; also a write re-parked after a reserved apply); H = handed
to the port (PROPOSED; the port's turn may still be pending: H-q = queued INSIDE the port behind a busy turn,
`raft-rs-runtime-owner.js:2146-2150`; H-c = in the core); C = committed (applied, answer resolved); A = answered
(outcome settled, hand-off forgotten).

| State | Role edge (FOLLOWER/CANDIDATE) | Tenure renewed while leading: TODAY | ... AFTER the repair | Commit | Deadline | Shutdown |
|---|---|---|---|---|---|---|
| R | n/a (no await between registration and the first propose) | n/a, except a renewal INSIDE the caller's own leadership read before registration (section 8) | that read answers NOT_LEADER, nothing registered | | | |
| D | released NOT_LEADER (LEADERSHIP_LOST); the retry finds it released, proposes nothing | next retry re-proposes under the renewed tenure: DEFECT (witnesses a, e) | next retry: tenure mismatch, released NOT_LEADER (LEADERSHIP_LOST) in the step that would propose; nothing proposed | | released COMMIT_DEADLINE_EXCEEDED | released SERVICE_SHUTDOWN |
| P | released NOT_LEADER; readmit finds it released | readmit proposes it under the renewed tenure: DEFECT (witness b) | readmit: tenure mismatch, released NOT_LEADER | | released | released |
| H-c | released OUTCOME_UNKNOWN (may commit) | commits and is answered: inherited work, CORRECT | unchanged (witness d) | answered | OUTCOME_UNKNOWN | OUTCOME_UNKNOWN |
| H-q | released OUTCOME_UNKNOWN; the port later hands the bytes to the deposed core, which FORWARDS them to the successor (raft-rs 0.7.0 `raft.rs:2312-2322`): DEFECT, raft owner (witness c) | the port hands them to the core under the renewed term: DEFECT, raft owner | unchanged: the kernel cannot retract bytes it handed to the port (section 7) | | | |
| H then port deferral answered AFTER a renewal | | marked QUEUED again, retried under the renewed tenure: DEFECT | the retry is fenced (same as D) | | | |

## 4. Caller census (re-derived; file:line)

Every hand-over to consensus goes through `startPartitionRaftWriteCommit` (:465), then `handOffToConsensus`, so
every caller can be DEFERRED; those passing `park: isPartitionReserved(...)` can be PARKED. The record of the
placement writer named six callers; there are seven (the generation origin was missing; its :749 is the origin,
not the DECISION, which goes through :220).

| # | Caller (file:line) | Deferred / parked | Authority decision of the proposing tenure? | Continuation on a NOT_LEADER release (VERIFIED read unless marked) | Loses work? New retry mechanism? |
|---|---|---|---|---|---|
| 1 | Placement admission / hold release / repair: `partition-placement-admission.js:258` (`proposePlacementCommand`, from ADMIT :306, RELEASE_HOLD :317, REPAIR :291-303 via the repository) | both | YES (the owner's planning pass) | owner `submitPlacementAttempt` (`replica-placement-owner.js:388-404`): obsolete pass returns, the attempt stays retained for the current custody; current custody: NOT_LEADER, clearing trigger LEADERSHIP_START (`-constants.js:210`); the retained attempt is reused under the same entryId by the next same-intent pass (a fresh decision) | No / no. Fence REQUIRED (the probe) |
| 2 | Ordinary SQL writes: `partition-service-write-metrics-base.js:736` -> `startAdmittedPartitionWrite` (`raft-write-commit.js:446-463`) | both | no | the requester gets the retryable NOT_LEADER (`RETRYABLE_WRITE_FAILURE_CODES`, `partition-write-kernel.js:79-91`), the same answer a role edge gives; not proposed, so a retry under any entryId cannot apply twice (router retry not traced, INFERRED) | No / no |
| 3 | CDC acknowledgements: `partition-cdc-obligation.js:410` (`proposeCdcAcknowledgement`) | deferred | no | the lane is tenure-fenced (`partition-cdc-obligation-lane.js:57-69`): after the renewal the old lane is not current, its flush ends NOT_LEADER (`partition-cdc-obligation-delivery.js:236-238`); the new lane re-derives owed acknowledgements from the durable obligations; a new-lane join of the old pending entryId gets NOT_LEADER -> `scheduleDeliveryRetry` (:264) | No (obligations stay durable until acknowledged) / no |
| 4 | Coordinator settlement: `partition-coordinator-settlement.js:68` | both | yes (freeze/decision recording of the coordinator) | `applySettlement` returns null (`distributed-transaction-release-settlement.js:218-232`), release recovery retries in its own loop | No / no |
| 5 | Participant PREPARE / DECISION: `partition-participant-transaction-request.js:220` (`proposeAdmitted`, from `proposeSealedPrepare` :344 and `decideParticipant` :559) | deferred | PREPARE: sealed bytes validated at apply; DECISION: the coordinator's | PREPARE: `keepsSealedSession` (:335-338) keeps the session sealed for the coordinator's re-send (same sealed bytes, apply is the authority); DECISION: retryable answer, the coordinator re-sends until applied | No / no |
| 6 | Generation origin: `partition-participant-transaction-request.js:749` (`enableParticipantTransactionAdmission`) | deferred | no | refused answer; release recovery re-runs the cutover (INFERRED) | No / no |
| 7 | Formation transition: `membership-publication-formation-transition-command.js:548` (hooks registered `partition-service-entry-apply-base.js:73-82`), from the latch (`membership-publication-coordinator-persist.js:186`) and the original declare (`seed-original-registration.js:113`) | both | yes (the publications leader's formation evaluation) | latch: attempt retained unless settled terminal (:187-189), re-submitted at the coordinator's next evaluation; declare: `publishOriginalRight` submit/observe | No / no |

Kernel-internal re-hand-overs (not new callers): `readmitReservedWrites` (`partition-participant-transaction-apply.js:416`)
and `reparkReservedWrite` (:717) carry the registered write's hand-off (and so its tenure).

Leadership read `partitionWriteLeadershipRefusalOf` used without a following proposal (affected only by section 8):
`partition-placement-repair-preparation.js:17`, `partition-participant-transaction-request.js:264` (BEGIN), :432,
:531, :780, `partition-placement-admission.js:292`.

Join paths (a caller answers a request by joining an existing pending write with the same entryId):
placement :245-249, CDC :406-408, settlement :62, participant :436-440 / :541-545 / :744-747, formation :540-545.

## 5. The systemic question

"A write not yet handed to consensus never survives the tenure it was submitted under": right for ALL partition
writes, not only authority writes. Reason (section 1): a renewal without a role edge is a leadership lost and
regained that the announcements did not separate; every write not yet handed over is exactly in the state the
role edge would have released (`releasePendingWrites`), with the same answer. Every caller already handles that
answer from the role-edge path (table, last column): no caller loses work, none needs a new retry mechanism.
Cost for the non-authority writes: one retry, in a rare schedule. Benefit: one rule for every writer, enforced
at the one boundary every writer crosses; the kernel does not need to know which commands carry a decision.
Stage gate (brief): not triggered.

Reference systems (VERIFIED for raft-rs from `~/.cargo/registry/src/*/raft-0.7.0/src/raft.rs`; the others from
their documented design, not read here):
- raft-rs 0.7.0: no proposal state survives a role change. A candidate (and a follower with no leader) returns
  `ProposalDropped`; a leader running a transfer drops (`ProposalDropped`, which this port names
  TRANSFER_IN_PROGRESS); a follower with a known leader FORWARDS the proposal to it (`raft.rs:2312-2322`; this
  binding sets no forwarding switch, `vendor/raft-rs-wasm/src/lib.rs:457-465`, and raft-rs 0.7 has none). The
  application re-proposes.
- etcd raft: `ErrProposalDropped` (no leader, transfer, forwarding disabled); the etcd server's waiter times out or
  reports a leader change; the client retries.
- TiKV: pending proposals carry (index, term); on a leader change they are answered NotLeader / StaleCommand, and an
  applied entry whose term differs from the proposal's is answered StaleCommand; region-epoch checks at apply.
- CockroachDB: a command carries the proposer's lease sequence / max lease index; below raft, a command proposed
  under a lease no longer held is rejected at apply.
Which pattern the kernel follows: the DROP pattern (raft-rs/etcd, TiKV's NotLeader for pending proposals) for
writes not yet in consensus: the kernel releases them typed and the caller re-decides. An apply-time stale check
(TiKV term check, CRDB lease index) is what would be needed if entries of an ended tenure could still enter the
log; the owner's design keeps the tenure out of the command bytes, so the place to stop them is before the core:
the raft owner's propose step (section 7).

## 6. The repair: candidate (B), and why not (A)

(B) as the record recommended, confirmed by the census:
- Capture: the hand-off records `tenure: service.leadershipTenure` at registration
  (`executePartitionRaftWriteCommit`, synchronous with `startPartitionRaftWriteCommit`).
- Fence: `proposeUnlessDeferred` (the ONE step every hand-over passes: first propose, every re-proposal after a
  port deferral, every readmit of a parked or re-parked write) compares `handoff.tenure === service.leadershipTenure`
  in the same synchronous step as `markCommittedWriteProposal(PROPOSED)` and `raft.propose`. A mismatch releases
  that one write through the queue's one release (`proposalQueue.releaseEntry`, via a registry method
  `releasePendingCommittedWrite(entryId, answerOf)` beside `releasePendingCommittedWrites`) with
  `buildReleasedPendingWriteAnswer(..., {cause: LEADERSHIP_LOST})`: proposal state QUEUED, so NOT_LEADER,
  `ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE`, `consensus.reason: 'leadership-lost'`, exactly the role-edge answer.
  Nothing proposed. No timer, no event, no second outcome.
- Same for every writer (no command-type special case).
(A) (release QUEUED writes on TERM_CHANGE) is refuted as the sole mechanism by section 3, last row: a write PROPOSED
at the renewal whose port deferral is answered after it is QUEUED again and would be re-proposed; only a check at
the hand-over catches it.

Residual of (B), stated (not changed here): the release of a deferred write happens at its next retry (<= 100 ms
after its previous attempt, `USER_TRANSACTION_WRITE_RETRY_MAX_DELAY_MS`), of a parked write at its readmit or its
deadline (30 s). In between, a caller of the NEW tenure that joins the old pending write by entryId (placement
:245-249, CDC :406-408, ...) inherits its NOT_LEADER. Placement: the current custody then re-proposes the same
retained attempt at its next wake (any trigger; at worst the 60 s resync). CDC: `scheduleDeliveryRetry`. No
work lost; a liveness delay in that schedule only. An eager release on TERM_CHANGE in addition would remove it,
at the cost of a second release site; left to the lead.

## 7. The port-queued proposal (raft owner; not edited)

Mechanism (VERIFIED read): `executeCommand` (`raft-rs-runtime-owner.js:2146-2153`) queues a PROPOSE while the
group's turn is busy (`group.queuedProposals`, bytes only); `drainQueuedProposalBatch` (:2116-2130) later runs
`perform(PROPOSE)`, which first steps every queued inbound envelope (`perform` :1983-2000 -> `drainInbound`) and
then invokes the core's `propose`. Nothing compares the leadership the proposal was submitted under with the
core's at that step. Consequences: (i) across a renewal the bytes enter the core under the renewed term;
(ii) across a role edge the inbound drain makes the core a follower of the successor and raft-rs FORWARDS the
proposal to it (`raft.rs:2312-2322`; the ingress admits a forwarded MsgPropose, `raft-rs-ingress.js:44-49`), so
the old leadership's entry is appended under the successor's term, AFTER the successor's term-start entry: the
placement owner's barrier (record section 9: "a proposal made under tenure T sits before the successor's
term-start entry or never commits") does not cover it. The same holds for a non-queued propose whose own turn's
inbound drain deposes the core first.

The kernel cannot close it: once `raft.propose` was called, the bytes belong to the port; a kernel-side release
answers the waiter but cannot stop the entry (and would misreport one that commits). Witness (c) goes through the
real rs-raft port's public surface (`PartitionNodeCluster`): the role-edge variant, the reachable one on a
multi-voter group.

Exact edit for the raft owner (`src/raft/raft-rs-runtime-owner.js`):
1. `executeCommand` (:2146): record the leadership a proposal is submitted under, from the group's last announced
   status, for BOTH paths: queued `group.queuedProposals.push({bytes: command.bytes, deferred,
   submittedTerm: group.lastStatus?.term ?? null})`, immediate `enqueue(group, () => perform(group, {...command,
   submittedTerm: group.lastStatus?.term ?? null}))` (PROPOSE_COMMAND only).
2. At the propose step itself, after `drainInbound` (in `performCommand` for 'propose' :2000-2010 and for every
   member of `extraBatch` in `finishBatchedPropose`): read the core's status in the same turn
   (`invokeCoreAt(group, expectedGeneration, 'status')`) and do not invoke the core's `propose` for a proposal
   whose core is not leader (`raftState` != leader) or whose `submittedTerm` differs from the core's term; answer
   it with the core's own dropped-proposal refusal (CORE_REFUSED, reason ending in
   `RAFT_RS_CORE_REFUSAL_TEXT.PROPOSAL_DROPPED`, retryable, nothing proposed), which the kernel already types as a
   consensus refusal (`buildPartitionWriteProposalRefusal`, not proposed). In `drainQueuedProposalBatch` this is
   per member: the members that pass are batched as today, each refused one is answered on its own deferred.
   This also makes forwarding unreachable for proposals (a non-leader core never receives one).

## 8. The status read between the owner's fence and the propose (`partition-placement-admission.js:222`)

Schedule: owner fence passes under T (`proposeWithinTenure`) -> `requestPlacementAdmission` ->
`proposePlacementCommand` -> `partitionWriteLeadershipRefusalOf` -> `service.raft.readStatus()` runs a consensus turn
(drain inbound, apply, announce: TERM_CHANGE renews the tenure to T'; the owner's custody ends) -> the status says
LEADER -> registration captures T' -> propose under T'. A check at the propose alone (capture at registration) does
NOT make this harmless: the capture is already T'. Kernel-side closure (same file, the kernel's own leadership
read): `partitionWriteLeadershipRefusalOf` compares the tenure before and after its `readStatus()`; a tenure that
changed inside the read answers the kernel's NOT_LEADER refusal (`buildPartitionWriteLeadershipRefusal`), nothing
registered. Between the read's return and the registration no caller awaits or calls consensus (INFERRED by read:
placement :224-258, CDC :406-410, settlement :55-68, participant :436-457, formation :520-548). Witness (g).

## 9. Witnesses (red first; real kernel and real PartitionService; ceilings stated)

| # | File / test | Substrate | Expected before | Expected after |
|---|---|---|---|---|
| a | `test/rebalancer/placement-owner-authority-write-kernel.test.js` "kernel: ... deferred ..." (existing) | placement authority fixture (real owner + ledger PartitionService, fixture log) | RED (re-proposed at term 3) | GREEN |
| g | same file, "kernel: a renewal inside the kernel's own leadership read ..." | same; the renewal is announced from inside the ledger port's status read that the kernel's leadership read makes | RED (proposed at the renewed term) | GREEN |
| b | `test/partition/partition-write-kernel-tenure-fence.test.js` "parked ..." | real PartitionService (participant fixture) on the controllable port; reservation by an applied PREPARE, readmit by the applied decision | RED (proposed at the renewed term) | GREEN (released NOT_LEADER) |
| e | same file, "ordinary write deferred ..." | same; the port's typed TRANSFER_IN_PROGRESS deferral once | RED | GREEN (released NOT_LEADER, not proposed) |
| f | b and e assert, after the release: proposal queue size 0, no pending outcome, 0 live kernel timers (deadline, retry), and (b) a later readmit proposes nothing for the old write | counting clock on the replica | RED (1 pending, 1 deadline) | GREEN |
| d | same file, "handed to consensus before the renewal ..." | same | GREEN (preservation guard) | GREEN |
| c | `test/raft/raft-rs-backend/queued-proposal-leadership-fence.test.js` | three real rs-raft ports (`PartitionNodeCluster`); leader's turn suspended in a real delivery | RED (the queued entry committed under the successor's term) | RED until the raft owner's edit (section 7) |

## 10. As implemented

- `0bb5c4738` witnesses (tests and the authority fixture's armed renewal only; src = `8e84e2801`).
- Repair (next commit on the branch), three kernel files:
  - `partition-service-raft-write-commit.js`: the hand-off records `tenure: service.leadershipTenure` at
    registration (`executePartitionRaftWriteCommit`); `proposeUnlessDeferred(service, handoff)` first runs
    `releasedOnEndedTenure` (identity compare; on a mismatch the write is released through
    `releasePendingCommittedWrite` with `buildReleasedPendingWriteAnswer(..., {cause: LEADERSHIP_LOST})` and
    `PROPOSAL_NOT_MADE` is returned), then `markCommittedWriteProposal(PROPOSED)` and `raft.propose`, all in one
    synchronous step; `proposeWithinDeferralBudget`/`handOffToConsensus` pass the hand-off;
    `partitionWriteLeadershipRefusalOf` compares the tenure before and after its `readStatus()` (section 8).
  - `partition-service-cdc-stream-base.js`: `releasePendingCommittedWrite(entryId, answerOf)` ->
    `proposalQueue.releaseEntry` (the queue's one release; the deadline uses the same).
  - `proposal-queue.js`: `releaseEntry`'s doc names the new cause. No change to the lifecycle wiring, no event,
    no timer, no command-type special case.

## 11. Executed red (adam-laptop, check base 0dbed1718): `lab/kernel-red-0bb5c473` (src = `8e84e2801`)

| Witness | Verdict | First failure / evidence |
|---|---|---|
| a placement deferred (existing) | RED | entry deferred at term 2, proposed at term 3 (`log[2]`), ADMITTED |
| e ordinary deferred (+f) | RED | `{enteredUnderRenewedTerm: 1, answer: 'pending', queued: 1, pendingOutcome: true, kernelTimers: 1}`; hand-overs: term 1 deferred, term 2 accepted |
| b parked (+f) | RED | `{enteredUnderRenewedTerm: 1, answer: 'pending', queued: 1, pendingOutcome: true, kernelTimers: 1, handOversAfterLaterReadmit: 1}` |
| d preservation | GREEN (expected both sides) | |
| c port-queued, real rs-raft | RED | queued-fence-a led at term 1; successor queued-fence-b elected at term 2 while a's turn was suspended; the queued proposal's turn answered `CORE_OK/drained`; a ended follower of b at term 2; the command was committed at index 3, term 2 on b and c: raft-rs forwarded it |
| g placement status-read window | GREEN before the repair, NOT by the kernel: `attemptOutcome: partition_write_cutover_paused`, no proposal | see below |

Finding from g (VERIFIED read): the participant cutover pause is a second, request-level fence against a term
change: `pausedWriteAnswerOf` -> `participantCutoverPauseOf` -> `invalidateParticipantReleaseAdmission`
re-reads status and raises the pause when the release admission's proof (term, leader, configuration, runtime
generation, incarnation; `partition-participant-transaction-pause.js:211-233`) no longer matches. The placement
admission checks it AFTER the kernel's leadership read (`partition-placement-admission.js:241`), so in that
composition the status-read window is already closed (CUTOVER_PAUSED). It does not reach the kernel's
re-proposals (a, b, e are red) and it precedes the leadership read for ordinary writes
(`startAdmittedPartitionWrite` checks the pause first), so for them nothing but the kernel stands between a
renewal inside the read and the registration. Witness g is therefore also placed on the ordinary write path
(`partition-write-kernel-tenure-fence.test.js`, "kernel tenure fence (g)"); the placement test keeps its property
and states why it is green.

Regression baseline in the same run (src unchanged): every non-witness file green except the placement-owner
base reds identical to `lab/por-corrective-8e84e280` (tv-dator): dt-placement-owner-formation-drain [4, 10, 11],
placement-owner-construction-orders [4, 5], placement-owner-authority-barrier [2], replica-placement-owner-core [18].

## 12. Executed after the repair (adam-laptop, check base 0dbed1718)

Commits: `0bb5c4738` witnesses, `c9d8896f9` witness g on the ordinary write path, `a5bf01004` repair (pushed).

| Witness | Red before | After the repair |
|---|---|---|
| a placement deferred | `lab/kernel-red-0bb5c473` RED | `lab/kernel-green-a5bf0100` GREEN |
| e ordinary deferred (+f counts) | `lab/kernel-red-0bb5c473` RED | GREEN |
| b parked (+f counts, later readmit) | `lab/kernel-red-0bb5c473` RED | GREEN |
| g ordinary write, renewal inside the kernel's leadership read (+f counts) | `lab/kernel-red-g-c9d8896f` RED (`{enteredUnderRenewedTerm: 1, answer: 'pending', queued: 1, pendingOutcome: true, kernelTimers: 1}`) | GREEN |
| g placement (property only) | GREEN (CUTOVER_PAUSED, section 11) | GREEN |
| d preservation | GREEN | GREEN |
| c port-queued, real rs-raft | RED | RED (raft owner, section 7; unchanged by design) |

Regression attribution (same 28 files, same host; `lab/kernel-red-0bb5c473` at src `8e84e2801` vs
`lab/kernel-green-a5bf0100` and `lab/kernel-green-a5bf0100-run2`):
- Pre-existing, identical first assertion in all three runs (and as in `lab/por-corrective-8e84e280`):
  dt-placement-owner-formation-drain [4, 10, 11] (`cdcIntegrationService.updateSystemTableRow is not a function`),
  placement-owner-construction-orders [4, 5], placement-owner-authority-barrier [2], replica-placement-owner-core [18].
- Green before and after: partition-service-write-commit, partition-write-kernel, partition-write-typed-releases,
  partition-write-leadership-transfer(+committed), partition-commit-deadline-wait-bound-spent,
  partition-participant-transaction-staging, partition-transaction-replicated-apply-v3, -replay-cursor-v4,
  proposal-queue, partition-coordinator-settlement, partition-cdc-obligation, partition-service-stale-topology-write-guard,
  placement-growth-dispatch-identity, placement-owner-authority tenure/await-points/wakes/negatives/disruptions/five-nodes.
- One red not attributed to the repair: partition-runtime-reconstruction-leadership [5] (W-B6-3) failed in
  `kernel-green-a5bf0100` at "the registered release owner revalidates the healed leader" (a waitFor budget);
  it passed in `kernel-green-a5bf0100-run2` (same full set and load) and in two isolated runs at `a5bf01004`
  (`lab/kernel-attr-recon-a5bf0100-1`, `-2`), and at `c9d8896f9` in the full baseline and two isolated runs
  (`lab/kernel-attr-recon-c9d8896f-1`, `-2`). By read, the revalidation it waits for touches no kernel path: the
  release recovery's RESUME/INSPECT read facts and status; the query-drain proof exists only for sql_transactions
  (`replica-handler-participant-cutover.js:167-191`); ENABLE reaches the kernel only when no origin is recorded
  (`partition-participant-transaction-request.js:735-757`). Classified load-sensitive (1 of 4 at the repair, 0 of 3
  before); recorded, not hidden. (`lab/kernel-attr-recon--1`, `--2` are two invocations that never ran: a mistyped
  sha.)

## 13. Notes for the lead

- The kernel's read compare refuses on ANY identity change inside the read, including null -> T (the replica
  became leader inside the read): the caller decided before this replica led. Cost: one retryable NOT_LEADER for
  a write routed at that instant. Narrowing it to "a tenure existed before the read" is a one-condition change if
  the lead prefers it; no witness depends on the null case.
- Join residual (section 6) and the participant-session question (a renewal keeps participant staging sessions,
  a role edge discards them, `partition-service-raft-lifecycle-wiring.js:49-54`) are the participant/placement
  owners' to rule on; neither loses work.
- `architecture/process-replication.md` (write kernel bullets, ~:165-180) does not state the tenure fence; not
  edited (outside the writer's scope).

## 14. Lead rulings 2026-11-21 (follow-up on the same branch)

### 14.1 Join gap: closed by the same fence (no second release site)
A join (a caller answered by the write already pending under the same entryId: placement :245, CDC :406,
settlement :62, participant :436/:540/:744, formation :541, ordinary writes `partition-service-write-metrics-base.js:702`)
is a hand-over of that write's answer. Every join goes through the registry's `getPendingCommittedWriteOutcome`
(VERIFIED: the only reader of `pendingWriteOutcomes`), which now first runs the kernel's
`releaseJoinedWriteOfEndedTenure(service, entryId)` -> `releasedOnEndedTenure(service, handoff)`, the same
function `proposeUnlessDeferred` runs. It releases (queue release, LEADERSHIP_LOST) only a write that (i) this
hand-off still owns, (ii) is not yet handed to consensus (proposal state QUEUED), (iii) was registered under a
tenure other than the current one; then the join answers null and the caller registers its own write under the
current tenure in the same turn. A write handed to consensus (PROPOSED) is inherited work and is joined as before.

Identity (found while closing the gap; pre-existing hazard, now closed): the registry is keyed by entryId, so a
registration that replaces a released one under the same entryId (role-edge release then a new request, and now
the join) left the OLD execution able to act on the NEW write by entryId: its held retry would mark and propose
(before `a5bf01004`) or release (at `a5bf01004`) the new write; a late port refusal or a spent deferral budget would
reject it. The hand-off now records its own pending registration (`handoff.pending`, the queue entry object), and
every by-entryId action of an execution (fence, mark PROPOSED/QUEUED, reject on refusal or spent budget) first
checks `ownsPendingWrite(service, handoff)`; an execution that no longer owns its registration makes no proposal
(`PROPOSAL_NOT_MADE`) and touches nothing.

Residual (stated): a joiner that joins while the old write's proposal turn is in flight at the port (PROPOSED) joins
inherited work; if the port then answers the typed deferral (nothing entered), that write is released at its next
retry and the joiner receives that release. The window is the port's deferral turn (a settled turn for
TRANSFER_IN_PROGRESS / USER_TRANSACTION_OPEN).

Finding for the placement-admission and formation owners (not edited): `proposePlacementCommand` (:257-265) and
`proposeFormationCommand` (:546-558) keep `pendingFingerprints` by entryId and clean up by VALUE
(`pendingFingerprints.get(entryId) === fingerprint`) when their commit promise settles. When a write is released and
the same request re-registers under the same entryId before the old promise settles (the join above; also a
role-edge release followed by an immediate retry), the old cleanup deletes the new write's fingerprint, and a later
same-entryId request is refused ERROR.BYTES / INVALID_COMMAND instead of joining. Fix there: clean up by the commit
promise's identity (delete only if the map still holds this write's own token).

### 14.2 Read-check scope (kept as implemented)
`partitionWriteLeadershipRefusalOf` refuses NOT_LEADER on ANY identity change of the tenure inside its status read,
including null -> T (the replica became leader inside the read): a write submitted before a tenure existed was
decided before this replica led; its owner retries under the tenure. Witness: `partition-write-kernel-tenure-fence.test.js`
"kernel tenure fence (read scope)" (a follower made leader by the port's LEADER event inside the kernel's read: the
first check answers NOT_LEADER, the second, under the minted tenure, null). Added after `a5bf01004`, so it is green
on the repair; at `8e84e2801` (no read compare) it would answer null the first time (INFERRED, not executed).

### 14.3 Question for the participant owner (not changed): staging sessions across a renewal
- Schedule: a leader stages a participant session (BEGIN, statements) and seals it (PREPARE command built, maybe
  proposed and deferred); the term renews without a role edge; the coordinator re-sends PREPARE.
- What a renewal is: leadership lost and regained between two announcements (section 1). A role edge runs
  `releasePendingWrites`, which also runs `discardParticipantSessions` (`partition-service-raft-lifecycle-wiring.js:49-54`);
  a renewal runs neither, so the session, its staged operations and its sealed PREPARE bytes are KEPT. The kernel
  fence releases the PREPARE write if it was not yet handed to consensus (`keepsSealedSession` keeps the session
  for the re-send, `partition-participant-transaction-request.js:335-356`).
- What could go wrong: the kept session was staged and sealed under the earlier tenure; the re-sent PREPARE is
  proposed under the new one with the same sealed bytes. Safe only if the PREPARE's apply re-validates everything
  the earlier tenure decided (generation base, row keys, reservations, release admission): `sealSession` says
  "Advisory: the apply is the authority over the carried base". Questions: does any staged fact NOT re-validated at
  apply depend on the leadership that staged it (e.g. a read inside the session served by the old tenure, the
  release-admission generation, the determinism self-check run "once as the replica becomes the leader")? If so,
  a renewal must discard sessions like a role edge does. Witness shape: stage and seal under term T, renew to T+1
  (TERM_CHANGE only), re-send PREPARE, then assert either the session was discarded (outcome UNKNOWN/ABSENT as on
  demotion, the "TX1 inc4 demotion" test's facts) or the applied PREPARE re-validated every staged fact.

### 14.4 Open item for the lead: one unexplained red
`test/partition/partition-runtime-reconstruction-leadership.test.js` subtest 5 (W-B6-3) failed once, first failure of
`lab/kernel-green-a5bf0100` (log `a5bf010046a3-mwqs7ktu-1905803-adam-laptop.log`, `test-results.ndjson`), assertion
at line 696: `'the registered release owner revalidates the healed leader'` (`false !== true`: the group's
`waitFor` over `leaderOf()` and `participantCutoverPauseOf(current) === null` expired). It passed in five later runs:
`lab/kernel-green-a5bf0100-run2` (full set), `lab/kernel-attr-recon-a5bf0100-1`, `-2`, `lab/kernel-attr-recon-c9d8896f-1`,
`-2` (and in `lab/kernel-red-0bb5c473`). Chase as a flake with this evidence retained; no kernel path found in the
revalidation it waits for (section 12).
