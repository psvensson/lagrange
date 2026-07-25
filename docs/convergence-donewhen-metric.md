---
audience: development
---

# Rolling-Restart Convergence Metric

This is the current closure contract for rolling-restart convergence. It
separates hard safety from variance-aware bounded-time convergence and is
implemented by the stat-gate summary plus
[`convergence-sealed-bars.json`](../test/distributed/config/convergence-sealed-bars.json).

## 1. Verdict Shape

A fixed-code run window is evaluated on two independent axes:

- **Safety floor:** every run has zero corruption, unexpected node exits,
  oracle blindness, and stale-source execution.
- **Convergence:** the Wilson 95% lower confidence bound of the scenario pass
  rate meets the sealed environment bar.

Any safety breach dominates the result. A high pass rate cannot compensate for
one unsafe run.

## 2. Why the Convergence Axis Is Statistical

Rolling-restart completion is sensitive to CPU and latency tails. A short
consecutive-pass streak can occur by variance and is therefore only a liveness
signal, not closure evidence. The aggregate uses a Wilson lower bound so the
verdict incorporates sample uncertainty instead of treating the point estimate
as certainty.

The deterministic tier remains the first choice for timer, message-ordering,
and owner-state defects. It does not model CPU contention or real-container
transport effects; see
[`deterministic-directed-testing-plan.md`](deterministic-directed-testing-plan.md).

## 3. Environment Scaling

The model treats a run as a sequence of node restarts. If `q` is the probability
that one restart re-quiesces within its calibrated work budget, the first-order
node-count model is:

```text
T(nodeCount) = qTarget ^ nodeCount
```

`scripts/calibrate-machine.js` measures the host factor used to scale work-bound
timeouts. Re-run that cheap calibration when runner hardware changes, not for
ordinary source changes. The sealed pass-rate bar is a code-capability
reference and is changed only through the promotion rule below.

## 4. Gate Interpretation

The stat gate reports one of these outcomes:

- `SAFETY_VIOLATED` — at least one hard safety count is non-zero.
- `ABOVE_BAR` — safety is clean and the Wilson lower bound meets the bar.
- `BELOW_BAR` — safety is clean and the Wilson upper bound is below the bar.
- `INCONCLUSIVE` — safety is clean but the interval straddles the bar.
- `NO_SEALED_BAR` — the scenario has no configured reference.

An inconclusive window does not authorize a pass or fail claim. Increase the
sample only when the statistical claim is the question being answered.

## 5. Sealed `doneWhen`

For the five-node `rolling-restart` scenario, the current contract is:

1. use a fixed-code window of at least 15 runs;
2. require `CORRUPT = NODE_EXIT = ORACLE_BLIND = staleSource = 0` in every run;
3. require the Wilson 95% lower bound of the scenario-pass rate to be at least
   **`T(5) = 0.357`**; and
4. treat a consecutive-pass probe only as a liveness heartbeat.

The corresponding per-restart target is **`qTarget = 0.812`**. The executable
values live in
[`convergence-sealed-bars.json`](../test/distributed/config/convergence-sealed-bars.json);
this document and that file must change together.

## 6. Promotion Rule

The bar may move upward only when a fresh, fixed-code window of at least 15
runs:

1. satisfies the safety floor;
2. has a Wilson 95% lower bound strictly above the current bar; and
3. records the new bar, node count, `qTarget`, window, source identity, and
   evidence together.

The bar is never recalibrated downward to make a change pass. Hardware changes
use the machine-factor calibration; material scenario-shape changes require a
new explicit reference rather than silently rewriting this one.

## 7. Operating Commands

```sh
node scripts/calibrate-machine.js
bash scripts/rolling-restart-stat-gate.sh 15
```

Do not put the statistical gate on ordinary push CI. Run deterministic
falsifiers and focused owner tests first, then spend the live window on release
or promotion claims that only the real environment can establish.
