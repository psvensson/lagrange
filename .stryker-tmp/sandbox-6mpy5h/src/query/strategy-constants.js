/**
 * Constants for join/data-movement strategy selection.
 *
 * Defines strategy types, selection reasons, hint fields,
 * guardrail limits, and error/log messages for the planner
 * strategy chooser and EXPLAIN diagnostics.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { BROADCAST_MAX_PAYLOAD_BYTES } from '../wasm-service/query-budget-constants.js';

/**
 * Available join/data-movement strategies.
 * @enum {string}
 */
const STRATEGY = Object.freeze(stryMutAct_9fa48("125062") ? {} : (stryCov_9fa48("125062"), {
  BROADCAST: stryMutAct_9fa48("125063") ? "" : (stryCov_9fa48("125063"), 'broadcast'),
  LOOKUP: stryMutAct_9fa48("125064") ? "" : (stryCov_9fa48("125064"), 'lookup'),
  EMIT_SHUFFLE: stryMutAct_9fa48("125065") ? "" : (stryCov_9fa48("125065"), 'emit_shuffle')
}));

/**
 * Reasons the strategy chooser selected a particular strategy.
 * Persisted in plan diagnostics for EXPLAIN output.
 * @enum {string}
 */
const STRATEGY_REASON = Object.freeze(stryMutAct_9fa48("125066") ? {} : (stryCov_9fa48("125066"), {
  SIDE_BELOW_BROADCAST_THRESHOLD: stryMutAct_9fa48("125067") ? "" : (stryCov_9fa48("125067"), 'Side dataset size is below broadcast threshold'),
  INNER_KEY_BOUNDED_LOOKUP: stryMutAct_9fa48("125068") ? "" : (stryCov_9fa48("125068"), 'Inner side uses primary key or unique bounded lookup'),
  DEFAULT_EMIT_SHUFFLE: stryMutAct_9fa48("125069") ? "" : (stryCov_9fa48("125069"), 'No broadcast or lookup shortcut; using emit/shuffle'),
  USER_HINT_BROADCAST: stryMutAct_9fa48("125070") ? "" : (stryCov_9fa48("125070"), 'User hint requested broadcast strategy'),
  USER_HINT_LOOKUP: stryMutAct_9fa48("125071") ? "" : (stryCov_9fa48("125071"), 'User hint requested lookup strategy'),
  USER_HINT_EMIT_SHUFFLE: stryMutAct_9fa48("125072") ? "" : (stryCov_9fa48("125072"), 'User hint requested emit/shuffle strategy')
}));

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
const STRATEGY_INPUT_FIELD = Object.freeze(stryMutAct_9fa48("125073") ? {} : (stryCov_9fa48("125073"), {
  SIDE_SIZE_BYTES: stryMutAct_9fa48("125074") ? "" : (stryCov_9fa48("125074"), 'sideSizeBytes'),
  INNER_ACCESS_PATH: stryMutAct_9fa48("125075") ? "" : (stryCov_9fa48("125075"), 'innerAccessPath'),
  BROADCAST_THRESHOLD_BYTES: stryMutAct_9fa48("125076") ? "" : (stryCov_9fa48("125076"), 'broadcastThresholdBytes')
}));

/**
 * Field names for planner hint objects.
 * @enum {string}
 */
const HINT_FIELD = Object.freeze(stryMutAct_9fa48("125077") ? {} : (stryCov_9fa48("125077"), {
  STRATEGY: stryMutAct_9fa48("125078") ? "" : (stryCov_9fa48("125078"), 'strategy')
}));

/**
 * Field names for strategy decision output.
 * @enum {string}
 */
const STRATEGY_DECISION_FIELD = Object.freeze(stryMutAct_9fa48("125079") ? {} : (stryCov_9fa48("125079"), {
  STRATEGY: stryMutAct_9fa48("125080") ? "" : (stryCov_9fa48("125080"), 'strategy'),
  REASON: stryMutAct_9fa48("125081") ? "" : (stryCov_9fa48("125081"), 'reason'),
  HINT_APPLIED: stryMutAct_9fa48("125082") ? "" : (stryCov_9fa48("125082"), 'hintApplied'),
  INPUT: stryMutAct_9fa48("125083") ? "" : (stryCov_9fa48("125083"), 'input')
}));

/**
 * Error messages for strategy selection and hints.
 * @enum {string}
 */
const STRATEGY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("125084") ? {} : (stryCov_9fa48("125084"), {
  SIDE_SIZE_REQUIRED: stryMutAct_9fa48("125085") ? "" : (stryCov_9fa48("125085"), 'Side dataset size in bytes is required for strategy selection'),
  SIDE_SIZE_MUST_BE_NUMBER: stryMutAct_9fa48("125086") ? "" : (stryCov_9fa48("125086"), 'Side dataset size must be a non-negative number'),
  INVALID_STRATEGY_HINT: stryMutAct_9fa48("125087") ? "" : (stryCov_9fa48("125087"), 'Invalid strategy hint; must be one of: broadcast, lookup, emit_shuffle'),
  HINT_BROADCAST_EXCEEDS_THRESHOLD: stryMutAct_9fa48("125088") ? "" : (stryCov_9fa48("125088"), 'Hint rejected: broadcast requested but side size exceeds threshold'),
  HINT_LOOKUP_NO_KEY_ACCESS: stryMutAct_9fa48("125089") ? "" : (stryCov_9fa48("125089"), 'Hint rejected: lookup requested but inner side lacks key-bounded access')
}));

/**
 * Log messages for strategy selection.
 * @enum {string}
 */
const STRATEGY_LOG_MSG = Object.freeze(stryMutAct_9fa48("125090") ? {} : (stryCov_9fa48("125090"), {
  STRATEGY_SELECTED: stryMutAct_9fa48("125091") ? "" : (stryCov_9fa48("125091"), 'Strategy selected'),
  HINT_APPLIED: stryMutAct_9fa48("125092") ? "" : (stryCov_9fa48("125092"), 'User hint applied to strategy selection'),
  HINT_REJECTED: stryMutAct_9fa48("125093") ? "" : (stryCov_9fa48("125093"), 'User hint rejected by guardrail')
}));

/**
 * Set of valid strategy values for fast membership check.
 * @type {Set<string>}
 */
const VALID_STRATEGIES = new Set(stryMutAct_9fa48("125094") ? [] : (stryCov_9fa48("125094"), [STRATEGY.BROADCAST, STRATEGY.LOOKUP, STRATEGY.EMIT_SHUFFLE]));
export { STRATEGY, STRATEGY_REASON, DEFAULT_BROADCAST_THRESHOLD_BYTES, STRATEGY_INPUT_FIELD, HINT_FIELD, STRATEGY_DECISION_FIELD, STRATEGY_ERROR_MSG, STRATEGY_LOG_MSG, VALID_STRATEGIES };