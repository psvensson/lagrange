# Verdict, round 4: fixes/cutover-seed-parity @ 6e432286d (change 13950e88b..6e432286d)

**REJECT, on one blocking item (R4-1).**
- **R3-1 is closed.** In both variants the in-flight attempt settles at once with `propagation_stopped`, and no retry delay is armed after stop.
- **The new witnesses are red on b5a77287f and green on the fix.** Nothing regressed.
- **But the same owner still arms a retry timer after `stop()` on the background-retry lane.** That is the category this round was asked to exhaust.

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity`. Exports: `$V/r4/fix` (6e432286d) and `$V/r4/prev` (b5a77287f plus the new witness file). Probes are in `$V/r4/probes/`.

## Blocking

**R4-1. A background retry wave that is in flight when `stop()` lands re-arms its retry timer after stop.**
- In `cdc-group-propagation-delivery-methods.js:531-585`, `runBackgroundRetryEntry` checks `state !== RUNNING` only before its attempt.
- After `await this.deliverToTargets(...)` it goes on to `rescheduleBackgroundRetryEntry` and then `armBackgroundRetryEntry` (`:588-605`, `:388-426`). That path has no stopped check, so it arms a referenced `setTimeout` of `computeRetryDelayMs(attempt)`, at most 1000 ms, after stop.
- When that timer fires it returns without delivering, because the state is not RUNNING. So the effect is a stray timer that keeps the process alive for at most 1 s. It sends nothing, and the partition shutdown does not wait on it.
- Probe `n-stop-orderings.mjs`, case E: after stop, `backgroundRetryTimers: 1, activeTimeouts: 1`. The fix and b5a77287f give the same result (`$V/r4/probes/n.{fix,prev}.out`), so it is pre-existing in this owner.
- It contradicts the owner's stated stop contract ("every retry delay it holds ... no background retry will follow") and the categorical rule applied in B1, B-D and R3-1.
- The repair is one guard: `if (this.state !== RUNNING) return;` after the wave's attempt, or inside `armBackgroundRetryEntry`, plus a witness for this ordering.
- If you judge this below the bar, it is the only item, and it is pre-existing.

## Checks confirmed

**R3-1 closed.** `m-inflight-attempt-at-stop.mjs` (`$V/r4/probes/m.{fix,prev}.out`):

| Variant | fix | b5a77287f |
|---|---|---|
| maxAttempts 3 | settles at once, `propagation_stopped`, 0 sleeps, 0 timers | 1 retry sleep armed, settles after 51 ms |
| maxAttempts 1 | settles at once, `propagation_stopped` | answers the router's `refused` |

**New witnesses.** `test/topology/cdc-group-propagation-stop-settles-deliveries.test.js` tests 5 and 6 are red on b5a77287f:
- test 5 at "the delivery settles once the service stops, without any clock moving";
- test 6 at "the answer is the typed stopped outcome, never a success or a pending retry".

On the fix the file passes 6/6 (`$V/r4/w-{prev,fix}.out`).

**Other orderings** (probe `n-stop-orderings.mjs`, fix vs b5a77287f):

| Case | fix | b5a77287f |
|---|---|---|
| A: router throws after stop | settles at once, `propagation_stopped`, no timers | a sleep is armed |
| B: in-flight attempt succeeds after stop | answers success (`[]`); honest, since the router acknowledged the delivery | the same |
| D: two concurrent deliveries in flight | both settle at once, stopped, no timers | 2 sleeps armed |
| F: stop during an immediate-batch flush | settles at once, stopped, no timers | a sleep is armed |
| C: two targets, stop during the first target's attempt | first target answered stopped, no timers | no stopped answer yet, a sleep is armed |

Case C also shows one router delivery made after stop, on both trees (finding N1 below).

**PROPAGATION_STOPPED.** It is produced only by `buildStoppedFailures`. Nothing outside the service reads `deliveryFailures`, so the stopped answer is never treated as success or retried (unchanged from round 3).

## Non-blocking finding

**N1. `deliverToTargets` keeps fanning out to the remaining targets of an attempt after stop.**
- In case C, one router delivery is made after stop (`routerCallsAfterStop: 1`) on both trees.
- It is not a retry and not a timer the service owns. The router's own pending-response timeout bounds it.
- A stopped check per target inside `deliverToTargets` (`:693`) would make "no delivery after stop" hold within an attempt too. This is pre-existing.

## Runs and gates (fix)

| Run | Result |
|---|---|
| test/topology, `--jobs=2` | 13/13, exit 0 |
| test/bootstrap, `--jobs=2` | 183/184 |
| fresh-join-via-non-seed-node, 5x, stop at first red | 5/5 green, 21.7-26.7 s TAP |

The one test/bootstrap failure is `critical-placement-trace-classifier`, which fails only in an export (not a git repository); it is green in the worktree.

Gates, run in the worktree:

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

The worktree was clean afterwards.

The rest of the round-3 results stand. This change touches only `deliverToTargetsWithRetry`.

No child processes survive, and I ran no git writes.
