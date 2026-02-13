/**
 * Constants for join/data-movement strategy selection.
 *
 * Defines strategy types, selection reasons, hint fields,
 * guardrail limits, and error/log messages for the planner
 * strategy chooser and EXPLAIN diagnostics.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3
 */

import {
  BROADCAST_MAX_PAYLOAD_BYTES,
} from '../wasm-service/query-budget-constants.js';

/**
 * Available join/data-movement strategies.
 * @enum {string}
 */
const STRATEGY = Object.freeze({
  BROADCAST: 'broadcast',
  LOOKUP: 'lookup',
  EMIT_SHUFFLE: 'emit_shuffle',
});

/**
 * Reasons the strategy chooser selected a particular strategy.
 * Persisted in plan diagnostics for EXPLAIN output.
 * @enum {string}
 */
const STRATEGY_REASON = Object.freeze({
  SIDE_BELOW_BROADCAST_THRESHOLD:
    'Side dataset size is below broadcast threshold',
  INNER_KEY_BOUNDED_LOOKUP:
    'Inner side uses primary key or unique bounded lookup',
  DEFAULT_EMIT_SHUFFLE:
    'No broadcast or lookup shortcut; using emit/shuffle',
  USER_HINT_BROADCAST:
    'User hint requested broadcast strategy',
  USER_HINT_LOOKUP:
    'User hint requested lookup strategy',
  USER_HINT_EMIT_SHUFFLE:
    'User hint requested emit/shuffle strategy',
});

/**
 * Default broadcast threshold in bytes.
 * Side datasets at or below this size qualify for broadcast.
 * Matches BROADCAST_MAX_PAYLOAD_BYTES from query-budget-constants.
 * @type {number}
 */
const DEFAULT_BROADCAST_THRESHOLD_BYTES = BROADCAST_MAX_PAYLOAD_BYTES;

/**
 * Field names for strategy input descriptors.
 * @enum {string}
 */
const STRATEGY_INPUT_FIELD = Object.freeze({
  SIDE_SIZE_BYTES: 'sideSizeBytes',
  INNER_ACCESS_PATH: 'innerAccessPath',
  BROADCAST_THRESHOLD_BYTES: 'broadcastThresholdBytes',
});

/**
 * Field names for planner hint objects.
 * @enum {string}
 */
const HINT_FIELD = Object.freeze({
  STRATEGY: 'strategy',
});

/**
 * Field names for strategy decision output.
 * @enum {string}
 */
const STRATEGY_DECISION_FIELD = Object.freeze({
  STRATEGY: 'strategy',
  REASON: 'reason',
  HINT_APPLIED: 'hintApplied',
  INPUT: 'input',
});

/**
 * Error messages for strategy selection and hints.
 * @enum {string}
 */
const STRATEGY_ERROR_MSG = Object.freeze({
  SIDE_SIZE_REQUIRED:
    'Side dataset size in bytes is required for strategy selection',
  SIDE_SIZE_MUST_BE_NUMBER:
    'Side dataset size must be a non-negative number',
  INVALID_STRATEGY_HINT:
    'Invalid strategy hint; must be one of: broadcast, lookup, emit_shuffle',
  HINT_BROADCAST_EXCEEDS_THRESHOLD:
    'Hint rejected: broadcast requested but side size exceeds threshold',
  HINT_LOOKUP_NO_KEY_ACCESS:
    'Hint rejected: lookup requested but inner side lacks key-bounded access',
});

/**
 * Log messages for strategy selection.
 * @enum {string}
 */
const STRATEGY_LOG_MSG = Object.freeze({
  STRATEGY_SELECTED: 'Strategy selected',
  HINT_APPLIED: 'User hint applied to strategy selection',
  HINT_REJECTED: 'User hint rejected by guardrail',
});

/**
 * Set of valid strategy values for fast membership check.
 * @type {Set<string>}
 */
const VALID_STRATEGIES = new Set([
  STRATEGY.BROADCAST,
  STRATEGY.LOOKUP,
  STRATEGY.EMIT_SHUFFLE,
]);

export {
  STRATEGY,
  STRATEGY_REASON,
  DEFAULT_BROADCAST_THRESHOLD_BYTES,
  STRATEGY_INPUT_FIELD,
  HINT_FIELD,
  STRATEGY_DECISION_FIELD,
  STRATEGY_ERROR_MSG,
  STRATEGY_LOG_MSG,
  VALID_STRATEGIES,
};
