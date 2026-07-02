/**
 * Dual-path closure verification for control-plane migration.
 *
 * Verifies that no dual progression paths exist for migrated
 * concerns after a phase closure. Detects temporary toggles,
 * duplicate progression branches, and superseded code paths that
 * should have been removed.
 *
 * Each control-plane concern (dispatch, rebalance, split) must
 * have exactly one progression owner path. This module evaluates
 * a concern registry snapshot and produces typed violation results.
 *
 * Requirements: 10.3 (Requirement 10)
 */

import {
  CLOSURE_STATUS,
  CONCERN,
  VIOLATION_TYPE,
} from './dual-path-closure-constants.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_COMMA_SPACE = ', ';

/**
 * Build a frozen violation result.
 *
 * @param {Object} options
 * @param {string} options.concern - One of CONCERN values.
 * @param {string} options.violationType - One of VIOLATION_TYPE.
 * @param {string} options.detail - Diagnostic detail message.
 * @return {Object} Frozen violation result.
 */
function buildViolation(options) {
  return Object.freeze({
    concern: options.concern,
    violationType: options.violationType,
    detail: typeof options.detail === LOCAL_STR_STRING ?
      options.detail :
      null,
  });
}

/**
 * Verify a single concern has exactly one progression owner path.
 *
 * The concernEntry describes the current state of a concern:
 *   {
 *     concern: string,          // CONCERN value
 *     ownerPaths: string[],     // registered progression paths
 *     activeToggles: string[],  // temporary migration toggles
 *     supersededBranches: string[], // superseded branches not yet removed
 *   }
 *
 * @param {Object} concernEntry - Concern state snapshot.
 * @return {Array<Object>} Array of frozen violation results
 *   (empty when the concern is clean).
 */
function verifyConcern(concernEntry) {
  const entry = concernEntry && typeof concernEntry === 'object' ?
    concernEntry :
    {};

  const violations = [];

  const ownerPaths = Array.isArray(entry.ownerPaths) ?
    entry.ownerPaths :
    [];
  const activeToggles = Array.isArray(entry.activeToggles) ?
    entry.activeToggles :
    [];
  const supersededBranches = Array.isArray(entry.supersededBranches) ?
    entry.supersededBranches :
    [];
  const concern = typeof entry.concern === 'string' ?
    entry.concern :
    '';

  if (ownerPaths.length > 1) {
    violations.push(buildViolation({
      concern,
      violationType: VIOLATION_TYPE.DUPLICATE_PROGRESSION,
      detail: `${ownerPaths.length} progression paths: ` +
        ownerPaths.join(LOCAL_STR_COMMA_SPACE),
    }));
  }

  for (const toggle of activeToggles) {
    violations.push(buildViolation({
      concern,
      violationType: VIOLATION_TYPE.ACTIVE_TOGGLE,
      detail: typeof toggle === LOCAL_STR_STRING ? toggle : null,
    }));
  }

  for (const branch of supersededBranches) {
    violations.push(buildViolation({
      concern,
      violationType: VIOLATION_TYPE.SUPERSEDED_BRANCH,
      detail: typeof branch === LOCAL_STR_STRING ? branch : null,
    }));
  }

  return violations;
}

/**
 * Verify all concerns in a registry snapshot have single owner
 * paths and no remaining dual-path artifacts.
 *
 * @param {Array<Object>} concernEntries - Array of concern state
 *   snapshots (see verifyConcern for shape).
 * @return {Object} Frozen closure verification result with shape:
 *   {status, violations, totalConcerns, cleanConcerns}
 */
function verifyClosureState(concernEntries) {
  const entries = Array.isArray(concernEntries) ?
    concernEntries :
    [];

  const allViolations = [];
  let cleanConcerns = 0;

  for (const entry of entries) {
    const violations = verifyConcern(entry);
    if (violations.length === 0) {
      cleanConcerns++;
    }
    for (const v of violations) {
      allViolations.push(v);
    }
  }

  const status = allViolations.length === 0 ?
    CLOSURE_STATUS.CLEAN :
    CLOSURE_STATUS.VIOLATIONS_FOUND;

  return Object.freeze({
    status,
    violations: Object.freeze(allViolations),
    totalConcerns: entries.length,
    cleanConcerns,
  });
}

/**
 * Build a clean concern entry for a migrated concern that has
 * completed dual-path removal.
 *
 * @param {string} concern - One of CONCERN values.
 * @param {string} ownerPath - The single canonical owner path.
 * @return {Object} Frozen concern entry with no toggles or
 *   superseded branches.
 */
function buildCleanConcernEntry(concern, ownerPath) {
  return Object.freeze({
    concern: typeof concern === LOCAL_STR_STRING ? concern : '',
    ownerPaths: Object.freeze(
      typeof ownerPath === LOCAL_STR_STRING && ownerPath.length > 0 ?
        [ownerPath] :
        [],
    ),
    activeToggles: Object.freeze([]),
    supersededBranches: Object.freeze([]),
  });
}

/**
 * Build a default concern registry snapshot covering all three
 * canonical control-plane concerns. Each concern starts clean
 * with the provided owner path map.
 *
 * @param {Object} ownerPathMap - Maps CONCERN values to their
 *   single canonical owner path string.
 * @return {Array<Object>} Array of frozen concern entries.
 */
function buildDefaultConcernRegistry(ownerPathMap) {
  const pathMap = ownerPathMap && typeof ownerPathMap === 'object' ?
    ownerPathMap :
    {};

  return Object.freeze([
    buildCleanConcernEntry(
      CONCERN.DISPATCH,
      pathMap[CONCERN.DISPATCH] || '',
    ),
    buildCleanConcernEntry(
      CONCERN.REBALANCE,
      pathMap[CONCERN.REBALANCE] || '',
    ),
    buildCleanConcernEntry(
      CONCERN.SPLIT,
      pathMap[CONCERN.SPLIT] || '',
    ),
  ]);
}

export {
  buildCleanConcernEntry,
  buildDefaultConcernRegistry,
  buildViolation,
  verifyConcern,
  verifyClosureState,
};
