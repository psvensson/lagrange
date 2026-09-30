# Verdict, round 6: fixes/cutover-seed-parity @ b92027363 (change 12adc944e..b92027363)

**REJECT, on one blocking item (R6-1), which concerns the evidence, not the production code.**
- The production code passes every property check I could build: no owner timer, router call or source proposal after stop in any lane, and every waiter settles.
- N1, N4, the move into the mixin and the N3 record are correct, with one small inaccuracy in the record (N-c).
- Nothing regressed.

The rewritten witness, however, can still be defeated by owner code. Two mutants in the owner file arm a referenced 1 s timer after stop and pass 14/14. The witness's own claim ("whatever primitive or module created it") is therefore falsified, and the owner's non-negotiable (evidence tests the property) is not met.

The gap comes from attributing a timer by the stack that creates it, which is also the approach I suggested in round 5 (r5 N2). That suggestion was incomplete.

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity/r6`. Exports, each built with `git archive` with node_modules symlinked:

| Export | Tree |
|---|---|
| `$V/fix` | b92027363 |
| `$V/p6e` | 6e432286d |
| `$V/p12` | 12adc944e |
| `$V/mut5` | the round-5 mutant |
| `$V/mutA` … `$V/mutD` | round-6 scratch mutants of `fix` |

The new witness file was copied into p6e, p12 and mut5.

## Blocking

**R6-1. The property witness misses timers created from owner code through a detached continuation.**
- Where: `test/topology/cdc-group-propagation-stop-arms-nothing.test.js`, hook at ~:70-85. It attributes a Timeout or Immediate to the owner only when an owner frame (`src/topology/cdc-group-propagation*.js:<line>`) is on the synchronous creating stack.
- A timer created in a later tick, by code whose stack no longer contains an owner frame, is not attributed, even though owner code scheduled it.

Mutants (each adds one line in the owner's stopped branch, `delivery-methods.js:550`), all run with the witness file:

| Mutant | The one added line | Witness result |
|---|---|---|
| mutA | `if (this.isPropagationStopped()) { Promise.resolve(this.deliveryRetryMaxDelayMs).then(waitFor); }` (`waitFor` = `node:timers/promises` setTimeout) | **passes 14/14** (`$V/w-mutA.out`) |
| mutC | `if (this.isPropagationStopped()) { process.nextTick(setTimeout, () => {}, 1000); }` | **passes 14/14** (`$V/w-mutC.out`) |
| mutB, control | `queueMicrotask(() => setTimeout(...))`, with the arrow defined in the owner | caught (13/14, lane 12) |
| mutD, control | `await waitFor(...)` (async stack) | caught (13/14, lane 12) |

- Both escaping mutants leave a live referenced 1 s timer after stop. My resource-level probe (`$V/probes/n-stop-orderings.mjs`, case E) shows `activeTimeouts: 1` on mutA and mutC, and 0 on the fix (`$V/probes/n.{mutA,mutC,fix}.out`).
- These escapes are inside the owner, not outside it: the timer exists only because owner code scheduled it. Only the creating stack is foreign (node internals).
- **Timers created on the owner's behalf by another module:** in this composition the router and the source group are test fakes, so none exist. With a real router, a synchronous `router.deliver()` call from the owner would be attributed, because the owner frame is below it on the stack. That is correct: the owner starts no router call after stop, and the router-call assertion covers it.
- **Stack depth:** the 64-frame limit was not reached by any real lane, so it is not a practical escape.
- **Repair, test-only:** add a resource-level assertion per lane, and keep the stack check as the attribution for diagnostics. The lane composition is fully in-memory, so after `stop()`, and once the lane has settled and the test's own `setImmediate` turns are done, the number of live `Timeout` and `Immediate` handles (`process.getActiveResourcesInfo()`) must equal the count taken just before `stop()`.
  - A narrower alternative: record every Timeout and Immediate init in the window and exclude only those whose stack starts in the test file (`turns()`).
  - Either one catches mutA and mutC, which my probe demonstrates.

## 1. The red/green table, reproduced

Outputs: `$V/w-{p6e,mut5,p12,fix}.out`.

| Tree | Result | Red lanes (named assertion) |
|---|---|---|
| 6e432286d | 9/14 | 1, 2 (no proposal on the source group); 5 and 13 (no router delivery after stop); 12 (no timer or immediate created from the owner) |
| r5 mutant | 11/14 | 1, 2; 12 (the `timers/promises` wait) |
| 12adc944e | 12/14 | 1, 2 (N1) |
| b92027363 | 14/14 | none |

This matches the implementer's claim exactly.

- **Determinism:** 5 runs on the fix, stopping at the first red: 5/5 green, 206-210 ms each (`$V/det-*.out`). Order is driven by held promises and mock timers, with no wall-clock waits.
- **Beyond R6-1:** my own async_hooks probe (`$V/probes/p-property.mjs`, output `p.fix.out`) shows, for propagate-after-stop in safe and grouped mode, grouped delivery in flight at stop, stop during the source apply, and the deferred and background lanes after stop: 0 owner timers, 0 source proposals and 0 router calls after stop.

## 2. N1: caller census and the stopped answer

- `propagateCDCEvent` (`service.js:192-203`) asserts the caller's contract (`assertPropagationRequest`, `:361-372`). When stopped, it returns `buildStoppedPropagationResult` (`:381-397`) with no source apply and no delivery: `success:false`, `status:'stopped'`, and every safe target `propagation_stopped`.
- **Callers:**
  - `SeedRuntimeBridgeOwner.propagatePartitionCDCEvent` (`seed-runtime-bridge-owner.js:162-179`), reached through `bootstrap-service-replica-registration-methods.js:191`, `bootstrap-service-seed-delegates.js:303` and `seed-cache-hydration-phase.js:725`;
  - `NodeJoiningPublicationActivation.propagatePartitionCDCEvent` (`node-joining-publication-activation.js:724-735`).
  - All of them feed the one consumer, `partition-cdc-propagation-subscriber.js:220`, which awaits the result and **discards it**.
- **How a stopped result is handled:**
  - It is not read as success by any code: nothing reads `success`, `status` or `deliveryFailures`.
  - It is not retried: the subscriber does not throw, so the partition does not buffer or replay it.
  - Nothing reads a missing field, so it cannot throw.
- **Effect at the partition:** the event counts as delivered (`partition-service-cdc-stream-base.js:139-170`) and `afterPropagation` runs. That is the pre-existing contract: propagation failures belong to the owner's own retries and never surface to the partition. After stop no retry follows, so on a node that is shutting down the event is terminal.
- **The CDC write owner:** the CDC integration service's typed SHUT_DOWN answers the write path (`executeSQL`), which never consumes propagation results. There is no crossover and no unconfirmed-write reporting.
- **Vocabulary:** see N-a below.

## 3. N4: no semantic change

- The states are CREATED, INITIALIZED, RUNNING and STOPPED. The only state writes are at `service.js:69, 156, 167, 176`.
- A background wave entry or timer is created only while RUNNING: `scheduleBackgroundRetry` refuses otherwise, and re-arming happens only from a running wave.
- So at the entry of `runBackgroundRetryEntry`, the old `!== RUNNING` and the new `isPropagationStopped()` differ only for CREATED and INITIALIZED, where no wave can exist. The never-started and running cases behave the same.

## 4. Nothing regressed (fix)

**Witness files:**

| Witness file | Result |
|---|---|
| stop-settles-deliveries | 6/6 |
| seed-teardown-pending-cdc-delivery | 1/1 |
| cdc-shutdown-terminal-owner-write | 10/10 |
| membership-publication-first-epoch-members | 11/11 |
| bootstrap-request-shut-down-writer-not-ready | 1/1 |

**Runs** (thermal-gated, one at a time, stopping at the first red):

| Run | Result |
|---|---|
| test/topology, `--jobs=2` | 14/14 |
| test/bootstrap, `--jobs=2` | 183/184 |
| membership-consistency, 3x | 93/93 each, about 55 s TAP |
| seed-node-bootstrap, 1x | 110/110, 36.5 s wall vs 35.3 s TAP |

The one test/bootstrap failure is `critical-placement-trace-classifier`, which fails only in an export (not a git repository); it is green in the worktree.

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
| `generate-global-owner-debt-inventory.js --verify-import-graph` | rc=0 |

The lifecycle mixin (`cdc-group-propagation-lifecycle-methods.js`) holds exactly the methods removed from `service.js`, unchanged.

## 5. The N3 record

Mostly accurate: the scenario, the evidence, and the remedy (a stop-generation token and a restart witness) are right. Two imprecisions are listed as N-c.

## Non-blocking findings

- **N-a. A second name for "stopped" inside the owner.** `buildStoppedPropagationResult` puts the lifecycle state constant `CDC_GROUP_PROPAGATION_STATE.STOPPED` into the result's `status` field. Every other result uses `CDC_GROUP_PROPAGATION_MESSAGE.STATUS_*`, and the per-target error is `PROPAGATION_STOPPED`. Nobody reads `status` today; a `CDC_GROUP_PROPAGATION_MESSAGE.STATUS_STOPPED`, or reusing the delivery-error name, would keep one vocabulary (R06). This is not a clash with the CDC write owner's SHUT_DOWN, which belongs to a different owner and a different path.
- **N-b. Vacuous `success:false`.** When a stopped propagate has no safe targets, the result is `success:false` with an empty `deliveryFailures` (my probe topology with 0 safe targets). Harmless while nothing reads it, but ambiguous.
- **N-c. The N3 record is imprecise.**
  - It lists `latency-topology-setup.js:135` as setup-only. That line is inside the static `LatencyTopologySetup.start`, which is also reached from `startLatencyTopologyLifecycle` on an existing instance (`seed-runtime-bridge-owner.js:143-155`, `node-joining-owner-construction.js:311-316`).
  - "Nothing restarts a stopped instance" holds only because teardown nulls the topology. It does so after an await: `LatencyTopologySetup.stop` is async (`seed-cleanup-handler.js:562-563`, `join-cleanup-handler.js:614-615`), so there is a microtask window.
  - The conclusion (not reached today) stands. The record should name the lifecycle entry points and the window.

## Commands

- Witness: `node --import=<@tapjs/mock/import> test/topology/cdc-group-propagation-stop-arms-nothing.test.js` under `timeout -k 5 150`, in each export.
- Probes: `ROOT=<export> timeout -k 5 60|90 node <probe>.mjs`.
- Suites: `node scripts/run-test-files.js --jobs=2`.
- Integration runs: `$V/../run.sh` behind `wait-for-thermal-headroom`.
- Gates: run in the worktree.

No child processes survive, and I ran no git writes or source edits in the repository; all mutants live in scratch exports.
