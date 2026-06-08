/**
 * Bounded retry jitter — decorrelate synchronized retriers so independent nodes
 * do not all hammer a saturated owner at the same instant (a metastable-failure
 * sustaining mechanism; see
 * .kiro/specs/metastable-convergence-resilience/, Phase 1).
 *
 * Conservative by construction: jitter is ADDITIVE-UPWARD only, so a jittered
 * delay is never SHORTER than the computed backoff — it can only spread the herd
 * later, never make retries more aggressive. Range: [delayMs, delayMs*(1+ratio)].
 *
 * Opt-in, default OFF (ratio 0 -> identity), so the measured baseline is
 * unchanged until enabled via LAGRANGE_RETRY_JITTER=true (or an explicit ratio
 * via LAGRANGE_RETRY_JITTER_RATIO in [0,1]).
 */

const DEFAULT_RETRY_JITTER_RATIO = 0.25;

function resolveRetryJitterRatio(env = process.env) {
  const explicit = Number(env.LAGRANGE_RETRY_JITTER_RATIO);
  if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 1) {
    return explicit;
  }
  return env.LAGRANGE_RETRY_JITTER === 'true' ? DEFAULT_RETRY_JITTER_RATIO : 0;
}

/**
 * @param {number} delayMs - the computed (backoff) delay.
 * @param {number} [ratio] - jitter fraction in [0,1]; defaults to the env policy.
 * @param {function} [random] - injectable RNG returning [0,1).
 * @return {number} floor(delayMs + random()*ratio*delayMs), never below delayMs.
 */
function applyBoundedJitter(
  delayMs,
  ratio = resolveRetryJitterRatio(),
  random = Math.random,
) {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return delayMs;
  }
  const normalizedRatio =
    Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 1) : 0;
  if (normalizedRatio === 0) {
    return delayMs;
  }
  const spread = delayMs * normalizedRatio * random();
  return Math.floor(delayMs + spread);
}

export {
  DEFAULT_RETRY_JITTER_RATIO,
  applyBoundedJitter,
  resolveRetryJitterRatio,
};
