# Re-verification: placement owner corrective round (stages 1-2)

Verifier: independent subagent, 2026-11-21, read-only. Subject `work/placement-owner-repair-20261121` at
`8e84e2801987` (commits `abd8506f3`, `87a34cb4d`, `8e84e2801` on top of `b92a5d6ce`). Nothing was executed
here; executed evidence is the retained lab output (tv-dator, sha-bound by `placement-head=`).
VERIFIED = read at the path and line named, or seen in a retained log. INFERRED = reasoned from what was read,
not executed. Line numbers are those of the file at `8e84e2801` (`replica-placement-owner.js` unless named).

## Verdict

**APPROVE-WITH-CONDITIONS** for merging `8e84e2801` into the integration line.

Every source change of the round is an added check or a containment; none widens what an ended tenure can do.
The new behaviour (per-candidate isolation) is safe because the ledger's applier, not the owner's pass
accounting, refuses a busy partition, an unresolved ledger transition and copy capacity at commit
(`partition-placement-admission-decision.js:165-174, 202-235`, VERIFIED). The conditions are about what the
round claims or leaves unwitnessed, and about two items that stay red for other writers.

Conditions:
1. (carried, gates any "stage 1 complete" or release claim, not this merge) Barrier fact: witness
   "barrier and the production definition" is red at head by design. The integration line carries a custody
   that can wait for ever on a quiet ledger until the raft owner's field lands; the fixture model
   (`LedgerLog.currentTermApplied`) must change in the same step and that witness must turn green.
2. (carried, other writer) Kernel fence: the write-kernel probe is red at head.
3. Isolation follow-ups (finding N1-N4 below): a ruling on trigger retention after a candidate failure (it has
   no witness, does nothing for planning, and switches the resync acceptance counter off for the custody); a
   failure after a proposal was made must not be named and treated like one before it; the record must say
   that isolation does not cover the starvation the first verification named.
4. Evidence: run the owner-exercising files of the stage-2 selection that were not re-run at head (N7), with
   per-case output retained (first verification's condition 7 is still open).
5. Record section 22, row 2c: the statement "no schedule here produces a retained REFUSED across a transfer"
   is not confirmed; a schedule is given below (N5). Either witness it or state that the checkpoint on that
   row carries no weight.

## 1. First verification's findings 1-6 at `8e84e2801`

| # | Finding | State | Where |
|---|---|---|---|
| 1 | Barrier fact false again after a configuration change | OPEN in the fact (other writer); wake witness CLOSED | The owner still reads `currentTermApplied` once per custody and latches (`:698-708`, `replica-placement-owner-tenure.js:58-61`). Fixture now models the production definition (fixture `currentTermApplied`, `appendConfigurationChange`). "barrier wake" green before and after; "production definition" red before and after (per case, both logs). Condition 1 of the first verification ("replace the fact or show the interleavings unreachable") is met by neither: the red witness shows interleaving (b) reachable in the model. |
| 2 | Fence not at the kernel boundary | OPEN (other writer) | Probe `not ok 1 - kernel: ...` at head (log line 692). Port-queued proposal added to the stop item (record 24). |
| 3a | Status read between fence and propose | OPEN (other writer), recorded | Record 24. Unchanged code. |
| 3b | Second drain of one custody from a notify inside the synchronous prefix | CLOSED | `:306-310` assigns `custody.running` before `drainCustody` is called; invariant stated `:297-300`. Witness "drain start": red before (`max in flight 2`, before-log line 142), green after (after-log line 215, per case). |
| 4 | No checkpoint after `await readPassCensus` | CLOSED | `:739-740` `AFTER_CENSUS`. Witness "census read": red before (`1 !== 0` constructions after the tenure ended, before-log line 53-62), green after (file level). The record's two false sentences are corrected in section 22. |
| 5 | Throw path unwitnessed; 60 s recovery; factory-less path; poisoned pass; resync counter | PARTLY CLOSED | Retention witness: P3(i) now asserts the next wake's pass carries the failed pass's triggers and `placementResyncAdmissions === 0` (wakes test `:221-230`); green before and after, so it is a strengthened witness, not red-first. 60 s recovery in a quiet cluster: unchanged, now also for a failed candidate. Factory-less owner without resync: open, handed to stage 3 (record 21). Poisoned pass: only partly closed, see N3. Resync counter with retained triggers: open and widened, see N1. |
| 6 | Witness state (3 red, 4/5/13 vacuous, missing witnesses, per-case output) | CLOSED except per-case output | See section 6. Per-case output for passing files is still not retained (author states it). Still without witness: the second REMOVE read's checkpoint, A4′, the barrier re-check. |

## 2. Await table, enumerated at head

Every `await` and every synchronous foreign call in the drain and the pass, with the check that follows:

| Point | Line | Next check before authoritative action or construction |
|---|---|---|
| drain: `await runPass` | `:325` | loop condition `isCustodyCurrent(custody)` `:336`, restart guard `:340`; between them only bookkeeping on the captured custody `:327-329` |
| pass start (synchronous from the drain) | `:738` | `PASS_START` |
| F1 status read (foreign, may run a consensus turn) | tenure.js`:59` via `:701` | re-check `:707` on the latch path; the false path returns |
| F2 CDC drive, synchronous prefix (foreign) | tenure.js`:93-94` via `:456` | NONE before `reconcilePlacementAttempts` `:458-462` and `custody.reconciled = true` `:463`; next check `BEFORE_HOLD_RELEASE` `:409` or `AFTER_CENSUS` `:740` |
| A2 `await submitHoldRelease` | `:372` | `:396` (before attempt bookkeeping), `:373` |
| `await readPassCensus` | `:739` | `:740` |
| node inputs, storage and cache reads (local collaborators, synchronous) | `:742-744`, `:718`, `:504` | same turn as `:740` |
| `await proposeCandidateIsolated` | `:669` | inside: `:629`; after: `CANDIDATE` `:665` or `BEFORE_HOLD_RELEASE` `:409`; `:672-676` (counter, busy set, occupancy) run two async returns after `:629` unguarded: pass-local bookkeeping |
| A3 `await isCandidateAdmissibleNow` | `:615` | `:617`; REMOVE reads remove.js`:39/:42/:45` then `:40/:43/:47` |
| A4 `await submitPlacementAttempt` | `:430` (`:392`) | fence `:380`; `:396`; `:431` |
| A4′ re-admission | `:441` | fence `:380`; `:442` (result discarded); `:629` |
| A5 `await submitHoldRelease` | `:652` | `:653` |
| `await planAndAdmit`, `await runPassSteps` | `:748`, `:756` | `completePass` keeps a stale stop; snapshot guard `:762` |
| late drive answer | tenure.js`:96-103` | frees the request slot only |

Compared with record section 22: the table is correct for every await (VERIFIED). One omission: F2. The CDC
drive is no longer awaited, but its synchronous prefix is foreign code
(`partition-cdc-obligation-delivery.js:610-618`), and the reconciliation that follows deletes settled attempts
from the owner-level map and the durable store with no tenure check. What it deletes are settled facts and
nothing is proposed, so this is a table omission, not a defect (INFERRED).

## 3. Findings on the new behaviour

### N1. Trigger retention after a candidate failure: unwitnessed, inert for planning, and it blinds the resync counter
- Code: a pass with any failed candidate re-adds all its triggers to the custody (`:326-329`).
- Triggers are read by nothing but the snapshot and `resyncOnly` (`:728`); planning is always from the full
  census. Retention therefore re-attempts nothing by itself: the re-attempt comes from the next wake, and in a
  quiet cluster from the 60 s resync (none on the factory-less owner).
- Interleaving: candidate P fails in every pass (deterministic). Pass 1 `{LEADERSHIP_START}` -> retained.
  Pass 2 `{LEADERSHIP_START, LEDGER_COMMIT}` -> retained. The set only grows. Every later pass woken by the
  resync alone carries retained triggers, so `resyncOnly` is false and `placementResyncAdmissions` stays 0
  for every partition of the custody, although the timer caused the admission. The sealed contract uses
  that counter as its missed-wake signal. The snapshot's `triggers` becomes the union of everything seen.
- No witness: "poisoned candidate" does not look at triggers; P3(i) covers the catch at `:331` only.
  Removing `:326-329` fails nothing (INFERRED from the test text).

### N2. `CANDIDATE_FAILED` can name an admitted operation
- Classification is by position, not by error type: `:637-644` catches everything thrown inside
  `proposeOrderedCandidate` and rethrows nothing.
- No tenure loss is signalled by exception on this path: the owner's fence and the write kernel answer typed
  (`:380-383`; `partition-service-raft-write-commit.js:242-262, 377-388`, VERIFIED). A REMOVE read that throws
  because leadership was lost is recorded as a candidate failure, not a stale stop; the next iteration's
  `CANDIDATE` check stops the pass (miscount only, INFERRED).
- After-proposal schedule: admission of P1 commits ADMITTED; `deleteUnresolvedPlacementAttempt` (`:399`, a
  local SQLite write) throws -> P1 is recorded `CANDIDATE_FAILED`; `:672-676` are skipped (busy set, copy
  occupancy, `ledgerIncomplete`, the A5 hold release); the pass goes on and proposes P2 from accounting that
  misses P1. The applier refuses P2 where it matters (target or source at capacity, ledger transition
  unresolved), so no duplicate and no over-allocation; the cost is one committed REFUSED entry per remaining
  candidate, the operation id missing from the pass's `admitted`, and a ledger hold released one pass late.
  Before the round the same throw aborted the pass and proposed nothing further (INFERRED, not executed).
- Minimal repair: a failure of a candidate for which this pass made a proposal ends the pass (the census
  must be re-read), or is recorded under a name that does not say "failed".

### N3. Isolation does not cover the starvation the first verification named
`proposeCandidateIsolated` covers the admissibility read, the statement build, the attempt record and the
submission. The first verification's examples (one bad PARTITIONS row, one failing capacity read) are in
`evaluateAllPartitions` (`:500-527`) and `readStorageExcludedTargets` (`:471-483`), outside the loop: they
still abort every pass and starve every partition for the tenure, visible only as `ABORTED` and a warn line.
The record says "a failure outside the candidate loop still aborts the pass"; it should say that this is
the case the finding was about. The A5 hold release (`:677-679`) is inside the loop and outside the isolation.

### N4. Retry and visibility of a failed candidate
- Bound claimed (one failure per candidate per pass, one pass per wake): VERIFIED (`:320-336`, one candidate
  per partition per pass). Recording the failure emits no wake: `recordCandidateFailure` and the warn line
  only; `WRITE_PATH_RELEASED` is emitted by the cutover pause alone
  (`partition-participant-transaction-pause.js:285`). No hot loop (INFERRED; "no spin" asserted in the witness
  as at most 5 passes in 500 ms).
- No backoff and no rate limit: a failure common to all candidates logs one warn line per candidate per
  wake, message only, no stack; the pass reports `READY` / `COMPLETED` with `failedPasses` unchanged.
- Visible: `failedCandidates {partitionId: message}` on the failing pass's snapshot and
  `totals.failedCandidates`. The snapshot carries no `retainedTriggers` for this case (only `ABORTED` does).
  `totals.failedCandidates` is asserted by no test.
- Not from this round, made more relevant by it: `resolveAttempt` puts the attempt in the in-memory map
  before the durable write (`:168-169`). If the write throws, the candidate fails; on the next wake the
  retained attempt is found (`:158-159`) and proposed without a durable row (INFERRED).

### N5. A4′ has a schedule (record claim not confirmed)
A retained attempt answered with a committed REFUSED needs (a) an attempt whose earlier answer was not a
committed one and (b) a commit by another proposer between the pass's census and the attempt's apply.
With the fixture's existing tools:
1. A leads; `dropNext` drops its admission E of the deficit; the pass waits at A4.
2. B is elected and deposed inside its holdoff (`heldAcrossABA`): E's write is released, E stays retained (`:396`).
3. A leads again with `holdNextAdmissibilityCheck(a)` armed: reconciliation keeps E (never committed); the pass
   is held at A3.
4. While held, an admission for the same partition is committed through the entry that carries no tenure
   (`requestPlacementAdmission` on A's ledger: the routed PLACEMENT_ADMIT surface).
5. Release: `:617` passes, E is proposed, the applier answers REFUSED PARTITION_BUSY
   (`decision.js:221-223`), `hadRetained && isCommittedRefusal` -> fresh attempt F proposed (`:435-441`).
6. Drop F and transfer A -> B: F is released; the pass stops stale at `A4R_AFTER_READMISSION`.
INFERRED, not executed; whether the fixture accepts step 4's body was not checked. Weight: the checkpoint at
`:442` discards its result and is followed by `:629` and `:665`; removing it changes only the stale label.
The checks that matter on this row are `:431` before the fresh proposal and the fence.

### N6. Bounds: the two stated unbounded cases are not the only ones
- Custody ended without a raft edge (detach `:783-788`, shutdown `:206-208`, a sink re-drive): same mechanism as
  the renewal, nothing releases the pending write.
- The write's answer is given only after its post-commit side effects
  (`partition-service-raft-write-commit.js:404`); no edge releases that wait (INFERRED, plan not traced).
- REMOVE has three reads (remove.js`:39, :42, :45`); I found no time bound in the evaluator and did not trace
  the workflow owner's read. The read timeout stays the author's inference.
- "No constant bound" for a write is overstated if the proposal queue's commit deadline is fixed
  (`write-commit.js:142-145`); the value was not traced. None of these has an executed witness.

### N7. Evidence gap at head
The head run selected 12 files; the stage-2 run at `b92a5d6c` selected 17. Not re-run at `8e84e280` although
the owner's drain and pass changed: `test/raft/raft-rs-backend/formation-learner-placement-reversal`,
`formation-placement-lease-authority`, `formation-placement-native-retirement` (green at `b92a5d6c`),
`replica-placement-owner-clearing-triggers`, `growth-promote-authoritative-completion-and-progress`,
the provisioner witness (red at `b92a5d6c`).

## 4. Drain entries (check 4)
Two callers of `drainQueue`: `notify` (`:294`) and the drain's own `finally` (`:341`). `drainCustody` is called
from one place, after the mark (`:308-309`). Between the decision and the mark there is one field read
(`leadershipTenure`, a plain field, `replica-leadership-state.js:39, 50`) and a set size: no foreign call
(VERIFIED). The mark is cleared in `finally` (`:338`) on every exit of the drain, before the restart at `:341`.
Two drains for one custody: no path found. A mark left set: only by a pass that never settles (a write answer
or a read that never returns), which is the single-flight shape from before this round. A rejection of the
drain (only if the warn call at `:332` or the `finally` throws) is unhandled at `notify`, as before.

## 5. Barrier latch (check 5)
The latch is a field of the custody object (`:705`); a custody is created only in `beginCustody` (`:191`) and
is current only by identity (`:135-138`). A latch set under one tenure cannot be read under another, also
when the same token gets a second custody (sink re-drive). The re-check (`:707`) is after the latch; a stale
latch is on a custody that can never be current again (VERIFIED). Reachability of the re-check: the read
returns true only for a leader at the tenure's term, so it fails only when the custody was ended by a sink
call or the token re-minted at the same term inside the read: near-unreachable (INFERRED).

## 6. Re-staged witnesses (check 6)
| Witness | Premise asserted | Second candidate | Notes |
|---|---|---|---|
| 3 | yes (`reached.pass.done === false`, read in the same turn as the successor's count) | `SPEC_TWO` | asserts no attempt by the held pass; attempts are recorded before the fence (fixture `:457-462`) |
| 4 | yes | `SPEC_TWO` | one stale stop at `A3_AFTER_ADMISSIBILITY`; deciding tenure is the current token |
| 5 | yes (inside the wait predicate) | `SPEC_TWO` | |
| 13 | yes, at each of six transfers (`leaderPassOutstanding`, dropped proposal of the current term) | `SPEC_TWO` | bound asserted: one pass and one write outstanding, no obsolete pass, after every transfer; five fields compared; timers kept |
No witness asserts that the second partition is a candidate of the held pass (INFERRED from the
"poisoned candidate" red log: `evaluated 3, candidates 2` in the same shape of world). The second candidate adds
no kill power alone: `CANDIDATE` (`:665`) precedes it.

## 7. Lab evidence (check 7)
- Before: `por-corrective-red-87a34cb4`, head `87a34cb4d910`; `git diff b92a5d6ce 87a34cb4d -- src` is empty
  (VERIFIED). After: `por-corrective-8e84e280`, head `8e84e2801987`. Red run 17:06Z, repair commit 18:40
  local, green run 17:44Z: red-first in commit and in execution order.
- Red before, per case: await-points 4 "census read"; barrier 3 "drain start"; wakes 7 "poisoned candidate"
  (snapshot `ABORTED`, `candidates 2`, `proposals 0`); barrier 2 "production definition".
- Green before, per case: await-points 5 "A3 REMOVE, third read"; wakes 4 P3(i); barrier 1 "barrier wake".
- After, per case: barrier 1 ok, 2 not ok, 3 ok; construction 1-3 ok, 4-5 not ok; write-kernel 1 not ok;
  core 18 not ok; drain 4 not ok, 10 and 11 cancelled.
- Unchanged claims: core [18] and drain [4, 10, 11] have the same signatures at base
  (`por-outofscope-base-974320ad`, head `974320ad37f8`: `cdcIntegrationService.updateSystemTableRow is not a
  function`; `46/46 below, 1 admissions`; 10 and 11 `cancelledByParent`). Construction 4-5 red at
  `bf0c6310` (`pow-run3`) and at head. VERIFIED.
- Confirmed at file level only (file ok, assertion count equals the case count): after: "census read",
  "A3 REMOVE, third read", "poisoned candidate", P3(i), tenure 3, 4, 5, 13 and "A1 request answered late",
  negatives, disruptions, five-nodes, growth-dispatch. Before: the whole tenure file. The diagnostics of 13
  (the six `suspended` samples) are in no log.

## 8. Mutation thinking (check 8)
| Mechanism removed | Witness that fails |
|---|---|
| `AFTER_CENSUS` (`:740`) | await-points "census read" (executed red on exactly this absence) |
| drain mark (`:306-310`) | barrier "drain start" (executed red) |
| candidate isolation (`:636-645`, `:669-670`) | wakes "poisoned candidate" (executed red) |
| `recordCandidateFailure` | "poisoned candidate" (snapshot names partition and message) |
| retention in the catch (`:331`) | wakes P3(i) (INFERRED; green before and after) |
| APPLIED_PROGRESS subscription (`:226-230`) | barrier "barrier wake" (INFERRED) |
| `A3_AFTER_ADMISSIBILITY` (`:617`) | tenure 3 and 4 (INFERRED) |
| barrier re-check (`:707`) | none ("drain start" and tenure 12 do not end the custody inside the read) |
| retention after a candidate failure (`:326-329`) | none |
| `totals.failedCandidates`, the warn line | none |
| `A3_AFTER_REMOVE_FLOOR` alone (remove.js`:47`) | none: `:617` catches it; the property still holds |
| `A3_AFTER_REMOVE_PROJECTION`, `A4R_AFTER_READMISSION` | none |

## Author claims not confirmed
- "No schedule here produces a retained REFUSED across a transfer" (N5).
- The REMOVE read ends at its read timeout (N6).
- The two cases without a constant bound are the only ones (N6).
- Per-case green at head for the passing files (file level only).
- "Unchanged elsewhere" beyond the twelve files run at head (N7).
