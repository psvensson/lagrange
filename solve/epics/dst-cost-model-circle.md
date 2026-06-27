---
id: dst-cost-model-circle
roadmapRow: null
status: discussing
graduatesTo: null
links:
  quests: [dst-cost-model-fidelity-spike]
  upstreamEpic: topology-convergence-hardening
  relatedEpic: convergence-timeout-leadership-settle
  relatedDoc: docs/deterministic-directed-testing-plan.md
  relatedDoc2: docs/convergence-donewhen-metric.md
---

# Complete the DST circle — host all subsystems on a calibrated virtual-time cost model

> **FRESH-AGENT START HERE.** This epic captures a multi-week / high-risk program with a **live
> kill-gate** (the fidelity spike). Read [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)
> (the DT1–DT8 program + its honest scope caveats) and [`docs/convergence-donewhen-metric.md`](../../docs/convergence-donewhen-metric.md)
> (the sealed metric: SAFE floor hard / convergence statistical; `passRate ≈ q^N` is a per-restart
> latency race against a WALL-CLOCK budget). Then read the kill-gate quest
> `solve/quests/dst-cost-model-fidelity-spike.json` — **do not start Phase 1+ before the spike
> resolves.** All file:line below were grounded at HEAD `da2d101e` (2026-06-27) but are POSITIONAL —
> re-grep before trusting.

## Intent (why now)

The rolling-restart convergence quest iterates through an **expensive docker stat-gate** (N≥15,
~600s/run). The DT1–DT8 program already replaced the docker gate's **safety / CORRUPT dimension**
with deterministic in-process falsifiers (`test:safety-pregate`), but the **convergence / passRate
dimension** — the current frontier — still requires docker, because the in-process substrate models
**zero execution cost** (`test/distributed/harness/virtual-network.js:98-99` "the network never
invents delays"; `src/time/time-source.js` fires timers for free). With work free, every loop
converges instantly in virtual time, so the latency-tail verdict is unreproducible. This epic asks:
can a **calibrated virtual-time cost model** charge the real CPU sinks so a saturated node genuinely
misses a budget in virtual time — making the convergence mechanisms reproducible in-process, so
latency-tail levers (the whole current frontier) can be iterated deterministically instead of on
docker hours?

## Decision — Option B (cost model), REFRAMED by verification

The operator chose **Option B** (build the cost model) over Option A (logical circle only; accept the
convergence axis stays docker-only). Two adversarial verification rounds then forced a **reframe of
the acceptance target** — Option B as first specified ("the in-process passRate tracks the docker
passRate within a tolerance band") is an **unfalsifiable curve-fit**: at p≈0.30, N≈20, docker's own
rate CI is ±0.20, so a tolerance band wider than the measurement passes any model, and the
calibration loop (tune cost magnitudes until rates match, use docker to re-tune) cannot tell "right"
from "curve-fit".

**Reframed target (the falsifiable form):** the cost model targets **per-run ROOT-CAUSE LABEL
agreement** with docker (docker already records the dominant FAIL reason per run —
`convergence-donewhen-metric.md:152`), **not** the aggregate passRate number. Docker keeps the
passRate number and the `T` re-seal. This is still genuinely Option B — it reproduces the latency
*mechanisms* in-process, which the logical circle cannot — but it is a falsifiable mechanism claim.

## Options under discussion (settled here for provenance)

- **Option A — logical circle only.** Host all subsystems for the safety + design-bug class; accept
  the convergence/passRate axis stays docker-only. Achievable, modest value (consolidates bespoke
  DT-tests). NOT chosen.
- **Option B — add the cost model (CHOSEN, reframed).** Also build a per-node single-core virtual-time
  charging model so the convergence *mechanisms / root-cause labels* reproduce in-process. Larger,
  research-grade, fidelity-bounded; **does not remove the docker passRate calibration** — it narrows
  how often it is needed.

## The cost model (the centerpiece — what Option B actually builds)

1. **Per-node single-core event-loop model.** Each node's loop is one serial resource; a charged
   callback occupies the node's clock for its duration; concurrent callbacks contend (queue) —
   reproducing the saturation coupling that composing zero-cost subsystems deletes.
2. **Charge calibrated virtual-ms for the dominant CPU sinks — re-profiled at HEAD.** ⚠️ The
   originally-named sink set is stale and must NOT be charged from memory. `parseStepsHistory` is now
   memoized (`src/rebalancer/steps-history-parse-memo.js`) so it is no longer a per-tick sink. The
   `fastJsonClone` deep-clone, by contrast, is STILL LIVE and unconditional at HEAD (`deepClone` →
   `fastJsonClone`, `src/cache/system-table-cache.js:932`, no flag) — a prime charge candidate. So the
   charged-op set MUST be re-profiled on current HEAD before calibrating — it likely includes the live
   deep-clone, the sqlite full-log scan (CL-018; the `calibrate-machine.js` probe already treats it as
   a first-class cost term), CDC apply, raft log replication, transport serialization, and the
   priority-recovery snapshot *construction*, not the stale `{clone, parse, snapshot}` triple.
3. **Calibrate cost-per-op with OWN per-sink micro-benchmarks.** ⚠️ `scripts/calibrate-machine.js` is a
   hardware *scaler* (one scalar `LAGRANGE_MACHINE_FACTOR`, applied only to two timeout fields in
   `convergence-budget-calibration.js`); it is NOT a per-op cost probe. The cost model needs net-new
   input-size-parameterized per-sink benchmarks (cost as a function of row count / payload size), with
   the machine factor applied on top as the hardware normalizer.
4. **Advance the per-node clock by charged cost**, so a saturated node genuinely misses a wall-clock
   budget — the latency race becomes real in virtual time.

**Honest fidelity bound (sealed, not discovered later):** this is a *model* of cost. Real
`eventLoopUtilization=1.0` saturation is produced by libuv threadpool I/O (sqlite off-thread C++), GC,
and microtask/macrotask starvation — none of which a serial-ms-per-callback model reproduces directly.
So the model is validated against docker's **per-run root-cause labels**, and docker remains the
periodic re-calibrator. Option B narrows docker dependence; it never removes it.

## The phased plan (corrected scope — XL / multi-month / high-risk)

> Each production seam: byte-identical `Real*` default (dead in production), subagent-verified
> red-on-revert, full regression sweep, **constructor-injection only — no env flags to make a
> subsystem hostable**. Lands as focused `feat`/`test` commits, **NOT via the Solver `run` loop**
> (the DT1–DT8 precedent). The cost-model substrate is built WITH the TimeSource layer, BEFORE Phase-3
> hosting, so each subsystem is hosted-and-charged and its non-vacuity sub-gate runs on the charged
> clock (else Phase 4 is a regime change requiring re-validation).

- **Phase 1 — seam completion (corrected enumeration).**
  - Rebalancer main loop (`unified-rebalancer-lifecycle-base.js`): `nowFn:89`, `Date.now:184`, **and the
    bare `Math.random():179` that bypasses the resolved `randomSource:94`** (an existing determinism
    hole); `unified-rebalancer-policy-scheduler-methods.js` `Date.now:157,178,192,230` + `setTimeout:207`;
    `rebalancer-planning-gate-methods.js` `setTimeout:62`/`clearTimeout:78,89` + `Date.now:250` +
    `checkRebalance:726`. (~2× the first-draft budget; multiple commits.)
  - Membership-lifecycle controller: thread `now` through the intent-builder options (`:188,220,240`).
  - Publication persist/CDC `now` seam (`coordinator-reads.js:95`, `coordinator-reconcile.js:269` fallback).
  - **Replica-operation repository — its own multi-file sub-project:** 20+ bare `Date.now()` across 6
    `replica-operation-repository-*-methods.js`, no existing seam; introduce a repository-level timeSource.
  - **Determinism-audit lint** (early): flag bare `Date.now`/`Math.random`/`setTimeout`/`setInterval` on
    hosted critical-path modules; red-on-revert test (a planted raw call must fail it); run in `test:static`.
- **Phase 2 — shared deterministic persistence/CDC substrate** intercepting the **CDC-apply +
  cache-mutate layer** (NOT one gateway method: `upsertSystemTableRow` is defined in 7+ places, 17+
  writers — bootstrap-writer, query-state phase, direct cache mutation — must be inventoried). Reuse
  `deterministic-simulator.js` storage (KV + append-log + compare-and-swap).
- **Phase 3 — host real subsystems, DAG-ordered (sources → sink).** 3a readiness (already seamed
  `:120`) + 3d node join/restart path (`wait-for-leadership-phase.js` is clock-seamed/cache-only, but
  the bootstrap assumes real sockets — `fastify.listen`, `startWebSocketServer`, `process.exit(1)` —
  stub the server/exit boundary) → 3b membership-lifecycle → **3c rebalancer SINK** = host
  move-planner **+ the async `evaluateRemoveSafety` pipeline** (`operation-workflow-remove-safety-evaluator.js`:
  `getPriorityRecoveryPlanningSnapshot`, `getOperationsByEntity:376`, `getCriticalReplicaRowsForSafety:418`,
  live `router.pingNode`/`getConnectionState:635-646`) **+ workflow-owner execution** = a major
  decoupling refactor with a deterministic router/ping fake. **Plus omitted subsystems:** SWIM
  membership FD, transport/router, admin SQL query engine (`sqlQueryEngine`, null-at-join),
  HLC consumers, `AuthoritativeControlPlaneView`/`DurableWorkflowCoordinator`/`OperationLane`.
  **Non-vacuity sub-gate per subsystem:** each must make ≥1 non-vacuous decision driven by another
  hosted subsystem's real output (guards the DT3 vacuity trap).
- **Phase 4 — cost-modeled whole-system rolling-restart scenario + census** mirroring
  `test/distributed/scenarios/rolling-restart.js` (form → quiesce → kill/start one at a time →
  re-converge); seed-iterate via `exploreWithPct`/`minimizePctDepth`. Census honesty: an all-green
  census is **bounded negative evidence** (`notReproducedBelow`), never proof — and is **vacuous for
  latency roots without the cost model live**.
- **Phase 5 — differential validation + docker's new role.** Validate the cost model by **per-run
  root-cause-label agreement** vs docker on a pre-registered calibration set (NOT aggregate-rate
  matching). Docker becomes the periodic re-calibrator + the final `T` re-seal — it is **not retired**.

## Open questions (the ones that gate the program)

- **Q1 (kill-gate):** can an honest cost model reproduce ≥2 *mechanistically distinct* latency roots'
  per-run labels (one CPU-saturation, one non-CPU coordination tail) red-on-revert with a directional
  docker match? → the fidelity-spike quest. If NO, Option B is refuted; fall back to the logical circle.
- **Q2:** what is the *current* (HEAD-re-profiled) dominant charged-op set, and what is its flag state?
- **Q3:** how is Tier-2 sealed as a *pre-registered, powered* label-agreement gate (per-run root-cause
  labels + a directional/rank component across a parameter sweep), not a free-form tolerance band?
- **Q4 (ROI, honest):** the saving is **bounded** — the deterministic-first regime already makes
  routine changes cost zero gate-hours; the cost model additionally lets a latency-tail change be
  *pre-validated for direction* before its one certification gate. It does **not** eliminate the
  certification / `T` re-seal gate. Is that bounded saving worth the XL cost? (Confront, don't gloss.)

## Program shape

**Epic + sealed sub-quests, kill-gate first; NOT one monolithic quest; NOT the Solver `run` loop.**
The DT1–DT8 program landed as focused `feat`/`test` commits with subagent verification, because each
increment's doneWhen was a local deterministic red-on-revert test. A single sealed quest cannot encode
"achieve X, or prove it's impossible and pivot" without goalpost-moving — and the fidelity spike is a
genuine kill-gate. So: this epic holds the bet + open questions + the kill-gate as a first-class
decision point; each phase becomes a sealed sub-quest only once its doneWhen is a concrete
deterministic gate; the cost-model calibration + Tier-2 sealing are their own (statistical) sub-quests
kept off the deterministic-only path.

## Traps (paid for already — don't re-pay)

- **Aggregate passRate correlation is unfalsifiable** at p≈0.30 / N≈20 — target per-run root-cause
  labels, not the rate number.
- **Stale sinks** — `parseStepsHistory` is memoized away (do NOT charge it); the `fastJsonClone`
  deep-clone is still unconditional/live (`system-table-cache.js:932`). Re-profile HEAD for the real set.
- **calibrate-machine.js is a hardware scaler, not a per-op cost probe** — build own per-sink benchmarks.
- **Cost model must precede hosting** — else Phase-3 sub-gates certify an un-charged regime.
- **Single-root spike does not generalize** — the tail is multi-headed (~10 roots, several non-CPU);
  the kill-gate requires ≥2 mechanistically distinct roots.
- **Hosting the stack is the real cost**, not the cost table — `evaluateRemoveSafety` + bootstrap +
  CDC are deep async/I/O decoupling refactors. Carry the XL/multi-month rating; don't relabel as
  "seam-completion + composition".

## Decision log

- 2026-06-27 — Epic opened. Operator chose Option B (cost model). Two adversarial verification rounds
  (4 subagents) returned NOT-TRUSTED on the v1 plan (the in-process scenario cannot reproduce the
  docker *convergence verdict* because the substrate models zero cost) and NOT-TRUSTED / TRUSTED-WITH-
  CAVEATS on the v2 cost-model plan (aggregate-passRate target unfalsifiable; stale sinks;
  calibrate-machine miscited; cost-model-before-hosting ordering; spike too weak). All corrections
  folded in above. Reframed Tier-2 to per-run root-cause-label agreement; docker retained as
  re-calibrator. Next action = the fidelity-spike kill-gate quest; nothing else starts before it resolves.
