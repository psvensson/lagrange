/**
 * Strategy selector for join and data movement.
 *
 * Chooses between broadcast, lookup, and emit/shuffle strategies
 * based on dataset size, access path, and optional user hints.
 * Persists the decision and rationale in plan diagnostics for
 * EXPLAIN output.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {LOOKUP_ACCESS_PATH} from './distributed/distributed-context-constants.js';
import {
  STRATEGY,
  STRATEGY_REASON,
  DEFAULT_BROADCAST_THRESHOLD_BYTES,
  STRATEGY_INPUT_FIELD as SIF,
  HINT_FIELD,
  STRATEGY_DECISION_FIELD as SDF,
  STRATEGY_ERROR_MSG,
  VALID_STRATEGIES,
} from './strategy-constants.js';

/**
 * Set of access paths that qualify for lookup strategy.
 * @type {Set<string>}
 */
const KEY_BOUNDED_ACCESS_PATHS = new Set([
  LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
  LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
]);

/**
 * Choose the default strategy without considering user hints.
 *
 * Rule order (from design):
 * 1. If side dataset <= broadcast threshold → broadcast.
 * 2. Else if inner side is pk/unique/bounded lookup → lookup.
 * 3. Else → emit/shuffle.
 *
 * @param {Object} input - Strategy input descriptor.
 * @param {number} input.sideSizeBytes - Side dataset size in bytes.
 * @param {string|null} input.innerAccessPath - Inner side access
 *   path from LOOKUP_ACCESS_PATH, or null if not key-bounded.
 * @param {number} [input.broadcastThresholdBytes] - Override for
 *   broadcast threshold.
 * @return {{strategy: string, reason: string}} Chosen strategy
 *   and reason.
 * @throws {Error} If sideSizeBytes is missing or invalid.
 */
function chooseDefaultStrategy(input) {
  validateInput(input);

  const threshold = input[SIF.BROADCAST_THRESHOLD_BYTES] ??
    DEFAULT_BROADCAST_THRESHOLD_BYTES;
  const sideSize = input[SIF.SIDE_SIZE_BYTES];
  const accessPath = input[SIF.INNER_ACCESS_PATH] ?? null;

  // Rule 1: broadcast if side is small enough
  if (sideSize <= threshold) {
    return {
      strategy: STRATEGY.BROADCAST,
      reason: STRATEGY_REASON.SIDE_BELOW_BROADCAST_THRESHOLD,
    };
  }

  // Rule 2: lookup if inner side has key-bounded access
  if (accessPath && KEY_BOUNDED_ACCESS_PATHS.has(accessPath)) {
    return {
      strategy: STRATEGY.LOOKUP,
      reason: STRATEGY_REASON.INNER_KEY_BOUNDED_LOOKUP,
    };
  }

  // Rule 3: emit/shuffle as fallback
  return {
    strategy: STRATEGY.EMIT_SHUFFLE,
    reason: STRATEGY_REASON.DEFAULT_EMIT_SHUFFLE,
  };
}

/**
 * Validate a user-provided strategy hint against guardrails.
 *
 * Guardrails:
 * - broadcast hint rejected when side size exceeds threshold.
 * - lookup hint rejected when inner side lacks key-bounded access.
 * - emit/shuffle hint is always valid.
 *
 * @param {string} hintStrategy - Requested strategy from hint.
 * @param {Object} input - Strategy input descriptor.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateHint(hintStrategy, input) {
  if (!VALID_STRATEGIES.has(hintStrategy)) {
    return {
      valid: false,
      error: STRATEGY_ERROR_MSG.INVALID_STRATEGY_HINT,
    };
  }

  const threshold = input[SIF.BROADCAST_THRESHOLD_BYTES] ??
    DEFAULT_BROADCAST_THRESHOLD_BYTES;
  const sideSize = input[SIF.SIDE_SIZE_BYTES];
  const accessPath = input[SIF.INNER_ACCESS_PATH] ?? null;

  if (hintStrategy === STRATEGY.BROADCAST &&
      sideSize > threshold) {
    return {
      valid: false,
      error: STRATEGY_ERROR_MSG.HINT_BROADCAST_EXCEEDS_THRESHOLD,
    };
  }

  if (hintStrategy === STRATEGY.LOOKUP &&
      (!accessPath || !KEY_BOUNDED_ACCESS_PATHS.has(accessPath))) {
    return {
      valid: false,
      error: STRATEGY_ERROR_MSG.HINT_LOOKUP_NO_KEY_ACCESS,
    };
  }

  return {valid: true, error: null};
}

/**
 * Map a valid hint strategy to its corresponding reason string.
 *
 * @param {string} hintStrategy - Validated hint strategy.
 * @return {string} Reason string for diagnostics.
 */
function hintReason(hintStrategy) {
  if (hintStrategy === STRATEGY.BROADCAST) {
    return STRATEGY_REASON.USER_HINT_BROADCAST;
  }
  if (hintStrategy === STRATEGY.LOOKUP) {
    return STRATEGY_REASON.USER_HINT_LOOKUP;
  }
  return STRATEGY_REASON.USER_HINT_EMIT_SHUFFLE;
}

/**
 * Select a strategy considering both default rules and optional
 * user hints. Returns a full decision object suitable for plan
 * diagnostics and EXPLAIN output.
 *
 * @param {Object} input - Strategy input descriptor.
 * @param {number} input.sideSizeBytes - Side dataset size in bytes.
 * @param {string|null} input.innerAccessPath - Inner side access
 *   path or null.
 * @param {number} [input.broadcastThresholdBytes] - Override.
 * @param {Object|null} [hints] - Optional planner hints object.
 * @param {string} [hints.strategy] - Requested strategy override.
 * @return {Readonly<Object>} Frozen strategy decision with
 *   strategy, reason, hintApplied, and input fields.
 * @throws {Error} If input is invalid or hint fails guardrails.
 */
function selectStrategy(input, hints) {
  validateInput(input);

  const hintStrategy = hints?.[HINT_FIELD.STRATEGY] ?? null;

  // If a hint is provided, validate and apply it
  if (hintStrategy) {
    const hintValidation = validateHint(hintStrategy, input);
    if (!hintValidation.valid) {
      throw new Error(hintValidation.error);
    }

    return Object.freeze({
      [SDF.STRATEGY]: hintStrategy,
      [SDF.REASON]: hintReason(hintStrategy),
      [SDF.HINT_APPLIED]: true,
      [SDF.INPUT]: freezeInput(input),
    });
  }

  // No hint — use default chooser
  const defaultChoice = chooseDefaultStrategy(input);

  return Object.freeze({
    [SDF.STRATEGY]: defaultChoice.strategy,
    [SDF.REASON]: defaultChoice.reason,
    [SDF.HINT_APPLIED]: false,
    [SDF.INPUT]: freezeInput(input),
  });
}

/**
 * Format a strategy decision as EXPLAIN/diagnostic output.
 *
 * @param {Object} decision - Strategy decision from selectStrategy.
 * @return {Readonly<Object>} Frozen diagnostic object with
 *   human-readable fields for EXPLAIN.
 */
function formatExplainDiagnostic(decision) {
  return Object.freeze({
    strategy: decision[SDF.STRATEGY],
    reason: decision[SDF.REASON],
    hintApplied: decision[SDF.HINT_APPLIED],
    sideSizeBytes: decision[SDF.INPUT]?.[SIF.SIDE_SIZE_BYTES] ??
      null,
    innerAccessPath:
      decision[SDF.INPUT]?.[SIF.INNER_ACCESS_PATH] ?? null,
    broadcastThresholdBytes:
      decision[SDF.INPUT]?.[SIF.BROADCAST_THRESHOLD_BYTES] ??
      DEFAULT_BROADCAST_THRESHOLD_BYTES,
  });
}

/**
 * Validate strategy input descriptor.
 *
 * @param {Object} input - Strategy input.
 * @throws {Error} If sideSizeBytes is missing or invalid.
 * @private
 */
function validateInput(input) {
  const sideSize = input?.[SIF.SIDE_SIZE_BYTES];
  if (sideSize === undefined || sideSize === null) {
    throw new Error(STRATEGY_ERROR_MSG.SIDE_SIZE_REQUIRED);
  }
  if (typeof sideSize !== TYPEOF.NUMBER || sideSize < NUM.ZERO) {
    throw new Error(STRATEGY_ERROR_MSG.SIDE_SIZE_MUST_BE_NUMBER);
  }
}

/**
 * Create a frozen copy of the input descriptor for diagnostics.
 *
 * @param {Object} input - Strategy input.
 * @return {Readonly<Object>} Frozen input snapshot.
 * @private
 */
function freezeInput(input) {
  return Object.freeze({
    [SIF.SIDE_SIZE_BYTES]: input[SIF.SIDE_SIZE_BYTES],
    [SIF.INNER_ACCESS_PATH]:
      input[SIF.INNER_ACCESS_PATH] ?? null,
    [SIF.BROADCAST_THRESHOLD_BYTES]:
      input[SIF.BROADCAST_THRESHOLD_BYTES] ??
      DEFAULT_BROADCAST_THRESHOLD_BYTES,
  });
}

export {
  chooseDefaultStrategy,
  validateHint,
  selectStrategy,
  formatExplainDiagnostic,
};
