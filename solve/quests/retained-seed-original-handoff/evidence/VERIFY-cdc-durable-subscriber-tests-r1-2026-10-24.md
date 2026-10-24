---
audience: development
documentClass: evidence
---

# VERIFY cdc-durable-subscriber-tests r1 (2026-10-24)

## Verdict: APPROVE for keeping 4d02ca8cb

No required changes to the commit. There are two advisories for land (A1, A2) and three production findings to record at their owners (P1-P3). None of them blocks keeping this test-only unit.

## Identity

- Commit `4d02ca8cbcd63646d24d1f13d1aa95257eb4be2b`. Parent `9b78690a797fbae347c463892e3881f1e770370e`. `refs/wip/lab-cdcsub-1` resolves to the same SHA.
- Branch `work/cdc-durable-subscriber-tests-20261024`. Worktree `/mnt/data/peter/projects/.worktrees/cdc-durable-subscriber-tests-20261024` was clean, and I left it unchanged at HEAD 4d02ca8cb.
- `git diff 9b78690a7 4d02ca8cb -- src` is empty: 0 lines. The unit is test-only: 7 test files, 1 new helper, 1 harness, 2 shard metadata files.
- I verified from two detached scratch worktrees, `wt-head` (4d02ca8cb) and `wt-base` (9b78690a7), under `scratchpad/cdcsub-verify/`. Their `node_modules` was symlinked to the primary checkout. Both trees were removed with `git worktree remove` and `prune` at the end. The only effect on the primary repo was the transient `.git/worktrees` metadata. No file in `/mnt/data/peter/projects/lagrange` was edited.

## Per-file table (my runs, `node --test --test-reporter=tap`, thermal-gated, sequential)

| File | Base pass/total | Head pass/total | Matches implementer | Notes |
|---|---|---|---|---|
| partition-service.test.js | 87/97 (5 tests red: 25, 27-30) | 101/101 | yes | 23/24 deleted (2 tests, 4 leaves); 22 +1 ledger assertion; 28/29 +1 `data.value===20` |
| partition-service-size-split-transport.test.js | 76/83 (#2, #14, #15, #16 red) | 81/83 (#15, #16 red) | yes | #15/#16 fail "Replica transport handler left registered…" (cluster H, untouched) |
| cdc-generation.property.test.js | 0/4 | 4/4 | yes | |
| cdc-subscription-catchup.integration.test.js | 24/38 | 36/36 | yes | |
| seed-teardown-pending-cdc-delivery.test.js | 0/1 ("waits in the batch window 0 !== 1") | 1/1 | yes | |
| partition-cdc-obligation.test.js | 10/20 (O3-O6, O8-O11, O14, O17) | 20/20 | yes | |
| partition-write-kernel.test.js | 96/97 (#5) | 97/97 | yes | |

The `npm run -s test:file` runner (LAGRANGE_PLACEMENT=local) gives the same exits: head is green on all files except size-split, which fails only on #15/#16; base is red on all seven. Leaf-by-leaf diffs are below.

## Findings

### A. The fixture is a faithful consumer of the owner: PASS

- `test/test-helpers/acknowledging-cdc-subscriber.js:30-37` answers `buildCommittedCdcOutcome([event], groupId, {index, term})`. That is the owner builder, `src/cdc/cdc-delivery-outcome.js:239-247`.
- The gate is `assertSubscriberAcceptance` (`src/partition/partition-cdc-delivery.js:79-89`). For a durable event it calls `isCommittedCdcOutcome(answer, [cdcEvent])` with `groupId = null`.
- `isCommittedCdcOutcome` (`cdc-delivery-outcome.js:308-319`) checks four things:
  - the vector digest `cdcCommitWaitIdentity([event])`, a digest of the semantic event (`:232-237`, `:194-211`);
  - exactly one receipt per binding, where a binding is `sourcePartition` + `eventKey` + `eventDigest` (`:213-219`, `:292-297`);
  - the exact receipt fields (`:52-54`);
  - a non-empty `groupId` and a positive `logIndex` and `term`.
- Index, term and groupId are only shape-checked. Nothing binds them to a real recipient log, which is acceptable for a controlled input; the helper's header says so (`:8-9`). The per-subscriber `logIndex` counter starts at 1, and term is 1. Both are > 0.
- **It cannot acknowledge an event it did not receive.** The receipt is built from the exact `event` argument. Any other event has a different `eventKey` or `eventDigest`, so `exactBindings` fails. Dedup is per binding: `distinctBindings` (`:272-281`) plus `matchingBindings === 1`.
- `onEvent` runs before the receipt. A throw goes through the real refusal path, and `events.push` happens only after `onEvent` resolves.
- `settlePendingCdcDeliveries` (`:47-52`) reads `service.pendingCDCEventDeliveries` directly. That is the owner's set, written by `trackPendingCDCEvent` (`src/partition/partition-service-cdc-stream-base.js:225-233`). There is no private copy. It is bounded at 50 rounds, and armed timers are not awaited.
- **No per-test copies remain in the changed tests.** `git grep buildCommittedCdcOutcome` at 4d02ca8cb hits only the helper and `test/topology/cdc-group-propagation-service-harness.js:105`. The harness hit is the source double's `applyCDCBatch` answer, built through the owner builder, so rule 1 holds.
- Pre-existing re-wraps outside this unit, consistent with census §4.5: `test/partition/partition-cdc-delivery-progress.test.js:46-50` and `test/test-helpers/cdc-topology-progress-fixture.js:29-35`. Both are multi-mode recipient answers (committed, provisional or unknown) and use the builder. They are not subscriber doubles. Follow-up only.
- Mutation (helper answers `undefined`), my runs:
  - partition-service: 6 red (head numbering 22, 23, 25-28 = base 22, 25, 27-30).
  - cdc-generation: 3/4 red. INSERT stays green because the refused first attempt already pushed the event.
  - catch-up: 4 subtests red.
  - partition-cdc-obligation: 9 red (O3-O6, O8-O10, O14, O17).
  - O11 stays green under this mutation. That is expected, because nothing can acknowledge at all. See C for its own mutant.

### B. No assertion weakened: PASS (one precision note)

I counted assertions per test block in base and head source (script `count-asserts.mjs`). Only these blocks changed:

| Test | Before → after | Change |
|---|---|---|
| ps 22 insert | 4 → 5 | + `countCdcObligations == {owed:0, delivered:1}` |
| ps 28 upsert / 29 INSERT OR REPLACE | 3→4 / 2→3 | + `data.value === 20` |
| ps 23 / 24 | 2 / 2 → deleted | see below |
| size-split #1 | 1 → 2 | + `failedDeliveries > 0` (makes it non-vacuous) |
| size-split #2 | 4 → 3 | − `cdcEventBuffer.size() === 1`; the poll loop's buffer-drain condition was removed too (not an assertion) |
| catch-up subtest 1 | 8 → 7 | − `catchup.mode === backfill`, − `bufferedEventsReplayed >= 3`; "exactly replayed events" (which filtered `streamMode === catchup`) is replaced by `delivered.length === 3` plus `t.same` on `[[INSERT,row-1],[UPDATE,row-1],[INSERT,row-2]]`; the sort check now runs on `sourceLogIndex` (set at `partition-cdc-obligation-delivery.js:187`) |
| catch-up dedup subtest | 5 → 3 | − `cdcEventBuffer.size() > 0`, − `mode === backfill`, − `bufferedEventsReplayed > 0`; + `subscriberAEvents.length === 2` |
| seed-teardown | 5 → 8 | − `immediateBatchEntriesByKey.size === 1` (replaced by the wave's retry-sleep, active-wave and source-batch assertions), + `retrySleepReleases.size === 0` after teardown; `pendingCDCEventDeliveries.size === 1` → `> 0` |
| write-kernel #5 | same count | `emitCdcEntry: {...}` → `null` (V2 is always null, `partition-write-kernel.js:543,566`) |
| O11 / O17 / recordingSubscriber | unchanged assertions | the subscriber now answers the receipt |

- Every deleted assertion targets retired volatile behaviour: the buffer size, backfill mode, `bufferedEventsReplayed`, or the `streamMode === catchup` tag. These are V4 and V8 in census §1.2, and none asserted anything else.
- Precision note (non-blocking): seed-teardown `> 0`. My probe shows that the pending count at the hold is deterministically 2 (`probes/seed-batch-map-observe.tap`: "PROBE pending=2", the drive plus the invocation cleanup). `=== 2` could be pinned. The post-teardown `=== 0` assertion carries the property either way.
- **Deletion of ps 23/24: justified.** At base they asserted `cdcEventBuffer.size() === 0` and the absence of a buffering warning. Writes no longer feed the volatile buffer, so the assertions were true by construction: vacuous, as census §1.3 says.
  - The durable analogue, "no obligation for a suppressed table", is false in production today.
  - My probe `probes/policy-probe.out` (implementer's probe re-pointed at wt-head) prints `user-table(externalCdcAllowed:false) {"owed":1}` and `sql_write_operations {"owed":1}`. This agrees with the investigation §0 point 1-2 and §6 (F1, F4, D2).
  - So deleting the tests is correct, and rewriting them would assert either a falsehood or the current undecided behaviour.
  - **The D1a unit (census §1.5) must add the witness**: a red-then-green test that a suppressed table (`logs`, `sql_write_operations`, a user table with `externalCdcAllowed:false`) records no owed obligation, or whatever D1a rules. The comment at `partition-service.test.js:1075` records this.

### C. O11: faithful rewrite

- The successor drive joins the stale invocation. `driveCdcObligations` (`src/partition/partition-cdc-obligation-delivery.js:645-650`) returns `JOINED_IN_FLIGHT` with `rerun = true` while `delivery.activeCdcInvocation` is set. When the stale child settles, `closeIfSettled` (`src/cdc/cdc-delivery-invocation.js:185-190`) calls the drive's `onClosed`. That is `resumeAfterCdcCleanup` (`obligation-delivery.js:627-633`), which calls `scheduleDeliveryRetry(delivery, null)`: a lane timer at `retryDelayMs`, initially `CDC_BUFFER_REPLAY_INITIAL_DELAY_MS = 50` (`partition-service-constants.js:39`).
- **The timer redrive is the intended production design, not a regression.**
  - Even at 4151a3ab4, a joined drive's rerun went through `scheduleDeliveryRetry`, never in the same turn.
  - 681da1dc1 added the `activeCdcInvocation` join and `resumeAfterCdcCleanup`, which is invocation custody: no new invocation while a stale child is unsettled.
  - O11's assumption that the redrive happens in the same turn held only before 681da1dc1, when the new lane was not in flight.
  - The JSDoc "the running drive runs once more" (`:638`) is loosely worded; the rerun happens on the retry timer.
- **Not weakened.**
  - The flush deadline is 1000 ms (`partition-cdc-obligation-constants.js:66`). A stale acknowledgement would land in the current lane through `laneOf()` in `acknowledgeDelivered` (`:266-289`), so `beforeDeadline.pending` (read after +50 ms) and `acks` (after the deadline) both still observe it.
  - Mutant (`mut/o11-guard-mutant.tap`): remove the post-await currency guards in `deliverObligation` (`scoped.assertCurrent`, `context.assertCurrent`, `!current`), and in `deliverCDCEventToSubscriber` run `invoke()` outside `deliveryContext.run`. O11 goes red with `pending: 1, acks: 1`.
  - Without the 50 ms advance (`mut/o11-no-advance.tap`), O11 is red with `retried: false`, as the implementer reported.
- At base, O11's stale completion returned `undefined`, so the receipt gate refused it whatever the tenure. The tenure guard was untested. The rewrite strengthens the test.

### D. size-split #1 and the entryId-less raw propose

- The new property is real. A subscriber that throws, reached through `insertData` → committed apply → `recordCommittedStatementCdc` → lane drive, produces no unhandled rejection, and `failedDeliveries > 0` proves the subscriber was reached.
- Mutant (`mut/sizesplit1-rethrow-mutant.tap`): make `driveOneObligation` rethrow after `handleDeliveryFailure`. The drive rejects, and `trackPendingCDCEvent`'s `promise.finally(...)` chain (`cdc-stream-base.js:230`) becomes an unhandled rejection. The test goes red (tap shows `tapCaught: 'unhandledRejection'`).
- At base, #1 was green but vacuous: it overrode `generateCDCEvent`, which is never called (V1).
- Raw propose probe (`probes/raw-propose-no-entry.out`): `raft.propose({type:'INSERT', sql, params, proposedBy})` without `entryId` returns `{"outcome":"HOST_FAILURE","reason":"NOT NULL constraint failed: _cdc_obligations.entry_id","phase":"application","retryable":true,"recoveryRequired":true}`. The row is rolled back and nothing is recorded. With an `entryId` it returns `CORE_OK`, applies, and records owed 1.
- **Classification: a latent production one-version defect, not reachable from production proposers today.** It is recorded as P1 below; the test's move to `insertData` is correct.
  - Every production write proposal carries an entryId. The kernel resolves it (`partition-write-kernel.js:239-248`, `randomUUID` when absent), and `proposeUnlessDeferred` (`partition-service-raft-write-commit.js:80-85`) keys on `entry.entryId`.
  - But the apply side has two contracts for one command. The statement-outcome owner accepts an entryId-less SQL command through a legacy fallback key (`src/partition/partition-committed-statement-outcome.js:83-90`: proposedBy, proposedAt, timestamp, sql, params) and executes it (`partition-service-entry-apply-base.js:622-647`). The CDC recorder then fails on the schema's `entry_id TEXT NOT NULL` (`partition-cdc-obligation-constants.js:94`, write at `partition-cdc-obligation-ledger.js:95-103`).
  - The result is untyped (a raw SQLite message), arrives after the statement already ran, and is labelled `retryable: true` although it fails identically on every replica.
  - The committed-command gate already fails closed and typed for an unknown type (`entry-apply-base.js:583-599`, `COMMAND_UNKNOWN`). A committed SQL command without an entryId should be refused the same way, before execution, and the fallback key should be deleted (no-legacy rule).

### E. Catch-up: PASS

- `partition-cdc-delivery.js:716` `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)` is the only durable catch-up owner. The backfill branch (`:573-632`) needs `cdcEventBuffer.size() > 0` and is dead (V8).
- The rewritten subtest 1 pins ledger order exactly (`t.same` on operation and id, in log order). The `sourceLogIndex` sort check is secondary.
- The dedup and sliding-window subtests now pin V9, the live sliding window (`partition-cdc-delivery.js:633-667`): "catchup mode is sliding_window", "sliding window events replayed to B", and "no duplicate events to B".
- **V9 is slated for deletion** (census D1c; investigation §4 F5/D4, a duplicate-delivery path). Pinning it here is acceptable as current behaviour, and is recorded: those subtests must be deleted or rewritten with D1c.

### F. Seed-teardown: replacement property is real

I checked the four-step trace on head by ablation (`probes/seed-*.tap`):

1. Removing `resumeFixtureParticipantAdmission` leaves the write paused: "waits in the propagation wave's retry delay 0 !== 1".
2. Dropping `deliveryContext` from the subscriber fails the same way. `propagateDurableCdcEvent` calls `assertCdcDeliveryInvocation(parent)` (`cdc-group-propagation-durable-delivery.js:177-178`).
3. Deleting `resolveStrictCdcForwardRetryAfterMs` from the source double fails the same way. It is read at `cdc-propagation-progress.js:144`.
4. The durable payload never enters `immediateBatchEntriesByKey`. My observation probe asserts `size === 0` during the hold and passes (`seed-batch-map-observe.tap`), consistent with `durable-delivery.js:1-3`.

The ablations in steps 2-4 also hang the process after the failed assertion: lane retry timers keep running with no teardown. This matches the census note.

- The hold is the wave's retry sleep, owned by `stop()` (`cdc-group-propagation-service.js:181-189`, `sleep` at `cdc-group-propagation-lifecycle-methods.js:73-90`).
- Mutant (`mut/seed-nostop-mutant.tap`): `stop()` neither retires the active wave nor releases the sleeps. The test goes red at "ReplicaHandler.shutdown completes… false !== true".
- **P2, the one-version defect, is confirmed.** `assertPropagationRequest` (`cdc-group-propagation-service.js:370-380`) requires the volatile `applyCDCEvent` on every request. That check runs at `:206`, before the durable branch at `:212`, and the durable path never calls `applyCDCEvent`; it calls `applyCDCBatch` (`durable-delivery.js:101`).
- Ablation: deleting `applyCDCEvent` from the durable source double means the delivery never reaches the wave (`seed-no-apply-event.tap`). The harness double keeps a throwing `applyCDCEvent` only to satisfy that check.
- The durable request contract should check the durable surface (`applyCDCBatch`, `groupId`, `resolveStrictCdcForwardRetryAfterMs`), and the volatile check should go with V20.

## Production findings to record (owner action, not this unit)

- **P1.** The partition committed-apply owner plus the statement-outcome owner accept an entryId-less committed SQL command, which then fails the CDC recorder's `entry_id NOT NULL` as an untyped `HOST_FAILURE`, labelled `retryable` and `recoveryRequired`, on every replica. Fix: refuse it typed before execution and delete the fallback key at `partition-committed-statement-outcome.js:85-89`. Reachable only by a bug or version skew.
- **P2.** `assertPropagationRequest` demands volatile `applyCDCEvent` on the durable path (`cdc-group-propagation-service.js:372-376` vs `:212`).
- **P3.** The policy-suppressed tables owe forever (investigation F1/F4/D1a/D2). This is the witness the deleted ps 23/24 leave to D1a.

## Advisories for land (not blocking keeping the commit)

- **A1.** The duplication ratchet prints tighten hints at head: `[test]` clone groups 692 → 689 and duplicated lines 26237 → 26148 in `scripts/check-duplication.js`. Per CLAUDE.md, tighten when the checker prints the hint. Base: 692/692 groups, 26233/26237 lines. Head: 689/692, 26148/26237. src+scripts: 46/47 on both.
- **A2.** Optionally pin `pendingCDCEventDeliveries.size === 2` in seed-teardown. Also, the cdc-generation INSERT property still passes on a refused delivery; it does not prove acceptance. Adding a ledger `{owed:0}` check, as in ps 22, would close that gap.
- Follow-up (census D4): the two pre-existing receipt re-wraps (A) and other plain-callback partition subscribers outside this unit, for example `partition-service-shutdown-timers`, `cdc-sliding-window-catchup.*`, `cdc-buffer-replay-robustness`, `cdc-subscriber-registration-timing`. Most of them are dead-path tests the census already lists for D1c.

## What I ran

All runs were local, sequential, and gated by `scripts/checks/wait-for-thermal-headroom.js`. Paths are under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/cdcsub-verify/`:

- `runs/{head,base}/*.log` and `runs/summary.txt`: `LAGRANGE_PLACEMENT=local npm run -s test:file -- <file>` for the 7 files in both trees.
- `tap/{head,base}/*.tap` and `tap/summary.txt`: `node --test --test-reporter=tap` for the 7 files in both trees, used for the leaf diff.
- `count-asserts.mjs`: assertion counts per block.
- `mut/`:
  - helper-returns-undefined on 4 files: `partition-service.test.tap`, `cdc-generation.property.test.tap`, `cdc-subscription-catchup.integration.test.tap`, `partition-cdc-obligation.test.tap`;
  - `o11-guard-mutant.tap`, `o11-no-advance.tap`, `sizesplit1-rethrow-mutant.tap`, `seed-nostop-mutant.tap`.
  - Every mutant was reverted with `git checkout`, and `git status` was clean afterwards.
- `probes/`: `raw-propose.mjs` with `raw-propose-{no,with}-entry.out`; `policy-probe.mjs` and `policy-probe.out`; `ablate.py` with `seed-{no-resume,drop-context,no-strict-hint,no-apply-event,batch-map-observe}.tap`.
- `eslint.log`: `node --check` plus `npx eslint` on the 9 changed `.js` files. Both clean, rc 0.
- `dup-head.log` and `dup-base.log`: `npm run -s test:duplication`.
- `audit-shards.log`: `npm run -s audit:shards`, rc 0. Shards current; primary, resource and subsystem classifications OK; 2464 tests.
- `metadata-refresh.log`: `npm run -s test:metadata:refresh` at head. **Zero drift**: `git status` stayed empty, and the seal `snapshotDigest` `821a7754…` equals the committed `impact-graph-seal.json`.

## Limits and unknowns

- I did not re-run the lab run (adams-gamla 199 files, 195/4). I relied on the implementer's classification of its four failures as pre-existing. **Unknown** to me.
- I did not re-run the pre-commit hook, the full `npm test`, or the land gate.
- The O11 mutant removes several guards at once. I did not isolate which single guard is load-bearing.
- I did not trace whether a mixed-version peer can commit an entryId-less SQL command (P1 reachability). **Unknown.**
- I did not run the other plain-callback subscriber tests outside the 7 files.
