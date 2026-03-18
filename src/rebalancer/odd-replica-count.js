import {ADJUST_DIRECTION} from './replica-status.js';

const ODD_MODULUS = 2;
const ODD_REMAINDER = 1;
const ODD_STEP = 2;
const ODD_ADJUST = 1;

/**
 * Validate that a replica count is odd (required for Raft quorum).
 * @param {number} count
 * @return {boolean}
 */
function isOddReplicaCount(count) {
  return count % ODD_MODULUS === ODD_REMAINDER;
}

/**
 * Adjust replica count to nearest odd number.
 * @param {number} count
 * @param {string} direction
 * @return {number}
 */
function adjustToOddCount(count, direction = ADJUST_DIRECTION.UP) {
  if (isOddReplicaCount(count)) {
    return count;
  }
  return direction === ADJUST_DIRECTION.UP ?
    count + ODD_ADJUST :
    count - ODD_ADJUST;
}

/**
 * Get the next higher odd replica count.
 * @param {number} current
 * @param {number} max
 * @return {number}
 */
function getNextOddCount(current, max) {
  const next = current + ODD_STEP;
  return next <= max ? next : current;
}

/**
 * Get the next lower odd replica count.
 * @param {number} current
 * @param {number} min
 * @return {number}
 */
function getPreviousOddCount(current, min) {
  const previous = current - ODD_STEP;
  return previous >= min ? previous : current;
}

export {
  isOddReplicaCount,
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
};
