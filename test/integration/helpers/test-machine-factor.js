// Hardware-relative budget scaling for integration tests (doctrine:
// hardware-relative-convergence-budget epic - scale WORK-BOUND budgets by a
// machine factor, never correctness). CI lanes export
// LAGRANGE_TEST_MACHINE_FACTOR (the release and ci workflows set 3); the
// reference machine stays 1, so a budget keeps the meaning it was calibrated
// with on the machine it was calibrated on.
//
// Why a shared owner (2026-09-13): the GCP proof runner is 2.4x slower
// single-threaded than the reference machine, and every stop/start can land
// it on a different host. Two integration files carried fixed wall-clock
// budgets (a 12 s seed bootstrap, a 100 ms heartbeat with a 200 ms ready
// lease) that passed the rc.2 proof by margin and failed the 0.2.4 proof
// twice; scaled by 3 on that host, both pass. Non-numeric or absent means 1.

const MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const REFERENCE_MACHINE_FACTOR = 1;

/**
 * The machine factor CI declared, or 1 on the reference machine.
 * @param {object} [env] process environment
 * @return {number} >= 1
 */
function resolveTestMachineFactor(env = process.env) {
  const parsed = Number(env[MACHINE_FACTOR_ENV]);
  return Number.isFinite(parsed) && parsed >= REFERENCE_MACHINE_FACTOR ?
    parsed :
    REFERENCE_MACHINE_FACTOR;
}

const TEST_MACHINE_FACTOR = resolveTestMachineFactor();

/**
 * A work-bound budget scaled for this machine. Integer milliseconds.
 * @param {number} referenceMs the budget as calibrated on the reference machine
 * @return {number}
 */
function scaleByMachineFactor(referenceMs) {
  return Math.round(referenceMs * TEST_MACHINE_FACTOR);
}

export {scaleByMachineFactor};
