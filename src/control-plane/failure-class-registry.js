/**
 * Failure-class registry for harness-discovered failures.
 *
 * Maps each harness-discovered failure class to a deterministic test
 * ID, enforcing the closure policy from Requirement 8: a failure
 * class SHALL NOT be considered closed until a deterministic
 * reproduction exists below full harness scale.
 *
 * Each entry tracks:
 * - failureClassId: unique identifier for the failure class
 * - invariantId: optional link to an invariant in the catalog
 * - deterministicTestId: optional link to a deterministic repro test
 * - status: open | reproduced | closed
 * - description: human-readable description of the failure class
 *
 * Requirements: 8.1
 */

import {
  CLOSURE_VALIDATION_REASON,
  FAILURE_CLASS_STATUS,
} from './failure-class-constants.js';

const LOCAL_STR_FAILURECLASSID_IS_REQUIRED_AND_MUST_BE_A = 'failureClassId is required and must be a non-empty string';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_DETERMINISTICTESTID_IS_REQUIRED_AND_MUST = 'deterministicTestId is required and must be a non-empty string';
const LOCAL_STR_CANNOT_CLOSE_A_FAILURE_CLASS_THAT_IS_NOT = 'Cannot close a failure class that is not in reproduced status';

/**
 * @type {Map<string, Object>}
 */
const registry = new Map();

/**
 * Creates a frozen failure class entry from the given options.
 * @param {Object} options
 * @return {Object}
 */
function buildEntry(options) {
  const failureClassId =
    typeof options.failureClassId === 'string' &&
    options.failureClassId.length > 0 ?
      options.failureClassId : null;

  if (!failureClassId) {
    throw new Error(
      LOCAL_STR_FAILURECLASSID_IS_REQUIRED_AND_MUST_BE_A,
    );
  }

  const invariantId =
    typeof options.invariantId === 'string' &&
    options.invariantId.length > 0 ?
      options.invariantId : null;

  const deterministicTestId =
    typeof options.deterministicTestId === 'string' &&
    options.deterministicTestId.length > 0 ?
      options.deterministicTestId : null;

  const description =
    typeof options.description === 'string' &&
    options.description.length > 0 ?
      options.description : null;

  const status = deterministicTestId ?
    FAILURE_CLASS_STATUS.REPRODUCED :
    FAILURE_CLASS_STATUS.OPEN;

  return Object.freeze({
    failureClassId,
    invariantId,
    deterministicTestId,
    status,
    description,
  });
}

/**
 * Registers a failure class in the registry.
 * If a class with the same ID already exists, it is replaced.
 *
 * @param {Object} options
 * @param {string} options.failureClassId - unique failure class id
 * @param {string} [options.invariantId] - optional invariant catalog id
 * @param {string} [options.deterministicTestId] - optional test id
 * @param {string} [options.description] - human-readable description
 * @return {Object} the frozen registered entry
 */
function registerFailureClass(options) {
  const entry = buildEntry(options);
  registry.set(entry.failureClassId, entry);
  return entry;
}

/**
 * Retrieves a failure class entry by ID.
 *
 * @param {string} failureClassId
 * @return {Object|null} the frozen entry or null if not found
 */
function getFailureClass(failureClassId) {
  if (
    typeof failureClassId !== LOCAL_STR_STRING ||
    failureClassId.length === 0
  ) {
    return null;
  }
  return registry.get(failureClassId) || null;
}

/**
 * Returns all failure classes with status 'open'.
 * Per Requirement 8, classes without a deterministic test ID
 * remain open.
 *
 * @return {Object[]} array of frozen open entries
 */
function getOpenFailureClasses() {
  const result = [];
  for (const entry of registry.values()) {
    if (entry.status === FAILURE_CLASS_STATUS.OPEN) {
      result.push(entry);
    }
  }
  return Object.freeze(result);
}

/**
 * Marks a failure class as reproduced by attaching a deterministic
 * test ID. The class must exist and be in 'open' status.
 *
 * @param {string} failureClassId
 * @param {string} deterministicTestId
 * @return {Object} the updated frozen entry
 */
function markReproduced(failureClassId, deterministicTestId) {
  const existing = registry.get(failureClassId);
  if (!existing) {
    throw new Error(
      `Failure class not found: ${String(failureClassId)}`,
    );
  }
  if (
    typeof deterministicTestId !== LOCAL_STR_STRING ||
    deterministicTestId.length === 0
  ) {
    throw new Error(
      LOCAL_STR_DETERMINISTICTESTID_IS_REQUIRED_AND_MUST,
    );
  }

  const updated = Object.freeze({
    ...existing,
    deterministicTestId,
    status: FAILURE_CLASS_STATUS.REPRODUCED,
  });
  registry.set(failureClassId, updated);
  return updated;
}

/**
 * Marks a failure class as closed. The class must exist and be in
 * 'reproduced' status (a deterministic test ID must be present).
 *
 * @param {string} failureClassId
 * @return {Object} the updated frozen entry
 */
function markClosed(failureClassId) {
  const existing = registry.get(failureClassId);
  if (!existing) {
    throw new Error(
      `Failure class not found: ${String(failureClassId)}`,
    );
  }
  if (existing.status !== FAILURE_CLASS_STATUS.REPRODUCED) {
    throw new Error(
      LOCAL_STR_CANNOT_CLOSE_A_FAILURE_CLASS_THAT_IS_NOT,
    );
  }

  const updated = Object.freeze({
    ...existing,
    status: FAILURE_CLASS_STATUS.CLOSED,
  });
  registry.set(failureClassId, updated);
  return updated;
}

/**
 * Validates whether a failure class has sufficient closure evidence.
 * A class has valid closure evidence when a deterministic test ID is
 * present and the status is REPRODUCED or CLOSED. Harness-only
 * evidence (no deterministic test ID) is explicitly disallowed.
 *
 * @param {string} failureClassId
 * @return {{valid: boolean, reason: string, failureClassId: string}}
 */
function validateClosureEvidence(failureClassId) {
  const entry = getFailureClass(failureClassId);
  if (!entry) {
    return Object.freeze({
      valid: false,
      reason: CLOSURE_VALIDATION_REASON.UNKNOWN_FAILURE_CLASS,
      failureClassId: String(failureClassId),
    });
  }

  if (!entry.deterministicTestId) {
    const reason = entry.status === FAILURE_CLASS_STATUS.OPEN ?
      CLOSURE_VALIDATION_REASON.HARNESS_ONLY_EVIDENCE :
      CLOSURE_VALIDATION_REASON.MISSING_DETERMINISTIC_REPRO;
    return Object.freeze({
      valid: false,
      reason,
      failureClassId: entry.failureClassId,
    });
  }

  if (
    entry.status === FAILURE_CLASS_STATUS.REPRODUCED ||
    entry.status === FAILURE_CLASS_STATUS.CLOSED
  ) {
    return Object.freeze({
      valid: true,
      reason: CLOSURE_VALIDATION_REASON.VALID,
      failureClassId: entry.failureClassId,
    });
  }

  return Object.freeze({
    valid: false,
    reason: CLOSURE_VALIDATION_REASON.MISSING_DETERMINISTIC_REPRO,
    failureClassId: entry.failureClassId,
  });
}

/**
 * Clears all entries from the registry.
 * Intended for test isolation only.
 */
function clearRegistry() {
  registry.clear();
}

export {
  clearRegistry,
  getFailureClass,
  getOpenFailureClasses,
  markClosed,
  markReproduced,
  registerFailureClass,
  validateClosureEvidence,
};
