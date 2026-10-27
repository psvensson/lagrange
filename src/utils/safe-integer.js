// Language-level numeric guards, shared by every owner that needs one. A
// domain predicate that carries meaning (an epoch, a counter) stays with its
// owner and is written over these.

/**
 * Whether a value is a positive safe integer: an exact count or coordinate
 * that `+1` arithmetic cannot round (2**53 + 1 === 2**53).
 * @param {*} value - A candidate.
 * @return {boolean} Whether it is a safe integer above zero.
 */
function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export {isPositiveSafeInteger};
