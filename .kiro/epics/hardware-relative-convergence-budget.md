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
