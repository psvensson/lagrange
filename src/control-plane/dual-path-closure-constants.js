/**
 * Constants for dual-path closure verification.
 *
 * Supports the phase closure verification from Requirement 10.3:
 * dual progression paths SHALL be time-bounded and removed at
 * phase closure. This module defines the vocabulary for detecting
 * and reporting dual-path violations.
 *
 * Requirements: 10.3
 */

/**
 * Control-plane concern identifiers.
 * Each concern must have exactly one progression owner path.
 * @enum {string}
 */
const CONCERN = Object.freeze({
  DISPATCH: 'dispatch',
  REBALANCE: 'rebalance',
  SPLIT: 'split',
});

/**
 * Dual-path violation types detected during closure verification.
 * @enum {string}
 */
const VIOLATION_TYPE = Object.freeze({
  /** Two or more progression paths exist for the same concern. */
  DUPLICATE_PROGRESSION: 'duplicate_progression',
  /** A temporary migration toggle is still active. */
  ACTIVE_TOGGLE: 'active_toggle',
  /** A superseded branch coexists with the canonical owner path. */
  SUPERSEDED_BRANCH: 'superseded_branch',
});

/**
 * Verification result status values.
 * @enum {string}
 */
const CLOSURE_STATUS = Object.freeze({
  /** All concerns have a single owner path; no violations found. */
  CLEAN: 'clean',
  /** One or more dual-path violations detected. */
  VIOLATIONS_FOUND: 'violations_found',
});

/**
 * Subsystem identifier for dual-path closure diagnostics.
 * @type {string}
 */
const DUAL_PATH_CLOSURE_SUBSYSTEM = 'dual-path-closure';

export {
  CLOSURE_STATUS,
  CONCERN,
  DUAL_PATH_CLOSURE_SUBSYSTEM,
  VIOLATION_TYPE,
};
