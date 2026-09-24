# Agent A (evidence author), stop report: frozen production violates P-Q and P-L

Frozen production is **b3bb872c7**. Check: `git diff --name-only b3bb872c7..HEAD -- src/` prints nothing (worktree head 518538b1c).

I made no worktree edits and no git writes. Probes and the frozen-production export are in `$V = …/scratchpad/verify-seed-parity/r8a/`. The export was built with `git archive b3bb872c7` into `$V/prod`.

## The blocker

The CDC authoritative catch-up's retry delay is not bounded by the integration service owner's terminal boundary.

**Where:**
- `src/cdc/cdc-integration-service-authoritative-catchup.js:162-164`: the default `sleep` is `clock.setTimeout` on the service's clock.
- `:203-307`: the per-table attempt loop: a deferred read, then `await sleep(retryAfterMs || 500)`, then the next attempt, up to 3 per table.
- The method belongs to the CDC integration service (`cdc-integration-service-mutation-operations.js:85-86`).
- No production caller injects `sleep`:
  - `membership-publication-coordinator-reconcile.js:344` and `:398`, the reconcile catch-ups;
  - `node-joining-ready-signal-readiness.js:566`.

**Reproduced on b3bb872c7:**

Probe `$V/probes/catchup-pq.mjs`: the authoritative read answers deferred before terminal, and `markShuttingDown()` runs while the catch-up sleeps. Output: `$V/probes/catchup-pq.prod.out`.
- Virtual clock: a timer is still pending after terminal (`virtualPendingAfterTerminal: 1`), and **5 authoritative read retries execute after terminal**.
- The service's real clock: **1 referenced Timeout** is live after terminal (`refedTimeoutsAfterTerminal: 1`), and the same 5 reads execute after terminal.

Probe `$V/probes/catchup-pq-realread.mjs`: the real read answers after terminal. Output: `catchup-pq-realread.prod.out`.
- The retry timer is pending at terminal (1).
- After it fires, **22 authoritative reads execute after terminal**, one per CDC-propagated table, each answering `authoritative_row_source_unavailable`.

**Properties violated:**
- **P-Q:** a CDC-owned retry stays pending (the armed sleep) and executes (the retried authoritative read) after `markShuttingDown`. The catch-up's reads feed `applyAuthoritativeCacheRepair` (cache repair of the propagated tables), and its retries are deferral-driven. So this is CDC-owned retry work, not a caller-owned wait.
- **P-L:** the sleep is a referenced `setTimeout` on the service clock. It survives the terminal boundary for up to `retryAfterMs`, which comes from the failure and is uncapped, or 500 ms by default. A2 excludes "merely shorter than 90 s".
- **Re-classification of the recorded finding.** `finding-cdc-catchup-sleep-at-shutdown.md` scoped this out as a "read path". Under P-Q as the owner now states it, the read-path framing does not exempt it: the property concerns CDC-owned retry work, and this is a CDC-owned retry. **It violates P-Q.**

**Class repair (tier P1, for the production implementer; not done here):**
- Default the catch-up `sleep` to `service.delayUntilShutdown(ms)`, the owner's primitive (`cdc-integration-service-lifecycle.js:185`).
- End the attempt loop and the table loop when `service.isShuttingDown === true`, with a typed terminal answer per table instead of reads. That is the same shape as `confirmCacheVisibilityHoleWithinBudget` (`cache-visibility-wait.js:316-317`).

**A semantic question for the lead:** a catch-up *started* after terminal, with no pending sleep, still performs its first read for each table (22 reads). Is a first-attempt catch-up read "CDC-owned publication work" under P-Q? I read it as yes, because the catch-up is a cache-repair unit of work. The class repair above covers both, but the lead should confirm which property governs it.

## Terminal boundaries (from the frozen production code)

| Owner | Terminal boundary | Evidence |
|---|---|---|
| CDCGroupPropagationService | `stop()`'s first statement, `state = STOPPED`. It is synchronous and there is no STOPPING state, so stop requested and terminal coincide. | `cdc-group-propagation-service.js:175-183`; the state set is `CREATED`/`INITIALIZED`/`RUNNING`/`STOPPED` (`cdc-group-propagation-constants.js:7-12`); the only state writes are at `service.js:69, 156, 167, 176` |
| CDC integration service lifecycle | `markShuttingDown()`'s first statement, `isShuttingDown = true` (`cdc-integration-service-lifecycle.js:155-156`). It then releases every hold (`:157-162`). There is no intermediate phase: `isShuttingDown` is its only lifecycle flag (`cdc-integration-service.js:131`). | Callers: `seed-cleanup-handler.js:642` and `join-cleanup-handler.js:707`. Each marks before the engine shutdown and before the partition release. |

## Census of CDC delayed-work and retry sites (the sibling sweep for this category)

Every `setTimeout`, `setInterval`, `setImmediate`, timeSource or clock `setTimeout`, `timers/promises`, and imported sleep in `src/cdc/` and `src/topology/cdc-group-propagation*.js`:

| Site | Classification | Reason |
|---|---|---|
| `topology/cdc-group-propagation-lifecycle-methods.js:66` `armPropagationTimer` | (a) the primitive | refuses once stopped |
| `topology/cdc-group-propagation-lifecycle-methods.js:76-92` `sleep` | (a) | arms through the primitive; released at stop |
| `topology/cdc-group-propagation-delivery-methods.js:107` `await this.sleep(...)` | (a) | goes through the primitive's `sleep` |
| batch window and background wave arms (`delivery-methods.js` `armImmediateBatchEntry`, `armBackgroundRetryEntry`) | (a) | `armPropagationTimer` |
| `cdc/cdc-integration-service-lifecycle.js:185-201` `delayUntilShutdown` | (a) the primitive | held until `markShuttingDown` |
| `cdc/cdc-routed-mutation-readiness.js:~470-485` routed-mutation retry delay | (a) | `delayUntilShutdown`; stops when `isShuttingDown` (`:463`, `:475`, `:487`) |
| `cdc/cdc-integration-service-cache-visibility-wait.js:157` wait budget timer | (a) | `holdUntilShutdown` releases the wait and `cleanup` clears the timer |
| `cdc/cdc-integration-service-cache-visibility-wait.js:342` repair retry delay | (a) | `delayUntilShutdown`; the loop ends when `isShuttingDown` (`:316-317`) |
| **`cdc/cdc-integration-service-authoritative-catchup.js:162-164, 303`** catch-up sleep | **(b) ownership defect: BLOCKER** | a CDC-owned retry around the owner's primitive (above) |
| `cdc/cdc-integration-service-shared.js:151-152` `delayOn` | (c), no call site | exported helper with no caller in src or test. No work is scheduled today, but a reuse would bypass the primitive. Recommend deleting it or routing it to `delayUntilShutdown`. |
| `cdc/cdc-confirmation-tracker.js:78` | (c) | Its timer only rejects a caller's confirmation wait (no retry or publication work). The tracker has its own `shutdown()`, which clears every timer. No production code constructs it: `PartitionService` accepts it as an option (`partition-service-core-base.js:196`), and only tests build one. |
| `cdc/cdc-pipeline-readiness-gate.js:64-65, 151` polling `_sleep` | (c) | A caller-owned startup wait: seed `seed-runtime-bridge-owner.js:188` (injects `d.sleep`) and joiner `node-joining-backfill-merge-and-status.js:413`. It evaluates readiness and schedules no CDC retry or publication work. It is not a CDC lifecycle owner's work. |

## Not done (stopped at the blocker, per the brief)

- The witness edits are not made: P-Q and P-L are not yet written into the headers, and there are no owner-scoped census, semantic, state or execution legs.
- The full attack matrix against my own witness was not run.
- The E0 gates were not run.

Round-8 partial results are in `…/verify-seed-parity/r8/partial-r8.md`: the committed witness is red on all 13 r7 mutants, and refresh and no-clear are expected escapes from the handle/creation checks.
