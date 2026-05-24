/**
 * Shared result factory for control-plane invariant checks.
 */

/**
 * Build a frozen invariant result object.
 *
 * @param {Object} options
 * @param {string} options.invariantId - One of INVARIANT_ID.
 * @param {string} options.severity - INVARIANT_OUTCOME_SEVERITY.
 * @param {boolean} options.passed - Whether the invariant holds.
 * @param {string} options.reason - INVARIANT_REASON code.
 * @param {Object} [options.context] - Additional diagnostic context.
 * @return {Object} Frozen invariant result.
 */
function buildInvariantResult(options) {
  return Object.freeze({
    invariantId: options.invariantId,
    severity: options.severity,
    passed: options.passed,
    reason: options.reason,
    context: options.context ?
      Object.freeze({...options.context}) :
      null,
  });
}

export {
  buildInvariantResult,
};
