# Verification: write kernel tenure fence (a5bf01004)

Verifier: independent subagent, 2026-11-21. Read-only; nothing executed on this machine. Subject:
`work/write-kernel-tenure-fence-20261121` = `a5bf010046a33f51842d1e6dfe146bcce2e3b575` over
`8e84e2801987b162359de39ef35e54aaf8462261` (witnesses `0bb5c47388440a87f091556b7f2225238dad7b7b`,
`c9d8896f9fd144e6f92b0d88fbe948b36710198f`). All file:line references are at a5bf01004.
Markers: VERIFIED = read at the path named (or read in the lab file named); INFERRED = reasoned, not executed.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging a5bf01004 into the integration line.

The repair does what it claims for the two states it targets (deferred, parked) and I found no schedule in
which it loses an acknowledged write, duplicates one, or answers "not proposed" for bytes that consensus or
the port still holds. It does not by itself satisfy the owner's contract "the fence at the actual admission
boundary" (finding 3), and its release is keyed by entryId rather than by the hand-off, which lets a stale
hand-off release a current-tenure write (finding 2); that second point becomes deterministic under the
lead's ruled join closure.

Conditions:

1. Before (or in the same change as) the ruled join closure: bind the fence's release to the hand-off that
   owns the pending write (finding 2), with a witness.
2. The owner's contract is not reported closed while witness c is red: the raft owner's port-side fence
   (record section 7) is required for it (finding 3).
3. Lead rulings recorded on the null tenure (finding 4) and on staging sessions across a renewal (finding 5).
4. The suites in the last section run on the merged tree.

## Findings

### 1. Double apply through the port-held proposal: not introduced by this change (VERIFIED by read)

The question: can the kernel answer NOT_LEADER ("nothing proposed", caller retries) for a write the port
still holds and later forwards and commits?

No. The fence's answer is built from the proposal state the queue holds at the release
(`partition-write-kernel.js:391-408`): QUEUED gives NOT_LEADER, PROPOSED gives OUTCOME_UNKNOWN. The state
is:

- set to PROPOSED synchronously before the port is called
  (`partition-service-raft-write-commit.js:107` then `:111`; no await between the tenure compare `:90`, the
  mark and `raft.propose`);
- returned to QUEUED in exactly two places: `:116`, after the port's promise for that proposal resolved
  with a typed deferral; and `reparkReservedWrite` `:329`, at the apply of the write's own committed entry,
  which the reservation consumed without effect on every replica
  (`partition-participant-transaction-apply.js:711-717`).

The port's two typed deferrals (`portDeferralOf` `:75-80`: HOST_FAILURE, `recoveryRequired === false`,
reason USER_TRANSACTION_OPEN or TRANSFER_IN_PROGRESS) are produced only where nothing reached the core:
`raft-rs-runtime-owner.js:1987-1990` (before the core is entered; the only non-recovery
USER_TRANSACTION_OPEN host failure, the other producers at `:285`, `:611` go through `groupHostFailure`
with `recoveryRequired: true`, `:218-220`) and `answerRefusedProposal` `:1707-1714` for a proposal the core
refused (`:1785-1787`, `:1845-1849`). A proposal queued inside the port (`:2146-2152`) is spliced out of
the port's queue before its deferred is answered (`:2117`), so when the kernel sees a deferral the port no
longer holds the bytes.

So a write the port holds, or that the core forwarded (witness c), is always in state PROPOSED: any release
answers it OUTCOME_UNKNOWN, and its commit answers it under its own entryId. A caller that retries an
OUTCOME_UNKNOWN under a fresh entryId can still apply twice; that is the kernel's existing documented
contract (`partition-write-kernel.js:66-78`), unchanged here.

A client that already holds an acknowledgement cannot be affected: an answered write is no longer response
pending and `releaseEntry` returns false for it (`proposal-queue.js:282-286`).

### 2. DEFECT (new behaviour, narrow today): the fence releases by entryId, not by hand-off (INFERRED)

`releasedOnEndedTenure` (`partition-service-raft-write-commit.js:89-97`) has no state check and no
ownership check: it releases whatever pending write the queue holds under `handoff.entry.entryId`.

Minimal interleaving:

1. W1 (entryId E) is parked under tenure T1; a decision applies and readmits it
   (`readmitReservedWrites` `:311-313`, `void handOffToConsensus`); the port defers it; its hand-off H1
   (tenure T1) sleeps up to 100 ms in the retry loop.
2. E's queue entry is released (role edge, commit deadline, or the ruled release-at-join). The parked
   execution awaits only `commitPromise` (`:405`), so it returns at once: the outcome record and
   `WRITE_HANDOFFS` entry are cleared while H1's loop still sleeps.
3. The replica leads under T2 and a caller registers E again (hand-off H2, tenure T2). Its first propose is
   synchronous with the registration, so the queue state for E is PROPOSED.
4. H1's timer fires: `:90` T1 !== T2, `:93` releases H2's pending write. H2's caller is answered
   OUTCOME_UNKNOWN with cause leadership-lost for a current-tenure write that consensus holds (or
   NOT_LEADER when H2 is itself deferred or parked).

Before the repair step 4 re-proposed the same bytes under E (a duplicate entry, idempotent at apply). After
it, a handed-over current-tenure write is disowned. The direction is safe (nothing lost, nothing applied
twice when the re-delivery carries E), but it contradicts "work handed to consensus completes under its
existing identity", and no code enforces the claim "the release cannot touch a handed-over write": that
holds only structurally.

Reachability at a5bf01004: only the parked-then-readmitted-then-deferred path, with a new tenure and a
re-registration inside the 100 ms sleep (a fast re-election, in practice a sole voter). On the non-park
path the execution awaits the hand-over loop (`:388`), so the outcome record survives and all seven callers
join instead of re-registering. Under the lead's ruled join closure (release the old write at the join,
then register the new one) step 2-4 happen every time on both paths.

Minimal fix: release only when the hand-off still owns the entry, for example
`WRITE_HANDOFFS.get(service)?.get(entryId) === handoff` before `:93` (return true without releasing
otherwise), or key the queue release by the pending registration. Witness needed: a stale hand-off's retry
against a re-registered E under a new tenure leaves the new write pending.

### 3. Contract gap (author-acknowledged): the fence is one layer above the admission boundary (VERIFIED by read; witness c red in all runs)

`proposeUnlessDeferred` is the only call of `raft.propose` in `src/partition` (grep at a5bf01004: one hit,
`:111`; the other two in `src` are the message-group and wasm services' own). Its callers are
`handOffToConsensus` from the first hand-over (`:388`) and the readmit (`:312`); there is no batch path in
the kernel. Claim 1 of the author holds at the kernel.

Between the kernel's compare and the core's `propose` (`raft-rs-runtime-owner.js:1830`, `:1838`) lie the
port's queue (`:2146-2152`) and the turn's inbound drain (`:2002`), which can depose the core first. The
kernel's view also lags the core inside a turn: the role and term are announced at the end of `drainReady`
(`:1340`, `:1398-1415`), after committed entries were applied. Two consequences beyond the record:

- Every readmit runs inside a consensus turn (`partition-participant-transaction-apply.js:413-417`,
  `afterCommit` of the decision's apply), so `group.tail !== null` and **every readmitted parked write is
  port-queued**: the unfenced path of witness c is the normal path of parked writes, not a rare one.
- A status read that cannot settle synchronously answers the last recorded observation
  (`:1560-1578`): a first propose can pass the kernel's read and fence while the core is already deposed in
  the suspended turn.

In both the write is PROPOSED, so finding 1 holds (no misreport). But "no fresh decision authorized by an
expired tenure; the fence at the actual admission boundary" is met only with the raft owner's edit.

### 4. Null tenure: `null === null` is "same tenure" (pre-existing hole, not closed) (VERIFIED by read; reachability INFERRED)

`:90` passes when both are null. Subcases:

- Registered while not leading, replica leads later: null !== T, released NOT_LEADER. Closed by the repair.
- Registered while not leading, readmitted while still not leading: proposed by a non-leader; raft-rs
  forwards it (`raft-0.7.0/src/raft.rs:2312-2321`). Unchanged from the base.

A registration without a leadership read exists: the reserved branch of `startAdmittedPartitionWrite`
(`:485-486`) parks before `partitionWriteLeadershipRefusalOf`; FORWARD_WRITE reaches `applyWrite` with no
role check (`partition-service-entry-apply-base.js:474-476`); the readmit runs on every replica. The only
upstream guard is the cutover pause (`:479`), whose open admission is bound to a term and leader id
(`partition-participant-transaction-pause.js:219-233`); whether an admission can be open on a non-leader I
did not trace. The role-edge release covers follower, leader, follower again.

Recommendation: treat a null tenure as ended (one condition in `releasedOnEndedTenure`). It needs the
lead's ruling because fixtures that fake leadership without a LEADER event register with null.

### 5. PREPARE: the kept sealed session makes the fence nominal for PREPARE; no DECISION over unprepared state (VERIFIED by read; consequences INFERRED)

A DECISION never applies over staging: with no row, COMMIT of a session is refused NOT_PREPARED
(`partition-participant-transaction-request.js:511-515`), COMMIT while PREPARING is refused PREPARING
(`:546-548`), a bound ROLLBACK ends the session and proposes its tombstone (`:516-519`); with a row the row
decides (`:487-506`). The schedule asked for does not exist.

The asymmetry is real: a role edge discards sessions (`partition-service-raft-lifecycle-wiring.js:49-54`);
the fence's release answers NOT_LEADER, which `keepsSealedSession` keeps (`:335-338`). Schedule: PREPARE
sealed under T1, deferred; renewal to T2; fence releases it; the coordinator re-sends; `prepareSession`
finds `session.sealed !== null` and skips the release fence and the topology check (`:413-425`), then
proposes the T1-sealed bytes as a new registration under T2. The comment there ("a sealed command already
submitted") is no longer true of a fence-released PREPARE. Before the repair the kernel's own retry did the
same, so this is not a regression; safety rests on the apply validating the carried base (not re-verified
here). It is the participant owner's ruling, as the author says, but it should be stated as: for PREPARE
the tenure fence changes who re-proposes, not whether T1-staged bytes enter under T2.

### 6. The seven callers (census VERIFIED; continuations partly INFERRED)

Census re-derived by grep: `startPartitionRaftWriteCommit` is called at
`partition-placement-admission.js:258`, `partition-cdc-obligation.js:410`,
`partition-coordinator-settlement.js:68`, `partition-participant-transaction-request.js:220` and `:749`,
`membership-publication-formation-transition-command.js:548`, and through `startAdmittedPartitionWrite`
from `partition-service-write-metrics-base.js:736`. Seven. Confirmed.

- (a) User SQL: the answer is the typed retryable NOT_LEADER with the entryId; nothing was acknowledged,
  nothing proposed (finding 1). The router's retry and its entryId were not traced (INFERRED, as the author).
- (b) CDC: the pending command stays in `lane.commands`; a non-current lane ends NOT_LEADER
  (`partition-cdc-obligation-delivery.js:236-238`), a current one schedules the delivery retry (`:264-265`).
  VERIFIED to that point; the new lane's re-derivation from durable obligations was not read.
- (c) Finding 5.
- (d) Settlement: null from `applySettlement` ends the pass with no release authority
  (`distributed-transaction-release-settlement.js:218-272`), one attempt per pass. The loop that re-runs
  the pass was not traced.
- (e) Generation origin: refused answer returned (`:735-752`); the retry was not traced.
- (f) Formation: the latch attempt is kept unless settled terminal
  (`membership-publication-coordinator-persist.js:186-189`). The wake that submits it again was not traced.
- (g) Placement: the intended fence; `submitPlacementAttempt` read (`replica-placement-owner.js:388-406`),
  the wake after NOT_LEADER (LEADERSHIP_START, the 60 s resync) not verified. A renewal emits no
  LEADERSHIP_START, so the delay the author names is the resync.

### 7. The leadership read (`:450-463`) (VERIFIED by read)

No livelock: it refuses only when a role or term event is delivered inside that one read; a steady state
delivers none. It does refuse when the replica becomes leader inside the read (null to T), by design.

The author's statement that no caller calls consensus between the read's return and the registration is
wrong for placement (`partition-placement-admission.js:241`) and formation (`...-transition-command.js:520`):
`pausedWriteAnswerOf` reads the status again (`partition-participant-transaction-pause.js:227-233`). It is
harmless there: a term that changes inside that read no longer matches the admission's proof and raises
the pause.

### 8. The premise (VERIFIED by read, schedule not executed)

raft-rs 0.7.0 raises a term only in `become_candidate` and `become_follower`; `become_leader` keeps it
(`raft.rs:1126-1203`). The reachable renewal without a role edge: a shared-runtime replacement does not
announce a role loss (`invalidateRuntimeGroups`, `raft-rs-runtime-owner.js:586-594`, keeps `lastStatus`), a
sole voter campaigns in `resumeAfterReconstruction` (`:557-558`) and announces LEADER at T+1 against LEADER
at T. A single group's own failure does announce the loss (`groupFailed` `:199-216`). The demotion and the
release are one synchronous step (`replica-leadership-state.js:161-170`,
`partition-service-raft-lifecycle-wiring.js:87-96`); the only window in which neither fires is the
unannounced one of finding 3.

### 9. Leak accounting (VERIFIED by read)

The release clears the queue entry and the commit deadline (`proposal-queue.js:189-199`, `:282-295`); the
pending outcome clears when the execution returns (`partition-service-cdc-stream-base.js:373-378`); the
hand-off and its parked entry are forgotten in the `finally` (`:181-188`, `:345-347`); a readmit empties
the parked map before handing over (`:309-310`). The same holds for a re-parked write. A deferred write's
retry sleep stays armed until it next fires (at most 100 ms), then returns PROPOSAL_NOT_MADE.

Shutdown: the tenure is ended at `partition-service-lifecycle-methods.js:198`, the release runs at `:210`
after an await. A deferred write whose retry fires in between is answered NOT_LEADER instead of
SERVICE_SHUTDOWN. Both are retryable and unproposed; cosmetic.

### 10. Join (question 7)

At a5bf01004 a join cannot hand a new-tenure caller a wrong definite answer: it hands the true outcome of
that entryId, which for an old deferred or parked write is the retryable NOT_LEADER. The cost is the delay
of finding 6 (g). The ruled closure must carry condition 1.

## Evidence (VERIFIED in the lab files)

All runs on adam-laptop, check base 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c; the sha in each
`selection.json` and log file name matches the commit.

| Witness | Before | After (`kernel-green-a5bf0100`, and `-run2`) |
|---|---|---|
| a placement deferred | `kernel-red-0bb5c473` log :732 not ok 1 | `placement-owner-authority-write-kernel.test.js` ok, 2 assertions |
| e (+f) ordinary deferred | `kernel-red-0bb5c473` log :333 not ok 1, `enteredUnderRenewedTerm: 1` | `partition-write-kernel-tenure-fence.test.js` ok, 4 assertions |
| b (+f) parked | same log :383 not ok 2 | same file ok |
| g ordinary, renewal inside the read | `kernel-red-g-c9d8896f` log :132 not ok 4 | same file ok |
| d preservation | ok 3 in both red logs (:443, :126) | same file ok |
| c port-queued | not ok 1 (:467) | not ok 1 in both green runs (:490, :338) |

Regression set (28 files): the placement base failures have the same case numbers and names in all three
runs (dt-placement-owner-formation-drain 4, 10, 11; placement-owner-construction-orders 4, 5;
placement-owner-authority-barrier 2; replica-placement-owner-core 18). I compared case lines, not the
assertion bodies. Those cases cannot show a regression the kernel change might add to them.

`partition-runtime-reconstruction-leadership` test 5: failed once (`kernel-green-a5bf0100` log :359-376,
"the registered release owner revalidates the healed leader", 10.2 s, file took 41.0 s against 29-33 s
elsewhere); passed in `-run2`, `kernel-attr-recon-a5bf0100-1/-2`, `kernel-attr-recon-c9d8896f-1/-2` and in
the baseline `kernel-red-0bb5c473`. The wait at test `:696-700` needs a leader whose cutover pause is
lifted; the origin was recorded before the failure (`:670-672`), so the enable path proposes nothing
(`partition-participant-transaction-request.js:737-740`) and the resume reads status only. I agree the
kernel change is an unlikely cause (INFERRED). One failure in four runs against none in three does not
separate the two sides. The record's "at c9d8896f9 in the full baseline" is inexact: the full baseline ran
at 0bb5c4738 (same src).

## Author claims not confirmed

- The router's retry of NOT_LEADER and the entryId it uses.
- The loops that retry settlement and the generation origin; the wake that re-submits the formation latch.
- The placement wake after NOT_LEADER and the 60 s resync.
- The new CDC lane's re-derivation of owed acknowledgements.
- The sole-voter renewal schedule as an executed fact (read only).
- "No caller calls consensus between the read and the registration" (false for placement and formation,
  finding 7).
- The reference-system descriptions other than raft-rs.

## Not exercised by any witness

The stale hand-off against a re-registered entryId (finding 2); a null tenure (finding 4); a re-parked
write across a renewal; a port deferral answered after the renewal (record section 3, last row); a release
at shutdown; a readmitted write that is then deferred.

## Suites to run on the merged tree (lab, not this machine)

Run after the repair (28 files, listed in `kernel-green-a5bf0100/test-results.ndjson`): the kernel,
proposal queue, typed releases, leadership transfer (both), commit deadline, participant staging,
replicated apply v3, replay cursor v4, coordinator settlement, CDC obligation, stale topology guard,
placement growth identity, the placement authority set.

Obviously relevant and NOT run:

- `test/partition/partition-participant-transaction-apply.test.js` (readmit and repark)
- `test/partition/partition-participant-release-admission.test.js`,
  `participant-release-first-prepare-native`, `-prepared-settlement-native`, `-deadline-recovery`,
  `-protocol`, `-control-three-member`
- `test/partition/partition-participant-transaction-topology.test.js`
- `test/partition/placement-retained-leadership.test.js`
- `test/partition/write-path-epoch-fencing.test.js`
- `test/partition/settled-replay-preserves-result.test.js`, `committed-statement-outcome.test.js`
- `test/partition/partition-cdc-delivery-progress.test.js` and the other `partition-cdc-obligation-*` files
- `test/partition/proposal-queue-capacity.property.test.js`, `proposal-queue-size-invariant.property.test.js`
- `test/partition/managed-split-resume-under-write-load.test.js`, `split-source-participant-ack.test.js`
- `test/raft/raft-rs-backend/transfer-leadership-write-path.test.js`,
  `transfer-leadership-drop-classification.test.js`, `test/raft/leadership-transfer-single-path.test.js`
- the formation transition and latch suites, and the distributed-transaction suites that drive
  PREPARE and DECISION end to end
- `partition-runtime-reconstruction-leadership` repeated (at least five runs under the full-set load)
