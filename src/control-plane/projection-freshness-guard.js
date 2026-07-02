import {OWNER_OUTCOME_FRESHNESS} from './owner-outcome-contract.js';

const PROJECTION_FRESHNESS_DEFAULT_UNKNOWN_EPOCH = 0;

function normalizeProjectionEpoch(value) {
  const epoch = Number(value);
  return Number.isFinite(epoch) ? Math.floor(epoch) : null;
}

function resolveProjectionUnknownEpoch(value) {
  const unknownEpoch = Number(value);
  return Number.isFinite(unknownEpoch) ?
    Math.floor(unknownEpoch) :
    PROJECTION_FRESHNESS_DEFAULT_UNKNOWN_EPOCH;
}

/**
 * Shared blocking guard for convergence-critical consumer boundaries.
 *
 * A projection is fresh enough to act on only when an epoch/revision was
 * actually observed (not the unknown sentinel), the producer freshness signal
 * is FRESH (when supplied), and the observed epoch satisfies any required
 * epoch fence (when supplied). Callers that omit `freshness` or `requiredEpoch`
 * skip those dimensions, so the same guard serves the active-gate promotion,
 * operation-workflow advance, and startup-readiness boundaries.
 *
 * @param {object} epochFence
 * @param {number|string} [epochFence.observedEpoch] projection's observed epoch
 * @param {number|string} [epochFence.requiredEpoch] minimum authoritative epoch
 * @param {string} [epochFence.freshness] OWNER_OUTCOME_FRESHNESS value
 * @param {number} [epochFence.unknownEpoch] sentinel meaning "unobserved"
 * @return {object} frozen guard result
 */
function assertProjectionFresh(epochFence = {}) {
  const unknownEpoch = resolveProjectionUnknownEpoch(epochFence.unknownEpoch);
  const observedEpoch = normalizeProjectionEpoch(epochFence.observedEpoch);
  const requiredEpoch = normalizeProjectionEpoch(epochFence.requiredEpoch);
  const revisionObserved =
    observedEpoch !== null && observedEpoch > unknownEpoch;
  const freshnessSatisfied =
    epochFence.freshness === undefined ||
    epochFence.freshness === null ||
    epochFence.freshness === OWNER_OUTCOME_FRESHNESS.FRESH;
  const epochFenceSatisfied =
    requiredEpoch === null ||
    (observedEpoch !== null && observedEpoch >= requiredEpoch);
  return Object.freeze({
    observedEpoch,
    requiredEpoch,
    unknownEpoch,
    revisionObserved,
    freshnessSatisfied,
    epochFenceSatisfied,
    projectionFresh:
      revisionObserved && freshnessSatisfied && epochFenceSatisfied,
  });
}

export {
  assertProjectionFresh,
  normalizeProjectionEpoch,
  PROJECTION_FRESHNESS_DEFAULT_UNKNOWN_EPOCH,
};
