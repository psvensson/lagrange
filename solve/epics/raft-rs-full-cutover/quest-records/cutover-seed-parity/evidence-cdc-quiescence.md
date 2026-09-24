# Evidence: CDC shutdown quiescence (P-Q, P-L) for the two CDC lifecycle owners

Author: Agent A (evidence author), 2026-09-24. This record describes the evidence; it does not approve it. A fresh verifier attacks it.

- Frozen production: b3bb872c7. The catch-up repair candidate is 242da6ca2, whose src differs only in the catch-up and in `cdc-integration-service-shared.js` (`delayOn` deleted).
- The witnesses are:
  - `test/topology/cdc-group-propagation-stop-arms-nothing.test.js` (the propagation owner);
  - `test/cdc/cdc-shutdown-terminal-owner-write.test.js` (the integration owner);
  - `test/helpers/owner-work-ledger.js` (the owner-scoped async_hooks ledger and the structural census).
- The scratch evidence is under `scratchpad/verify-seed-parity/r8a/`.

## Properties (as written into both witness headers)

- **P-Q (quiescence).** Once a CDC lifecycle owner has reached its terminal state, no CDC-owned retry or publication work may remain pending, be newly scheduled, or execute.
- **P-L (process liveness), kept distinct from P-Q.** Terminal shutdown leaves no referenced CDC-owned handle capable of keeping the process alive.

## Terminal boundaries

| Owner | Boundary | Evidence |
|---|---|---|
| CDCGroupPropagationService | The first statement of `stop()`, `state = STOPPED`. `stop()` is synchronous and there is no STOPPING state, so stop requested and terminal coincide. | `src/topology/cdc-group-propagation-service.js:175-183`; states CREATED, INITIALIZED, RUNNING and STOPPED (`cdc-group-propagation-constants.js:7-12`); the only state writes are at `service.js:69, 156, 167, 176`. Primitive: `armPropagationTimer`, plus the `sleep` built on it (`cdc-group-propagation-lifecycle-methods.js:66, 76-92`). |
| CDC integration service lifecycle | The first statement of `markShuttingDown()`, `isShuttingDown = true`, which then releases every hold. There is no other lifecycle flag. | `src/cdc/cdc-integration-service-lifecycle.js:155-162`; the flag at `cdc-integration-service.js:131`; callers `seed-cleanup-handler.js:642` and `join-cleanup-handler.js:707`, before the engine shutdown and the partition release. Primitives: `delayUntilShutdown` (`:185-201`) and `holdUntilShutdown` (`:170-177`). |

## Proof legs

Both owners use the same four legs. None of them counts global Node handles.

**Census (structural).** A test assertion over the owner's files.
- Every `setTimeout`, `setInterval` and `setImmediate` reference is named by file and enclosing function, and must equal the classified list.
- No `node:timers` or `timers/promises` import, and no `refresh()`.
- For the CDC integration owner, additionally: no `delayOn`, and any delayed-work helper imported from outside `src/cdc` must be classified.

**Semantic.** After the boundary:
- the primitive refuses and arms nothing: `armPropagationTimer` answers null, and `delayUntilShutdown` resolves at once;
- a hold is released at once;
- every caller gets the terminal or stopped answer.

**State.**
- The owner's bookkeeping is empty after the boundary:
  - propagation: batch timers and entries, background timers and waves, held sleeps;
  - integration: `shutdownReleases`, and pending timers on the owner's clock.
- The owner work ledger (async_hooks) holds no pending owner Timeout or Immediate (P-Q), and none that is referenced (P-L).
- The ledger attributes by the owner frame on the creating stack, or by the owner resource that triggered the creation.

**Execution.**
- The ledger records no owner callback running after the boundary, and nothing created after it from any stack.
- Time is then moved past every delay: the virtual clock advances 24 h, or every pending owner callback is run.
- No router delivery, source proposal, engine write or authoritative read follows.

## Census table

| Site | Class | Reason |
|---|---|---|
| `src/topology/cdc-group-propagation-lifecycle-methods.js:66` `armPropagationTimer` | (a) | the primitive; refuses once stopped |
| `…-lifecycle-methods.js:76-92` `sleep` | (a) | arms through the primitive; released at stop |
| `…-delivery-methods.js:107` retry sleep; `armImmediateBatchEntry`; `armBackgroundRetryEntry` | (a) | all go through `armPropagationTimer` |
| `src/cdc/cdc-integration-service-lifecycle.js:185-201` `delayUntilShutdown` | (a) | the primitive |
| `src/cdc/cdc-routed-mutation-readiness.js:~470-487` routed-mutation retry delay | (a) | `delayUntilShutdown`; stops on `isShuttingDown` |
| `src/cdc/cdc-integration-service-cache-visibility-wait.js:157` wait budget timer | (a) | held by `holdUntilShutdown` (released at the mark; cleanup clears the timer) |
| `src/cdc/cdc-integration-service-cache-visibility-wait.js:342` repair retry delay | (a) | `delayUntilShutdown`; the loop ends on the mark |
| `src/cdc/cdc-integration-service-authoritative-catchup.js:162-164, 303` catch-up sleep | **(b) on b3bb872c7**, (a) on 242da6ca2 | On b3bb872c7 it is a CDC-owned retry around the primitive: a P-Q and P-L violation, now repaired. |
| `src/cdc/cdc-integration-service-shared.js:151-152` `delayOn` | (b) bypass route on b3bb872c7 (no caller) | Deleted in 242da6ca2; the census fails while it exists. |
| `src/cdc/cdc-confirmation-tracker.js:78` | (c) | Its timer only rejects a caller's confirmation wait (no retry or publication work). The tracker has its own `shutdown()` that clears every timer. No production code constructs it: `PartitionService` takes it as an option. |
| `src/cdc/cdc-pipeline-readiness-gate.js:64-65, 151` with `CDC_PIPELINE_READINESS_SLEEP` (`src/constants/cdc-lifecycle-constants.js:85`) | (c) | A caller-owned startup readiness wait (seed `seed-runtime-bridge-owner.js:188`, which injects `d.sleep`; joiner `node-joining-backfill-merge-and-status.js:413`). It schedules no CDC retry or publication work. |

## Results

**Propagation witness** (16 tests: 14 lanes, semantic, census):

| Tree | Result | Red tests |
|---|---|---|
| b3bb872c7 | 16/16, 5 of 5 runs | none |
| 242da6ca2 | 16/16 | none |
| 6e432286d (before R4-1) | 9/16 | lanes 1, 2, 5, 12, 13; semantic (no primitive); census |
| 12adc944e (before N1) | 13/16 | lanes 1, 2 (source proposal after stop); census (the lifecycle file does not exist yet) |

**Integration-owner witness** (16 tests: A2 lanes i-vii, persist-loop x2, semantic, catch-up x2, real-clock x2, census):

| Tree | Result | Red tests |
|---|---|---|
| b3bb872c7 | 12/16, 5 of 5 runs, deterministic | catch-up sleeping at the mark (at "holds no timer after the mark (P-Q)"); catch-up started after the mark (at "no authoritative read after the mark"); real-clock catch-up (at "no referenced owner handle keeps the process alive (P-L)"); census (at the catch-up and `delayOn` timer sites) |
| 242da6ca2 | 16/16, 5 of 5 runs | none |
| 4258fdc32 (base) | 1/16 | every lane but the live read-back |

## Attack matrix

Mutants live in scratch exports only. Each is a one-line change at a named anchor. "Leg" names the first failing assertion's leg.

### Propagation owner

Base: frozen production; `L` = `…-lifecycle-methods.js`, `D` = `…-delivery-methods.js`.

| # | Class | Mutation | Leg that caught it | Result |
|---|---|---|---|---|
| P1 | original timer survives (no-clear) | `L` `clearImmediateBatchTimers`: drop `clearTimeout(timer)`, keep the Set clear | state (ledger pending) | red, lane 7 |
| P1 | guard removed | `L:66` `return setTimeout(callback, delayMs)` | semantic | red |
| P1 | `timer.refresh()` instead of clear | `L` `clearImmediateBatchTimers` | state + census | red, lane 7 + census |
| P1 | background no-clear | `L` `clearBackgroundRetryTimers`: `void retryTimer` | state | red, lane 11 |
| P2 | swap in the stop helpers | `L` `setTimeout` after the batch resolve / sleep release / background clear | execution (created after stop) + census | red, lanes 7 / 10 / 11 |
| P3 | unref'd substitute | `L`, the same site: `.unref()` | created after stop + census | red |
| P3 | unref'd on every stopped path | `L` `buildStoppedFailures` | created after stop + census | red, 13 tests |
| P4 | interval | `L` `buildStoppedFailures`: `setInterval(...).unref()` | created after stop + census | red, 13 tests |
| P5 | callback re-arms | `D` post-attempt stopped branch: `setTimeout(() => runBackgroundRetryEntry…)` | created after stop + census | red, lane 12 |
| P6 | through an immediate chain | `L` `buildStoppedFailures`: 200 immediates, then `setTimeout` | execution (owner immediate ran after stop) + census | red, 15 tests |
| P6 | `process.nextTick(setTimeout, …)` | `D` stopped branch | created after stop + census | red, lane 12 |
| P7 | `Promise.resolve(ms).then(waitFor)` (`timers/promises`) | `D` stopped branch plus import | created after stop + census (import) | red, lane 12 |
| P7 | microtask | `D` stopped branch: `queueMicrotask(() => setTimeout…)` | created after stop + census | red, lane 12 |
| P7 | 500-link promise chain | `L` `buildStoppedFailures` | created after stop + census | red, 13 tests |
| P8 | race, R4-1 reintroduced (post-attempt guard removed) | `D:550-554` | none | **green: an equivalent mutant.** The primitive refuses the re-arm (`armBackgroundRetryEntry` gets null), so P-Q still holds. |
| P8 | race, in-flight-attempt guard removed | `D:89-93` | semantic (answer not stopped) | red, lane 6 |
| P9 | direct call after stop (entry guard removed) | `D:58-60` | none | **green: an equivalent mutant.** The batch arm is refused and the per-target guard answers stopped. |
| P10 | foreign module (`RealTimeSource`, name computed to evade the census) | `L` `buildStoppedFailures` plus import | created after stop (the census is evaded, the runtime legs catch it) | red, 12 tests |
| P10 | detached continuation into a global unref'd timer (name computed) | `D` stopped branch | created after stop | red, lane 12 |

### Integration owner

Base: the scratch reference fix, with the catch-up through `delayUntilShutdown` and `delayOn` deleted; plus 242da6ca2 for K1-K4. `LC` = `cdc-integration-service-lifecycle.js`; `MARK` is the release loop in `markShuttingDown`.

| # | Class | Mutation | Leg that caught it | Result |
|---|---|---|---|---|
| C1 | catch-up guard removed | catch-up attempt-loop guard | execution (read after the mark) | red |
| C1 | catch-up raw sleep | `clock.setTimeout` sleep | state (timer after the mark) + P-L + census | red |
| C1 | routed retry bypasses the primitive | `cdc-routed-mutation-readiness.js:473` | state + census | red |
| C1 | delay not cleared at the mark | `LC` `delayUntilShutdown` release drops `clearTimeout` | state | red |
| C1 | `refresh()` instead of clear | same | state + real-clock ledger | red |
| C2 | swap at the mark | `LC` after `MARK`: `this.timeSource.setTimeout` | state | red, 13 tests |
| C3 | unref'd at the mark | `LC` after `MARK`: `setTimeout().unref()` | real-clock ledger pending + census | red |
| C4 | interval at the mark | `LC` after `MARK`: `setInterval().unref()` | real-clock ledger + census | red |
| C5 | a release re-arms | `LC` `delayUntilShutdown` release arms a nested timer | state | red |
| C6 | through an immediate | `LC` after `MARK`: `setImmediate(() => timeSource.setTimeout…)` | state + census | red |
| C6 | `process.nextTick(setTimeout, …)` | `LC` after `MARK` | real-clock P-L + census | red |
| C7 | microtask | `LC` after `MARK`: `Promise.resolve().then(() => timeSource.setTimeout…)` | state | red |
| C7 | `timers/promises` | `LC` after `MARK` plus import | real-clock P-L + census | red |
| C8 | race (ii-b): visibility wait not held | `cache-visibility-wait.js:299` hold replaced | semantic / state | red, (ii-a), (ii-b), and state |
| C8 | race: refusal before routing removed | `LC` `executeSQL` terminal refusal | semantic | red, (iii) and (vi) |
| C9 | the primitive arms after the mark | `LC` `delayUntilShutdown` early return removed | state (semantic test) | red |
| C10 | foreign module (`RealTimeSource`, computed name) | `LC` after `MARK` plus import | real-clock P-L (the census is evaded) | red |
| C10 | detached continuation into a global unref'd timer | `LC` after `MARK` | real-clock ledger pending | red |
| K1 | 242da6ca2: post-sleep terminal break removed | catch-up | execution (read after the mark) | red |
| K2 | 242da6ca2: raw clock sleep | catch-up | state + P-L + census | red |
| K3 | 242da6ca2: table-level terminal check removed | catch-up | execution | red |
| K4 | 242da6ca2: `isTerminal` always false | catch-up | execution | red |

**Considered and not run:**
- **Anonymous-frame abuse of the test-file exclusion:** not constructible from owner code alone, because every owner call path has a named, parenthesised owner frame. The ledger also follows trigger ancestry.
- **A MessagePort or I/O-based delay:** outside Timeout/Immediate, so outside this census. A MessagePort ping-pong is not a timer primitive and not in P-Q's "retry" sense. Recorded, not run.
- **A continuation on a promise the lane still holds at assert time:** the stated residual limit. No lane holds one on the candidates.
- **A restart during a wave:** the separate N3 finding (a different property: start after stop).

## Gates (tier E0, run in the evidence worktree)

- eslint on the three touched files: rc=0.
- `test:metadata:refresh`, then audit:shards: OK, 2173 tests.
- check-fast-static: ok.
- `npm run -s test:duplication`: 56/1815 and 791/30451.
- Inventory `--refresh`, then `--verify-import-graph`: rc=0.
- The regenerated metadata and inventory files were restored afterwards; the lead regenerates on commit.
