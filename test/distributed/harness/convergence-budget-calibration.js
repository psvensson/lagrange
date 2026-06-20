// Hardware-relative convergence budget calibration.
//
// PROBLEM: the rolling-restart convergence budgets (settleTimeoutMs,
// maxSustainedOverTargetMs) are absolute wall-clock values calibrated on ONE
// machine. The cluster's real settle time scales with the hardware the gate runs
// on (a slow CI box, a constrained VM, a fast workstation), so a fixed budget is
// either flaky on slow hardware or falsely lenient on fast hardware. We make the
// WORK-BOUND budgets relative to a measured machine factor instead.
//
// THE SPLIT (load-bearing): only WORK-BOUND budgets scale.
//   - settleTimeoutMs / maxSustainedOverTargetMs  = "how long the WORK (drain,
//     catch-up, rebalance) is allowed to take" -> SCALE by the factor.
//   - quietWindowMs / sampleIntervalMs            = stability-proof / cadence
//     requirements, NOT work -> stay FIXED. (A slow machine must still demonstrate
//     the SAME real-duration steady window; scaling it would weaken the proof.)
//   - raft protocol timers (election/heartbeat) live in src/ and are correctness
//     parameters; this module never touches them.
//
// THE FACTOR is composite and computed OUTSIDE this module (scripts/calibrate-
// machine.js): machineFactor = hostFactor x cpuScaling(cpus), where hostFactor is
// a host hot-path probe vs a stored reference (machine-to-machine portability) and
// cpuScaling is the constrained-container multiplier from triangulation. This
// module only CONSUMES the resolved factor and applies it, so it is pure and
// unit-falsifiable; the empirical derivation is the calibration script's job.
//
// CLAMP: [MACHINE_FACTOR_MIN, MACHINE_FACTOR_MAX]. Floor at 1.0 so a fast machine
// never gets a TIGHTER-than-reference budget (we never make the gate flakier on
// better hardware). Cap so a pathological/noisy probe cannot grant an unbounded
// budget -- a factor over the cap means "this machine is unsuitable for the gate",
// surfaced by the caller, not silently extended here.

export const MACHINE_FACTOR_MIN = 1.0;
export const MACHINE_FACTOR_MAX = 4.0;
export const MACHINE_FACTOR_DEFAULT = 1.0;

// Env var the gate sets from scripts/calibrate-machine.js output.
export const MACHINE_FACTOR_ENV = 'LAGRANGE_MACHINE_FACTOR';

// The convergence fields that scale with machine speed (work-bound). Everything
// else in the convergence block is intentionally left untouched.
export const WORK_BOUND_BUDGET_FIELDS = Object.freeze([
  'settleTimeoutMs',
  'maxSustainedOverTargetMs',
]);

// Clamp a raw factor into the valid band. Non-finite / <= 0 inputs fall back to
// the default 1.0 (treat an unmeasurable factor as "reference machine", never as a
// budget grant or a budget cut).
export function clampMachineFactor(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return MACHINE_FACTOR_DEFAULT;
  if (value < MACHINE_FACTOR_MIN) return MACHINE_FACTOR_MIN;
  if (value > MACHINE_FACTOR_MAX) return MACHINE_FACTOR_MAX;
  return value;
}

// True when a raw factor exceeds the cap -- the caller should treat this as
// "machine too slow / probe too noisy for a trustworthy gate", not silently clamp
// and proceed as if calibrated.
export function machineFactorExceedsCap(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > MACHINE_FACTOR_MAX;
}

// Resolve the machine factor from an environment map (defaults to process.env).
// Absent / invalid -> 1.0 (reference machine), so an uncalibrated run behaves
// exactly as today.
export function resolveMachineFactorFromEnv(env = process.env) {
  const raw = env && env[MACHINE_FACTOR_ENV];
  if (raw === undefined || raw === null || raw === '') {
    return MACHINE_FACTOR_DEFAULT;
  }
  return clampMachineFactor(raw);
}

// Scale a single work-bound timeout (ms) by the machine factor, clamped + rounded.
// Non-numeric / non-finite inputs are returned unchanged (a fixed sentinel like 0
// for "disabled" must not become a budget). Used by scenarios that resolve their
// own work-bound timeouts outside the convergence block (e.g. rolling-restart's
// perNodeConvergenceTimeoutMs / perRestartActiveTimeoutMs).
export function scaleWorkBoundTimeout(ms, rawFactor) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ms;
  return Math.round(ms * clampMachineFactor(rawFactor));
}

// Apply a (already-resolved) machine factor to a convergence budget block,
// returning a NEW block. Work-bound fields are multiplied and rounded; all other
// fields are copied verbatim. The applied factor and the touched fields are
// recorded on the result so the gate report can show exactly what was calibrated.
export function applyMachineCalibration(convergence, rawFactor) {
  const factor = clampMachineFactor(rawFactor);
  const calibrated = {...(convergence || {})};
  const calibratedFields = [];
  for (const field of WORK_BOUND_BUDGET_FIELDS) {
    const base = convergence && convergence[field];
    if (typeof base === 'number' && Number.isFinite(base)) {
      calibrated[field] = Math.round(base * factor);
      if (factor !== MACHINE_FACTOR_DEFAULT) calibratedFields.push(field);
    }
  }
  calibrated.machineFactor = factor;
  calibrated.machineCalibratedFields = calibratedFields;
  return calibrated;
}

// --- Factor composition (used by scripts/calibrate-machine.js) ---------------
//
// machineFactor = hostFactor x cpuScaling(cpus):
//   hostFactor   = this host's probe median / the stored reference median. Handles
//                  machine-to-machine portability (slow CI box vs fast workstation).
//                  The host probe runs UNCONSTRAINED, so it captures only physical/
//                  virtual host speed, not the per-container --cpus limit.
//   cpuScaling   = the constrained-container multiplier from triangulation, keyed
//                  by the node --cpus limit. Handles "the work runs inside cpus-
//                  limited containers", which the host probe cannot see.
// Kept pure + separate from the probe I/O so the math is unit-falsifiable.

// Median of a numeric sample (robust to GC / scheduler noise vs a mean).
export function median(samples) {
  const xs = (samples || [])
    .map(Number)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

// Look up the cpu-constraint multiplier for a given --cpus value from a
// triangulation table (e.g. {"0.5": 2.1, "1.0": 1.0, "2.0": 0.7}). Exact match
// wins; otherwise linear-interpolate between the two nearest keys; outside the
// measured range, hold the nearest endpoint (never extrapolate a runaway budget).
// An absent/empty table yields 1.0 (uncalibrated == reference, today's behaviour).
export function cpuScalingFromTable(cpus, table) {
  const target = Number(cpus);
  if (!table || !Number.isFinite(target) || target <= 0) return 1.0;
  // Normalize to numeric (k, v) pairs up front — do NOT round-trip a parsed key
  // back through String() to re-index (String(Number('2.0')) === '2' !== '2.0').
  const pairs = Object.entries(table)
    .map(([k, v]) => [Number(k), Number(v)])
    .filter(([k, v]) => Number.isFinite(k) && k > 0 && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
  if (pairs.length === 0) return 1.0;
  const exact = pairs.find(([k]) => k === target);
  if (exact) return exact[1];
  if (target <= pairs[0][0]) return pairs[0][1];
  if (target >= pairs[pairs.length - 1][0]) return pairs[pairs.length - 1][1];
  let lo = pairs[0];
  let hi = pairs[pairs.length - 1];
  for (const pair of pairs) {
    if (pair[0] <= target) lo = pair;
    if (pair[0] >= target) {
      hi = pair;
      break;
    }
  }
  if (hi[0] === lo[0]) return lo[1];
  return lo[1] + ((hi[1] - lo[1]) * (target - lo[0])) / (hi[0] - lo[0]);
}

// Compose the final machine factor from a host probe median, a stored reference
// median, and a cpu-scaling multiplier. Returns the parts (for the report) plus
// the clamped combined factor and whether the RAW combined value exceeded the cap.
export function composeMachineFactor(
  {hostMedianMs, referenceMedianMs, cpuScaling = 1.0} = {}) {
  const host = Number(hostMedianMs);
  const ref = Number(referenceMedianMs);
  const scaling = Number.isFinite(Number(cpuScaling)) ? Number(cpuScaling) : 1.0;
  const hostFactor =
    Number.isFinite(host) && Number.isFinite(ref) && ref > 0 ? host / ref : 1.0;
  const rawCombined = hostFactor * scaling;
  return {
    hostFactor,
    cpuScaling: scaling,
    rawCombined,
    combined: clampMachineFactor(rawCombined),
    exceedsCap: machineFactorExceedsCap(rawCombined),
  };
}
