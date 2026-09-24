# Verdict, round 5: fixes/cutover-seed-parity @ 12adc944e (change 6e432286d..12adc944e)

**APPROVE.** No blocking findings.
- **R4-1 is closed.** Every ordering from A to F settles at once with no timer, sleep or router call after stop.
- **The timer class is closed in the owner's production code.** A property-level probe across eight lanes found no timer or immediate created from inside the owner after `stop()`.
- **The new witnesses are red on 6e432286d**, and the E and C cases are red at behavioural assertions.
- **Nothing regressed.**

There are five non-blocking findings. The most useful are N1 (one post-stop path that starts work) and N2 (the census witness tests a code shape, not the property).

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity/r5`. Exports:

| Export | Tree |
|---|---|
| `$V/fix` | 12adc944e |
| `$V/prev` | 6e432286d plus the new witness file |
| `$V/mut` | 12adc944e with one scratch mutation, used for N2 only |

Probes are in `$V/probes/`.

## 1. R4-1 closed

`n-stop-orderings.mjs` (`$V/probes/n.{fix,prev}.out`) and `m-inflight-attempt-at-stop.mjs` (`m.{fix,prev}.out`) on 12adc944e:

| Case | Result on 12adc944e |
|---|---|
| A: router throws after stop | settled at once, `propagation_stopped` |
| B: attempt succeeds after stop | settled, `[]` (honest: the router acknowledged) |
| C: two targets, stop during the first | both targets `propagation_stopped`, 0 router calls after stop (6e432286d: 1 call after stop, second target not answered) |
| D: two concurrent deliveries | both settled at once, stopped |
| E: background wave in flight at stop | `backgroundRetryTimers 0`, `activeTimeouts 0` (6e432286d: 1 and 1) |
| F: stop during a batch flush | settled at once, stopped |
| m, maxAttempts 3 and 1 | both settled at once, `propagation_stopped`, 0 timers |

In every case: 0 held sleeps, 0 batch timers, 0 background timers and 0 active Timeout resources after stop.

## 2. The post-stop class in this owner: my own census

The owner's files are `cdc-group-propagation-service.js`, `-delivery-methods.js` and `-routing.js`; `-constants.js` holds data only.

**Timer creation.** Every timer is created through `armPropagationTimer` (`service.js:233-235`), which refuses when stopped. Its callers:
- `sleep` (`service.js:244-259`): a refused arm resolves at once, and each caller re-checks `isPropagationStopped()` (`delivery-methods.js:108`).
- `armImmediateBatchEntry` (`:263-276`): a refusal drops the entry and answers stopped (`:212-215`).
- `armBackgroundRetryEntry` (`:429-442`): a refusal drops the entry.

**Retry and reschedule paths:**
- `scheduleBackgroundRetry` (`:343`) refuses unless RUNNING. `scheduleDeferredDeliveryEvents` (`:162`) goes through it.
- `rescheduleBackgroundRetryEntry` and `armBackgroundRetryEntry` refuse through the primitive.
- `runBackgroundRetryEntry` refuses unless RUNNING at entry (`:512`) and checks stopped after the attempt (`:549`).
- `deliverToTargetsWithRetry` checks stopped at entry (`:58`), after each attempt (`:90`) and after each sleep (`:108`).

**Delivery starts:**
- `deliverToTargets` checks stop before each target (`:684`).
- `recoverGroupedDeliveryFailuresWithSafeFanout` (`service.js:~500-560`) only calls `deliverToTargetsWithRetry`, which answers stopped.

**Emits:** `PROPAGATED` (`service.js:378`) and `SAFE_FALLBACK` (`:575`) have no listener anywhere in src (searched), so nothing re-enters the service.

**Property probe.** `$V/probes/p-property.mjs` uses an async_hooks `init` hook that records every Timeout and Immediate whose creating stack is inside the owner. Output: `$V/probes/p.{fix,prev}.out`. On 12adc944e these lanes create **0** owner timers after stop:
- `propagateCDCEvent` after stop, in safe mode and in grouped mode (grouped mode takes the grouped-recovery fallback path);
- grouped propagate with stop during the in-flight grouped delivery;
- safe propagate with stop during the source apply;
- deliver, `scheduleDeferredDeliveryEvents` and `scheduleBackgroundRetry` called after stop.

## 3. New witnesses red on 6e432286d for the right reason

`$V/w-arms-{prev,fix}.out`:
- On 6e432286d the file is 0/4:
  - **E** fails at "no background retry timer is armed after stop" (behavioural).
  - **C** fails at "no router delivery is started after stop" (behavioural).
  - The primitive test fails at "the service owns one timer primitive" (the primitive does not exist).
  - The census fails at "every timer is armed through the primitive that refuses after stop".
- On 12adc944e it is 4/4.

## 4. Nothing regressed

**Witness files on 12adc944e:**

| Witness file | Result |
|---|---|
| stop-settles-deliveries | 6/6 |
| seed-teardown-pending-cdc-delivery | 1/1 |
| cdc-shutdown-terminal-owner-write | 10/10 |
| membership-publication-first-epoch-members | 11/11 |
| bootstrap-request-shut-down-writer-not-ready | 1/1 |

Outputs: `$V/w-*.out`.

**Runs** (thermal-gated, one at a time, stopping at the first red):

| Run | Result |
|---|---|
| test/topology, `--jobs=2` | 14/14, exit 0 |
| membership-consistency, 3x | 93/93 each, about 55-57 s TAP |
| seed-node-bootstrap, 1x | 110/110, 35.9 s wall vs 34.9 s TAP |
| fresh-join-via-non-seed-node, 3x | 11/11 each |

**Gates, run in the worktree** (clean afterwards):

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

**The guard across the state machine** (CREATED → `initialize` → INITIALIZED → `start` → RUNNING → `stop` → STOPPED; `start()` is allowed from STOPPED):
- **Never started (INITIALIZED):** the guard allows arming. A batch window is armed and runs (probe lane "never-started-deliver"), exactly as on 6e432286d. That is consistent: the guard refuses only STOPPED, and `stop()` from any state moves to STOPPED.
- **Restart (`stop()` then `start()`) before a delivery:** it arms normally, which is correct.
- The restart-during-a-wave edge is N3.

## Non-blocking findings

**N1. `propagateCDCEvent` has no stop guard at entry, so a call after `stop()` still applies the event to the local source group.**
- Where: `cdc-group-propagation-service.js:~260-317` (grouped) and `propagateSafe` `:~380-385`.
- `sourceMessageGroupService.applyCDCEvent` runs, which is a raft proposal on the local message group, before the deliveries answer stopped. Probe lanes 1 and 2 show `appliesAfterStop: 1` on both trees.
- Scenario: `LatencyTopologySetup.stop` is async, and the seed cleanup nulls the topology only after its promise resolves (`seed-cleanup-handler.js:562-563`; join cleanup `:614-615`). A partition CDC subscriber resumed in that microtask gap, or any holder of a stale service reference, makes the stopped service start a proposal.
- The partition's pending delivery then waits up to `proposeTimeoutMs`, which bounds it. This is pre-existing.
- Repair: answer stopped at `propagateCDCEvent` entry when `isPropagationStopped()`.

**N2. The census and the E witness test a code shape and bookkeeping, not the property.**
- Mutant `$V/mut`: `delivery-methods.js` imports `setTimeout as waitFor` from `node:timers/promises` and awaits `waitFor(1000)` in the background wave's post-attempt path.
- The new witness file still passes 4/4 (`$V/w-mut.out`), while probe n case E on the mutant sees `activeTimeouts: 1` after stop (`$V/probes/n.mut.out`).
- The regex census misses `timers/promises`, `queueMicrotask`/`process.nextTick` continuations, helpers imported from other modules (such as `delayOn`, `utils` sleeps), and methods mixed in from files outside the three. The E witness only counts the service's own Sets.
- A property-level witness would record the creation of every Timeout and Immediate during each lane with `async_hooks.createHook({init})`, filtered to creating stacks inside the owner, or equally assert `process.getActiveResourcesInfo()` has no new Timeout. It would drive every public lane with stop at each await point and assert zero creations after stop. `p-property.mjs` is a working template.

**N3. Restart during an in-flight background wave resurrects the pre-stop wave.**
- With `stop()` then `start()` while a wave's attempt is in flight, the post-attempt check sees RUNNING again. The wave records its events and re-arms in the restarted service (probe lane `restart-during-bg-wave`: `bgEntriesAfterRestart 1, bgTimersAfterRestart 1`), the same as on 6e432286d.
- `start()` is called only at setup (`latency-topology-setup.js:135`, `seed-runtime-bridge-owner.js:133`, `node-joining-publication-activation.js:702`), so this is not reached today.
- A stop generation token checked after each await would close it.

**N4. Two different guards.** `runBackgroundRetryEntry` checks `state !== RUNNING` at entry but `isPropagationStopped()` after its attempt. They differ only for CREATED and INITIALIZED, which have no background waves (`scheduleBackgroundRetry` needs RUNNING). Consistent in effect, but two predicates.

**N5. Router delivery in flight at stop.** It is outside the owner and bounded by the router's pending-response timeout. Its answer is converted to stopped.

## Commands

The probes ran as `ROOT=<export> timeout -k 5 60|90 node <probe>.mjs` (rc=0 each). The witness files ran with the tap loader (`--import=@tapjs/mock/import`) under `timeout -k 5 150`. The suite used `node scripts/run-test-files.js --jobs=2`. The integration runs used `$V/../run.sh` behind `wait-for-thermal-headroom`.

No child processes survive, and I ran no git writes or source edits in the repository; the mutation lives only in the scratch export.
