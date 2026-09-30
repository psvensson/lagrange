# A2 SLO tail on 102e127c4: causal classification

Recorded 2026-09-25 by a read-only investigator. No `src/` or test edits were made and no git writes were made in any repository worktree. The only git write was a `git bundle create`, which writes a file into the scratchpad. All work ran in throwaway clones on lab hosts.

- **Subject:** `test/integration/node-join-convergence-slo.integration.test.js`, the assertion "over-target voter duration should stay bounded (<= 2000 ms)".
- **Candidate:** 102e127c4, which combines seed parity, F1 and the lease-verdict fix.
- **Trigger:** A2 run 7 on the controller was red at 2516 ms. The REPLACE stayed active/ACTIVE through the whole window.

## 0. Scope change and stop decision

The brief first asked for a red rate: N=20 unmodified runs plus N=20 recorder runs. Mid-task the coordinator relayed that the owner had changed the brief:
- classify causally, not statistically;
- stop once at least two instrumented slow cases show the same sequence: readiness refresh-pending, no event wake, progress only at the 1 s fallback timer;
- the alternatives must be absent: no release, no early close, no unstamped-lease path, no handoff delay.

That condition was met by **five red cases** (§3). Every batch was stopped at that point through a STOP file the driver checks between runs. No run was killed.

- This record is therefore **not** a red-rate statistic. The per-host red counts in §1 are counts of the *instrumented observer variant*, and should not be read as the SLO test's red rate.
- Only one unmodified run was made: the tv-dator smoke run, which was green at 0 ms.
- These are not stop-at-first-red batches either: they were instrumented classification batches, stopped by the owner's evidence condition.

## 1. What ran where

**Hosts.** tv-dator (12 cores, x1.30), lenovo-laptop (8, x2.12), adam-laptop (8, x1.85) and adams-gamla (4, x1.94), all in parallel with one run at a time per host.
- `lab fleet` was checked first; all four hosts were free.
- The candidate was delivered as a bundle, `a2.bundle` (`quest/replace-source-removal-owner` over the common base ba7068036), into a `--shared` throwaway clone at `~/slo-a2/tree` detached at 102e127c4. `node_modules` was linked from the host checkout; the package-lock hash 82d5f5d6f759 is identical on all hosts. Node v22.23.2 was set explicitly, because lenovo-laptop's default nvm Node is 18.
- The driver (`driver.sh`):
  - took the machine-wide `flock -w 900` on `~/.lab/machine.lock` and wrote a holder record (`claude:553555be-slo-a2-classification`, `test:slo-red-rate`) for the whole batch;
  - ran `node scripts/checks/wait-for-thermal-headroom.js` before every run: always `ok`, CPU 52-74 C, NVMe 21-48 C or unmeasured;
  - then ran `node scripts/run-test-files.js --jobs=1 <file>`.
- After the batches:
  - every host showed no driver process, a free lock (`flock -n` succeeded) and no holder record;
  - `~/slo-a2` (clone, bundle, outputs) was deleted on all four hosts;
  - the host checkouts were untouched (`git status --short` was empty).

**Instrumented variant.** This is the scratch observer from the earlier investigation, `scratch-observe.node-join-convergence-slo.integration.test.js`: subtest 1 of the unmodified test, sampling until the REPLACE is terminal. It carries `NODE_OPTIONS=--import=slo-recorder.mjs`.

The recorder was extended in three versions.

| Version | Adds |
|---|---|
| v1 | The prior probes: handoff, remove-safety evaluations with their participation reads, safety-retry arming, completion stacks, and seed-cache operation and row transitions. It also adds: the drain verdict for every sweep (`resolvePriorityRecoveryOperationDrainState` with its release evidence); every `isPriorityRecoveryDrainOwnerUnavailable` verdict with the lease it saw; every `replica_operations` write, with path canonical or SQL fallback and whether `lease_expires_at` was stamped; lease touches; the lease on every cached operation transition; the owner action (wake boundary) that entered each evaluation; readiness publications per node, throttled to 25 ms per (service node, owner). |
| v2 | Safety-timer **fire** time; every entry into the REPLACE's operation lane, with whether the lane was **already held** (a held lane coalesces: the new factory is discarded); a caller stack for every owner action. |
| v3 | Every enqueue into the replica dispatch service's reconcile queue for the REPLACE, with its reason and stack. This names what triggered each "dispatch" wake. |

**Instrumented recordings (53).** A REPLACE episode was present in every one.

| Host | Recordings | Red | Green but ≥1500 ms |
|---|---|---|---|
| tv-dator (incl. smoke) | 17 | 0 | 1 |
| adam-laptop | 12 | 1 | 3 |
| lenovo-laptop | 11 | 4 | 0 |
| adams-gamla | 13 | 6 | 0 |
| **Total** | 53 | 11 | 4 |

The reds concentrate on the two slowest hosts. Every evaluation there takes 150-400 ms: this is a timing class, not noise (see §4d). Several green recordings show 0 ms because the test's samples never counted four voters (finding F-a from the earlier record). The episode still ran and is in the table.

The full per-run table is `runs-table.md` (machine-readable in `runs.json`). Its columns:
- times are ms relative to the REPLACE reaching ACTIVE in the seed's cache;
- `lastDefer` is the end of the last deferring evaluation before SAFE;
- `rp` lists the nodes whose participation read was the refresh-pending placeholder in that evaluation;
- `firstPubAfter` is the first readiness publication for an `rp` node on the evaluating node (202) after that deferral;
- `idle` is `lastDefer` → SAFE evaluation start;
- `firedHeld` is whether the lane was held when the timer fired;
- `n/p` means not probed in v1.

## 2. The mechanism

On every episode, the REPLACE owner (node 202, the target) re-evaluates remove safety at ACTIVE.

1. The first evaluation defers on "replacement leader ownership pending" and issues the F1 handoff. Leadership lands on the replacement 47-125 ms later (52 of 53 episodes; the exception is §4c).
2. Later evaluations defer with "would drop voter-ready replicas below minimum (2/3)", because one or both nodes' participation read answers the refresh-pending placeholder (`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING, planning_snapshot_refresh_pending`).
3. Across 53 episodes the ACTIVE-phase evaluations were:
   - 53 leader-ownership deferrals;
   - 145 floor deferrals;
   - 54 SAFE;
   - **0 "is not voter-ready"**.
4. **Every deferral in every slow run had a non-empty `rp`.**

A deferral re-enters only through one of these:
- incidental owner-lane traffic: replica-dispatch reconciles for message dispatch requests, the dispatch service's own retry timer, cache and CDC row replays, executor-outcome re-drives;
- the fixed 1000 ms `scheduleDeferredSafetyRetry` timer.

There is no readiness-publication wake for the remove-safety deferral (design §3.3 R-2 is not implemented).
- The dispatch service's readiness-driven `node_ready_dispatch_retry` does run early in ACTIVE (v3: +48 to +794), but it coalesces into in-flight reconciles and then stops. No enqueue of any reason occurs in the idle gaps of the decisive cases.

Two further properties decide how long the idle lasts:

1. **The timer is anchored to the first deferral, not the last.** It is armed at the first floor deferral, and later deferrals reuse it (`reusedTimer: true`). It fires about 1000 ms after the *first* deferral, whatever happened since.
2. **The owner lane coalesces (challenger BR2a, now measured).**
   - `runExclusive` returns the holder's promise and discards the factory.
   - A timer fire or dispatch wake that arrives while the lane is held by `checkTimeouts`, `reconcileOrphanedOperations`, an observed-progress retry or a target-progress re-entry is **lost**. None of those holders evaluates remove safety.
   - Measured:
     - the timer fired into a held lane in 5 of 11 v2/v3 fires;
     - dispatch wakes were lost the same way (for example adam v2#5 at +980).
   - Nothing re-arms the timer after a lost fire. Only another deferral does, and that needs an evaluation.

## 3. The decisive cases: timer-only progress, alternatives absent

All five are red, instrumented with v2 or v3 (lane and timer probes), and follow the same sequence:
1. a deferral on a refresh-pending read;
2. **no evaluation, no dispatch enqueue and no row event** until the safety timer fires into a free lane (`firedHeld=false`);
3. the timer's evaluation (`wake=safety_retry`) is SAFE;
4. then STOPPING, the source row leaves, and the window closes.

Common to all five:
- no release, no early close, no planner REMOVE, no SQL-fallback write;
- handoff landed in 80-117 ms;
- over-target (`ot`) is 2118-2524 ms.

| Case | ot | First deferral (timer armed) | Last deferral end, `rp` | Publications for `rp` on node 202 during the idle | Timer fired, lane | SAFE evaluation | Idle before the timer | STOPPING / source gone / window end |
|---|---|---|---|---|---|---|---|---|
| lenovo v2#3 | **2524** | +846 | +1366, 201 | +1374, +1437, +1465 | +1855, free | +1859..+2027 | 493 | +2238 / +2162 / +2293 |
| adam v2#5 | **2144** | +726 | +945, 202 | +993, +1018, +1071 | +1728, free | +1733..+1875 | 788 | +2036 / +1966 / +2105 |
| adams-gamla v2#4 | **2173** | +734 | +1279, 201+202 | +1317, +1345, +1369 | +1735, free | +1742..+1939 | 463 | +2172 / +2051 / +2116 |
| adams-gamla v3#1 | **2410** | +682 | +1186, 201 | +1245 | +1684, free | +1690..+1870 | 504 | +2063 / +1954 / +2197 |
| adams-gamla v3#2 | **2118** | +668 | +1254, 201 | +1257, +1317 | +1670, free | +1675..+1835 | 421 | +1978 / +1940 / +2120 |

Timeline, lenovo v2#3. Milliseconds are relative to REPLACE ACTIVE in the seed cache; "pub" means a readiness publication for node 201 on node 202.

```
 -231  over-target window opens (target row voter-ready before the owner's ACTIVE write)
    0  REPLACE active/ACTIVE (lease +29.8 s, stamped by the canonical ACTIVE write)
 +143..+499  EVAL (execute_reconcile) -> "replacement leader ownership pending"; rp 201,202
 +501  STEP_DOWN transfer_forwarded;  +618 replacement is leader  (117 ms)
 +501..+845  EVAL (execute_reconcile) -> floor 2/3; rp 202;  +846 timer ARMED
 +925..+1059 EVAL (dispatch)          -> floor 2/3; rp 201;  timer reused
 +1090..+1366 EVAL (dispatch)         -> floor 2/3; rp 201;  timer reused
 +1374 +1437 +1465  pub 201 on 202 (no wake reaches remove safety)
 +1424 observed-progress retry, +1573 checkTimeouts: lane holders that do not evaluate
 +1855 TIMER FIRED (armed +846), lane free
 +1859..+2027 EVAL (safety_retry) -> SAFE (both nodes eligible)
 +2162 source r2 row gone;  +2238 STOPPING visible;  +2293 window closes (ot 2524, RED)
 drain sweeps on 201 and 202 every ~1 s: in_flight, remoteOwnerUnavailable=false; the seed's drain completed from STOPPING
```

Timeline, adams-gamla v3#2, with dispatch triggers:

```
 +3    dispatch enqueue message_dispatch_request (seed's REPLICA_OPERATION_DISPATCH)
 +48..+223 node_ready_dispatch_retry enqueues (coalesced into the in-flight reconcile)
 +49..+343 EVAL -> leader ownership pending; +345 handoff; +425 leader  (80 ms)
 +345..+668 EVAL -> floor, rp 201,202; +668 timer ARMED
 +744..+1063 EVAL (dispatch: retryable_operation_dispatch) -> floor, rp 201,202
 +1093..+1254 EVAL (dispatch: message_dispatch_request) -> floor, rp 201
 +1257 +1317 pub 201 on 202; then NO dispatch enqueue, NO row event, NO evaluation
 +1670 TIMER FIRED (armed +668), lane free; +1675..+1835 EVAL (safety_retry) -> SAFE
 +1940 source gone; +1978 STOPPING; +2120 window closes (ot 2118, RED)
```

Full timelines: `timelines/<case>.wake.txt` (wakes, lane, timer, dispatch triggers, publications) and `timelines/<case>.full.txt` (all probes).

**Where the time goes in a timer red,** using lenovo v2#3 (2524 ms):

| Segment | ms |
|---|---|
| Pre-ACTIVE: the target is counted before the owner's ACTIVE write | 231 |
| ACTIVE → first evaluation start (lane contention) | 143 |
| Handoff evaluation (356) plus the post-handoff evaluation (344) | 700 |
| Two dispatch evaluations, both deferring on refresh-pending (plus 31 ms between them) | 441 |
| **Idle to the fixed timer** | **489** |
| SAFE evaluation | 168 |
| SAFE → source row gone and the next test sample | about 266 |

The idle to the timer ranges over 421-788 ms in the five cases. In each of them, a publication for the deferring node arrived on the evaluating node 3-59 ms after the deferral, and that node read eligible at the next evaluation.
- If an event wake fired on those publications, the SAFE evaluation would start earlier by between (SAFE start − last such publication) and (SAFE start − first such publication):

  | Case | Earlier by (ms) |
  |---|---|
  | lenovo v2#3 | 394-485 |
  | adam v2#5 | 662-740 |
  | adams-gamla v2#4 | 373-425 |
  | adams-gamla v3#1 | 445 |
  | adams-gamla v3#2 | 358-418 |

- Those publications may belong to a different build variant from the one remove safety reads (BR2b). So the savings are an estimate bounded by these numbers, not a proof.
- Subtracting them brings the five cases to about 1480-2080 ms. So **R-2 alone does not guarantee ≤2000 ms on the slow hosts**. The remaining budget is:
  - about 3-4 evaluations of 150-400 ms each, all deferring on the same two-node refresh-pending conjunction (F-d, R-3);
  - the pre-ACTIVE count of the target.

## 4. Classification of the tail

The tail is the 15 slow recordings (red, or ≥1500 ms green) out of 53.

### (a) Violation of the lease-verdict mechanism: 0 of 15, 0 ms

**No release occurs.**
- Across 53 recordings there were 573 drain sweeps of the REPLACE, on both nodes.
- **0** were `OWNER_UNAVAILABLE_RELEASED`, and **0** had release evidence with `remoteOwnerUnavailable: true`.
- Every drain verdict at ACTIVE was `in_flight` (or `evidence_unavailable`) with `sourceRemovalPending: true` and the lease live.

**No early close, and no planner surplus REMOVE.**
- 0 `completeOperation` of the REPLACE from ACTIVE, and 0 planner REMOVE rows.
- Every REPLACE went ACTIVE → STOPPING under its own remove safety, and was completed by the seed's drain from STOPPING, as `converged`, after the source row was gone.
- The early-close path the lease fix removed did not recur.

**The unstamped-lease path (verifier N4) was not exercised.**
- 371 of 371 `replica_operations` writes (53 inserts, 318 updates) took the canonical gateway path and carried `lease_expires_at`. There were 0 raw-SQL fallback writes.
- The cached lease advanced with every transition (for example ACTIVE +29.8 s, STOPPING +29.9 s ahead of the write).

**Finding L-a (no effect on this SLO; for the lease owner).**
- Node 201 computed the owner-availability verdict for the REPLACE 717 times with an operation input that carried **no lease field**. The verdict fell through to the routing heuristic and answered `unavailable=true` for the live owner 202:
  - 33 at ACTIVE;
  - the rest at PENDING, SENDING, CREATING and SYNCING.
- By elimination this is the target-progress re-entry, `isOperationWorkflowOwnerRemoteOwnerAvailable` → `isPriorityRecoveryDrainOwnerUnavailable` (`operation-workflow-owner-priority-recovery-reentry.js:326-340`, fed from the priority-recovery decision snapshot's operations):
  - the drain's own release evidence never answered true;
  - the stale-FAIL caller never ran, because no stale state was seen.
- The effect is at most a suppressed wake of a remote owner. Here the owner is local to its own lane, so the effect is nil.
- It is the same class as N4, a lease the verdict never sees, but a different route: a projection without the lease, not the SQL fallback.
- Not verified by stack.

### (b) Previously known mechanism, R-2 (remove-safety poll on stale readiness): dominant, 11 of 15

**(b1) Timer-gated, measured directly: 5 of 11 reds.** These are the §3 cases. Their idle time contribution is 421-788 ms each; the per-segment breakdown is in §3.

**(b2) Timer fired but lost to lane coalescing (BR2a): 2 reds.**
- **lenovo v2#1, ot 2494.**
  - The timer (armed +905) fired at +1921 into a held lane: a target-progress re-entry from +1908, then `checkTimeouts`. The fire was lost.
  - A dispatch reconcile at +2004 then evaluated SAFE at +2251.
  - Idle 616 ms. Publications for 201 on 202 arrived at +1457.
- **lenovo v2#4, ot 2157.**
  - The idle ran from +1038 (`rp` 201,202; publications at +1041..+1229) to a dispatch evaluation starting at +1633, which went SAFE.
  - The timer fired at +1742 into that holder.
  - Progress came about 109 ms before the timer would have fired; the idle is 595 ms.

**(b3) Same family, wake trigger unprobed (v1, before the lane and timer probes): 3 reds.**
- adams-gamla v1#2, ot 2149: idle 685 ms, SAFE by a dispatch wake about 100 ms before the timer was due.
- adams-gamla v1#4, ot 2181: idle 382 ms.
- lenovo v1#4, ot 5797: see (c).

**(b4) Refresh-pending deferral chain with no long idle: 1 red and 2 green.**
- adams-gamla v1#3, red at 2141:
  - the handoff was late (+888);
  - four deferrals on refresh-pending each ran 150-350 ms;
  - the longest idle was 143 ms.
- adam v1#4 (1648 ms) and adam v1#5 (1590 ms): idle 250 and 135 ms.

This is the upstream readiness-currency conjunction (finding F-d/R-3): the same trigger, but not the timer.

**Share.** 11 of 11 reds have the refresh-pending deferral as the gate. The poll-only re-entry (R-2), with its fixed and first-anchored timer, is the largest single contributor in 8 of 11 (b1, b2, and b3's two dispatch-before-timer cases), at 382-788 ms each.

### (c) Newly exposed mechanism: 1 case, not resolved by the probes

**lenovo v1#4, ot 5797, the worst tail.**
- The last deferral ended at +1338 (`rp` 201,202). The SAFE evaluation came only at +5432, an idle of 4094 ms.
- Four dispatch owner actions on node 202, at about 1 s cadence (+2091, +3113, +4139, +5188), each about 60-80 ms after a `checkTimeouts` drain sweep on 202, ran **without** an evaluation.
- No `safety_retry` owner action ran. The timer was armed at +1014, so it was due about +2014.
- Readiness publications for 201 and 202 on 202 were recorded at +1344..+1503, then **none for 3.1 s**, until +4604.
- Two readings fit, and v1 lacked the lane and timer probes to separate them:
  1. the timer and every dispatch wake coalesced into the once-a-second `checkTimeouts` holder of the lane (BR2a, never re-armed). v2 shows the building blocks: `checkTimeouts` takes the REPLACE's lane each second, and fires into held lanes are lost;
  2. the readiness owner did not publish a current snapshot for these nodes for 3.1 s (the R-3 lineage).
- It did not recur in the 32 v2 and v3 recordings.
- The coalescing half is known by analysis (challenger BR2a) but is first **measured** here. The 3.1 s publication silence is new and unexplained.

### (c') Handoff transfer window: 1 green case

tv-dator v2#4, ot 1668, green:
- the replacement became leader 890 ms after STEP_DOWN; every other episode took 47-125 ms;
- the post-handoff evaluation ran 1456 ms (+120..+1576) across that window, as the earlier F1 finding described for red-rate #10.

It is 1 of 53, not red, and the only case where the handoff delay contributed.

### Measurement edge: 1 green case

adam v2#1, ot 1508, green:
- the test's over-target window opened 500 ms before the REPLACE's ACTIVE write (the target row was active and a follower first);
- SAFE came at +836 and the window closed at +1008, so nothing at ACTIVE was slow.

### (d) Infrastructure or noise: none found

Evidence:
- the thermal gate passed before every run;
- no run failed for any reason other than this assertion;
- the reds sit on the two slowest hosts (adams-gamla 6 of 13, lenovo 4 of 11; tv-dator 0 of 17).

The host effect is a timing class: every evaluation, and the lane holders, take longer there. The mechanism is identical on every host. The controller's A2 red (2516 ms, uninstrumented) has the same observable shape: REPLACE active/ACTIVE throughout, no planner REMOVE, no handoff failure. It cannot be attributed per wake without a recording.

**Recorder perturbation.** The recorder wraps prototypes, polls the cache every 20 ms, and records publications. The observer variant keeps sampling until the REPLACE is terminal. Both add load, and the absolute milliseconds are recorder-on milliseconds. The causal sequence does not depend on them: a timer fire into a free lane → SAFE.

## 5. Minimal owner-level repair of the dominant mechanism (not implemented)

**Owner.** The REPLACE's remove-safety re-entry in the operation workflow owner. The repair is R-2 of design §3.3, amended by challenger B's BR1 and BR2, with one addition this data forces.

1. **A level-triggered readiness wake (§3.3 R-2).**
   - One permanent `subscribeReadinessPlanningSnapshots` subscription per owner.
   - On DEFER, register `waiters[operationId] = nodes`, where `nodes` are those whose participation read was the refresh-pending placeholder. The recorder shows the evaluation already has them: the `participation` reads with `planning_snapshot_refresh_pending`.
   - A publication for a registered node submits EXECUTE for R.
2. **BR1: the recheck reads the level, not the generation.**
   - Immediately after registration, in the same synchronous block, re-run `getControlPlaneParticipationSync(node, <remove-safety options>)` for each registered node, and wake if it is no longer the placeholder.
   - In all five decisive cases the flip happened inside or just after the deferring evaluation (a publication 3-59 ms after it ended). That is exactly the window in which the generation recheck is blind.
3. **BR2a: a lossless submit to the lane.**
   - A wake (publication, fallback timer or dispatch) that finds R's lane held must set a per-operation "rerun" bit that the holder consumes on release, instead of joining and discarding.
   - This is what lost the timer in lenovo v2#1 and v2#4, the dispatch wake in adam v2#5, and plausibly all wakes in lenovo v1#4, because `checkTimeouts` holds the lane once a second.
4. **BR2b and BR2c: dedupe must not drop an edge.** No tokenKey dedupe for the waiter. Key it by the operation's own wake sequence (the §BR2 amendment), because publications of other build variants arrive first (BR2b).
5. **Addition from this data: re-anchor the fallback.**
   - Today the timer is armed by the first deferral and only reused afterwards, so it fires at a fixed ~1 s after the *first* deferral.
   - A fire that was coalesced (or found nothing) is never re-armed.
   - The fallback should be re-armed after every DEFER, bounded by the last one, and re-armed on a lost fire. It stays the bounded backstop that §3.5(b) requires. Its cadence is not a budget change.

**Dependencies.**
- Design §3.3 (R-2) and §3.5(a) and (b), the "0 owner-clock ms" and "missed event cannot strand R" proofs.
- Challenger B's BR1 (level recheck) and BR2 (a) lossless lane, (b) variant-blind dedupe, (c) same-token republication.
- BR17's second-evaluation resume point (`DRR:284`), because the handoff evaluation is a DEFER source in every episode.
- BR14, the effective `checkTimeouts` cadence, because it is the dominant lane holder.

**What it will and will not buy.**
- In the five decisive cases it would remove about 360-740 ms each, which puts them at about 1480-2080 ms. That is not a guaranteed pass on the slow hosts.
- The rest is the readiness-currency conjunction: 3-4 deferring evaluations of 150-400 ms each on refresh-pending reads, recorded as R-3/F-d for the readiness planning owner.
- A test-side edge also remains: the target is counted before the ACTIVE write.

**Witnesses (red first on 102e127c4), using injected owner clocks:**
- **W3** (from the earlier record): a publication at t0 → evaluation at t0.
- **W3b** (BR2a): the lane is held by a `checkTimeouts` turn when the timer fires, or when a publication arrives → R re-evaluates when the holder releases, not at the next deferral.
- **W3c** (timer anchor): deferrals at t, t+300 and t+600, with no events → the fallback fires at most one fallback period after the *last* deferral, and a coalesced fire is re-armed.
- No test budgets, waits or retries change.

**Stop conditions for the implementer.**
- (c)'s 3.1 s publication silence needs its own probe before anyone attributes it: record the readiness owner's queue and drain for the two nodes. If it is real, it belongs to the readiness planning owner (R-3), not the REPLACE.
- L-a (a leaseless projection in the re-entry verdict) goes to the lease owner. It is outside this repair.

## 6. Files

All under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/slo-a2-classification/`:

- **Tooling:**
  - `slo-recorder.mjs`: v3 (lane, timer-fire, dispatch-queue, write-path, lease and drain probes);
  - `scratch-observe.node-join-convergence-slo.integration.test.js`;
  - `setup.sh`, `driver.sh` (lock and holder record, thermal gate, STOP file), `fetch.sh`, `a2.bundle`.
- **Analysis:** `tl.py` (full timeline), `wake.py` (wake, lane, timer and dispatch attribution), `classify.py`, `table.py`, `ot.py`.
- **Data:** `out-v1/`, `out-v2/`, `out-v3/<host>/`:
  - `rec-N.ndjson` (recorder);
  - `rec-N.tap` and `rec-N.stderr` (the test's own TAP);
  - `thermal-rec-N.txt`;
  - `summary.txt` (per-run rc and times).
  - `out-v1/smoke-tv/` also holds the one unmodified run, `plain-1.*`, green at 0 ms.
- **Results:** `runs.json` and `runs-table.md` (per-run table); `timelines/` (the ten key cases, `.wake.txt` and `.full.txt`).
