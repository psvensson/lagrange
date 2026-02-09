/**
 * PhaseGate - Base class for bootstrap phase validation gates.
 * Phase gates validate that a bootstrap phase completed successfully
 * before allowing progression to the next phase.
 *
 * Each phase gate implements the validate() method which checks
 * phase-specific conditions and returns a result with success status,
 * errors, and diagnostic information.
 *
 * @module bootstrap/phase-gate
 * @see Requirements 3.2, 3.4
 */

/**
 * @typedef {Object} PhaseGateResult
 * @property {boolean} success - Whether gate validation passed
 * @property {Array<string>} errors - Error messages if validation failed
 * @property {Object} diagnostics - Diagnostic data for debugging
 */

/**
 * PhaseGate - Base class for bootstrap phase validation.
 * Subclasses should override validate() to implement phase-specific checks.
 */
class PhaseGate {
  /**
   * Validate that the phase completed successfully.
   * @param {Object} _context - Bootstrap context with services and state.
   * @return {PhaseGateResult} Validation result with success, errors, and
   *   diagnostics.
   */
  validate(_context) {
    // Base implementation always passes - subclasses override with specific
    // validation logic
    return {
      success: true,
      errors: [],
      diagnostics: {},
    };
  }
}

export {PhaseGate};
