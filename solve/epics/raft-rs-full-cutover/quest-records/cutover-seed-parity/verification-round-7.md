# Verdict, round 7: fixes/cutover-seed-parity @ b3bb872c7 (change b92027363..b3bb872c7)

**REJECT, on one blocking item (R7-1), which concerns the evidence.**
- The production code is unchanged apart from N-a, and it passes every property check.
- N-a is acceptable (keep the field).
- N-c has one inaccuracy.
- Nothing regressed.

The handle-count witness catches the round-6 escapes (mutA and mutC), but it is still defeated two ways:
- **a swap:** a service handle is cleared at stop while a new referenced timer is created, so "no larger than" balances;
- **an unref'd timer:** `process.getActiveResourcesInfo()` does not list unref'd handles.

The repair is test-only and small. The witness already computes the right decision, `observation.creations`, and uses it only as a diagnostic. With that record made decisive, it catches every mutant I built, and the fix stays 14/14 in 5 runs out of 5.

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity/r7`.
- `$V/fix` is b3bb872c7.
- `$V/p6e`, `$V/mut5` and `$V/mutA`…`$V/mutD` are the round-6 trees with the new witness copied in.
- `$V/m1…m7` are round-7 scratch mutants of `fix`.

## Blocking

**R7-1. The decision "live Timeout/Immediate handles after settle ≤ before stop" does not test the property.**

Where: `test/topology/cdc-group-propagation-stop-arms-nothing.test.js`. The count is taken in `lane.stop` (~:163) and asserted at ~:340-346.

**(a) Swap: a handle cleared at stop masks a new one.**
- In three lanes, the count before stop includes a service timer that `stop()` clears: the batch window (lane 7), the retry delay (lane 10) and the background wave armed at stop (lane 11).
- A post-stop timer created in the owner's own stop helpers leaves the count equal. The mutants, each a one-line addition in `cdc-group-propagation-lifecycle-methods.js`:
  - **m1:** `setTimeout(() => {}, 1000)` inside the per-entry loop of `clearImmediateBatchTimers` (after :36);
  - **m2:** the same inside the sleep's `release` when stopped (after :81);
  - **m3:** the same inside `clearBackgroundRetryTimers` (after :20).
- **All three pass 14/14** (`$V/w-m1swapBatch.out`, `w-m2swapSleep.out`, `w-m3swapBg.out`).
- Each leaves a live, referenced 1 s timer after stop. Probe `$V/probes/q-swap.mjs` shows before=1, after=1, createdAfterStop=1 for the swapped scenario (`$V/probes/q.m{1,2,3}*.out`); the fix shows before=1, after=0, created=0 in all three (`q.fix.out`).
- This is a real gap: owner code arms a timer after stop.

**(b) An unref'd timer is invisible to the count.**
- `node -e` shows that `getActiveResourcesInfo()` lists `setInterval` and `setImmediate` handles but not an unref'd `setTimeout`.
- **m4:** `setTimeout(() => {}, 1000).unref()` at the top of `buildStoppedFailures`, which every stopped path takes. It **passes 14/14** (`$V/w-m4unref.out`).
- Is this a gap in the property? Yes. The witness header states the property as "the service starts no further work: no timer or immediate is created from its code". An unref'd timer does not keep the process alive, so it does not reproduce the old teardown linger, but its callback still runs after stop in any process that stays up, as a server does.

**Caught correctly** (red):

| Mutant | What it does | Result |
|---|---|---|
| m5 | `setInterval` | 4/14 (the run also hit its 150 s timeout) |
| m6 | a 200-immediate chain, then a timer | 4/14: the chain's pending Immediate is live at the count |
| m7 | a 500-link promise chain, then a timer | 4/14: microtasks drain inside the window |
| mutA, mutB, mutC, mutD | round-6 mutants | 13/14 each |
| r5 mutant | | 11/14 |
| 6e432286d | | 9/14 |

The **mock-timer reset** does not open an escape: lanes 8 and 12 reset before the pre-stop count. A timer the owner arms under the mock is not a real handle, and nothing is armed between the reset and `stop()` in those lanes.

**Tested repair:** make the existing record decisive, i.e. `assert.deepEqual(observation.creations, [])`. It records every Timeout and Immediate init after stop, whatever its stack, ref'd or unref'd, excluding only frames from the test file. The handle count can stay as a second check.
- A scratch copy of the witness with that one assertion added (`$V/witness-creations-decisive.test.js`): the fix is **14/14, 5 of 5 runs**.
- It is red on every mutant: m1 (lane 7), m2 (lane 10), m3 (lane 11), m4 (12 lanes), m5, m6, m7, mutA to mutD (lane 12), the r5 mutant (1, 2, 12) and 6e432286d (1, 2, 5, 12, 13). Outputs: `$V/wc-*.out`, `$V/wcdet-*.out`.

**Residual limit, recorded only:** the observation window closes after the 60-turn drain. Work that owner code parks on a promise the lane still holds at assertion time runs after the window. The `finally` answers the held router calls only after the assertions. On the fix no owner continuation is pending at assertion time, but the witness cannot see past its window. That is inherent; the lanes answer the calls they care about.

## 1. The table, reproduced

Outputs: `$V/w-*.out`.

| Tree | Result (implementer's claim) |
|---|---|
| mutA | 13/14 (claimed 13/14) |
| mutC | 13/14 (claimed 13/14) |
| r5 mutant | 11/14 (claimed 11/14) |
| 6e432286d | 9/14 (claimed 9/14) |
| mutB | 13/14 (claimed 13/14) |
| mutD | 13/14 (claimed 13/14) |
| fix | 14/14, and 5 of 5 runs green (claimed 14/14, 5x) |

## 2. N-a

- `CDC_GROUP_PROPAGATION_MESSAGE` has exactly one value, `STATUS_DELIVERED: 'delivered'`. Every owner result carries it regardless of success: grouped `service.js:291`, stopped `:393`, safe `:448`.
- Nothing in src reads `status` from a propagation result: the subscriber discards the result.
- Putting it on the stopped answer is therefore consistent, and "stopped" is expressed once, per target, as `PROPAGATION_STOPPED`. The second vocabulary from round 6 is gone.
- **Recommendation: keep it**, so all results have one shape, and record a follow-up to delete the field owner-wide. A single-valued status with no reader carries no information, and "delivered" next to `success:false` misleads a future reader. Omitting it only on the stopped answer would reintroduce a special shape.

## 3. N-c

Mostly accurate: the lifecycle entry points, the teardown window, the `isShuttingDown` guard on the deferred seed start, and the conclusion are all right. One inaccuracy, non-blocking:
- It states that `CDCGroupPropagationService.start()` "is called only from the static `LatencyTopologySetup.start` (:135)".
- It is also called directly on the create-if-absent paths: `seed-runtime-bridge-owner.js:133` and `node-joining-publication-activation.js:702`. The previous version of the record listed both; this revision dropped them.
- Those calls act on a freshly created instance, never a stopped one, so the conclusion holds. The enumeration should list them.

## 4. Nothing regressed (fix)

**Witness files:**

| Witness file | Result |
|---|---|
| stop-arms-nothing | 14/14, 5 of 5 runs |
| stop-settles-deliveries | 6/6 |
| seed-teardown-pending-cdc-delivery | 1/1 |
| cdc-shutdown-terminal-owner-write | 10/10 |
| membership-publication-first-epoch-members | 11/11 |
| bootstrap-request-shut-down-writer-not-ready | 1/1 |

**Runs** (thermal-gated, stopping at the first red):

| Run | Result |
|---|---|
| test/topology, `--jobs=2` | 14/14 |
| membership-consistency, 3x | 93/93 each, about 56 s TAP |
| seed-node-bootstrap, 1x | 110/110, 36.8 s wall vs 35.5 s TAP |

**Gates, run in the worktree** (clean afterwards, head b3bb872c7):

| Gate | Result |
|---|---|
| complexity | 1813 |
| cognitive | 159 |
| unused exports | 1437 |
| file size | 27/21 |
| duplication | 56/1815 and 791/30451 |
| check-fast-static | ok |
| audit:guidelines | rc=0 |
| eslint | rc=0 |
| inventory `--verify-import-graph` | rc=0 |

## Commands

- Witness: `node --import=<@tapjs/mock/import> <witness file>` under `timeout -k 5 150`, in each export.
- Mutants: made by one-line insertions with a python replace in scratch copies of `$V/fix`.
- Probe: `ROOT=<export> timeout -k 5 60 node q-swap.mjs`.
- Suites: `node scripts/run-test-files.js --jobs=2`.
- Integration: `run.sh` behind `wait-for-thermal-headroom`.

I made no source edits or git writes in the repository. One of my own wait loops matched its own command line and was killed by its PID. No child processes survive.
