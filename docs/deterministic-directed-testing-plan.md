# Deterministic & Directed Testing Strategy (DT1–DT8)

Status: PARTIALLY IMPLEMENTED + VERIFIED (2026-06-16). The cheap, verifiable tier is
built and tested; DT4 steps 1–3 (the TimeSource seam, the partial-seam collapses, the
opt-in Raft election seam, and the in-process freeze→leadership scenario) and DT5 step 1
(the seeded RandomSource seam + jitter-site coverage) and the in-process L1→TT
freeze→leadership→publication-stall scenario are landed; the DT5 PCT scheduler and DT6
(multi-node DST) proceed as a gated program (see below).
Author: analysis of the convergence loop + harness, 2026-06-16.

> **Implementation status (2026-06-16).**
> - **DT7 (model-check the design class) — DONE.** `models/leadership-failback/LeadershipFailback.tla`
>   (+ `_bug.cfg`/`_fixed.cfg`) models CL-039: TLC shows the lost-failback as a
>   counterexample under the bug config and proves convergence under the fix. Wired into
>   `scripts/model-tlc.js` (all 11 configs `met=true`), `model:check` added to `test:ci`,
>   mapped in `models/CL-INDEX.md`.
> - **DT1 primitive — DONE.** `test/distributed/harness/wait-for-state.js` (`pollUntil` +
>   `waitForState`) + cluster method + unit tests. (The leadership-location snapshot field
>   and the full CL-039 biasing repro are deferred — they touch the convergence-critical
>   `src/` control-snapshot path and need the gate loop.)
> - **DT2 — module DONE, live-wiring deferred.** `test/distributed/harness/in-run-invariant-monitor.js`
>   (samples `evaluateInvariants` + the gap-watchdog into a one-run verdict) + unit tests.
>   Wiring it into the live convergence run loop is left to a gate-validated change (the
>   memories warn against editing the live run path mid-convergence).
> - **DT3 — DONE.** `test/rebalancer/operation-lifecycle-fold.property.test.js` — a
>   fast-check interleaving property over the pure `advanceOperationLifecycle` kernel
>   (monotonic sequence, terminal-absorbing, crash-free), seeded from the real
>   `OPERATION_LIFECYCLE_STATE.PLANNED` and guarded by a non-vacuity check (the fold
>   provably reaches terminal states — ~93% of random folds — so the absorbing property
>   is actually exercised; an earlier draft seeded a non-existent state and was vacuous).
> - **DT8 — DONE.** Gate-demotion rule added to `closure-grammar.md`.
> - **DT4 — STEPS 1–3 LANDED (2026-06-16). The virtual-clock seam is in and reaches the
>   timing-race mechanism in-process.**
>   - **Step 1 — the `TimeSource` seam.** `src/time/time-source.js`: `RealTimeSource` (the
>     default — byte-for-byte the platform globals `Date.now`/`setTimeout`/`clearTimeout`/
>     `setInterval`/`clearInterval`), `VirtualTimeSource` (deterministic fake clock advanced
>     with `advance(ms)`; timers fire in `(dueAt, scheduling-order)` order, intervals
>     reschedule, zero-interval clamps, runaway re-arm fails loud), `resolveTimeSource(options)`.
>   - **Step 1b — collapse the partial seams.** `control-plane-readiness-participation-base.js`
>     (`now`/`setTimeoutFn`/`clearTimeoutFn`), `membership-publication-coordinator-reconcile.js`
>     (owner-driver `setInterval` + matching clear in stop), `lease-service.js`
>     (`now`/`setIntervalFn`/`clearIntervalFn`), and `hlc-clock-service.js` (physical clock)
>     all thread onto a resolved TimeSource. Byte-identical by default; explicit per-fn options
>     keep precedence (readiness 834 / membership-publication 401 / lease+hlc 163 green).
>   - **Step 2 — the hard Raft election-timer seam.** Base `@markwylde/liferaft` schedules its
>     heartbeat + randomized election timeout through `raft.timers = new Tick(raft)` (tick-tock,
>     native setTimeout). `src/raft/virtual-tick.js` is a tick-tock-faithful `VirtualTick`
>     scheduling on a TimeSource; `src/raft/liferaft.js` swaps it in OPT-IN (only when
>     `options.timeSource` is given — clears the natively-armed timer, swaps, re-arms on the
>     virtual clock). Production passes no timeSource → dead branch → byte-identical (liferaft +
>     election + message-group raft 140 green). Subagent-verified TRUSTED (empirically: no native
>     timer leak/fire on wall time). **Because the seam is opt-in and dead in production, no
>     docker equivalence check is needed for production SAFETY**; an equivalence gate would only
>     be needed to certify virtual-path FIDELITY before trusting a DT5 verdict at scale.
>   - **Step 3 — the in-process freeze→leadership scenario.**
>     `test/convergence/dt4-freeze-leadership-scenario.test.js` drives a single VirtualTimeSource
>     against a real LifeRaft node and reproduces CL-039's L1→L2 deterministically: heartbeats
>     within the window HOLD leadership; a freeze past the election timeout SHEDS it at the exact
>     instant; identical across runs. Sub-second, no docker.
> - **DT5 — STEP 1 LANDED (2026-06-16): the seeded `RandomSource` seam + jitter-site coverage.**
>   `src/random/random-source.js`: `RealRandomSource` (the default — `Math.random`, byte-for-byte
>   unchanged), `SeededRandomSource` (mulberry32, same seed -> same stream), `resolveRandomSource`.
>   Threaded OPT-IN (no production path passes a `randomSource`, so all sites stay `Math.random`):
>   the raft election `timeout()` jitter (`src/raft/liferaft.js` override — same formula, only the
>   source differs; removes the freeze scenario's `min==max` workaround), the message-retry backoff
>   jitter, and the unified-rebalancer scheduler / planning-gate staggering jitter. Tests:
>   `test/random/random-source.test.js`, `test/raft/election-jitter-seed.test.js`,
>   `test/random/dt5-jitter-seam.test.js` (same seed -> identical streams; defaults unchanged).
>   **REMAINING DT5:** the PCT-style depth-bounded scheduler over the virtual clock — the search
>   layer on top of these now-deterministic time+random seams (bound bug depth k, insert k
>   priority-change points per seed, iterate seeds with replay).
> - **Full freeze→leadership→publication-stall scenario (L1→TT) — LANDED (2026-06-16).**
>   `test/convergence/dt4-full-chain-scenario.test.js` composes the REAL owner-membership driver
>   with a real LifeRaft node on one VirtualTimeSource: the leadership signal is the seed's live
>   raft state read through the production Tier-0 path
>   (`resolveControlPlanePublicationsLeadership` → `cdcIntegrationService.canWriteSystemTableLocally`),
>   and the real `driveOwnerMembershipReconcile` runs on the same clock via its seamed interval.
>   While the seed holds publications leadership the driver passes the gate and proceeds to publish;
>   once leadership leaves the seed the driver defers at the gate every tick and never reaches
>   publish — the stuck-OPEN stall (TT). Honest scope: the L1→L2 freeze→shed is proven by the
>   companion election-timer scenario and modeled here via `change({state})`; the test observes the
>   leadership GATE (real code), not a materialized published epoch. Subagent-reviewed
>   FAITHFUL-WITH-CAVEATS. Remaining toward a higher-fidelity end-to-end: a real 2-node election
>   across two virtual clocks + driving the actual publish/upsert (L4) internals.
> - **DT6 — DEFERRED (north star).** Seed-iterated whole-system DST: a real multi-node cluster on
>   per-node virtual clocks with message passing, seed-iterated via the DT5 PCT scheduler. The
>   seams (TimeSource on all four subsystems + raft, RandomSource on the jitter sites) are the
>   substrate; DT6 is the search + multi-node-isolation harness on top.

> Corrections from the verification pass are marked **[V]** inline. The load-bearing
> one reworked DT1: **"force the precondition" is deterministic only for bugs with a
> STRUCTURAL (observable-state) precondition; for TIMING-race bugs like CL-039 it only
> *biases* the hit rate — true determinism needs DT4's virtual clock.** The repo's own
> N=8 CL-039 verdict proves the leadership-shed is probabilistic regardless of gap
> magnitude (a 19.5s seed gap held leadership) and the terminal self-heals (0/8), so a
> seed pause cannot deterministically reproduce CL-039 in one pass. DT1 is reframed
> accordingly; secondary fixes: the Raft election seam lives in LiferRaft's `Tick`
> object (not `raft-replica-base.js:412`), `model:check` is in no test aggregate today
> (DT7 is net-new CI wiring, not a promotion), and `pauseNode` is docker-pause
> (cgroup freezer), not literal SIGSTOP.

## Why this plan

The convergence verdict today is a Monte-Carlo docker gate: N≥8 runs × ~400s ≈ 50
min, and it "runs a lot and hopes the race shows up." That is the wrong tool for the
bugs this repo actually has. Per the closure ledger and the convergence memories, the
recurring class is **deterministic design / liveness bugs with a non-deterministically
*triggered* precondition** (circular dependencies in formation/recovery; leadership
stranding; lost-wakeup). For that class, sampling can confirm "rare" but can never
prove "fixed" — the precondition just stops appearing (CL-039 is stuck at "open,
not-reproduced-at-N=4").

The fix is not "sample more cheaply." It is: **force the precondition, check the
design directly, and demote the gate to a final integration check.** This plan turns
that into eight workstreams, grounded in what already exists.

The decisive grounding corrections (they shrink the work):

- **[G] 3 of the 4 critical-path clock seams already exist.** The owner driver takes
  `options.setIntervalFn` (`membership-publication-coordinator-reconcile.js:669`),
  the readiness build takes `options.now`
  (`control-plane-readiness-participation-base.js:225`), and the lease service takes
  `now`/`setIntervalFn`/`clearIntervalFn` (`lease-service.js:73-81`). Only **Raft
  election timing** and the **HLC physical clock** (`hlc-clock-service.js:27,53,80`)
  lack a seam — and Raft election timing is exactly CL-039's L1 cause. [V] The Raft
  election seam is NOT `raft-replica-base.js:412` (that is the learner-promotion timer):
  the election timer is armed inside LiferRaft via `raft.timers.setTimeout('election', …)`
  (`node_modules/@markwylde/liferaft/index.js:729`), routed through a swappable `Tick`
  object — but `tick-tock` hardcodes native timers, so virtualizing it means substituting
  the whole `Tick` (or patching globals). `applyRuntimeRaftTiming`
  (`raft-timing-utils.js:61`) changes the election *duration*, not the *clock*.
- **[G] `chaos.js` already has `pauseNode` and `restartNode`.** [V] `pauseNode` is
  docker pause (cgroup freezer, `docker-provider.js:549`), **not** literal SIGSTOP —
  it freezes the whole container, a *different* fault than a running-but-stalled seed.
  [V] And pausing the seed past `ELECTION_MAX_DEFAULT_MS` does **not** deterministically
  shed leadership: the CL-039 ledger's own N=8 data shows the L1→L2 shed is probabilistic
  (a 19.5s seed gap held leadership) and the terminal self-heals (0/8). So this is a
  *biasing* lever, not a deterministic reproducer — see the DT1 rework.
- **[G] invariant-engine, gap-watchdog, the fast-check real-function pattern, and the
  TLA+ specs already exist** — `evaluateInvariants(state)`
  (`src/control-plane/invariant-engine.js:555`, 13 invariants, currently post-hoc
  only), `EventLoopGapWatchdog` (`src/diagnostics/event-loop-gap-watchdog.js`, running
  at boot), `task27-membership-publication-interleavings.property.test.js` (drives the
  real `deriveMembershipPublicationCandidate`/`acknowledgeMembershipPublication`), and
  `models/**/*.tla` (`PublicationConvergence.tla` already models a lost-wakeup with a
  `ScheduledReconcile` fix). Most of Tier-1 and the complementary work is *wiring*.
- **[G] The wait-for methods are fixed-condition pollers, not generic.**
  `waitForControlPlaneQuiescence`/`waitForConvergence`/`waitForAllActive`/
  `waitForLoadReadinessStability` each poll a built-in predicate; **none takes an
  arbitrary caller predicate.** Directed chaos needs a new generic `waitForState`.
- **[G] Observability risk:** publication status is in
  `node.getControlPlaneLedgerSnapshot().controlPlaneDiagnostics.publicationConvergence`
  (`cluster-node-handle-layer.js:970`), but the publications-p1 **leadership location**
  (`tier1PartitionsLeaderNodeId`) appears to live in rebalancer DIAG logs, not the
  snapshot. DT1 must confirm/add it as a first-class snapshot field.

| Order | WS | What it buys | Tier | Size |
|------|-----|--------------|------|------|
| 1 | DT1 directed (state-triggered) chaos | forces structural preconditions deterministically; biases timing races | 1 | M |
| 2 | DT2 single-run invariant + gap monitor | one run yields the violated invariant, not a coin flip | 1 | S |
| 3 | DT7 TLA+ model-check the design class | proves a circular-dep fix the gate can't | comp | M |
| 4 | DT3 property-based kernel interleaving | shrink races in pure decision logic | 1 | S-M |
| 5 | DT4 virtual-clock seam on the critical path | drive the real freeze→leadership chain in-process | 2 | L |
| 6 | DT5 seeded scheduler / PCT fuzzing | principled depth-bounded race search vs sampling | 2 | L |
| 7 | DT8 demote the docker gate | re-rank the loop: falsify cheap, integrate rarely | meta | S |
| 8 | DT6 full DST | seed-iterated whole-system simulation | 3 | XL |

DT8 is policy that lands as soon as DT1–DT2 give a cheaper falsifier. DT6 is the north
star; DT4 is the load-bearing investment that makes DT5/DT6 possible.

---

## DT1 — Directed (state-triggered) chaos (flagship)

**Tier 1 #1.** Converts the coin-flip into a forced precondition — **deterministically
for bugs with a STRUCTURAL precondition, and as a *biasing* lever for timing races.**

> **[V] Scope correction (load-bearing).** "Force the precondition" is fully
> deterministic only when the precondition is an *observable structural state* (an OPEN
> epoch, a missing handler, a specific topology) you can detect and then act on. For a
> *timing race* — like CL-039, where a seed event-loop gap must coincide with the raft
> election-timer window — directed chaos can only *raise the hit rate and make the run
> observable*; the repo's own N=8 CL-039 data shows the gap→shed step is probabilistic
> (a 19.5s gap held leadership) and the OPEN-stuck terminal self-heals (0/8). True
> determinism for that class needs DT4's virtual raft clock. So: **lead the flagship
> with a structural-precondition CL; treat CL-039 as a biasing + observability case,
> honestly labeled, and finish it deterministically under DT4.**

### Problem statement (grounded)
`rolling-restart.js` waits for quiescence, then restarts nodes on a **wall-clock
timer**: `preRestartSettleMs` (`:599`), a `restartNode` loop with `interRestartDelayMs`
(`:612-621`), and `postRestartLoadSoakMs` (`:626`) — defaults 1000/250/1000 in
`config/local.json`. Whether the bad interleaving happens depends on where that timer
lands vs the system's internal micro-state. That is the "run a lot and hope." The
harness already exposes the state to do better: `node.getControlPlaneLedgerSnapshot()`
(`cluster-node-handle-layer.js:970`) returns `publicationConvergence` (status
OPEN/PUBLISHED) and `readinessByNodeId`, and `chaos.js` already has `pauseNode`
(SIGSTOP, `:199-211`) and `restartNode` (`:217`).

### Concrete steps
1. **Add a generic `waitForState(predicate, opts)` to the cluster class** (alongside
   the fixed-condition waiters in `cluster-class-quiescence.js` /
   `cluster-class-lifecycle-base.js:1344`). It polls a caller-supplied
   `async (cluster) => boolean` on a bounded interval with a timeout and a
   no-progress cut — the one primitive the existing waiters specialize but never
   expose generically.
2. **Surface leadership location in the snapshot** ([G] observability gap). Confirm
   whether `getControlPlaneLedgerSnapshot()` carries `tier1PartitionsLeaderNodeId`; if
   not, add it (publications-p1 write-leader + `helperSaysWriteLeader`) to
   `controlPlaneDiagnostics` so a predicate can read "leadership stranded on a
   restarting node" without scraping logs.
3. **Pick a STRUCTURAL-precondition CL as the first flagship** — one whose precondition
   is an observable state (e.g. an OPEN epoch with a specific topology, a quorum on the
   edge), where `waitForState(predicate) → restart/partition/kill` forces the failure
   *deterministically*. State-triggered chaos (act exactly when the system is in state
   X) is strictly better than timed chaos and is the durable, reusable pattern. (Survey
   the active frontier for the best candidate; CL-039 is NOT it — see below.)
4. **Treat CL-039 as a biasing + observability case, honestly labeled.** Build
   `test/closure/CL-039.repro.test.js` that:
   - drives to the post-restart recovery window,
   - **biases** toward L1 by pausing/stalling the seed near the election window
     (`pauseNode`, [V] docker-pause = whole-container freeze, a *different* fault than a
     running-but-stalled seed — note this in the test), and `restartNode(lastNode)`,
   - **observes** with `waitForState` whether leadership strands on a restarting node and
     the epoch stays OPEN, recording the L1→L4 link rates into the report.
   This raises the CL-039 hit rate and makes a single run *diagnostic* (which link
   fired), but it is **not** a deterministic one-pass reproducer — the gap→shed step is
   probabilistic (CL-039.md N=8) and the terminal self-heals. The deterministic CL-039
   force lands under **DT4** (virtual raft clock: make the seed miss the election timeout
   while running). Label the test as biasing-until-DT4 in its header.
5. **Register** in `test/closure/registry.json` / `npm run repro -- CL-###`.

### Guard / verification
- For the structural-precondition flagship: the directed repro reproduces the failure in
  a single run, deterministically, far under the 400s gate wall, and goes green under
  the fix (red-on-revert).
- For CL-039: the biasing run measurably raises the L1→L2 link rate vs timed restart and
  reports which causal link fired per run (an honest improvement, not a silver bullet).
- `waitForState` has a harness unit test (predicate true immediately → returns; never
  true → times out with a clear message).

### Effort / risk
Medium. Risk: low-moderate — harness-only (no `src/` behavior change) except the
leadership-location snapshot field (step 2). [V] The flagship value depends on choosing
a *structural* precondition; CL-039 alone would leave DT1 as a biasing tool, which is
why DT4 (not DT1) is the true deterministic unlock for the timing-race class.

---

## DT2 — Single-run invariant + gap monitoring (make one run informative)

**Tier 1 #2.** Stops needing N samples to learn *what* broke.

### Problem statement (grounded)
`evaluateInvariants(state)` (`src/control-plane/invariant-engine.js:555`) already
encodes 13 safety invariants (leader uniqueness, publication-drain determinism, …) but
is only called **post-hoc** (deterministic-convergence-harness + root-cause-invariants
on the failure bundle). `EventLoopGapWatchdog`
(`src/diagnostics/event-loop-gap-watchdog.js`) already measures `maxGapMs` at boot and
warns over `LAGRANGE_LOOP_GAP_THRESHOLD_MS`, but its signal lands only as console WARN
in the gz logs. So a single run produces a binary pass/fail and you sample N times to
see the violated invariant.

### Concrete steps
1. **Sample invariants continuously during a run.** In the scenario/quiescence poll
   loop, periodically build the state snapshot the failure bundle already builds and
   call `evaluateInvariants` live; record the first failing safety invariant + the
   timestamp + a bounded trace into the run report. A run then *reports the violated
   invariant*, not just FAIL.
2. **Promote the gap-watchdog max-gap into the run verdict.** Read
   `EventLoopGapWatchdog.maxGapMs` (or parse its WARN) per node and stamp
   `maxEventLoopGapMs` into the report next to `srcFingerprint`; add a gate assertion
   that the seed max gap stays below the raft election timeout (the WS4 gap-watchdog
   idea, now first-class). A single run shows whether a freeze blew the election ceiling.
3. **Wire both into `analyze:precondition-recurrence`** so the precondition is read off
   one run's invariant timeline instead of mined from logs.

### Guard / verification
- A known-failing directed run (DT1) reports the exact violated invariant + the seed
  max gap in its report JSON, with no debug-logs perturbation.
- The gap assertion fires on an induced seed pause and passes on a healthy run.

### Effort / risk
Small. Risk: low — read-only monitoring; must stay O(cheap) per poll so it does not
itself perturb convergence (sample on the existing poll cadence, not a hot loop).

---

## DT7 — TLA+ model-check the design-bug class (complementary, high-leverage)

**Complementary.** The right proof for the recurring circular-dependency / lost-wakeup
class — which the docker gate can never prove fixed.

### Problem statement (grounded)
The recurring bug class is design-level (`[[circular-dependency-class-formation-vs-steady-state]]`,
`[[recovery-as-second-bootstrap-impossibility]]`). Five TLA+ specs already exist —
`models/active-gate/ActiveGate.tla`, `models/readiness-starvation/{ReadinessStarvation,
PublicationConvergence,CoupledAdmission}.tla`, `models/readiness-handoff/ReadinessHandoff.tla`
— and `PublicationConvergence.tla` already models a **lost-wakeup** with a candidate
`ScheduledReconcile` fix. `npm run model:tlc` (`scripts/model-tlc.js`) runs TLC; it is
in `test:quality` via `model:contracts`/`model:check` but **not in `test:ci`**, and
there is **no documented CL↔spec mapping**. [V] Correction: `model:check`/`model:tlc`
are **standalone manual scripts in NO test aggregate** — `test:quality` is
`test:static + test:mutation`, neither of which references them. So DT7 step 3 is
*net-new CI wiring*, not a "promotion."

### Concrete steps
1. **Map each design-class CL to a TLA+ property.** Add a `model:` field to the CL STATE
   block (or a `models/CL-INDEX.md`) linking e.g. CL-001/CL-036 (circular spread↔readiness)
   to the spec + property that should hold. **[V] For CL-039, author a NEW
   `LeadershipFailback.tla` rather than extending `PublicationConvergence.tla`:** that
   spec models `published/converged/probeBounded/phase` with **no leadership variable,
   no node identity, no Raft** — CL-039's mechanism (leadership migrating off the seed
   onto a restarting replica with no fail-back) is a different state dimension, so the
   fit is only the abstract "a needed action never fires." A dedicated spec with a
   leader-location variable + a fail-back action is the honest model.
2. **Make a design-class fix gate on a green model-check.** When a CL's first violated
   invariant is circular/liveness, require `npm run model:tlc` (the relevant config)
   green before `fix_in_progress` → guarded, recorded in `reproducedBy` alongside the
   directed repro. This is the deterministic *proof* the gate can't give.
3. **Wire `model:check` into CI** ([V] it is in no aggregate today — this is net-new,
   not a promotion; it is fast and offline) so a spec regression is caught, and document
   the spec↔CL map in `docs/deterministic-repro-tier.md`.

### Guard / verification
- The extended `PublicationConvergence.tla` (or a new `LeadershipFailback.tla`)
  exhibits the CL-039 lost-wakeup as a TLC counterexample on the unfixed action and
  holds under the fail-back fix.
- `npm run model:tlc` green and wired into CI.

### Effort / risk
Medium (TLA+ authoring is specialist work, but the specs exist). Risk: low — models are
offline; the danger is a spec that abstracts away the real failure mode
(`[[publication-convergence-model-vs-reality]]`), so each extended action must be
justified against the CL evidence.

---

## DT3 — Property-based interleaving of decision kernels

**Tier 1 #3.** Shrink races in pure logic instead of sampling them in docker.

### Problem statement (grounded)
`test/control-plane/task27-membership-publication-interleavings.property.test.js`
already drives the **real** `deriveMembershipPublicationCandidate`
(`membership-publication-planning-evidence.js`), `buildMembershipPublicationRow`, and
`acknowledgeMembershipPublication` under fast-check (v3.23.2) with injected `nowMs` and
shrinking. The stateful `driveOwnerMembershipReconcile`
(`coordinator-reconcile.js:453`) is NOT pure and is not a fast-check target — but the
pure `derive*`/planning kernels it calls are.

### Concrete steps
1. **Extend the interleaving model** to the pure decision kernels on the convergence
   critical path that lack property coverage: the owner ack-completion/close predicate
   (extract a pure `decideOwnerReconcileOutcome(snapshot)` if needed) and the
   rebalancer remove-safety decision. **[V] Caveat:** the existing
   `evaluateRemoveSafety(context, operation)`
   (`operation-workflow-remove-safety-evaluator.js:266`) is **async and deeply
   I/O-bound** (`await getOperationsByEntity`, `router.pingNode`,
   `getCriticalReplicaRowsForSafety`), so factoring a pure `evaluate(snapshot)` from it
   is a substantial decoupling refactor, not a light extraction — size this item at the
   upper end of the range, or scope DT3 to the already-pure `derive*`/planning kernels
   first and defer remove-safety until DT4 makes its inputs injectable.
2. **Encode the CL invariants as fast-check properties** over those kernels (e.g.
   CL-038 surplus-drain terminalization, CL-035 voter-ready visibility) so a regression
   shrinks to a minimal failing interleaving in seconds.
3. Route these under `test/closure/` where they correspond to a CL, reusing
   `npm run repro -- CL-###`.

### Guard / verification
- Each new property fails (shrinks to a minimal counterexample) when its fix is
  reverted, green on HEAD.

### Effort / risk
Small–Medium. Risk: low; the value is bounded by how much logic is pure — pairs with
DT4 (a clock seam lets more of the stateful path be driven deterministically).

---

## DT4 — Virtual-clock seam on the critical path (the load-bearing unlock)

**Tier 2 #4.** Drive the *real* freeze→leadership-loss→stall chain in-process.

### Problem statement (grounded)
The emergent bug is the freeze→leadership chain. Three of its four subsystems already
take an injectable clock: owner driver `setIntervalFn`
(`coordinator-reconcile.js:669`), readiness `now`
(`control-plane-readiness-participation-base.js:225`), lease all-three
(`lease-service.js:73-81`). The two gaps are **Raft election timing** — opaque LifeRaft,
native `setTimeout` at `raft-replica-base.js:412`, configured via
`raft/constants.js RAFT_ELECTION_TIMING` — and the **HLC physical clock**
(`hlc-clock-service.js:27,53,80`, no injection). There is no shared clock module today.

### Concrete steps
1. **Introduce one `TimeSource` abstraction** (`now()` + `setTimer`/`clearTimer`) with a
   real-time default and a virtual implementation that the convergence harness advances.
   Thread it through the three subsystems that already have partial seams (collapse
   their ad-hoc `now`/`setIntervalFn` options onto it) and the HLC clock.
2. **Tackle Raft election timing** — the hard part. Either (a) wrap LifeRaft's timer
   creation behind an injectable scheduler, or (b) drive election timing through
   `applyRaftTimingConfig` (`message-group-service-raft-timing.js`) plus a virtual
   timer shim. This is the seam that lets the harness force "seed misses the election
   timeout" deterministically (CL-039 L1) without SIGSTOP.
3. **Stand up a critical-path in-process scenario** in `deterministic-convergence-harness`
   that instantiates the real owner driver + readiness + lease + a raft stub on the
   virtual clock and reproduces the freeze→leadership chain by advancing time — the
   emergent bug, deterministic, in milliseconds.

### Guard / verification
- The in-process scenario reproduces a known freeze→leadership-loss (CL-034/CL-001-B
  lineage) by advancing the virtual clock past the election timeout, and goes green
  under the landed fix — no docker.
- Equivalence: with the real-time `TimeSource`, behavior is unchanged (a differential
  run vs a small docker gate matches).

### Effort / risk
Large. Risk: high — touches the hottest timing paths; the Raft seam is the riskiest.
Land the `TimeSource` behind a default that is byte-for-byte the current behavior;
adversarial subagent verification + a small equivalence gate before relying on it.

---

## DT5 — Seeded scheduler / PCT-style fuzzing

**Tier 2 #5.** Principled depth-bounded race search instead of sampling.

### Problem statement (grounded)
`Math.random()` is called directly in jitter/backoff hot paths
(`unified-rebalancer-policy-scheduler-methods.js:113,120`, `message-retry-handler.js:130`,
`rebalancer-planning-gate-methods.js:54`); a few components already accept an injectable
`random` (`replica-operation-repository.js:519`, `latency-group-manager.js:70`,
`node-joining-owner-construction.js:104`). No PCT or schedule-exploration framework
exists.

### Concrete steps
1. **Thread a seeded RNG** (via the DT4 `TimeSource`/`RandomSource` pair) through the
   jitter/backoff sites so a seed fully determines scheduling decisions.
2. **Add a PCT-style scheduler** over the DT4 virtual clock: bound the bug depth k, and
   for each seed insert k priority-change points — giving a provable lower bound on the
   probability of catching a depth-k race per seed, replacing "hope."
3. **Iterate seeds** (each a sub-second in-process run) to a budget; on failure, record
   the seed for exact replay (`deterministic-simulator.js` already has replay +
   `minimizeDeterministicTrace`).

### Guard / verification
- A known depth-2 race (a reverted fix) is found within a bounded seed budget and
  replays deterministically from its seed.

### Effort / risk
Large; depends on DT4. Risk: moderate — only as sound as the seam coverage; uncovered
`Math.random`/`Date.now` sites silently break determinism (add a lint/audit that flags
direct `Date.now`/`Math.random`/`setTimeout` on the critical-path modules).

---

## DT8 — Demote the docker gate (re-rank the loop)

**Meta / policy.** Lands as soon as DT1–DT2 provide a cheaper falsifier.

### Problem statement
The docker stat-gate is currently the *falsifier* (run N, hope). It should be the
*final emergent-integration check*, run rarely.

### Concrete steps
1. **Re-rank the loop in the closure grammar:** falsify at DT1 (directed repro) / DT3
   (property) / DT7 (model-check) FIRST; the docker gate runs only to confirm a
   green-deterministic fix at the emergent level, **N=2–3**, not N≥8.
2. **Record the rung** in `reproducedBy`: a fix needs (a) a deterministic repro or
   model-check AND (b) one small confirming gate — not a large statistical gate as the
   primary evidence.
3. **Keep the large gate** only for genuinely statistical questions (convergence-rate
   promotion verdicts), per `[[stat-gate-run-count-guidance]]`.

### Guard / verification
- The grammar + `docs/deterministic-repro-tier.md` state the re-ranked loop; a
  spot-audit of the next few CLs shows the directed/property/model evidence landing
  before any large gate.

### Effort / risk
Small (doc/policy). Risk: low — but [V] it only sticks once the cheap tier actually
*reaches* the emergent bug for the CL in hand: deterministically via DT1 for
structural-precondition bugs, but only via **DT4** for timing-race bugs like CL-039
(DT1 alone biases, it does not falsify them). Demote the docker gate per-CL only when a
deterministic falsifier exists for that CL — not as a blanket policy.

---

## DT6 — Full DST (the north star)

**Tier 3.** Seed-iterated whole-system deterministic simulation (FoundationDB /
TigerBeetle / Antithesis).

### Problem statement (grounded)
`deterministic-simulator.js` already has the *shell* — fake clock, partition/heal,
message drop/delay, replay, `minimizeDeterministicTrace` — but drives test-provided
callbacks, not the real state machines, because `src/` lacks systematic clock/RNG/
scheduler injection.

### Concrete steps (program, not a sprint — gated on DT4/DT5)
1. Complete clock + RNG + scheduler injection across the system (DT4/DT5 generalized).
2. Instantiate the real owner/readiness/rebalancer/raft instances inside the
   deterministic simulator's event loop on the virtual clock + virtual network.
3. Drive runs by **seed**; iterate thousands/min; every failure reproducible and
   shrinkable to a minimal trace.

### Guard / verification
- A seed reproduces a real historical CL failure end-to-end in-process and shrinks to a
  minimal trace; a differential run against a small docker gate agrees.

### Effort / risk
Very large; multi-month. Risk: high; the prize is "every race is reproducible." Pursue
only after DT4 proves the seam approach on the critical path.

---

## Sequencing & dependencies
- **DT2 first** (best-grounded, cheap, makes every run informative). **DT1** alongside,
  led by a *structural-precondition* CL (deterministic), with CL-039 as a biasing case.
  **DT7** in parallel (specialist, but specs exist).
- **DT3** rides on the existing fast-check pattern over the already-pure kernels;
  remove-safety waits on **DT4**.
- **[V] DT4 is the true deterministic unlock for the timing-race class** (CL-039), not
  just a "Tier 2" nicety — it is what lets DT1/DT8 actually falsify those bugs. It is
  also the load-bearing investment **DT5** and **DT6** depend on.
- **DT8** is per-CL policy that becomes safe only once a deterministic falsifier exists
  for that CL (DT1 for structural, DT4 for timing-race).

## Open questions (for the verifier)
1. DT1: is `tier1PartitionsLeaderNodeId` already in `getControlPlaneLedgerSnapshot`, or
   must it be added? (Determines whether DT1 is pure-harness or touches the snapshot.)
2. DT1: does `pauseNode` (SIGSTOP) reliably reproduce the election-timeout shed, or does
   docker pause interact with the heartbeat detector differently than a real event-loop
   gap? (Validate the induction lever before building the full repro.)
3. DT4: wrap LifeRaft's timer vs drive timing through `applyRaftTimingConfig` — which is
   the lower-risk Raft election seam?
4. DT7: extend `PublicationConvergence.tla` vs author a dedicated `LeadershipFailback.tla`
   for CL-039?
