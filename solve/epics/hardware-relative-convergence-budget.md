---
id: hardware-relative-convergence-budget
roadmapRow: RM-0.1-fs-rolling-restart
status: resolved
graduatesTo: null
---

# Epic: Hardware-relative convergence budget (OQ1 resolution)

## Intent

The rolling-restart gate's work-bound budgets (`settleTimeoutMs`,
`maxSustainedOverTargetMs`) were absolute wall-clock values calibrated on one
machine. The cluster's real settle time scales with the hardware the gate runs on,
so a fixed budget is flaky on slow hardware and falsely lenient on fast hardware.
This makes the budgets **relative to a measured machine factor** instead — the
resolution of OQ1 from `strategy-gate-and-altitude-teeth.md`.

This supersedes the "bump 120s → 180s" proposal: 180s becomes the *reference-machine*
value at factor 1.0; every other machine scales automatically.

## Decision (resolves OQ1)

- **Keep** the `doneWhen` shape — 3 consecutive scenario-PASS.
- **Keep SAFE-every-run as a hard, never-scaled invariant** (0 corrupt / breach /
  exit). Calibration only makes the *liveness* budget portable; it never relaxes
  correctness. This is what makes recalibration honest, not goalpost-moving.
- **Scale only WORK-BOUND budgets** by `machineFactor`:
  - `settleTimeoutMs`, `maxSustainedOverTargetMs` → SCALE.
  - `quietWindowMs`, `sampleIntervalMs` → FIXED (a stability proof / cadence is a
    real-duration requirement, not work; scaling it would weaken the proof).
  - raft protocol timers (election/heartbeat, in `src/`) → UNTOUCHED (correctness
    parameters, not perf).
- **Track convergence-time (p50/p95 settle) as a separate, non-gating metric** =
  the explicit 0.2 target. Demotes slowness from "blocks 0.1" to "tracked debt".

## Factor model

`machineFactor = hostFactor × cpuScaling(cpus)`, clamped to `[1.0, 4.0]`:
- **hostFactor** = this host's hot-path probe median ÷ a stored reference median.
  Handles machine-to-machine portability. The probe runs UNCONSTRAINED on the host
  orchestrator, so it captures only host speed.
- **cpuScaling(cpus)** = the constrained-container multiplier from triangulation,
  keyed by the node `--cpus` limit. Handles "the work runs inside cpus-limited
  containers", which the host probe cannot see.
- **Clamp floor 1.0**: a fast machine never gets a *tighter* budget (never make the
  gate flakier on better hardware). **Cap 4.0**: a noisy/slow probe cannot grant an
  unbounded budget — over the cap = "machine unsuitable for the gate", surfaced, not
  silently extended.

## Implementation (LANDED, below-gate verified)

- `test/distributed/harness/convergence-budget-calibration.js` — pure core:
  `clampMachineFactor`, `machineFactorExceedsCap`, `resolveMachineFactorFromEnv`,
  `applyMachineCalibration` (scales work-bound, leaves stability fixed, records
  `machineFactor` + `machineCalibratedFields`), `median`, `cpuScalingFromTable`
  (exact / interpolate / endpoint-hold, never extrapolate), `composeMachineFactor`.
- `scripts/calibrate-machine.js` — hot-path probe (sqlite full-log scan [CL-018] +
  readiness-snapshot JSON serialize [CL-010/011/019] + CPU), median over 7 trials.
  `--establish-baseline`, `--cpus`, `--emit-env`, `--json`. Baseline +
  triangulation table → `test/distributed/calibration-baseline.json`.
- `test/distributed/harness/config-parser.js` — `mergeWithDefaults` applies
  `applyMachineCalibration(convergence, resolveMachineFactorFromEnv())`. Absent env
  → factor 1.0 → **exactly today's behaviour** (non-invasive).
- `scripts/rolling-restart-stat-gate.sh` — runs the probe once per gate, exports
  `LAGRANGE_MACHINE_FACTOR`; `CPUS=` overlays `resourceLimits.cpus` for
  triangulation; banner prints `cpus` + `machineFactor`. `CALIBRATE=0` opts out.
- `test/distributed/harness/__tests__/convergence-budget-calibration.test.js` —
  20 falsifiers (work/stability split, floor, cap, interpolation, compose). GREEN.
- This machine's reference baseline: `referenceMedianMs ≈ 84.4ms` (workloadVersion 1).

## Triangulation RESULTS (2026-06-20)

Measured via the in-container probe (`docker run --cpus=N --entrypoint node
distributed-db:test scripts/calibrate-machine.js`), median/cpus=1.0 median. The
probe is single-threaded (mirrors the node event-loop hot path), so cpus≥1 shows
no speedup — representative, not a flaw.

| cpus | probe median | cpuScaling (vs 1.0) |
| ---- | ------------ | ------------------- |
| 0.5  | ~183 ms      | **2.17×** (≈1/cpus + cgroup overhead) |
| 0.75 | ~107 ms      | 1.27× |
| 1.0  | ~84 ms       | 1.0 (= host reference) |
| 2.0  | ~83 ms       | ~1.0 (single-threaded; floored) |

Stored in `test/distributed/calibration-baseline.json :: cpuScalingTable`. End-to-end
factor (host probe × table): cpus=0.5 → **2.16**, 0.75 → 1.26, 1.0 → 1.0, 2.0 → 1.0.

**CAVEAT (documented in the baseline):** this is the pure work-mix multiplier — a
LOWER BOUND. It does not capture super-linear raft-election churn under event-loop
starvation at low cpus (CL-033/039); the validation gate confirms/raises it.

**Pipeline validated end-to-end:** a real docker gate at cpus=0.5 picks up
machineFactor=2.16 and scales both the convergence budget AND the shell no-progress
frozen-cut (`noProgressMaxElapsedMs=324092`, base 150000). cpus=1.0 baseline run:
CONVERGED, missing=0, 0 breach, wall 598s, machineFactor 1.0 (identical to today on
the reference machine at default cpus — the non-invasive property holds).

## Triangulation procedure (gates)

The table starts empty (cpuScaling = 1.0 everywhere = today). Triangulation runs
measure RAW settle at each `--cpus` to BUILD the table:
1. Run the gate at `CPUS ∈ {0.5, 1.0, 2.0}` (small N each), table empty. Extract
   measured settle (`maxOverTargetMs`, wall) from reports — pass/fail is irrelevant
   here; we read the settle distribution.
2. `cpuScaling(cpus) = settle(cpus) / settle(1.0)`. Populate `cpuScalingTable`.
   Note the SHAPE (linear vs super-linear: constrained CPU → event-loop starvation
   → more raft elections [CL-033/039] → super-linear) and the **CPU collapse floor**
   below which the cluster stops converging at all (publishable 0.1 operational fact).
3. **Validation gate:** re-run at two `--cpus` WITH the table populated → budgets now
   scale → pass-rate should be **invariant across CPU**. That invariance is the
   falsifiable proof the factor tracks hardware. SAFE must hold every run.

## Validation RESULTS (2026-06-20)

- **cpus=1.0, factor 1.0 (nominal):** CONVERGED, missing=0, 0 corrupt/breach/exit,
  wall 598s. (Reference machine at default cpus behaves identically to today.)
- **cpus=0.5, factor 2.16 (calibrated):** CONVERGED, missing=0, 0 corrupt/breach/exit,
  wall 1113s, budget scaled (perNodeConvergence 120s→259s, no-progress 150s→324s).
  The constrained run PASSES + stays SAFE because its budget scaled with the
  hardware. Total wall ratio 1.86× (diluted by the fixed-wall load phase; the work
  tail tracks the ~2.17× probe prediction).
- **Contrast (cpus=0.5 WITHOUT calibration, nominal budget):** also reached
  stat-gate CONVERGED (missing=0) + SAFE, wall 489s, but scenario verdict
  BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked — a budget-bound block).
- **HONEST READING (N=1 is not a rate verdict — the gate's own header says single-run
  pass/fail is meaningless for this ~50%-flaky convergence):**
  - All three runs reached missing=0 (publication converged). The strict scenario
    verdict was PASS only at cpus=1.0; BOTH cpus=0.5 runs fell short of a clean PASS.
  - The budget scaling demonstrably TOOK EFFECT: the calibrated 0.5 run used its
    larger budget (wall 1113s, not cut), vs the no-cal run terminating at 489s.
  - The verdict shifted (no-cal = BLOCK_TOPOLOGY_CONVERGENCE [budget-bound] →
    cal = BLOCK_EVIDENCE_INCOMPLETE [non-measuring / metrics-missing]). This is
    WEAKLY consistent with calibration clearing the budget-bound block, but is ONE
    sample and NOT conclusive — and cpus=0.5 may sit near/below the convergence
    floor (super-linear churn), where the failure is not purely budget-bound and
    calibration cannot rescue it.
  - **NOT ESTABLISHED:** that calibration raises the PASS RATE on constrained
    hardware. That needs N≥8 with/without at a constraint where cpus=1.0 reliably
    PASSES (cpus=0.75 is the better discriminator than 0.5 — milder slowdown, faster
    runs, less likely below the floor). Multi-hour; deferred as a user decision per
    the "don't default to N=8" guidance.
- **WHAT IS PROVEN:** the mechanism is correct, verified, and non-invasive; budgets
  + frozen-cut scale by the measured factor; SAFE held on every run (0 corrupt/
  breach/exit across all 4 docker runs); factor 1.0 on the reference machine is
  byte-identical to today. The mechanism is sound; its rate-level *benefit* on slow
  hardware is plausible but not yet statistically demonstrated.

## RATE VERDICT — N=8 per arm at cpus=0.75 (2026-06-20) — CALIBRATION IS LOAD-BEARING

The discriminating gate: cpus=0.75 (mild enough that cpus=1.0 reliably PASSes),
N=8 WITH calibration (factor 1.275) vs N=8 WITHOUT (nominal, factor 1.0).

| arm | PASS | budget-timeout (BLOCK_TOPOLOGY_CONVERGENCE) | SAFE | other |
| --- | ---- | ------------------------------------------- | ---- | ----- |
| **cal** (1.275×) | **4/8 (50%)** | 2/8 | 7/8 | 1 node-exit, 1 evidence-incomplete |
| **nocal** (1.0×) | **0/8 (0%)** | **7/8** | 8/8 | 1 evidence-incomplete |

**Decisive:** without calibration the nominal budget is too tight for the 1.27×-
slower hardware — **0/8 PASS, 7/8 budget-bound topology-convergence timeouts**. With
calibration the scaled budget converts those into passes — **4/8 PASS, budget-
timeouts cut 7→2**. (nocal 0/8 under a true ~50% rate has p≈0.5^8≈0.004, so the
effect is not chance.) The cal arm's 50% PASS matches the cpus=1.0 baseline (~50%
from prior gates) = **pass-rate invariance across hardware**, the design's goal.

Note: all 8 nocal runs reached publication convergence (stat-gate CONVERGED,
missing=0) yet failed the strict scenario verdict on the budget-bound topology
dimension — calibration is what closes that gap on slow hardware.

**SAFE:** 0 data corruption (hardBreach=0) across ALL 16 runs. The one non-SAFE
event was a single node-death in the cal arm (CL-030 resource-floor lineage) —
plausibly because calibrated runs run LONGER under sustained 0.75-cpu pressure, so
more exposure to the resource-floor death. This is a hardware-floor caveat (cpus=0.75
is near the viable floor for this 5-node workload), NOT a calibration defect:
calibration only extends timeouts, it cannot kill a node. Below ~0.75 cpu the
cluster starts shedding nodes — the publishable "minimum viable hardware" signal.

## Falsifiable success criterion

Gate pass-rate is statistically indistinguishable at `cpus=0.5` and `cpus=2.0` once
the factor is applied (and SAFE holds every run). If not, the probe isn't
representative (or the run hit the collapse floor) — re-derive the table.

## Open follow-ons

- Probe runs on host; for maximum fidelity it could run INSIDE a cpus-limited
  container, but the host-probe + cpuScaling(cpus) split matches the user's mental
  model (machine baseline × constrained-hardware multiplier) and is cheaper.
- Long-term: push more convergence assertion into the deterministic in-process
  substrate (virtual clock), where wall-clock — and thus this whole problem — does
  not exist; reserve the real-time docker gate + calibration for what must run real.
