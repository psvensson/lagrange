# Re-check: W1b round 3 (`work/placement-outcome-format-20261121` @ ec1b2f77c85c39940aa856bba0ad2a7548a75b98)

Verifier: independent subagent, read-only. Git reads (`show`, `diff`, `grep`, `rev-parse`) and the retained lab outputs only. No test executed, nothing written in any worktree.
Subject: `git diff aa0f6f1cc ec1b2f77c -- src test` (ce2d8e18f red tests, ec1b2f77c fix).
Labels: **VERIFIED** = read in source at the named ref, or present in a retained lab output. **INFERRED** = reasoned from reading, not executed.
File:line references are at ec1b2f77c unless a ref is named.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging ec1b2f77c into the integration candidate after the retained-repair branch.

No interleaving found that duplicates, loses or permanently blocks a placement or a hold release. Both new behaviours are safe for one reason that does not depend on the author's "never re-engaged" claim: the release is re-validated at apply, and the owner re-derives the release obligation from the census on every pass. The lab evidence matches the record. The hand-off list is complete.

Conditions:

1. **R1**: the per-pass call `reconcileReleaseAttempts` (hand-off item 7) has no witness. Add one, or record it as an owned gap, before the hand re-application onto the placement-owner repair branch. It is the one hunk whose loss no test detects.
2. **R2**: correct the record: at ec1b2f77c the re-drive is not fenced by the owner; it is fenced only by the partition's leadership prelude. On the repair branch the `isPassCurrent(pass)` guard must precede `redrivenReleaseAttempt` (which writes), not only the second submit.
3. **R3**: on the repair branch place item 7 after the term-start barrier. At ec1b2f77c the leadership-start reconcile reads a store that may not have applied its predecessor's entries; this is safe (below) but should be recorded.
4. Record R4-R7 as owned follow-ups.

## 1. Re-drive of a blocked RELEASE

### (a) Idempotence by operation identity: holds in every state (VERIFIED read; one executed witness)

`decideHoldRelease` (`src/partition/partition-placement-admission-decision.js:365-387`) reads the census, finds the row by `release.operationId`, and answers by `isEngagedLedgerHold` (`:340-343`).

| Hold state | Apply answer | Rows written |
| --- | --- | --- |
| engaged, no other copy | `RELEASED` | the one row |
| engaged, another copy in its copy phase | committed `REFUSED COPY_PHASE_NOT_IDLE` (`:373-378`) | none |
| lifted | `REFUSED HOLD_NOT_HELD` | none |
| never engaged | `HOLD_NOT_HELD` | none |
| row absent | `HOLD_NOT_HELD` (`held === undefined`) | none |
| terminal or complete | `HOLD_NOT_HELD` (outside the census steps, or `incomplete` false) | none |

- The owner's read predicate equals the apply predicate. `readEngagedLedgerHoldIn` (`:352-355`) reads by `ROW_SQL` (any step); `incomplete` can be true only at a census step (`replica-operation-step-policy.js:290-303`), so both agree.
- Stronger than idempotence: the apply re-checks the release condition (`:373-378`). A spurious, duplicate or late release cannot lift a hold early.
- Executed witness: `blocked-release` #1, green at ce2d8e18f and ec1b2f77c (second release commits `REFUSED HOLD_NOT_HELD`, row identical).
- Operation id from the admitting log index: `placementOperationIdOf(statement.partitionId, index, ordinal)` (`:321`). Hold set in `operationOf` (`:274-276`).
- **R4. "A lifted hold is never re-engaged under the same id" is overstated (VERIFIED read).** Two routes exist in principle:
  - `decideRetainedPlacementRepair` (`partition-placement-retained-repair.js:186-200`) inserts an absent row from the retained copy, whose history may carry the hold (`:144-158`). No `DELETE` on `replica_operations` exists in `src/rebalancer` or `src/partition` (grep), so "absent" means another ledger lineage or a recreated store.
  - A workflow writer rewriting `steps_history` from a stale copy: not traced by the author or by me.
  - Neither breaks safety: the release names one operation id, the apply re-validates, and the owner re-derives the release (2 below).
- A newer admission relying on the hold: not reachable. While a ledger row is incomplete every other admission is refused `LEDGER_TRANSITION_UNRESOLVED` (`:224-227`), held or not, and a second ledger move is refused `PARTITION_BUSY` (`:221-223`).

### (b) Loop bound (VERIFIED read)

- `submitHoldRelease` (`src/rebalancer/replica-placement-owner.js:453-462`) re-drives at most once per call; the fresh attempt goes through `submitPlacementAttempt`, not back through the re-drive.
- A pass calls it at `:431` and `:713`; `shouldStopPlacementPass` (`:219-223`) prevents both for one operation.
- If the fresh id met a record too, the next pass would re-drive again. **R6: there is no count cap or backoff across passes.** Each iteration costs one upsert of the same attempt row, one info line and one history entry (bounded at 32); a `BYTES` answer writes no log entry and no outcome row. A foreign record under a just-minted uuid needs a writer that predicts it. The reserved-partition path writes no outcome row (`partition-participant-transaction-apply.js:711-729`), so no systematic collision comes from there.

### (c) The trigger pair (VERIFIED read)

`redrivenReleaseAttempt` (`replica-placement-owner-attempts.js:235-245`) requires `BYTES` and `OTHER_RECORD`.

- `BYTES` for a body that builds no command: digest null, `UNSETTLED`, no re-drive (`:129-136`).
- `BYTES` for a pending write of another digest: the store holds no record, `UNSETTLED`, no re-drive.
- `OTHER_RECORD` is a committed record of another digest under the entry key (`partition-committed-statement-outcome.js:284-293`). It is permanent, and the apply of the old entry then throws (`partition-placement-admission.js:237`). The old entry can never take effect, so there is no parallel pair with it.
- Owner and partition digests agree (`partition-placement-admission-command.js:103-119`), so an own committed release reads `SAME_COMMAND`.
- Two leaders releasing under two ids: first `RELEASED`, second `HOLD_NOT_HELD`. Harmless, witnessed by #1.

### (d) Crash between row replacement and submission (VERIFIED read; not witnessed)

- Order in `redrivenReleaseAttempt`: memory set, durable upsert on the same `attempt_key`, history, return; the submit follows in the owner.
- After a crash the durable row names the fresh id; hydration loads it (`:104-117`), the reconcile keeps it while the hold is engaged, and `resolveAttempt` returns it (same intent key, owner `:267-282`). The fresh id is re-driven.
- A crash before the upsert leaves the old id; it is re-driven again under another fresh id. No test covers either.

### (e) Tenure fence: **R2** (VERIFIED read)

- At ec1b2f77c there is no pass object and no `isLeader` check between the `BYTES` answer and the write of the fresh attempt row. "Only while the pass is current" describes the repair branch, not this tip.
- The second submit is fenced by the partition's own leadership prelude, as every submission on this branch is (the second submit of `submitCandidateAdmission`, `:477-483`, is the same shape).
- A `BYTES` answer itself proves leadership at request time (prelude order: leadership first). Residual: a deposed leader could replace its local attempt row; the row is reconciled at its next leadership start. No ledger effect.

## 2. `SUPERSEDED_BY_LEDGER` retirement

- Read as described: `attemptDecisionIn` (`replica-placement-owner-attempts.js:254-262`) reads the receipt and the hold in one transaction; `SAME_COMMAND` is tested first; superseded only for a release key with a string `operationId`; an ADMIT never qualifies. VERIFIED.
- **R3. It does not run after a term-start barrier at this tip (VERIFIED read).** The ledger's sink is driven by `Boolean(this.isLeader && !this.isShutdown)` (`partition-service-leader-activation-methods.js:72-78`); `setLeader` notifies `LEADERSHIP_START` at once (owner `:284-297`); no barrier exists in this branch (grep). The barrier arrives with the repair branch.
- Why the stale read is safe:
  - An attempt `release:O` is created only from the local census (`:431`) or from a committed `ADMITTED` answer resolved after the local apply (`partition-placement-admission.js:256-258`). The store that holds the attempt row already holds O's row.
  - Lifted, terminal and complete are stable under log extension (apart from R4).
  - Row absent locally while the attempt is in memory needs a recreated store. Minimal interleaving: (1) node a holds `release:O` in memory; (2) its store is recreated and it becomes leader before applying O's admission; (3) leadership-start reconcile reads no row and retires the attempt; (4) the admission applies and the hold is engaged; (5) the next pass finds the held row and mints a fresh attempt.
- The author's re-derivation claim is true: `submitReleaseIfCopyIdle` (`:421-433`) runs on every pass (`:729`), before the node-input check, and `resolveAttempt` mints a fresh attempt when none is retained. VERIFIED read. That a pass follows the late apply (`ENTRY_COMMITTED`, cache change or resync): INFERRED.
- A late commit of the retired entry answers `HOLD_NOT_HELD` or releases the same hold. No effect beyond one outcome row.

**R1. The per-pass path is unwitnessed (VERIFIED by grep of the three test files).** No test calls `reconcileReleaseAttempts`. `blocked-release` #3 and `attempts-exact-settlement` #3 both retire through `reconcilePlacementAttempts` at leadership start. Deleting owner `:727-728` survives every test I read (INFERRED, not executed). The within-tenure case it exists for (a release with unknown outcome commits late, the hold lifts, nothing calls `submitHoldRelease` again) would then leak until the next leadership start.

## 3. DEFINITE pin (VERIFIED)

- `PINNED_DEFINITE_ANSWERS` (`test/rebalancer/replica-placement-owner-clearing-triggers.test.js:99-113`): 13 codes. `PLACEMENT_DEFINITE_ANSWER_CODES` (`src/rebalancer/replica-placement-owner-constants.js:185-199`): the same 13 names.
- The pin names the constants, not their string values; a renamed value passes. Acceptable for a membership pin.
- Mutant 58d1b07f65700e1aa6490e90f54ef5a4427838c4 (parent ec1b2f77c; `BACKPRESSURE` added to the list and removed from the waiting map): F11 #1 red with "the owner's DEFINITE declaration equals this test's pinned list"; #2-#4 green.
- "Only by the pin": the earlier assertions passed in that run; the later structural assertion was not reached because the pin throws first. That it would pass is INFERRED from the mutant's diff.

## 4. Lab evidence (VERIFIED from `selection.json`, `test-results.ndjson`, logs)

| Run | Sha | Confirmed |
| --- | --- | --- |
| `w1b-r3-red-a1` | ce2d8e18f74fc17edbe0d0fb1b0ebced931cf482 | blocked-release #1 ok; #2 red "placement proceeds for the partition that is not blocked: admitted []"; #3 red "the release obligation is reached: the attempt retires" (row `...:lost` kept); F11 file green |
| `w1b-r3-green-a1` | ec1b2f77c85c39940aa856bba0ad2a7548a75b98 | 9/12. blocked-release 3/3, F11, attempts 3/3, blocked-attempt green. Red: core #20; growth-promote #7 subtests 40, 42; retained-row-repair #15, #33-#36, #44 |
| `w1b-mutant-definite-moved-a43` | 58d1b07f65700e1aa6490e90f54ef5a4427838c4 | killed, see 3 |
| `w1b-mutant-blocked-invisible-a1` | 8b1cd678654c937d1c4ccc46516ca62af6bad6f9 | 0/3 files. blocked-attempt #1 "the blocked attempt is a typed, named state"; blocked-release #2 red, #1 and #3 green; attempts #1, #2 red, #3 green |
| `w1b-base-attribution-step1-fails-r2-a1` | 0993265e53601cba4a6a41baa08158725cfcea7f | the same three files red with the same subtest numbers and names; the six retained-row-repair error texts are identical to the tip's (diffed) |

Not inspected: the diff of the blocked-invisible mutant commit.

## 5. Hand-off (b): the list is complete (VERIFIED)

`git diff 0993265e5 ec1b2f77c -- src/rebalancer/replica-placement-owner.js` has nine textual hunks; the eight items cover all of them (item 8 covers both snapshot sites). No hunk is missing.

Notes for the merger, read at `work/placement-owner-repair-20261121` = 3b182f42fcb1060732cc0fff302cf4f05ba67b99 (the author saw 87a34cb4d; the branch has moved):

- Item 7: the leadership-start reconcile is in `readPassCensus` (`:686-693`), not `runPassSteps`. Place the call between `:691` and `:692`, behind `passTermStartBarrier`.
- Item 6: site `:457-461`. If forgotten, the census array is passed as the registry and the reconcile throws at leadership start: loud.
- Item 5: `submitHoldRelease` there returns null at the `BEFORE_HOLD_RELEASE` checkpoint (`:407-416`), and `submitPlacementAttempt` returns early for an obsolete pass (`:395`). Guard before `redrivenReleaseAttempt`.
- Item 8: one snapshot site there (`:762`).
- The repair branch does not touch `replica-placement-owner-attempts.js` or `partition-placement-admission-decision.js` (diff stat), so those merge as they are.
- The round-3 witnesses start the owner with `setLeader(true)` and no term-start barrier; whether they pass unchanged on the repair branch is not established.

## Minor findings

- **R5** (VERIFIED read): `blockedPlacementAttempts()` and `lastPassSnapshot.blockedAttempts` now mix current blocked work with re-drive history (`replica-placement-owner-attempts.js:156`). A consumer treating a non-empty list as blocked work reads history as blocked until 32 newer entries or a restart. The history is in memory only. `supersede` drops the collision's `recordClass`. The owner comment at `:303` still describes blocked work only.
- **R7** unwitnessed, read only: crash recovery of a re-drive; the history bound of 32; a second collision; the re-drive when leadership ends across the first submit; superseded retirement for an absent or terminal row (the unit witness covers lifted and engaged).
- `attemptDecisionIn` uses `db.transaction`; `canUseAttemptStore` checks only `prepare` and `exec`. A test double with attempts and no `transaction` throws inside the pass.

## Author claims not confirmed

- "One engaged-hold predicate": the apply and the owner's read share it; `submitReleaseIfCopyIdle` (`:422-426`) still has its own inline form with an entity filter.
- "Only while the pass is current": not at this tip (R2).
- "A lifted hold is never re-engaged": overstated (R4).
- The change cone of ec1b2f77c, the corpus selection and any merged tree: never run (the author says the same).
