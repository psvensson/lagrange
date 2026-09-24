verdict: approve

# Round 9 (Agent C, fresh final verifier): fixes/cutover-seed-parity @ 79db60fbd, production_sha 55a42ef57

- No src diff in the evidence round: `git diff --name-only 55a42ef57..79db60fbd -- src/` prints nothing (exit 0). `src/topology` is also unchanged since round 8 (`3dacf4632..79db60fbd`, empty).
- Scratch: `R=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity/r9c`.
  - Exports (`git archive`): `$R/t-242da6ca2`, `$R/t-55a42ef57`, `$R/t-79db60fbd` (src == 55a42ef57).
  - Hybrid: `$R/h-242-tests79` is 242da6ca2 src with the 79db60fbd witnesses and helper.
  - Mutants: `$R/mut/*`, built by `$R/mk.py` from `t-79db60fbd`, one semantic change each. Matrix: `$R/out/mutant-matrix.txt`.
  - Probes: `$R/probes/r9probe.mjs`, with outputs `r9probe.55a42ef57.out`, `r9probe-H1.55a42ef57.out` and `r9probe.242da6ca2.out`. Ledger attack: `$R/ledger-esc/probe-depth.mjs`, output `probe-depth.out`.
  - Runner: `$R/run.sh` (thermal gate, then `node --import=@tapjs/mock/import <file>`).
- I made no repository edits and no git writes. The worktree's `git status` is clean before and after. Every process I started exited.
- The coordinator's binding rules (1-6) were applied over the brief.

## Blocking

None.

I found no falsifier of P-Q or P-L for either owner. The semantic attack matrix is exhausted. The focused and adjacent suites and the cheap gates are green.

## Production (A), 55a42ef57: decision

The gate is where the work stops. Every CDC effect call site in `src/cdc` (`write-router/` included) routes through one of the three choke points, and each choke point calls `refuseIfTerminal` synchronously, immediately before its effect, with no await in between:

**(a) Read issue**
- `local-system-table-routing.js:257-259` (local read, including the `db.prepare` path)
- `owner-rpc-read-execution.js:421-432` (owner-RPC read and its reseed re-issue; the gate is evaluated again at re-issue)
- `:314-324` (overlay reseed)
- `:211-220` (SQL fallback)

**(b) Apply**
- `cache-visibility-authority.js:191-197` (repair)
- `:307-314` (sweep)
- These are the only two cache-mutation sites in `src/cdc`: `applySystemTableChange` and `reconcileAgainstAuthoritativeTruth`.

**(c) Submit**
- `routed-mutation-readiness.js:125-127` (local-leader leg)
- `:473-476` (engine hop, per attempt)
- `cdc-bootstrap-direct-sql.js:98, 127, 151` (bootstrap select, raft lane, fan-out)

**Post-await effects are reconsidered where they occur.**
- The re-issue after a reseed, the SQL fallback after the owner-RPC read, each local partition read in the loop, each fan-out target, each engine attempt and each repair apply after its read all gate at the point of the effect.
- Nothing relies on a check made before the await.

**Orderings checked on 55a42ef57 (all have zero effects after the mark)**
- S1-S7: both witnesses, plus my mutants.
- The catch-up:
  - during its sleep (evidence lane 12);
  - with a read in flight (lanes 17-19; implementer 1-3);
  - started after the mark (lane 13).
- A catch-up read from a witnessed leader in flight at the mark, which is the sweep route. Probe P3: no repair and no sweep, the stale row is kept, and the summary is `tablesHydrated 0, rowsApplied 0, rowsSwept 0, code SHUT_DOWN`.
- A routed write with its local leg in flight (lanes 23-25; implementer 8-9).
- An engine hop in flight that throws "Message timeout". Probe H3: NOT_CONFIRMED, with the cause kept.
- The SQL fallback in flight: the owner-RPC read (OWNER_RPC_PREFERRED_SQL_FALLBACK) is in flight at the mark and answers deferred. Probe P1: no engine read after the mark. On 242da6ca2 there were 2.
- The bootstrap raft lane in flight at the mark, answering a failure. Probe P2: no fan-out, and the answer is NOT_CONFIRMED with cause "no leader". On 242da6ca2 there was a fan-out write after the mark and the answer was a success.
- `waitForCacheUpdate` entered after the mark (the query engine calls it on CDC's behalf). Probe P4: 0 pending timers, 0 holds, and a typed terminal answer.
- A co-due virtual-clock resubmission. Probes H1d and H1e: no engine submission after the mark. On 242da6ca2 there were 2 engine submissions after it.

**P-L.** The only CDC timers are three:
- `delayUntilShutdown`, which is cleared on release;
- the visibility-wait budget timer, which the hold clears;
- the unconstructed confirmation tracker.

The real-clock ledger lanes are green 5/5.

**Terminal boundaries are correct.**
- CDC: the first statement of `markShuttingDown` (`lifecycle.js:155-162`). It is never reset. There is no earlier "stop requested" state in the service, and the pre-mark cleanup steps are correctly pre-terminal.
- Propagation: the first statement of the synchronous `stop()` (`cdc-group-propagation-service.js:175-183`). The source is unchanged since round 8.
- Propagation witness: 16/16, 5 of 5 runs.
- Propagation mutants PR1 (guard removed from `armPropagationTimer`) and PR2 (the sleep release drops `clearTimeout`) are both red: lanes 15 and 10.

**Callers treat terminal answers as terminal.**
- The catch-up callers are:
  - `membership-publication-coordinator-reconcile.js:344` and `:398`, each single-shot with a cooldown;
  - `node-joining-ready-signal-readiness.js:566`, fire-and-forget.
- Neither retries, and none reads `tablesHydrated` (unchanged since round 8).
- Routed writes answer `SHUT_DOWN`, which `isRetryableControlPlaneError` classes as non-retryable.

**The refactors do not change live behaviour.**
- The bootstrap body is a mechanical diff: renames plus the gate wrappers (`$R/out/old-bootstrap.txt` against `new-bootstrap.txt`).
- The repair-row body moved verbatim, with `this` changed to `service`.
- `reseeded: installed === true` is equivalent, because `installRecoveryRoutingOverlayEntry` returns a boolean.
- The sync-throw paths are preserved.

**Diagnostics after terminal (owner ruling 5): allowed.** On an in-flight repair read, `emitCacheVisibilityDivergence` and `recordAuthoritativeFallbackSignal` still run after the mark. Their exact effects are:
- `READ_MODEL_DIVERGENCE` has no listener anywhere in `src`;
- the fallback signal updates only the in-memory counters that admin diagnostics read.

Neither changes cache, partition, membership, readiness or catch-up state. Neither schedules anything, holds a handle, or flips a waiter to success, because the waiter was already settled at the mark.

## Non-blocking findings

### N1. Honesty (owner rule 3): the gate's prior-answer plumbing is incomplete, reachable only on a virtual clock

**Where.**
- `routed-mutation-readiness.js:119, 125-127`: `tryExecuteLocalSystemTableWrite` starts a fresh `issued = {}` on every attempt and never receives the outer `issuedHop.answer`.
- `:473-477`: a *thrown* engine answer is never recorded in `issuedHop`.

**Ordering (probe H1d).**
1. Attempt 1's engine hop answers the released write (proposed, OUTCOME_UNKNOWN) while live.
2. The retry delay fires.
3. The mark lands in a microtask queued by a co-due virtual timer. That is after `waitForRetryBudget`'s post-delay check and before attempt 2's local-leg gate.

**Result.** The gate answers `writeOutcome: not_routed` ("was not applied"), with stage `routed_local_leader_write` and no cause. This rewrites a possibly committed write into guaranteed not-applied. With no local leg (H1e) the answer stays NOT_CONFIRMED with the OUTCOME_UNKNOWN cause.

**The C4 mutant shows the same thing.** C4 removes `waitForRetryBudget`'s terminal checks. P-Q still holds, because the gate refuses the resubmission, so the gate dominates the work. But evidence lanes (i) and (iv) go red: the unknown-outcome cause is lost. Honesty in the resubmission route is carried by `waitForRetryBudget`, not by the gate.

**Why it does not block.**
- It is not P-Q or P-L: nothing is submitted after the mark.
- It is not reachable in production:
  - `RealTimeSource` wraps Node timers, and Node drains microtasks after each timer callback;
  - the retry delay is always at least 100 ms, so there is always an await, and the check after it catches a mark from any other macrotask. H1f and H1g, the production orderings, are honest.
  - `VirtualTimeSource` has no src constructor; it is used only by tests and the simulator.
- No `src` consumer branches on `writeOutcome`.

**Fix.** A one-line class fix: pass `issuedHop.answer` into the local leg as its initial prior answer, and record thrown engine answers.

**Owner decision.** If the owner counts virtual-clock orderings as in scope for rule 3, this becomes blocking.

### N2. Read honesty: a read refused in OWNER_LOCAL_ONLY mode loses the typed SHUT_DOWN and answers retryable (probe H2)

**Where.** `queryLocalAuthoritativeSystemTableRows` (`authoritative-read-flow.js:250-264`) drops the refused local answer as merely "unusable". The flow then answers one of:
- `authoritative_row_source_unavailable`, a retryable fragment (`control-plane-error-classification.js:20`), when the transport is ready;
- `ROUTER_QUERY_TRANSPORT_NOT_READY` with `deferRetry: true`, when the transport is not ready.

Either way `isControlPlaneWriterShutDown` is false. In fallback modes the refusal keeps SHUT_DOWN and is non-retryable.

So the implementer's claim ("terminal dominance makes a refused read non-retryable") holds only for fallback modes. OWNER_LOCAL_ONLY is the default mode, and gateway, query-engine and rebalancer callers use it.

**Why it does not block.**
- No CDC-owned loop consumes it: the catch-up and repair use fallback modes, and both have loop-level terminal checks.
- Any caller retry belongs to another owner, and its reads are refused with no CDC effect.

It is still an A2 answer-honesty gap for callers. The fix is to surface the refusal when every local stage was refused.

### N3. The evidence witness alone misses the gate's prior-answer honesty (G2)

- Mutant G2 makes the gate always answer NOT_ROUTED.
  - The evidence witness is green 27/27.
  - The implementer's `cdc-terminal-gate-inflight` is red (8, 9).
- Evidence lane 25 never reaches the gate: an unknown-outcome local answer returns as handled.

Rule 3 is covered by the combined witness set, not by the evidence file.

### N4. Routing leg 27 accepts a consult whose answer is ignored

| Mutant | Site | Result |
|---|---|---|
| A4i | SQL fallback | survives every witness |
| C5i | bootstrap fan-out | survives every witness |
| C7 | engine hop | caught by the in-flight lanes |

- A consult for a different stage is behaviour-equivalent: only the answer's label changes.
- The gate-removed representatives of the same semantic routes (A4, C5, C6, B2) are caught by leg 27.
- Rule 1 bounds the matrix by route, and production gates these sites correctly (probes P1 and P2).
- This is recorded as an evidence limit. Neither the SQL fallback nor the bootstrap lanes has an in-flight-ordering lane.

### N5. Ledger escape by stack depth (evidence limit)

- `creatingFrames()` captures 64 frames (`owner-work-ledger.js:24`).
- An owner retry handed to a foreign helper that arms it more than 64 frames below the owner frame, before the mark, from an unowned async context, escapes all three runtime legs:
  - `pending: []`;
  - `referenced: []`;
  - `runPending` runs nothing.
- The census misses it too, because the timer site is foreign. Evidence: `$R/ledger-esc/probe-depth.out`; at depth 10 it is caught.
- This is the same class as the round-8 foreign-scheduler limit. No production instance exists: every CDC delay is `delayUntilShutdown`, which is shallow.
- Otherwise the execution leg cannot miss an attributed callback without the state leg reporting it pending.

### N6. A write in flight at the mark that succeeds still emits its CDC mutation event after the mark (probe P5: `events: ["upsert"]`, the caller gets success)

- The success is honest: the write was issued while live and applied.
- The emit is synchronous in the same step as the answer, and nothing is scheduled.
- Its listeners are other owners:
  - `wasm-service/module-mirror.js:287`;
  - `debug-runtime/debug-coordinator.js:210`;
  - `bootstrap/node-joining-cdc-subscription-and-backfill.js:282`, mesh connectivity.
- Any re-entry into CDC is refused at the `executeSQL` entry.
- This path predates the round and sits outside the three gated classes.
- It is recorded in case the owner reads "publication work" as including local mutation events.

### N7. Equivalent-mutant judgements on the real fix are correct

- S1, the reseed re-issue ungated while the overlay stays gated (A2b), is green. A refused overlay means `installed === true` is false, so no re-issue happens.
- S5 and S6 have no entry guard on the real fix. Their refusal is carried by the inner read and apply gates. A1 ungates the owner-RPC read, and lanes 22 and implementer S5/S6 go red.

### N8. Literal copying

None found:
- terminal codes come from the owner's constants module;
- seam inputs (`TABLE_NOT_FOUND`, `ERRORS.*`) are inputs, not expected outputs;
- delays are derived.

The census lists name sites by construction.

## Attack classes

**Tried:**
- Every choke point against the four owner-rule-1 escape routes: in flight at the mark, a continuation after an awaited read, a caller entering after the mark, and retry or resubmission.
- One representative per round-8 site, S1-S7.
- Catch-up false success (KFS).
- The gate itself (G1 never refuses; G2 drops the prior answer).
- Honesty of uncertain writes: H1-H3, and the C4 dominance check.
- Read honesty (H2).
- Unwitnessed in-flight routes (P1-P3).
- Entry after the mark (P4).
- A write completing after the mark (P5).
- An independent census of `src/cdc` and its external callers: gateway, query engine, partition, rebalancer, bootstrap owners and event listeners.
- Terminal boundaries.
- Refactor equivalence.
- Ledger:
  - ignored or wrong-stage consults;
  - stack-depth attribution escape;
  - execution-leg completeness, by reasoning.
- Determinism, 5x per witness.
- Propagation spot check with PR1 and PR2.

**Not run:**
- The A2 suites (membership-consistency, seed-node-bootstrap, test/bootstrap as a whole): excluded by the brief.
- MessagePort or I/O delays: outside the Timeout/Immediate class, as already recorded.
- Syntactic variants beyond one per semantic route: owner rule 1.

## Commands and results

**Witness baselines**

| Command | Result |
|---|---|
| `git diff --name-only 55a42ef57..79db60fbd -- src/` | empty, rc=0 |
| 4 witnesses on 79db60fbd | 27/27, 9/9, 2/2, 16/16 |
| Witnesses on 242da6ca2 src (hybrid) | evidence 18/27, red 17, 19-24, 26, 27 (matches the author); implementer inflight 1/9 (only K5 green); catchup-terminal 2/2 |
| Determinism, 5x each on 79db60fbd | all 5/5 green (`out/determinism.txt`) |

**Mutant matrix** (evidence / inflight / catchup-terminal; red lane numbers in brackets)

| Mutant | Result |
|---|---|
| A1 owner-RPC read ungated | 23/27 [19,22,26,27] / 6/9 [2,6,7] / 2/2 |
| A2 overlay reseed ungated | 25/27 [17,27] / 8/9 [1] / 2/2 |
| A2b reseed re-issue only | 27/27 / 9/9 / 2/2: equivalent |
| A3 local read ungated | 25/27 [26,27] / 9/9 / 2/2 |
| A4 SQL fallback ungated | 26/27 [27] / 9/9 / 2/2 |
| A4i SQL fallback, consult ignored | 27/27 / 9/9 / 2/2: survives (N4) |
| B1 repair apply ungated | 22/27 [18,20,21,26,27] / 6/9 [3,4,5] / 2/2 |
| B2 sweep apply ungated | 26/27 [27] / 9/9 / 2/2 |
| B3 repair retry on a raw timer | 25/27 [8,16] / 9/9 / 2/2 |
| B4 repair loop guard removed | 26/27 [8] / 9/9 / 2/2 |
| S3 loop guard and read gate removed | 22/27 [8,19,22,26,27] / 6/9 [2,6,7] / 2/2 |
| C1 engine hop ungated | 24/27 [23,24,27] / 7/9 [8,9] / 2/2 |
| C2 local leg ungated | 25/27 [26,27] / 9/9 / 2/2 |
| C3 `executeSQL` entry refusal removed | 26/27 [4] / 9/9 / 2/2 |
| C4 resubmission guards removed | 25/27 [1,5] / 9/9 / 2/2: no submission after the mark; honesty lost (N1) |
| C5 bootstrap fan-out ungated | 26/27 [27] / 9/9 / 2/2 |
| C5i fan-out, consult ignored | 27/27 / 9/9 / 2/2: survives (N4) |
| C6 bootstrap raft lane ungated | 26/27 [27] / 9/9 / 2/2 |
| C7 engine hop, consult ignored | 25/27 [23,24] / 7/9 [8,9] / 2/2 |
| KFS catch-up counts hydrated regardless | 26/27 [18] / 8/9 [3] / 2/2 |
| G1 gate never refuses | 16/27 / 0/9 / 0/2 |
| G2 gate drops the prior answer | 27/27 / 7/9 [8,9] / 2/2 (N3) |
| PR1, PR2 (propagation witness) | 15/16 [15], 15/16 [10] |

**Probes**

| Command | Result |
|---|---|
| `r9probe.mjs` on 55a42ef57 | P1-P4 and H3: no effect after the mark, answers typed terminal. P5 as N6. H2 as N2. H1d as N1. H1e/H1f/H1g honest NOT_CONFIRMED |
| `r9probe.mjs` on 242da6ca2 | P1: 2 engine reads after the mark. P2: fan-out after the mark, answered success. H1d/H1e: 2 engine submissions after the mark (all fixed on 55a42ef57) |

**Suites** (`LAGRANGE_LANE_JOBS_CAP=2`, `run-classified-test-files`, on the 79db60fbd export)

| Command | Result |
|---|---|
| test/cdc + test/topology | 56/56 files green, 1995 assertions (`out/suite-cdc-topology.out`) |
| Adjacent: 6 control-plane files, node-joining-cdc-catchup-wiring, node-joining-ready-signal-retry, bootstrap-service-ready-signal, bootstrap-mode-routing.property, bootstrap-mode | 11/11 files green, 751 assertions (`out/suite-adjacent.out`) |

**Gates**

| Command | Result |
|---|---|
| `npm run -s test:duplication` | src+scripts 56/56 and 1815/1815; test 791/791 and 30451/30451 |
| complexity / cognitive / file-size / unused-exports | 1813/1813 · 159/159 · src 27/27, test 21/21 · 1437/1437 |
| `check-fast-static --base 242da6ca2` (worktree, read-only; status clean before and after) | ok |
| `audit:guidelines` | rc=0 |
| eslint on the 16 touched src and test files | rc=0 |

Every witness and suite batch was gated by `scripts/checks/wait-for-thermal-headroom.js`: all ok, CPU 44-73 C, one test process at a time.
