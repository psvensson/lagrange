verdict: reject

# Round 8 (Agent C, fresh final verifier): fixes/cutover-seed-parity @ 15bce6231, production_sha 242da6ca2

- No src diff in the evidence round: `git diff --name-only 242da6ca2..15bce6231 -- src/` prints nothing (exit 0).
- Scratch: `R=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity/r8c`. Exports `$R/t-<sha>` (git archive); mutants `$R/mut/*`; probes `$R/probes/*`; witness outputs `$R/out/*`; ledger attacks `$R/ledger-esc/*`.
- No repository edits, no git writes. Every process I started exited; the one runaway `node -e` of my own was killed by its PID (3821822).

## Blocking

### R8-1 (production, P-Q): CDC integration-owner work resumes after an in-flight await and crosses markShuttingDown without re-checking it

The P1 repair guards the catch-up loop only at its own boundaries: table start (catchup.js:207), after the read returns (:233) and after the sleep (:323). The owner's other continuations have no terminal check at all. When the mark lands while one of them awaits, CDC-owned retry and repair work runs after terminal. This is the same mechanism as the round-8 blocker, in its siblings. Probes are one-file `node` scripts run with `ROOT=<export>`. The outputs below are from 242da6ca2, and b3bb872c7 behaves the same.

| # | Site (file:line at 242da6ca2) | Ordering | Observed after the mark | Probe / output |
|---|---|---|---|---|
| S1 | `src/cdc/cdc-integration-service-owner-rpc-read-execution.js:424-440`, reached from the catch-up read at `cdc-integration-service-authoritative-catchup.js:223` | The catch-up's owner-RPC read is in flight at the mark and answers `TABLE_NOT_FOUND` | The engine's routing overlay is reseeded (`installRecoveryRoutingOverlayEntry`, :309) and `executeOnPartition` is re-issued. That is a CDC-owned retry that starts after terminal: `rpcAfter: 1, overlayAfter: 1`. The summary itself is honest (0 hydrated, `code: SHUT_DOWN`). | `$R/probes/inflight.mjs` -> `$R/probes/inflight.242da6ca2.out` (S1) |
| S2 | `src/cdc/cdc-integration-service-authoritative-read-flow.js:511` -> `:598-606` (also `:475-490` replica fallback, `:618-633` SQL fallback) | The catch-up's local read is in flight at the mark and answers unusable | A new owner-RPC authoritative read is issued after terminal (`rpcAfter: 1`). This contradicts the repair's own claim at catchup.js:147-148, "none was read after terminal". | same file (S2) |
| S3 | `src/cdc/cdc-integration-service-cache-visibility-wait.js:316-331` (retry loop) -> `:519` read -> `:581` divergence, `:594` `applyAuthoritativeCacheRepair`, `:611` fallback signal | Attempt 2 of the visibility repair (the retry) has its read in flight at the mark | The waiter is released with SHUT_DOWN, but the retry then applies the cache repair after terminal: `repairsAfter: 1, cacheChangesAfter: 1, cacheHasRowAfter: true`. | same file (S3) |
| S4 | same, attempt 1 | The first repair read is in flight at the mark | The same cache repair applies after terminal. | same file (S4) |
| S5 | `cache-visibility-wait.js:432-485` `refreshAuthoritativeCacheRow` (callers `partition-service-core-base.js:651`, `replica-operation-repository-observation-methods.js:274`) | Called after the mark | It makes an authoritative read and applies a cache repair (`reads: 1, repairs: 1, cacheHasRow: true`). This is the "started after terminal" ordering that 242da6ca2 now refuses for the catch-up. | same file (S5) |
| S6 | `cache-visibility-wait.js:497-` `repairCacheVisibilityHole` (caller `service-registration-visibility-owner.js:272`) | Called after the mark | It makes an authoritative read and applies a cache repair (`reads: 1, repairs: 1`). | same file (S6) |
| S7 | `src/cdc/cdc-routed-mutation-readiness.js:143` (local-leader write) -> `:582` -> `:594` `sqlQueryEngine.executeQuery` | A routed write's local-leader leg is in flight at the mark and answers a transient or reroutable failure (thrown or returned) | The write is re-routed to the still-registered engine after terminal (`engineWritesAfterMark: 1`), and its answer waits on that engine. This also breaks A2's "the write is not re-issued to an engine after shutdown began". | `$R/probes/localwrite.mjs` -> `$R/probes/localwrite.242da6ca2.out` (b3bb872c7 is identical: `localwrite.b3bb872c7.out`) |

- **Property violated:** P-Q. Once markShuttingDown has run, CDC-owned retry work (S1 reseed-retry, S3 repair retry, S7 re-route) and repair work (S2, S4-S6) still execute. None of these is a Node handle, so P-L is not violated.
- **Why it blocks:** the brief's ordering "shutdown during an in-flight read ... does anything else the read triggers run?" answers yes (S1, S2). The same mechanism has several sites (S1-S7). Under protocol 10 this is a class and needs a class repair, not another site patch.
- **Suggested class repair** (for the production implementer, not done here). The owner applies its terminal check at the primitives that every continuation passes through, not per loop:
  - the authoritative read flow refuses each new stage after the mark with the typed SHUT_DOWN answer (local -> owner-RPC, reseed-retry, SQL fallback);
  - one apply gate: `applyAuthoritativeCacheRepair` and `applyAuthoritativeCacheSweep` refuse after the mark, and so do the divergence and fallback-signal emits on the same path;
  - the routed mutation re-checks the mark before each engine hop, including the fall-through after the local-leader leg;
  - `refreshAuthoritativeCacheRow` and `repairCacheVisibilityHole` answer terminal at entry.
- **Evidence needed with it:** an in-flight-at-the-mark lane at every await stage, using the real read flow rather than a whole-method mock.

### R8-2 (evidence): the brief's in-flight-read ordering has no witness; the catch-up's post-read terminal break is unguarded

- Mutant K5 removes the post-read break (`catchup.js:233-235`). The result:
  - `$R/out/w-K5-cdc.out`: the evidence witness is 16/16 green;
  - `$R/out/direct-mut_K5.out`: the implementer's direct witness is 2/2 green;
  - `$R/probes/inflight.K5.out` (S1): on K5 the read's rows are applied after terminal, and the summary reports `tablesHydrated: 1, rowsApplied: 1` next to `code: SHUT_DOWN`. That is a fabricated "caught up" answer for a table cut off by the mark.
- So neither witness proves the claim "the read's result is not applied".
- The CDC witness mocks `executeAuthoritativeSystemTableRead` wholesale (test :472, :595). The read flow's own retry legs (R8-1 S1, S2) are therefore outside the composition.
- The evidence's declared residual limit ("owner work still waiting, at assert time, on a promise the lane holds is not observed") is exactly where R8-1 lives.

## Non-blocking

- **N1. Catch-up answer honesty on 242da6ca2: OK.**
  - `tablesHydrated` counts only tables applied before the mark.
  - Every other table is in `tablesFailed`, with `code: SHUT_DOWN` (S1/S2 summaries).
  - M11 (code line removed) is caught by the direct witness (`direct-mut_M11-no-terminal-code.out`, 0/2) but **not** by the evidence witness (`w-M11-no-terminal-code.out`, 16/16). `assertCatchupAnsweredTerminal` never asserts the typed code or `tablesFailed`.
- **N2. Callers treat the answer as terminal.**
  - `membership-publication-coordinator-reconcile.js:344` and `:398` return the summary to callers (:429-430, :696-697, :764, :842) that discard it.
  - `node-joining-ready-signal-readiness.js:566` is fire-and-forget (:584-591).
  - No caller reads `tablesHydrated`, and none retries around the call.
  - The coordinator's own reconcile tick (a different owner) may call the catch-up again after the CDC mark. It now answers SHUT_DOWN with no read.
- **N3. The injected `options.sleep` seam** (`catchup.js:166-168`). Production never passes it: all three callers were checked. A raw injected sleep would bypass the primitive: its handle survives, but the loop still ends at :323. Recommend deleting the seam, since tests can inject a clock through `timeSource`.
- **N4. The class (c) classifications are right.**
  - `cdc-confirmation-tracker.js:78` only rejects a caller's wait. It has its own `shutdown()`, and no production code constructs it: the only src references take it as the `cdcConfirmationTracker` option.
  - The `cdc-pipeline-readiness-gate.js:151-216` poll is a caller-owned readiness evaluation, with no retry or publication work.
- **N5. My census found no further timer-bypass site in `src/cdc` (including `write-router/`) or in `src/topology/cdc-group-propagation-*`.** The R8-1 sites are continuation defects, not timer sites.
- **N6. Census scope gaps (evidence).**
  - `readdirSync(src/cdc)` is not recursive, and `CDC_OWNER_FILE` (`/src/cdc/[\w-]+\.js$/`) excludes subdirectories. `write-router/` is outside both the census and ledger attribution; it has no timers today.
  - `DELAY_NAME` matches only sleep, delay and wait identifiers.
- **N7. Ledger escape (evidence residual; no production instance found).**
  - An owner that hands a retry as data to a foreign scheduler that existed before `ledger.open()` evades all three legs: census, state and execution.
  - At the mark: `pending: [], referenced: [], executedAfterTerminal: []`. `runPending` runs nothing, the census is empty, and the retry still runs after terminal.
  - Probe: `$R/ledger-esc/probe2.mjs` -> `probe2.out`.
  - Record it as a stated limit. Only a census of owner handoffs, not timer tokens, closes it.
- **N8. Ledger: refresh of an already-fired owner timer through a computed name is caught.** `createdAfterTerminal` records the re-init (`$R/ledger-esc/probe.out`). The census alone misses it.
- **N9. Both equivalent-mutant judgements are correct.**
  - M9 (R4-1 post-attempt guard removed, `delivery-methods.js:550-554`) is green. The re-arm reaches `armPropagationTimer`, which answers null and deletes the entry. Its only effect after stop is a misleading "Retrying" warn log.
  - M10 (entry guard `:58-60` removed) is green. Every later path is refused: `scheduleBackgroundRetry` has its RUNNING guard, the batch arm is refused, and `deliverToTargets` has a per-target guard.
- **N10. Terminal boundaries.**
  - Propagation: `stop()`'s first statement; synchronous, no STOPPING state.
  - CDC: `markShuttingDown()`'s first statement. It is never reset in src (`cdc-integration-service.js:131` is the only other write). Callers are `seed-cleanup-handler.js:642` and `join-cleanup-handler.js:707`.
  - Work before the mark during cleanup (runtime, control-plane and RPC teardown) is correctly pre-terminal. The evidence classifies it right.
  - The propagation owner's in-flight continuations are all re-guarded (`delivery-methods.js:58, 90, 108, 520, 551, 686`, and the entry at `service.js` `propagateCDCEvent`). **No P-Q or P-L falsifier was found for the propagation owner.**
- **N11. Literal copying.** None found in the assertions beyond the structural census lists, which name sites by construction. Delays are derived: 24 h, and the service's own `cacheWaitTimeoutMs` and `authoritativeFallbackRetryDelayMs`.

## Attack classes

**Tried:**
- An in-flight read at the mark, in every stage: local, owner-RPC, reseed-retry. SQL fallback by reading the code.
- An in-flight repair read: attempt 1 and the retry attempt.
- Repair entry points after the mark.
- An in-flight local-leader write leg.
- A catch-up started after the mark.
- The injected sleep, by code reading.
- Caller retry loops and `tablesHydrated` readers.
- An independent census of `src/cdc` (including `write-router/`) and `topology/cdc-group-propagation-*`.
- Terminal boundary and restart.
- Ledger: attribution through a foreign pre-existing scheduler (escapes); refresh after fire (caught).
- Test-file frame exclusion, by reading: the real-clock lanes arm through `src/time`, so it does not apply.
- Determinism, 5x.
- A mutant sample of 12.

**Not run, with reasons:**
- Item-4 suites and gates (`test/cdc`, `test/topology`, the adjacent control-plane and joining suites, duplication, check-fast-static, audit:guidelines, eslint, ratchets): reject fast. The brief forbids approval suites on a known-bad candidate, and this round has no src change to regress.
- A2 suites (membership-consistency, seed-node-bootstrap, test/bootstrap): excluded by the brief.
- A MessagePort or I/O-based delay: outside Timeout/Immediate; the author recorded it too.

## Commands and results

| Command | Result |
|---|---|
| `git diff --name-only 242da6ca2..15bce6231 -- src/` | empty, rc=0 |
| CDC witness on 15bce6231 (src = 242da6ca2) | 16/16 (`out/w-15bce6231-cdc.out`) |
| CDC witness on b3bb872c7 | 12/16; red 12, 13, 15, 16 (catch-up sleep, catch-up after mark, real-clock catch-up, census). Matches the author. |
| Propagation witness on 15bce6231 / b3bb872c7 | 16/16 / 16/16 |
| Propagation witness on 6e432286d | 9/16; red 1, 2, 5, 12, 13, 15, 16. Matches the author. |
| Propagation witness on 12adc944e | 13/16; red 1, 2, 16. Matches the author. |
| Determinism, 5x each witness on 15bce6231 | 5/5 green each (`out/det-*`) |
| Direct witness `cdc-authoritative-catchup-terminal` on 15bce6231 / b3bb872c7 | 2/2 / 0/2 |
| M1: primitive arms after the mark (early return removed) | red 15/16 |
| M2: `delayUntilShutdown` release drops `clearTimeout` | red 10/16 |
| M3: unref'd timer after the release loop | red 13/16 |
| M4: `executeSQL` terminal refusal removed | red 14/16 |
| M5: catch-up table-level terminal check removed | red 14/16 |
| M6: catch-up raw `clock.setTimeout` sleep | red 13/16 |
| M7: `armPropagationTimer` guard removed | red 15/16 |
| M8: propagation stopped branch re-arms `setTimeout` | red 14/16 |
| M9: R4-1 guard removed (equivalent) | green 16/16 (agree) |
| M10: entry guard removed (equivalent) | green 16/16 (agree) |
| **K5: catch-up post-read break removed** | **green 16/16, and direct 2/2: survives (R8-2)** |
| M11: catch-up `code` line removed | evidence green 16/16; direct red 0/2 |
| Probes `inflight.mjs` and `localwrite.mjs` on 242da6ca2 and b3bb872c7 | R8-1 S1-S7 as tabled |
| Ledger probes `probe.mjs` / `probe2.mjs` | refresh after fire caught; foreign-scheduler handoff escapes |

Every witness run was gated by `scripts/checks/wait-for-thermal-headroom.js`, all "ok", CPU 45-60 C, with one test process at a time. Runner: `$R/run.sh` (`node --import=@tapjs/mock/import <file>` under `timeout`). Mutants: `$R/mk.py` (one-anchor replace in a copy of `t-15bce6231`).
