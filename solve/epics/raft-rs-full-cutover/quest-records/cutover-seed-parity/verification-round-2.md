# Verdict, round 2: fixes/cutover-seed-parity @ 57f85f31d (corrective efba198fb..57f85f31d; base 4258fdc32)

**REJECT.** There are 4 blocking items (B-A to B-D). All static gates are green, and several round-1 items are closed: B1's CDC retry delay, the after-shutdown refusal, the live read-back, the typed 503, the first-epoch deferral, the owner's published read, and the test-3 split.

The rejection stands for four reasons:
- **B-A:** the branch hangs in teardown. The seed never finishes shutting down, and I measured this on both heads of the branch, not on the rs-raft base.
- **B-B:** round-1 B2 remains open inside the owner module.
- **B-C:** the corrective introduces a failed-join regression.
- **B-D:** a CDC-owned delayed retry still survives shutdown.

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity`. I used `git archive` exports, all with node_modules symlinked:

| Export | Tree |
|---|---|
| `$V/r2/fix` | C = 57f85f31d |
| `$V/r2/R` | pristine 4258fdc32 |
| `$V/r2/L` | pristine 9d85ac283 (Liferaft default, `raft-backend-constants.js`) |
| `$V/r2/base` | 4258fdc32 plus the corrective's test files |
| `$V/r2/r1head` | fedda05da plus the corrective's test files |
| `$V/r2/cexp` | C with the implementer's abandoned experiment (3 files from `seed-parity/cexp`) |

Probes are in `$V/r2/probes/`.

## Blocking

**B-A. The branch hangs in teardown: the seed's ReplicaHandler.shutdown never settles. This violates "teardown reaches its normal terminal state".**

Test: `test/bootstrap/fresh-join-via-non-seed-node.integration.test.js`. All 11 assertions pass, then the test times out inside its `finally` teardown.

| Tree | Red runs |
|---|---|
| C | 3/16 standalone (`$V/r2/batchC.table` fix 3, `batchD.table` 4, `batchD2.table` 1) and 1/1 in the `--jobs=2` bootstrap suite (`$V/r2/suite-bootstrap.out`) |
| r1head (fedda05da) | 2/13 (`$V/r2/batchE.table`: runs 5 and 10) |
| R (4258fdc32) | 0/25 (`$V/r2/batchC.table`, `batchE.table`, `batchF.table`) |

The red-rate batches ran to completion by design. The diagnosis batches stopped at their first red.

Where it hangs (`$V/r2/fjtrace-4.txt`, `$V/r2/fjtrace2-1.txt`, traced with `$V/r2/probes/shutdown-trace-preload.mjs` and `replica-task-preload.mjs`):
- `SeedCleanupHandler.cleanup` gets through `shutdownSharedRuntimeDependencies`, which runs `shutdownSqlQueryEngine` and so the CDC `markShuttingDown`.
- It never reaches `shutdownServiceMap`. It is stuck in `await d.clearReplicaHandler()`: `ReplicaHandler.shutdown()` on the seed is pending indefinitely.
- No ReplicaHandler or CDC async method is pending for more than 2 s. The candidates are therefore `Promise.allSettled(operationTasks)` or a local `service.shutdown()` (`replica-handler-runtime-methods.js:543-584`).
- Meanwhile the seed's partitions stay alive. Their leader-row publication keeps retrying at the 60 s capped cadence against the shut-down writer ("not routed" refusals every 60 s, `$V/r2/fj-fix-3.out`). The process exits only on the TAP alarm.

Round 1 missed this; that round's bootstrap suite passed. The implementer's `seed-parity/r5-bootstrap.out` shows the same signature (130.8 s, 13 assertions) and was attributed to the abandoned experiment, but this measurement shows it without the experiment.

**B-B. Round-1 B2 is not closed: the owner module still publishes the pending candidate under the published name.**
- `buildMembershipPublicationActiveSnapshot` returns `publishedActiveNodeIds: ["a"]` for an OPEN or ACK_PENDING `[a]` row, with `publishedActiveNodeIdsPresent: false`. The owner's reads give published `null` and pending `["a"]`. `buildPublicationRecoveryProtocolSnapshot` does the same. Evidence: `$V/r2/probes/j-owner-third-read.fix.out`, versus R, where everything said `["a"]`.
- That field reaches placement as published membership without the flag: `src/rebalancer/unified-rebalancer-priority-readiness.js:352-356,480-492`, fed by `control-plane-readiness-publication-planning-snapshot.js:636-638`. `findings-round-2.md` records this as "affects placement in the formation window".
- So "an unpublished candidate observable through published membership", "pending observable other than through the pending read" and "not wrappers over several interpretations inside the owner module" all still hold.
- The census test passes this file by labelling it "projection of the owner". The census only checks that the owner-read regex is present.
- **Owner decision needed:** the heartbeat (`heartbeat-service-lifecycle-methods.js:376-380`) and the reconcile (`membership-publication-coordinator-reconcile.js:744-747`) compose `published ?? pending` into `publishedActiveNodeIds`. That feeds the active-gate handoff target, whose `requiredAckNodeIds` and `acknowledgedNodeIds` equal that list (`publication-active-gate-handoff-contract-selection.js:647-664`). This preserves pre-existing semantics but treats the pending candidate as published.

**B-C. The corrective introduces a failed-join retraction regression.**
- `join-cleanup-publication-context.js:69-77` now targets only a pending candidate.
- Probe `$V/r2/probes/k-failed-join-retraction.mjs` uses the real coordinator. Membership epoch 1 is PUBLISHED `[joiner, seed]`, the joiner's row is READY, and the join-cleanup context is applied:
  - R publishes epoch 2 `[seed]` (retracted).
  - C publishes nothing, so the failed joiner stays published.
  - Evidence: `k-failed-join-retraction.{R,fix}.out`.
- Under the owner's classification rule (absent before, present on C, so introduced here) this must be repaired. `findings-round-2.md` lists it only as an owner decision, and no witness covers it.

**B-D. A CDC-owned delayed retry survives terminal shutdown (B1 class, write path).**
- The cache-visibility repair retry (`cdc-integration-service-cache-visibility-wait.js:342`, `delayOn`) is not held by the lifecycle.
- Probe g: the timeout fired, and the first repair read was not confirmed. Shutdown then settles the write at once with SHUT_DOWN(NOT_CONFIRMED). But the CDC timer is still armed (`timersAfterShutdownNoClock: 1`), and once the clock moves a second authoritative read runs against the torn-down service (`readsAfterClock: 2`). Evidence: `$V/r2/probes/g-repair-delay.fix.out`; base is identical.
- It is bounded (at most `authoritativeFallbackRetryDelayMs`, 25 ms by default, and one read). It is pre-existing. But it contradicts the `markShuttingDown` contract ("every wait or retry delay it holds for a write is released"). Only `delayUntilShutdown` covers `cdc-routed-mutation-readiness.js`.

## Non-blocking findings

- **N1. The CDC catch-up sleep (`cdc-integration-service-authoritative-catchup.js:303`) survives shutdown when it is already sleeping.** Probe h: the timer stays armed and 5 more reads run after shutdown with a deferred stub. With the real read after shutdown (probe i), the answer is `authoritative_row_source_unavailable`, not deferred, so the loop ends at once. At most one sleep remains, of `retryAfterMs` (uncapped). This is a read path and pre-existing.
- **N2. Test 3's placement assertion does not discriminate lease expiry.** The short-lease member is never placement-eligible while live, even with a fresh heartbeat, because it has no transport. Evidence: `$V/r2/l-test3.fix.out` (`liveLease.placementEligible: false` for both the stale-heartbeat and fresh-heartbeat rows). The assertion would pass if readiness ignored the lease. The owner accepted it as a parity invariant; "becomes unavailable" is not shown.
- **N3. The owner-transition witness (test 3 in `membership-publication-first-epoch-members.test.js`) calls `coordinator.acknowledgePublication` directly.** That is the real ack write (`membership-publication-coordinator-persist.js:160`), reached in production through `acknowledgeMembershipPublicationForNode` (`membership-publication-coordinator-reads.js:545-580`), which also selects the candidate. The witness bypasses that selection and uses an in-memory publications owner. It is red on R and r1head at "an unpublished first candidate is not published membership".
- **N4. The 503 witness injects the typed SHUT_DOWN through a stubbed `determineAndReserveMessageGroupAssignment`.**
  - The decision is the request owner's classification of the typed code (`bootstrap-request-owner.js:378-383, 402-411`), not an exception translation: an untyped control gets a 500.
  - It is red on r1head at "500 !== 503". On 4258fdc32 it is red only at its precondition, because there is no SHUT_DOWN type there; that base answered a 503 through the deferRetry.
  - A live joiner arriving during seed shutdown was not probed.
- **N5. The census test is lexical.** It asserts that routed readers contain an owner-read call and that every file mentioning the list is classified. It does not check the semantics of the "projection of the owner" files (see B-B).
- **N6. Recorded open items, unchanged:** the owner retry loop drops the earlier OUTCOME_UNKNOWN (ordering iii ends NOT_ROUTED), and the write paths that bypass the one exit (round-1 N5).

## Shutdown checks confirmed

- **Witness `test/cdc/cdc-shutdown-terminal-owner-write.test.js`** (`$V/r2/w-*-cdc-shutdown-terminal-owner-write.out`):
  - C: 9/9 pass.
  - 4258fdc32: 8/9 red. The one exception is test 9 (live read-back), which base already had.
  - r1head: 8/9 red, including test 9 at "the durable read-back finds the committed row".
  - (iv) and (v), the B1 cases, are red on both at "settles once shutdown wins, without any clock moving".
  - (vi) is red at "never submitted to the still-registered engine 1 !== 0".
  - (ii-a) and (ii-b) stay NOT_CONFIRMED with an OUTCOME_UNKNOWN cause, which is indeterminate as required.
- **Real seed with a publication write in flight at shutdown** (offsets 0/150/400 ms, `$V/r2/linger-fix-*.txt`): 0 referenced timers, `activeResources=[]`, exit within about 10 ms.
- **Timeouts:** no witness raises a timeout or adds slack. In the corrective diff, the only timing-related change is a lease length (`TEST_TIMEOUTS.TEST_TIMEOUT` used as `ready_lease_expires_at`).
- **Expired-member invariant:** no test asserts that an expired member stays absent from published membership (checked with a search over test/).

## Membership checks confirmed

- **Witness `test/control-plane/membership-publication-first-epoch-members.test.js`:**
  - C: 6/6 pass.
  - 4258fdc32: 5/6 red. Test 1 fails at "no epoch ... before READY", test 2 at "a later empty candidate", test 3 at "unpublished first candidate is not published membership", test 4 at "OPEN row only", and test 6 (census) also fails.
  - r1head: 4/6 red. Tests 1 and 2 pass there, as expected.
- **No empty epoch:** no path publishes an epoch with no members.
- **Test 3:** the member reaches published membership while live, observed from the owner's committed rows, 5/5 on C.

## Scope classification (three points, reproduced independently)

I ran `seed-parity/classify.mjs` (copied to `$V/r2/probes/classify.mjs`) twice per point with a 3 s window. Results are in `$V/r2/batchA.table`.

| Point | natural 50 ms: epochs/s | cadence | builds/s | pressure | max queue depth | persist failures |
|---|---|---|---|---|---|---|
| L 9d85ac283 | 15, 13 | 88 ms | 0 | all ALLOW | 1 | 0 |
| R 4258fdc32 | 25, 3 (settled after 8) | 40-48 ms | 0-3 | all ALLOW | 1 | 0 |
| C 57f85f31d | 26, 2 (settled after 6) | 40-47 ms | 0-3 | all ALLOW | 1 | 0 |

- **The record's classification is supported.** The flap is pre-existing on Liferaft and faster under rs-raft. It is bimodal on R and C alike, so the corrective did not introduce it. In update mode there is one drop and one re-admission at every point.
- **Caveat on the rate comparison:** L's flap windows carry event-loop stalls with p99 of 1.3 to 1.9 s (2.9 s in the implementer's run). The lower Liferaft rate is partly stall-driven.
- **Caveat on the implementer's evidence:** their `amplification-fix.txt` for C is a settled run (8 epochs). My flapping R and C runs show the same gates green.
- **The ~170/s rebuild rate appears only in the experiment traces.** By my recomputation: `hyb-2.out` peaks at about 155/s, `dbgf-3` at about 232/s and `dbgj-1` at about 182/s.
  - Actual behaviour is 0-3/s standalone at L, R and C.
  - Over the whole membership-consistency file on C, the peak is 18/s (`$V/r2/buildrate.jsonl`).
  - I did not reproduce the storm itself: C with the experiment, running the current membership-consistency file, peaked at 19/s. The "not in production" half is confirmed; the ~170/s magnitude is unreproduced.
  - `dbg-4` and `dbgc-1` peak at 166-186/s but ran in the `dbg` export, whose source now equals C, so their provenance cannot be verified.
- **Existing gates:**
  - Pressure governor, the critical-convergence queue bound and publication persist: green at all points.
  - formation-health, one local run on C (`$V/r2/formation-health-fix.out`): PASS (schema_admitted), 83 s window, 132 lease waits. The trend recorded "head unknown" because the export has no .git. A healthy formation has no lapsed member, so this gate cannot observe the amplification.
- **Conclusion:** leaving the flap to the readiness quest is supported.

## Runs and gates

| Run | Result |
|---|---|
| membership-consistency, C, stop at first red, 5x | 95/95 each, rc=0, 55-56 s wall vs 54-55 s TAP (`$V/r2/batchB.table`) |
| seed-node-bootstrap, C, 1x | 110/110, rc=0, 36.1 s wall vs 34.9 s TAP |
| test/cdc + test/control-plane, `--jobs=2` | 222/223, exit 1 |
| test/bootstrap, `--jobs=2` | 181/183, exit 1 |
| test/rebalancer, `--jobs=2` | 231/231, exit 0 |

The suite failures:
- `formation-release-handoff-interaction-registry` and `critical-placement-trace-classifier` fail only in the export ("not a git repository"). Re-run in the worktree, both are green (`$V/r2/wt-*.out`).
- The third failure is `fresh-join-via-non-seed-node` (B-A).

Gates, run in the worktree (the worktree was clean afterwards):

| Gate | Result |
|---|---|
| complexity | 1813/1813 |
| cognitive | 159/159 |
| unused exports | 1437/1437 |
| file size | 27/27 and 21/21 |
| duplication | 56/1815 and 791/30451 |
| audit:shards | OK, 2170 tests |
| audit:impact-contracts | PASS, 40 contracts |
| check-fast-static | ok |
| audit:guidelines | rc=0 |
| lint | rc=0 |

## Not verified

- A live joiner arriving during seed shutdown (N4).
- The root cause of B-A beyond `ReplicaHandler.shutdown`: under heavier instrumentation (PartitionService, RaftGroup, MessageGroupService) there were 0/8 reds.
- The ~170/s storm magnitude.
- `test:metadata:refresh` and the inventory `--refresh` / `--verify-import-graph` steps: they write files, and this verification is read-only.

No child processes survive, the worktree is clean, and I ran no git writes.
